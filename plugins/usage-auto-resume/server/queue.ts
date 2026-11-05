import { randomUUID } from "node:crypto";
import type { PluginTurnOutcome } from "@getpaseo/plugin/server";
import type { MessageQueue, QueueReason, QueuedMessage } from "../shared/rpc";
import type { AgentTimelineItem, PaseoAgent } from "./paseo-types";
import type { ResumerApi } from "./resumer";
import type { QueueRecord, QueueStore } from "./queue-store";
import type { JobStore, ResumeJob } from "./store";
import { subscriptionModel, type SubscriptionCheck } from "./subscription";

type Active = NonNullable<QueueRecord["active"]>;
const MAX_MESSAGES = 100;

function latestUserMessageId(timeline: readonly AgentTimelineItem[]): string | undefined {
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const item = timeline[index];
    if (item?.type === "user_message") return item.clientMessageId ?? item.messageId;
  }
  return undefined;
}

/** English sentences for `QueueReason`s that can also be thrown as RPC errors. */
function reasonMessage(reason: QueueReason): string {
  switch (reason) {
    case "agent-unavailable":
      return "This agent no longer exists.";
    case "agent-archived":
      return "This agent is archived.";
    case "agent-busy":
      return "The agent is still running or was closed. Wait for the current turn to finish and reopen the session, then resume.";
    case "agent-pending":
      return "The agent is waiting for a permission or input.";
    default:
      return "The agent is unavailable.";
  }
}

function unavailable(agent: PaseoAgent | null): QueueReason | null {
  if (!agent) return "agent-unavailable";
  if (agent.archivedAt) return "agent-archived";
  if (agent.activeTurn || (agent.status !== "idle" && agent.status !== "error"))
    return "agent-busy";
  if (agent.pendingPermissions.length || agent.attentionReason === "permission")
    return "agent-pending";
  return null;
}

function changedConversation(queue: QueueRecord, agent: PaseoAgent): boolean {
  return (
    agent.provider !== queue.provider ||
    subscriptionModel(agent) !== queue.model ||
    (agent.lastUserMessageAt ?? null) !== queue.baseline
  );
}

function changedAccount(queue: QueueRecord, check: SubscriptionCheck): boolean {
  return (
    check.auth === "api" ||
    Boolean(queue.identity && check.identity && queue.identity !== check.identity)
  );
}

function initialQueue(
  agent: PaseoAgent,
  job: ResumeJob | undefined,
  previous: QueueRecord | null,
): QueueRecord {
  const waiting = job?.state === "pending" && job.enabled;
  return {
    agentId: agent.id,
    provider: agent.provider,
    model: subscriptionModel(agent),
    identity: job?.identity,
    baseline: agent.lastUserMessageAt ?? null,
    status: waiting ? "waiting" : "paused",
    reason: waiting ? null : "saved",
    messages: [],
    acceptedIds: previous?.acceptedIds ?? [],
    handledTurns: previous?.handledTurns ?? [],
  };
}

function displayedMessage(
  message: QueueRecord["messages"][number],
  uncertain: string | null,
  activeId: string | undefined,
): QueuedMessage {
  let state: QueuedMessage["state"] = "queued";
  if (message.id === uncertain) state = "uncertain";
  else if (message.id === activeId) state = "running";
  return { ...message, state };
}

/** All operations are called under the resumer's per-agent lock, including lifecycle hooks. */
export function createMessageQueues(options: {
  store: QueueStore;
  jobs: JobStore;
  now: () => Date;
  loadAgent: (api: ResumerApi, agentId: string) => Promise<PaseoAgent | null>;
  check: (api: ResumerApi, agent: PaseoAgent) => Promise<SubscriptionCheck | null>;
  schedule: (api: ResumerApi, agent: PaseoAgent, immediate?: boolean) => Promise<void>;
  timeline: (api: ResumerApi, agentId: string) => Promise<AgentTimelineItem[]>;
}) {
  const { store, jobs, now, loadAgent } = options;
  const get = async (agentId: string) =>
    (await store.list()).find((queue) => queue.agentId === agentId) ?? null;
  const turnKey = (turnId: string | null, timeline: readonly AgentTimelineItem[]) =>
    turnId ?? latestUserMessageId(timeline);
  async function handled(
    agentId: string,
    turnId: string | null,
    timeline: readonly AgentTimelineItem[],
  ): Promise<boolean> {
    const key = turnKey(turnId, timeline);
    return Boolean(key && (await get(agentId))?.handledTurns.includes(key));
  }
  const rememberTurn = (
    queue: QueueRecord,
    turnId: string | null,
    timeline: readonly AgentTimelineItem[],
  ) => {
    const key = turnKey(turnId, timeline);
    return key ? [...queue.handledTurns, key].slice(-32) : queue.handledTurns;
  };

  async function pause(agentId: string, reason: QueueReason): Promise<void> {
    await store.update(agentId, (queue) =>
      queue ? { ...queue, status: "paused", reason } : undefined,
    );
  }

  async function row(api: ResumerApi, queue: QueueRecord): Promise<MessageQueue> {
    const uncertain =
      queue.status === "paused"
        ? (queue.active?.queuedMessageId ?? queue.resumeMessageId ?? null)
        : null;
    const activeId = queue.active?.queuedMessageId ?? queue.resumeMessageId;
    const agent = await loadAgent(api, queue.agentId).catch(() => null);
    return {
      agentId: queue.agentId,
      provider: queue.provider,
      title: agent?.title?.trim() || null,
      status: queue.status,
      reason: queue.reason,
      uncertainMessageId: uncertain,
      messages: queue.messages.map((message) => displayedMessage(message, uncertain, activeId)),
    };
  }

  async function list(api: ResumerApi, agentId?: string): Promise<MessageQueue[]> {
    return Promise.all(
      (await store.list())
        .filter((queue) => (!agentId || queue.agentId === agentId) && queue.messages.length > 0)
        .map((queue) => row(api, queue)),
    );
  }

  async function add(
    api: ResumerApi,
    agentId: string,
    id: string,
    text: string,
  ): Promise<MessageQueue> {
    if (!text.trim() || text.trim().length > 20_000)
      throw new Error("Enter a follow-up message of 1 to 20,000 characters.");
    const existing = await get(agentId);
    if (existing?.acceptedIds.includes(id)) return row(api, existing);
    const agent = await loadAgent(api, agentId);
    if (!agent || agent.archivedAt) throw new Error("This agent is unavailable or archived.");
    const job = (await jobs.list()).find((entry) => entry.agentId === agentId);
    const queue = await store.update(agentId, (current) => {
      if (current?.acceptedIds.includes(id)) return undefined;
      if ((current?.messages.length ?? 0) >= MAX_MESSAGES)
        throw new Error("This agent already has 100 follow-ups. Remove some first.");
      // An existing active chain owns its identity and execution state. Saving more text
      // never implicitly resumes a paused queue or changes the selected account/model.
      const base: QueueRecord =
        current && (current.messages.length || current.active)
          ? current
          : initialQueue(agent, job, current);
      return {
        ...base,
        messages: [...base.messages, { id, text: text.trim(), createdAt: now().toISOString() }],
        acceptedIds: [...base.acceptedIds, id].slice(-512),
      };
    });
    return row(api, queue!);
  }

  async function remove(
    api: ResumerApi,
    agentId: string,
    id: string,
  ): Promise<{ changed: boolean; queue: MessageQueue | null }> {
    let changed = false;
    const result = await store.update(agentId, (queue) => {
      if (!queue || !queue.messages.some((message) => message.id === id)) return undefined;
      if (
        queue.status === "running" &&
        (queue.active?.queuedMessageId === id || queue.resumeMessageId === id)
      ) {
        throw new Error("This message is running. Stop the agent before removing it.");
      }
      changed = true;
      return {
        ...queue,
        messages: queue.messages.filter((message) => message.id !== id),
        active: queue.active?.queuedMessageId === id ? undefined : queue.active,
        resumeMessageId: queue.resumeMessageId === id ? undefined : queue.resumeMessageId,
      };
    });
    return { changed, queue: result ? await row(api, result) : null };
  }

  async function resume(
    api: ResumerApi,
    agentId: string,
    uncertain?: "retry" | "skip",
  ): Promise<MessageQueue> {
    const queue = await get(agentId);
    if (!queue?.messages.length) throw new Error("There are no queued messages to send.");
    if (queue.status !== "paused") return row(api, queue);
    const agent = await loadAgent(api, agentId);
    const reason = unavailable(agent);
    if (reason) throw new Error(reasonMessage(reason));
    const uncertainId = queue.active?.queuedMessageId ?? queue.resumeMessageId;
    if (uncertainId && !uncertain)
      throw new Error("The previous message may already have run. Choose retry or skip first.");
    const check = await options.check(api, agent!);
    if (!check || check.auth === "api")
      throw new Error(
        "Turn on Auto Resume for this subscription provider before resuming the queue.",
      );
    const resumed = await store.update(agentId, (current) =>
      current
        ? {
            ...current,
            status: "waiting",
            reason: null,
            active: undefined,
            resumeMessageId: undefined,
            messages:
              uncertain === "skip"
                ? current.messages.filter((message) => message.id !== uncertainId)
                : current.messages,
            provider: agent!.provider,
            model: subscriptionModel(agent!),
            identity: check.identity,
            baseline: agent!.lastUserMessageAt ?? null,
          }
        : undefined,
    );
    // A fresh explicit resume always verifies quota and runs the continue first. Retry gets
    // a new delivery ID only when eventually dispatched; an old accepted ID cannot deadlock it.
    await jobs.update(agentId, () => null);
    if (!resumed?.messages.length) {
      const empty = await store.update(agentId, (current) =>
        current ? { ...current, status: "ready" } : undefined,
      );
      return row(api, empty!);
    }
    await options.schedule(api, agent!, true);
    const job = (await jobs.list()).find((entry) => entry.agentId === agentId);
    if (!job) await pause(agentId, "schedule-failed");
    return row(api, (await get(agentId))!);
  }

  async function pauseByUser(api: ResumerApi, agentId: string): Promise<MessageQueue> {
    if (!(await get(agentId))) throw new Error("This agent has no saved follow-up queue.");
    await pause(agentId, "paused-by-user");
    await jobs.update(agentId, (job) =>
      job?.state === "pending" ? { ...job, enabled: false } : undefined,
    );
    return row(api, (await get(agentId))!);
  }

  async function beforeContinue(
    job: ResumeJob,
    messageId: string,
    agent: PaseoAgent,
  ): Promise<boolean> {
    const queue = await get(job.agentId);
    if (!queue || !queue.messages.length) return true;
    if (queue.status !== "waiting") return false;
    if (
      changedConversation(queue, agent) ||
      (queue.identity && job.identity && queue.identity !== job.identity)
    ) {
      await pause(job.agentId, "provider-model-changed");
      return false;
    }
    const claimed = await store.update(job.agentId, (current) =>
      current?.status === "waiting"
        ? {
            ...current,
            identity: current.identity ?? job.identity,
            status: "running",
            reason: null,
            active: { kind: "continue", messageId, started: false },
          }
        : undefined,
    );
    return claimed?.status === "running" && claimed.active?.messageId === messageId;
  }

  async function started(api: ResumerApi, agentId: string, turnId: string | null): Promise<void> {
    const queue = await get(agentId);
    if (!queue?.messages.length) return;
    if (queue.active && (!queue.active.started || queue.active.turnId === turnId)) {
      const latest = latestUserMessageId(await options.timeline(api, agentId));
      if (latest === queue.active.messageId) {
        const agent = await loadAgent(api, agentId);
        await store.update(agentId, (current) =>
          current?.active
            ? {
                ...current,
                active: {
                  ...current.active,
                  started: true,
                  turnId,
                  baseline: agent?.lastUserMessageAt ?? null,
                },
              }
            : undefined,
        );
        return;
      }
    }
    await pause(agentId, "manual-activity");
  }

  function ownsTurn(
    active: Active | undefined,
    turnId: string | null,
    timeline: readonly AgentTimelineItem[],
  ): boolean {
    if (!active) return false;
    const latest = latestUserMessageId(timeline);
    if (latest && latest !== active.messageId) return false;
    if (active.turnId && turnId) return active.turnId === turnId;
    return latest === active.messageId;
  }

  async function accepted(api: ResumerApi, agentId: string): Promise<void> {
    const agent = await loadAgent(api, agentId);
    await store.update(agentId, (current) =>
      current?.active
        ? {
            ...current,
            active: {
              ...current.active,
              baseline: agent?.lastUserMessageAt ?? null,
              turnId: agent?.activeTurn?.turnId ?? current.active.turnId,
              started: Boolean(agent?.activeTurn) || current.active.started,
            },
          }
        : undefined,
    );
  }

  function hasNewerMessage(active: Active, agent: PaseoAgent | null): boolean {
    return active.baseline !== undefined && (agent?.lastUserMessageAt ?? null) !== active.baseline;
  }

  async function limited(
    api: ResumerApi,
    agentId: string,
    turnId: string | null,
    timeline: readonly AgentTimelineItem[],
  ): Promise<void> {
    const queue = await get(agentId);
    if (!queue || queue.status === "paused") return;
    const agent = await loadAgent(api, agentId);
    if (!queue.active && (!agent || changedConversation(queue, agent))) {
      await pause(agentId, "conversation-changed");
      return;
    }
    if (
      queue.active &&
      (!ownsTurn(queue.active, turnId, timeline) || hasNewerMessage(queue.active, agent))
    ) {
      await pause(agentId, "turn-changed");
      return;
    }
    const job = (await jobs.list()).find((entry) => entry.agentId === agentId);
    await store.update(agentId, (current) =>
      current && current.status !== "paused"
        ? {
            ...current,
            status: job ? "waiting" : "paused",
            reason: job ? null : "auto-resume-stopped",
            resumeMessageId: current.active?.queuedMessageId ?? current.resumeMessageId,
            handledTurns: rememberTurn(current, turnId, timeline),
            active: undefined,
            baseline: job?.baseline ?? current.baseline,
          }
        : undefined,
    );
  }

  async function ended(
    api: ResumerApi,
    agentId: string,
    turnId: string | null,
    outcome: PluginTurnOutcome,
    timeline: readonly AgentTimelineItem[],
  ): Promise<void> {
    const queue = await get(agentId);
    if (!queue?.messages.length) return;
    if (!queue.active) {
      if (queue.status !== "paused") await pause(agentId, "other-turn-ended");
      return;
    }
    const agent = await loadAgent(api, agentId);
    if (!ownsTurn(queue.active, turnId, timeline) || hasNewerMessage(queue.active, agent)) {
      await pause(agentId, "turn-not-ours");
      return;
    }
    if (outcome.kind !== "completed") {
      await pause(agentId, outcome.kind === "canceled" ? "canceled" : "failed");
      return;
    }
    const completed = queue.active.queuedMessageId ?? queue.resumeMessageId;
    await store.update(agentId, (current) =>
      current
        ? {
            ...current,
            messages: current.messages.filter((message) => message.id !== completed),
            active: undefined,
            resumeMessageId: undefined,
            handledTurns: rememberTurn(current, turnId, timeline),
            // Pausing while a turn is running takes effect after that turn; its completion is
            // still recorded, so a later resume never repeats completed user text.
            status: current.status === "paused" ? "paused" : "ready",
            reason: current.status === "paused" ? current.reason : null,
            baseline: agent?.lastUserMessageAt ?? null,
          }
        : undefined,
    );
  }

  async function drive(api: ResumerApi, agentId: string): Promise<void> {
    const queue = await get(agentId);
    if (!queue || queue.status !== "ready" || !queue.messages.length) return;
    const agent = await loadAgent(api, agentId);
    const reason = unavailable(agent);
    if (reason) {
      await pause(agentId, reason);
      return;
    }
    if (changedConversation(queue, agent!)) {
      await pause(agentId, "context-changed");
      return;
    }
    const check = await options.check(api, agent!);
    if (!check) {
      await pause(agentId, "auto-resume-off");
      return;
    }
    if (changedAccount(queue, check)) {
      await pause(agentId, "account-changed");
      return;
    }
    if (check.auth !== "subscription" || check.status !== "ready") {
      const held = await store.update(agentId, (current) =>
        current?.status === "ready"
          ? { ...current, status: "waiting", identity: current.identity ?? check.identity }
          : undefined,
      );
      if (held?.status === "waiting") await options.schedule(api, agent!);
      return;
    }
    // Recheck after the asynchronous account/usage lookup. The host's steer option avoids
    // interrupting a turn if another client starts one in the final check/send gap.
    const final = await loadAgent(api, agentId);
    if (unavailable(final) || changedConversation(queue, final!)) {
      await pause(agentId, "agent-changed");
      return;
    }
    const head = queue.messages[0]!;
    const messageId = randomUUID();
    const claimed = await store.update(agentId, (current) =>
      current?.status === "ready"
        ? {
            ...current,
            identity: current.identity ?? check.identity,
            status: "running",
            reason: null,
            active: { kind: "message", messageId, queuedMessageId: head.id, started: false },
          }
        : undefined,
    );
    if (claimed?.status !== "running" || claimed.active?.messageId !== messageId) return;
    try {
      await api.agents.ref(agentId).send(head.text, { messageId, activeTurnBehavior: "steer" });
      await accepted(api, agentId);
    } catch {
      await pause(agentId, "delivery-unknown");
    }
  }

  async function recover(): Promise<void> {
    for (const queue of await store.list()) {
      if (queue.active || queue.status === "running")
        await pause(queue.agentId, "plugin-restarted");
    }
  }

  return {
    list,
    add,
    remove,
    resume,
    pauseByUser,
    pause,
    beforeContinue,
    started,
    limited,
    ended,
    drive,
    recover,
    get,
    handled,
    accepted,
  };
}
