import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { GoalDetailWire, GoalRepoWire, GoalWire } from "@getpaseo/protocol/goals";
import { create } from "zustand";
import { hostSupportsFeature } from "@/runtime/host-features";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import type { ClawMuseStatusApiClient } from "../api";
import { getClawMuseStatusApiClient, subscribeClawMuseStatusApiClient } from "../api-access";
import { mergeGoalIntoList, sortGoalsForFilter } from "./presentation";
import type {
  CreateGoalInput,
  Goal,
  GoalDetail,
  GoalEvidence,
  GoalListFilter,
  GoalMergeMethod,
  GoalRepo,
  GoalRepoHost,
  GoalRepoPlanRun,
  GoalRun,
  GoalTarget,
} from "./types";

export type GoalsLoadStatus = "idle" | "loading" | "loaded" | "error";

export type GoalActionId = "accept" | "discard" | "approve" | "continue" | "pause" | "land";

export type GoalsUnavailableReason = "no_hosts" | "host_needs_update" | "not_enrolled" | null;

export interface GoalDetailState {
  goalId: string;
  status: GoalsLoadStatus;
  goal: GoalDetail | null;
  error: string | null;
}

export interface GoalsState {
  filter: GoalListFilter;
  repoKey: string | null;
  goals: Goal[];
  repos: GoalRepo[];
  status: GoalsLoadStatus;
  /** True while a reload runs over already-loaded data. */
  refreshing: boolean;
  error: string | null;
  /** Set when neither a connected localGoals daemon nor a status session is available. */
  unavailable: boolean;
  unavailableReason: GoalsUnavailableReason;
  detail: GoalDetailState | null;
  pendingActionGoalId: string | null;

  setFilter: (filter: GoalListFilter) => void;
  setRepoKey: (repoKey: string | null) => void;
  load: () => Promise<void>;
  openDetail: (goalId: string) => Promise<void>;
  closeDetail: () => void;
  act: (goalId: string, action: GoalActionId, input?: ActionInput) => Promise<Goal | null>;
  createGoal: (input: CreateGoalInput) => Promise<Goal>;
  requestPlan: (repoKey: string, target?: GoalTarget) => Promise<"queued" | "already_open">;
  /** The service remembers targets per repository; re-read them after a choice. */
  reloadRepos: () => Promise<void>;
  setRepoPlanEnabled: (repoKey: string, planEnabled: boolean) => Promise<void>;
}

export interface ActionInput {
  confirmExecutionStopped?: boolean;
  budgetRuns?: number;
  instruction?: string;
  target?: GoalTarget;
  mergeMethod?: GoalMergeMethod;
}

interface OnlineGoalDaemonHost {
  serverId: string;
  label: string;
  client: DaemonClient;
}

const goalServerById = new Map<string, string>();

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requireStatusClient(): ClawMuseStatusApiClient {
  const client = getClawMuseStatusApiClient();
  if (!client) {
    throw new Error("status_not_enrolled");
  }
  return client;
}

function resolveGoalDaemonHosts(): {
  localGoalsHosts: OnlineGoalDaemonHost[];
  hasSettlingHost: boolean;
  hasLegacyOnlineHost: boolean;
  hostLabels: Map<string, string>;
} {
  const runtime = getHostRuntimeStore();
  const hosts = runtime.getHosts();
  const sessions = useSessionStore.getState().sessions;
  const localGoalsHosts: OnlineGoalDaemonHost[] = [];
  const hostLabels = new Map<string, string>();
  let hasSettlingHost = false;
  let hasLegacyOnlineHost = false;

  for (const host of hosts) {
    hostLabels.set(host.serverId, host.label);
    const snapshot = runtime.getSnapshot(host.serverId);
    const connectionStatus = snapshot?.connectionStatus ?? "connecting";
    if (connectionStatus === "connecting" || connectionStatus === "idle") {
      hasSettlingHost = true;
      continue;
    }
    if (connectionStatus !== "online") {
      continue;
    }
    const client = runtime.getClient(host.serverId);
    const serverInfo = sessions[host.serverId]?.serverInfo ?? null;
    if (!client || !serverInfo) {
      hasSettlingHost = true;
      continue;
    }
    if (hostSupportsFeature(serverInfo, "localGoals")) {
      localGoalsHosts.push({ serverId: host.serverId, label: host.label, client });
    } else {
      hasLegacyOnlineHost = true;
    }
  }

  return { localGoalsHosts, hasSettlingHost, hasLegacyOnlineHost, hostLabels };
}

function enrichGoalRun(
  run: GoalRun,
  fallbackServerId: string,
  hostLabels: ReadonlyMap<string, string>,
): GoalRun {
  const serverId = run.serverId ?? fallbackServerId;
  const friendlyHost =
    (run.hostId ? hostLabels.get(run.hostId) : undefined) ??
    hostLabels.get(serverId) ??
    run.hostDisplayName ??
    null;
  return {
    ...run,
    serverId,
    hostDisplayName: friendlyHost,
  };
}

function enrichGoalFromDaemon(
  wire: GoalWire,
  serverId: string,
  hostLabels: ReadonlyMap<string, string>,
): Goal {
  const resolvedServerId = wire.serverId ?? serverId;
  goalServerById.set(wire.id, resolvedServerId);
  const friendlyHost =
    (wire.hostId ? hostLabels.get(wire.hostId) : undefined) ??
    hostLabels.get(resolvedServerId) ??
    wire.hostDisplayName ??
    null;
  return {
    ...wire,
    serverId: resolvedServerId,
    hostDisplayName: friendlyHost,
    currentRun: wire.currentRun
      ? enrichGoalRun(wire.currentRun, resolvedServerId, hostLabels)
      : null,
  };
}

function enrichGoalDetailFromDaemon(
  wire: GoalDetailWire,
  serverId: string,
  hostLabels: ReadonlyMap<string, string>,
): GoalDetail {
  const base = enrichGoalFromDaemon(wire, serverId, hostLabels);
  const resolvedServerId = base.serverId ?? serverId;
  return {
    ...base,
    runs: wire.runs.map((run) => enrichGoalRun(run, resolvedServerId, hostLabels)),
    reports: wire.reports,
  };
}

function normalizeRepoHosts(
  rawHosts: GoalRepoWire["hosts"],
  serverId: string,
  label: string,
  hostLabels: ReadonlyMap<string, string>,
): GoalRepoHost[] {
  const result: GoalRepoHost[] = [];
  for (const host of rawHosts) {
    const hostServerId = host.serverId ?? serverId;
    result.push({
      hostId: host.hostId,
      serverId: hostServerId,
      relayHostId: host.relayHostId,
      displayName: hostLabels.get(hostServerId) ?? host.displayName ?? label,
      connectivity: host.connectivity,
    });
  }
  return result;
}

function pickNewerPlanRun(
  existing: GoalRepoPlanRun | null,
  incoming: GoalRepoPlanRun | null,
): GoalRepoPlanRun | null {
  if (!existing) return incoming;
  if (!incoming) return existing;
  return incoming.createdAt > existing.createdAt ? incoming : existing;
}

function pickLatestTimestamp(left: number | null, right: number | null): number | null {
  if (left !== null && right !== null) return Math.max(left, right);
  return left ?? right;
}

function combineGoalRepoEntry(
  existing: GoalRepo | undefined,
  rawRepo: GoalRepoWire,
  normalizedHosts: GoalRepoHost[],
  incomingPlanRun: GoalRepoPlanRun | null,
): GoalRepo {
  if (!existing) {
    return {
      repoKey: rawRepo.repoKey,
      displayName: rawRepo.displayName,
      planEnabled: rawRepo.planEnabled,
      lastPlannedAt: rawRepo.lastPlannedAt,
      preferredHostId: rawRepo.preferredHostId,
      planAgent: rawRepo.planAgent,
      executeAgent: rawRepo.executeAgent,
      lastPlanRun: incomingPlanRun,
      hosts: normalizedHosts,
      suggestedCount: rawRepo.suggestedCount,
      activeCount: rawRepo.activeCount,
    };
  }

  const seenHostIds = new Set(existing.hosts.map((h) => h.hostId));
  const mergedHosts = [...existing.hosts];
  for (const host of normalizedHosts) {
    if (!seenHostIds.has(host.hostId)) {
      seenHostIds.add(host.hostId);
      mergedHosts.push(host);
    }
  }

  return {
    ...existing,
    planEnabled: existing.planEnabled || rawRepo.planEnabled,
    lastPlannedAt: pickLatestTimestamp(existing.lastPlannedAt, rawRepo.lastPlannedAt),
    preferredHostId: existing.preferredHostId ?? rawRepo.preferredHostId,
    planAgent: existing.planAgent ?? rawRepo.planAgent,
    executeAgent: existing.executeAgent ?? rawRepo.executeAgent,
    lastPlanRun: pickNewerPlanRun(existing.lastPlanRun, incomingPlanRun),
    hosts: mergedHosts,
    suggestedCount: existing.suggestedCount + rawRepo.suggestedCount,
    activeCount: existing.activeCount + rawRepo.activeCount,
  };
}

function mergeDaemonRepos(
  entries: ReadonlyArray<{
    serverId: string;
    label: string;
    repos: readonly GoalRepoWire[];
  }>,
  hostLabels: ReadonlyMap<string, string>,
): GoalRepo[] {
  const byKey = new Map<string, GoalRepo>();

  for (const entry of entries) {
    for (const rawRepo of entry.repos) {
      const normalizedHosts = normalizeRepoHosts(
        rawRepo.hosts,
        entry.serverId,
        entry.label,
        hostLabels,
      );
      const incomingPlanRun = rawRepo.lastPlanRun
        ? {
            ...rawRepo.lastPlanRun,
            hostDisplayName: entry.label || rawRepo.lastPlanRun.hostDisplayName,
          }
        : null;
      byKey.set(
        rawRepo.repoKey,
        combineGoalRepoEntry(byKey.get(rawRepo.repoKey), rawRepo, normalizedHosts, incomingPlanRun),
      );
    }
  }

  return Array.from(byKey.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function selectDaemonForRepo(
  repoKey: string,
  preferredHostId: string | null | undefined,
  repos: readonly GoalRepo[],
  localGoalsHosts: readonly OnlineGoalDaemonHost[],
): OnlineGoalDaemonHost | null {
  if (localGoalsHosts.length === 0) {
    return null;
  }
  if (preferredHostId) {
    const explicit = localGoalsHosts.find((host) => host.serverId === preferredHostId);
    if (explicit) {
      return explicit;
    }
  }
  const repo = repos.find((candidate) => candidate.repoKey === repoKey);
  if (repo) {
    for (const repoHost of repo.hosts) {
      const serverId = repoHost.serverId ?? repoHost.hostId;
      const match = localGoalsHosts.find((host) => host.serverId === serverId);
      if (match) {
        return match;
      }
    }
  }
  return localGoalsHosts[0] ?? null;
}

function selectDaemonForGoal(
  goalId: string,
  state: Pick<GoalsState, "goals" | "detail">,
  localGoalsHosts: readonly OnlineGoalDaemonHost[],
): OnlineGoalDaemonHost | null {
  if (localGoalsHosts.length === 0) {
    return null;
  }
  const knownServerId =
    (state.detail?.goalId === goalId ? state.detail.goal?.serverId : null) ??
    state.goals.find((candidate) => candidate.id === goalId)?.serverId ??
    goalServerById.get(goalId) ??
    null;
  if (knownServerId) {
    const match = localGoalsHosts.find((host) => host.serverId === knownServerId);
    if (match) {
      return match;
    }
  }
  return localGoalsHosts[0] ?? null;
}

function sendStatusGoalAction(
  client: ClawMuseStatusApiClient,
  goalId: string,
  action: GoalActionId,
  input: ActionInput | undefined,
): Promise<Goal> {
  switch (action) {
    case "accept":
      return client.acceptGoal(goalId, {
        ...(input?.budgetRuns === undefined ? {} : { budgetRuns: input.budgetRuns }),
        ...(input?.target ? { target: input.target } : {}),
      });
    case "discard":
      return client.discardGoal(goalId);
    case "approve":
      return client.approveGoal(goalId);
    case "land":
      return client.landGoal(goalId, { mergeMethod: input?.mergeMethod });
    case "continue":
      return client.continueGoal(goalId, {
        ...(input?.confirmExecutionStopped ? { confirmExecutionStopped: true } : {}),
        ...(input?.instruction ? { instruction: input.instruction } : {}),
        ...(input?.target ? { target: input.target } : {}),
      });
    case "pause":
      return client.pauseGoal(goalId);
  }
}

function withUpdatedRepoPlanFlag(
  repos: readonly GoalRepo[],
  repoKey: string,
  planEnabled: boolean,
): GoalRepo[] {
  const next: GoalRepo[] = [];
  for (const repo of repos) {
    next.push(repo.repoKey === repoKey ? { ...repo, planEnabled } : repo);
  }
  return next;
}

export async function submitGoalTaskReview(
  goalId: string,
  input: {
    runId: string;
    message: string;
    evidence: GoalEvidence;
  },
): Promise<void> {
  const { localGoalsHosts, hostLabels } = resolveGoalDaemonHosts();
  const state = useGoalsStore.getState();
  const daemonHost = selectDaemonForGoal(goalId, state, localGoalsHosts);
  if (daemonHost) {
    const response = await daemonHost.client.submitGoalReview({
      goalId,
      runId: input.runId,
      message: input.message,
      evidence: input.evidence,
    });
    enrichGoalDetailFromDaemon(response.goal, daemonHost.serverId, hostLabels);
    return;
  }
  await requireStatusClient().submitTaskReview(goalId, input);
}

async function fetchDaemonGoalLists(
  localGoalsHosts: readonly OnlineGoalDaemonHost[],
  filter: GoalListFilter,
  repoKey: string | null,
  hostLabels: ReadonlyMap<string, string>,
): Promise<{
  fulfilled: Array<{
    serverId: string;
    label: string;
    goals: Goal[];
    repos: readonly GoalRepoWire[];
  }>;
  firstError: unknown;
}> {
  const settled = await Promise.allSettled(
    localGoalsHosts.map(async (host) => {
      const payload = await host.client.listGoals({ filter, repoKey });
      return {
        serverId: host.serverId,
        label: host.label,
        goals: payload.goals.map((goal) => enrichGoalFromDaemon(goal, host.serverId, hostLabels)),
        repos: payload.repos,
      };
    }),
  );

  const fulfilled: Array<{
    serverId: string;
    label: string;
    goals: Goal[];
    repos: readonly GoalRepoWire[];
  }> = [];
  let firstError: unknown = null;
  for (const item of settled) {
    if (item.status === "fulfilled") {
      fulfilled.push(item.value);
    } else if (firstError === null) {
      firstError = item.reason;
    }
  }
  return { fulfilled, firstError };
}

async function executeDaemonGoalAction(
  daemonHost: OnlineGoalDaemonHost,
  localGoalsHosts: readonly OnlineGoalDaemonHost[],
  hostLabels: ReadonlyMap<string, string>,
  goalId: string,
  action: GoalActionId,
  input: ActionInput | undefined,
): Promise<Goal> {
  const targetHost =
    (input?.target?.hostId
      ? localGoalsHosts.find((host) => host.serverId === input.target?.hostId)
      : null) ?? daemonHost;
  const payload = await targetHost.client.actOnGoal({
    goalId,
    action,
    ...(input?.budgetRuns !== undefined ? { budgetRuns: input.budgetRuns } : {}),
    ...(input?.instruction ? { instruction: input.instruction } : {}),
    ...(input?.target ? { agent: input.target.agent } : {}),
    ...(input?.confirmExecutionStopped ? { confirmExecutionStopped: true } : {}),
    ...(input?.mergeMethod === undefined ? {} : { mergeMethod: input.mergeMethod }),
  });
  return enrichGoalFromDaemon(payload.goal, targetHost.serverId, hostLabels);
}

export const useGoalsStore = create<GoalsState>((set, get) => {
  const commitActionGoal = (goalId: string, goal: Goal, input: ActionInput | undefined): Goal => {
    const { goals, filter, detail } = get();
    set({
      goals: mergeGoalIntoList(goals, goal, filter),
      detail:
        detail && detail.goalId === goalId && detail.goal
          ? { ...detail, goal: { ...detail.goal, ...goal } }
          : detail,
    });
    if (detail?.goalId === goalId) {
      void get().openDetail(goalId);
    }
    if (input?.target) {
      void get().reloadRepos();
    }
    return goal;
  };

  return {
    filter: "all",
    repoKey: null,
    goals: [],
    repos: [],
    status: "idle",
    refreshing: false,
    error: null,
    unavailable: false,
    unavailableReason: null,
    detail: null,
    pendingActionGoalId: null,

    setFilter: (filter) => {
      if (get().filter === filter) {
        return;
      }
      set({ filter, goals: [], status: "idle" });
      void get().load();
    },

    setRepoKey: (repoKey) => {
      if (get().repoKey === repoKey) {
        return;
      }
      set({ repoKey, goals: [], status: "idle" });
      void get().load();
    },

    load: async () => {
      const { filter, repoKey, status } = get();
      const { localGoalsHosts, hasSettlingHost, hasLegacyOnlineHost, hostLabels } =
        resolveGoalDaemonHosts();

      if (localGoalsHosts.length > 0) {
        set({
          unavailable: false,
          unavailableReason: null,
          refreshing: status === "loaded",
          status: status === "loaded" ? "loaded" : "loading",
          error: null,
        });
        const { fulfilled, firstError } = await fetchDaemonGoalLists(
          localGoalsHosts,
          filter,
          repoKey,
          hostLabels,
        );
        if (get().filter !== filter || get().repoKey !== repoKey) {
          return;
        }
        if (fulfilled.length === 0 && firstError !== null) {
          set({ status: "error", refreshing: false, error: describe(firstError) });
          return;
        }
        set({
          goals: sortGoalsForFilter(
            fulfilled.flatMap((entry) => entry.goals),
            filter,
          ),
          repos: mergeDaemonRepos(fulfilled, hostLabels),
          status: "loaded",
          refreshing: false,
          unavailable: false,
          unavailableReason: null,
        });
        return;
      }

      const statusClient = getClawMuseStatusApiClient();
      if (statusClient && (await statusClient.hasSession())) {
        set({
          unavailable: false,
          unavailableReason: null,
          refreshing: status === "loaded",
          status: status === "loaded" ? "loaded" : "loading",
          error: null,
        });
        try {
          const [goals, repos] = await Promise.all([
            statusClient.listGoals(filter, repoKey),
            statusClient.listGoalRepos(),
          ]);
          if (
            getClawMuseStatusApiClient() !== statusClient ||
            get().filter !== filter ||
            get().repoKey !== repoKey
          ) {
            return;
          }
          set({
            goals: sortGoalsForFilter(goals, filter),
            repos,
            status: "loaded",
            refreshing: false,
            unavailable: false,
            unavailableReason: null,
          });
        } catch (error) {
          if (getClawMuseStatusApiClient() !== statusClient) return;
          set({ status: "error", refreshing: false, error: describe(error) });
        }
        return;
      }

      if (hasSettlingHost) {
        set({
          unavailable: false,
          unavailableReason: null,
          status: status === "loaded" ? "loaded" : "loading",
          error: null,
        });
        return;
      }

      set({
        unavailable: true,
        unavailableReason: hasLegacyOnlineHost ? "host_needs_update" : "no_hosts",
        status: "loaded",
        goals: [],
        repos: [],
        refreshing: false,
        error: null,
      });
    },

    openDetail: async (goalId) => {
      set({ detail: { goalId, status: "loading", goal: null, error: null } });
      const { localGoalsHosts, hostLabels } = resolveGoalDaemonHosts();
      if (localGoalsHosts.length > 0) {
        const preferred = selectDaemonForGoal(goalId, get(), localGoalsHosts);
        const ordered = preferred
          ? [preferred, ...localGoalsHosts.filter((host) => host.serverId !== preferred.serverId)]
          : localGoalsHosts;
        let lastError: unknown = null;
        for (const host of ordered) {
          try {
            const payload = await host.client.getGoal(goalId);
            if (get().detail?.goalId !== goalId) {
              return;
            }
            const goal = enrichGoalDetailFromDaemon(payload.goal, host.serverId, hostLabels);
            set({ detail: { goalId, status: "loaded", goal, error: null } });
            return;
          } catch (error) {
            lastError = error;
          }
        }
        if (get().detail?.goalId === goalId) {
          set({
            detail: {
              goalId,
              status: "error",
              goal: null,
              error: describe(lastError ?? new Error("goal_not_found")),
            },
          });
        }
        return;
      }

      const client = getClawMuseStatusApiClient();
      if (!client) {
        set({ detail: { goalId, status: "error", goal: null, error: "status_not_enrolled" } });
        return;
      }
      try {
        const goal = await client.getGoal(goalId);
        if (getClawMuseStatusApiClient() !== client || get().detail?.goalId !== goalId) {
          return;
        }
        set({ detail: { goalId, status: "loaded", goal, error: null } });
      } catch (error) {
        if (getClawMuseStatusApiClient() !== client || get().detail?.goalId !== goalId) {
          return;
        }
        set({ detail: { goalId, status: "error", goal: null, error: describe(error) } });
      }
    },

    closeDetail: () => set({ detail: null }),

    act: async (goalId, action, input) => {
      if (get().pendingActionGoalId !== null) throw new Error("goal_action_pending");
      const { localGoalsHosts, hostLabels } = resolveGoalDaemonHosts();
      const daemonHost = selectDaemonForGoal(goalId, get(), localGoalsHosts);

      if (daemonHost) {
        set({ pendingActionGoalId: goalId });
        try {
          const goal = await executeDaemonGoalAction(
            daemonHost,
            localGoalsHosts,
            hostLabels,
            goalId,
            action,
            input,
          );
          return commitActionGoal(goalId, goal, input);
        } finally {
          if (get().pendingActionGoalId === goalId) {
            set({ pendingActionGoalId: null });
          }
        }
      }

      const client = requireStatusClient();
      set({ pendingActionGoalId: goalId });
      try {
        const goal = await sendStatusGoalAction(client, goalId, action, input);
        if (getClawMuseStatusApiClient() !== client) return null;
        return commitActionGoal(goalId, goal, input);
      } finally {
        if (get().pendingActionGoalId === goalId) {
          set({ pendingActionGoalId: null });
        }
      }
    },

    createGoal: async (input) => {
      const { localGoalsHosts, hostLabels } = resolveGoalDaemonHosts();
      const daemonHost = selectDaemonForRepo(
        input.repoKey,
        input.hostId,
        get().repos,
        localGoalsHosts,
      );
      if (daemonHost) {
        const payload = await daemonHost.client.createGoal({
          ...(input.requestId ? { idempotencyKey: input.requestId } : {}),
          repoKey: input.repoKey,
          title: input.title,
          summary: input.summary,
          ...(input.acceptance !== undefined ? { acceptance: input.acceptance } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.budgetRuns !== undefined ? { budgetRuns: input.budgetRuns } : {}),
          ...(input.start !== undefined ? { start: input.start } : {}),
          ...(input.parentGoalId ? { parentGoalId: input.parentGoalId } : {}),
          ...(input.dependsOn?.length ? { dependsOn: input.dependsOn } : {}),
          ...(input.agent !== undefined ? { agent: input.agent } : {}),
        });
        const goal = enrichGoalFromDaemon(payload.goal, daemonHost.serverId, hostLabels);
        const { goals, filter } = get();
        set({ goals: mergeGoalIntoList(goals, goal, filter) });
        void get().reloadRepos();
        return goal;
      }

      const client = requireStatusClient();
      const goal = await client.createGoal(input);
      if (getClawMuseStatusApiClient() !== client) throw new Error("status_session_changed");
      const { goals, filter } = get();
      set({ goals: mergeGoalIntoList(goals, goal, filter) });
      void get().reloadRepos();
      return goal;
    },

    requestPlan: async (repoKey, target) => {
      const { localGoalsHosts } = resolveGoalDaemonHosts();
      const daemonHost = selectDaemonForRepo(repoKey, target?.hostId, get().repos, localGoalsHosts);
      if (daemonHost) {
        const payload = await daemonHost.client.requestGoalPlan({
          repoKey,
          ...(target?.agent !== undefined ? { agent: target.agent } : {}),
        });
        void get().reloadRepos();
        return payload.outcome;
      }

      const result = await requireStatusClient().requestGoalPlan(repoKey, target);
      void get().reloadRepos();
      return result.outcome;
    },

    reloadRepos: async () => {
      const { localGoalsHosts, hostLabels } = resolveGoalDaemonHosts();
      if (localGoalsHosts.length > 0) {
        const settled = await Promise.allSettled(
          localGoalsHosts.map(async (host) => {
            const payload = await host.client.listGoals({ filter: get().filter, repoKey: null });
            return { serverId: host.serverId, label: host.label, repos: payload.repos };
          }),
        );
        const fulfilled = settled
          .filter(
            (
              item,
            ): item is PromiseFulfilledResult<{
              serverId: string;
              label: string;
              repos: GoalRepoWire[];
            }> => item.status === "fulfilled",
          )
          .map((item) => item.value);
        if (fulfilled.length > 0) {
          set({ repos: mergeDaemonRepos(fulfilled, hostLabels) });
        }
        return;
      }

      const client = getClawMuseStatusApiClient();
      if (!client) {
        return;
      }
      try {
        const repos = await client.listGoalRepos();
        if (getClawMuseStatusApiClient() === client) set({ repos });
      } catch {
        // The next full load picks it up.
      }
    },

    setRepoPlanEnabled: async (repoKey, planEnabled) => {
      const { localGoalsHosts } = resolveGoalDaemonHosts();
      if (localGoalsHosts.length > 0) {
        const repo = get().repos.find((candidate) => candidate.repoKey === repoKey);
        const matchingHosts = repo
          ? localGoalsHosts.filter((host) =>
              repo.hosts.some(
                (repoHost) => (repoHost.serverId ?? repoHost.hostId) === host.serverId,
              ),
            )
          : localGoalsHosts;
        const targets = matchingHosts.length > 0 ? matchingHosts : localGoalsHosts;
        await Promise.all(
          targets.map((host) => host.client.setGoalRepoPlanEnabled({ repoKey, planEnabled })),
        );
        set({ repos: withUpdatedRepoPlanFlag(get().repos, repoKey, planEnabled) });
        return;
      }

      await requireStatusClient().setGoalRepoPlanEnabled(repoKey, planEnabled);
      set({ repos: withUpdatedRepoPlanFlag(get().repos, repoKey, planEnabled) });
    },
  };
});

subscribeClawMuseStatusApiClient(() => {
  useGoalsStore.setState({
    goals: [],
    repos: [],
    detail: null,
    status: "idle",
    error: null,
    pendingActionGoalId: null,
    unavailable: false,
    unavailableReason: null,
    refreshing: false,
  });
});
