import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import {
  ClawMuseStatusCreateMobileEnrollmentResponseSchema,
  ClawMuseStatusGetResponseSchema,
} from "@getpaseo/protocol/messages";
import {
  GoalEvidenceSchema,
  GoalListFilterSchema,
  type GoalActionId,
  type GoalMergeMethod,
  type GoalSource,
} from "@getpaseo/protocol/goals";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { connectToDaemon } from "../../utils/client.js";
import type { CommandOptions } from "../../output/index.js";

export type TaskRequest = (path: string, method?: string, body?: unknown) => Promise<unknown>;

export interface TaskListInput {
  filter: string;
  repoKey?: string;
  parentGoalId?: string;
  sourceKind?: string;
}

export interface TaskCreateBody {
  requestId: string;
  repoKey: string;
  title: string;
  summary: string;
  acceptance?: string;
  parentGoalId?: string;
  dependsOn?: string[];
  hostId?: string;
  agent?: string;
  start?: boolean;
  attachedAgentRef?: string;
  source?: GoalSource;
  paths?: string[];
}

export interface TaskActBody {
  hostId?: string;
  agent?: string;
  instruction?: string;
  confirmExecutionStopped?: boolean;
  mergeMethod?: GoalMergeMethod;
}

export interface TaskAttachInput {
  requestId: string;
  agentId: string;
  repoKey: string;
  title: string;
  summary: string;
  acceptance?: string;
  parentGoalId?: string;
}

export interface TaskApi {
  listTasks(input: TaskListInput): Promise<unknown[]>;
  getTask(id: string): Promise<unknown>;
  createTask(body: TaskCreateBody): Promise<unknown>;
  actOnTask(id: string, action: GoalActionId, body: TaskActBody): Promise<unknown>;
  submitTaskReview(
    id: string,
    body: { runId: string; message: string; evidence: unknown },
  ): Promise<unknown>;
  attachSession(input: TaskAttachInput): Promise<unknown>;
}

interface LocalGoalIndex {
  goalIds: Set<string>;
  repoKeys: Set<string>;
  hostIds: Set<string>;
}

const cloudReposSchema = z.object({
  repos: z.array(
    z
      .object({
        repoKey: z.string(),
        hosts: z.array(z.object({ hostId: z.string(), relayHostId: z.string() })),
      })
      .passthrough(),
  ),
});

async function cloudListTasks(request: TaskRequest, input: TaskListInput): Promise<unknown[]> {
  const query = new URLSearchParams({ filter: input.filter });
  if (input.repoKey) query.set("repoKey", input.repoKey);
  if (input.parentGoalId) query.set("parentGoalId", input.parentGoalId);
  if (input.sourceKind) query.set("sourceKind", input.sourceKind);
  const tasks = new Map<string, unknown>();
  let before: string | null | undefined;
  do {
    if (before) query.set("before", before);
    const value = z
      .object({ goals: z.array(z.unknown()), nextCursor: z.string().nullable().optional() })
      .parse(await request(`/tasks?${query}`));
    for (const item of value.goals) {
      const id = (item as { id?: string }).id;
      if (id) tasks.set(id, item);
    }
    before = value.nextCursor;
  } while (before);
  return [...tasks.values()];
}

function createCloudAttach(
  client: DaemonClient,
  request: TaskRequest,
): (input: TaskAttachInput) => Promise<unknown> {
  return async (input) => {
    const status = ClawMuseStatusGetResponseSchema.shape.payload.parse(
      await client.getClawMuseStatus(),
    );
    const repos = cloudReposSchema.parse(await request("/goal-repos"));
    const host = repos.repos
      .find((repo) => repo.repoKey === input.repoKey)
      ?.hosts.find((candidate) => candidate.relayHostId === status.relayHostId);
    if (!host) throw new Error("This host has not published the selected project");
    return request("/tasks", "POST", {
      requestId: input.requestId,
      repoKey: input.repoKey,
      title: input.title,
      summary: input.summary,
      ...(input.acceptance ? { acceptance: input.acceptance } : {}),
      ...(input.parentGoalId ? { parentGoalId: input.parentGoalId } : {}),
      hostId: host.hostId,
      start: true,
      attachedAgentRef: input.agentId,
      source: { kind: "session", key: `${host.hostId}/${input.agentId}` },
    });
  };
}

/**
 * Routes task operations to the daemon's own `goals.*` RPCs when it advertises
 * `localGoals`, falling back to the hosted Status API for repos, goal ids, or
 * run targets the local daemon does not own (or when the daemon is older).
 */
function createTaskApi(client: DaemonClient, ensureCloud: () => Promise<TaskRequest>): TaskApi {
  const localGoals = client.supportsLocalGoals();
  let indexPromise: Promise<LocalGoalIndex> | null = null;
  const localIndex = (): Promise<LocalGoalIndex> => {
    indexPromise ??= client.listGoals({ filter: "all" }).then((payload) => ({
      goalIds: new Set(payload.goals.map((goal) => goal.id)),
      repoKeys: new Set(payload.repos.map((repo) => repo.repoKey)),
      hostIds: new Set(payload.repos.flatMap((repo) => repo.hosts.map((host) => host.hostId))),
    }));
    return indexPromise;
  };
  const assertLocalHost = async (hostId: string): Promise<void> => {
    if (!(await localIndex()).hostIds.has(hostId)) {
      throw new Error("The requested run target is not published by this daemon");
    }
  };

  return {
    async listTasks(input) {
      if (localGoals && (!input.repoKey || (await localIndex()).repoKeys.has(input.repoKey))) {
        const payload = await client.listGoals({
          filter: GoalListFilterSchema.parse(input.filter),
          repoKey: input.repoKey ?? null,
          parentGoalId: input.parentGoalId,
        });
        return input.sourceKind
          ? payload.goals.filter((goal) => goal.source?.kind === input.sourceKind)
          : payload.goals;
      }
      return cloudListTasks(await ensureCloud(), input);
    },

    async getTask(id) {
      if (localGoals && (await localIndex()).goalIds.has(id)) {
        return client.getGoal(id);
      }
      return (await ensureCloud())(`/tasks/${encodeURIComponent(id)}`);
    },

    async createTask(body) {
      if (localGoals) {
        const index = await localIndex();
        const foreignHost = body.hostId !== undefined && !index.hostIds.has(body.hostId);
        if (!foreignHost && index.repoKeys.has(body.repoKey)) {
          return client.createGoal({
            idempotencyKey: body.requestId,
            repoKey: body.repoKey,
            title: body.title,
            summary: body.summary,
            ...(body.acceptance ? { acceptance: body.acceptance } : {}),
            ...(body.parentGoalId ? { parentGoalId: body.parentGoalId } : {}),
            ...(body.dependsOn ? { dependsOn: body.dependsOn } : {}),
            ...(body.agent !== undefined ? { agent: body.agent } : {}),
            ...(body.start !== undefined ? { start: body.start } : {}),
            ...(body.attachedAgentRef ? { attachedAgentRef: body.attachedAgentRef } : {}),
            ...(body.source ? { source: body.source } : {}),
            ...(body.paths ? { paths: body.paths } : {}),
          });
        }
      }
      return (await ensureCloud())("/tasks", "POST", body);
    },

    async actOnTask(id, action, body) {
      if (localGoals && (await localIndex()).goalIds.has(id)) {
        if (body.hostId) await assertLocalHost(body.hostId);
        return client.actOnGoal({
          goalId: id,
          action,
          ...(body.instruction ? { instruction: body.instruction } : {}),
          ...(body.agent !== undefined ? { agent: body.agent } : {}),
          ...(body.confirmExecutionStopped ? { confirmExecutionStopped: true } : {}),
          ...(body.mergeMethod ? { mergeMethod: body.mergeMethod } : {}),
        });
      }
      return (await ensureCloud())(`/tasks/${encodeURIComponent(id)}/${action}`, "POST", body);
    },

    async submitTaskReview(id, body) {
      if (localGoals && (await localIndex()).goalIds.has(id)) {
        return client.submitGoalReview({
          goalId: id,
          runId: body.runId,
          message: body.message,
          evidence: GoalEvidenceSchema.parse(body.evidence),
        });
      }
      return (await ensureCloud())(`/tasks/${encodeURIComponent(id)}/submit`, "POST", body);
    },

    async attachSession(input) {
      if (localGoals) {
        const index = await localIndex();
        if (index.repoKeys.has(input.repoKey)) {
          const payload = await client.listGoals({ repoKey: input.repoKey });
          const repo = payload.repos.find((candidate) => candidate.repoKey === input.repoKey);
          const host = repo?.hosts[0];
          if (repo && host) {
            return client.createGoal({
              idempotencyKey: input.requestId,
              repoKey: input.repoKey,
              title: input.title,
              summary: input.summary,
              ...(input.acceptance ? { acceptance: input.acceptance } : {}),
              ...(input.parentGoalId ? { parentGoalId: input.parentGoalId } : {}),
              attachedAgentRef: input.agentId,
              source: {
                kind: "session",
                key: `${host.hostId}/${input.agentId}`,
                url: null,
              },
            });
          }
        }
      }
      return createCloudAttach(client, await ensureCloud())(input);
    },
  };
}

/** An invocation borrows an enrolled client session; no host session is replaced. */
export async function withTaskApi<T>(
  options: CommandOptions,
  operation: (api: TaskApi, client: DaemonClient) => Promise<T>,
): Promise<T> {
  const client = await connectToDaemon({ target: options.daemonTarget });
  const cloud: { request: TaskRequest | null } = { request: null };
  try {
    const ensureCloud = async (): Promise<TaskRequest> => {
      if (cloud.request) return cloud.request;
      const enrollment = ClawMuseStatusCreateMobileEnrollmentResponseSchema.shape.payload.parse(
        await client.createClawMuseStatusEnrollment(),
      );
      const base = new URL(enrollment.statusBaseUrl);
      if (
        base.protocol !== "https:" &&
        !(base.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname))
      ) {
        throw new Error("Task service requires HTTPS or loopback HTTP");
      }
      const send = async (
        path: string,
        method: string,
        body: unknown,
        token?: string,
      ): Promise<unknown> => {
        const response = await fetch(new URL(path, base), {
          method,
          redirect: "error",
          signal: AbortSignal.timeout(20_000),
          headers: {
            "content-type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const value: unknown = await response.json();
        if (!response.ok) {
          const failure = z
            .object({ error: z.string(), message: z.string().optional() })
            .safeParse(value);
          if (!failure.success) {
            throw new Error(`Task service HTTP ${response.status}`);
          }
          throw new Error(failure.data.message ?? failure.data.error);
        }
        return value;
      };
      const session = z.object({ accessToken: z.string() }).parse(
        await send("/v1/mobile/enrollments", "POST", {
          enrollmentCode: enrollment.enrollmentCode,
          idempotencyKey: randomUUID(),
          platform: "browser",
          locale: "zh-Hans",
        }),
      );
      cloud.request = (path, method = "GET", body) =>
        send(`/v1/mobile${path}`, method, body, session.accessToken);
      return cloud.request;
    };
    const api = createTaskApi(client, ensureCloud);
    return await operation(api, client);
  } finally {
    if (cloud.request) {
      await cloud.request("/installation", "DELETE").catch(() => {
        process.stderr.write(
          "Task session cleanup failed; the short-lived access token will expire.\n",
        );
      });
    }
    await client.close();
  }
}
