import { create } from "zustand";
import type { ClawMuseStatusApiClient } from "../api";
import { getClawMuseStatusApiClient, subscribeClawMuseStatusApiClient } from "../api-access";
import { mergeGoalIntoList, sortGoalsForFilter } from "./presentation";
import type {
  CreateGoalInput,
  Goal,
  GoalDetail,
  GoalListFilter,
  GoalRepo,
  GoalTarget,
} from "./types";

export type GoalsLoadStatus = "idle" | "loading" | "loaded" | "error";

export type GoalActionId = "accept" | "discard" | "approve" | "continue" | "pause";

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
  /** Set when the phone is not enrolled with a status service at all. */
  unavailable: boolean;
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
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requireClient() {
  const client = getClawMuseStatusApiClient();
  if (!client) {
    throw new Error("status_not_enrolled");
  }
  return client;
}

function sendGoalAction(
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

export const useGoalsStore = create<GoalsState>((set, get) => ({
  filter: "needs_review",
  repoKey: null,
  goals: [],
  repos: [],
  status: "idle",
  refreshing: false,
  error: null,
  unavailable: false,
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
    const client = getClawMuseStatusApiClient();
    if (!client || !(await client.hasSession())) {
      set({ unavailable: true, status: "loaded", goals: [], repos: [], refreshing: false });
      return;
    }
    const { filter, repoKey, status } = get();
    set({
      unavailable: false,
      refreshing: status === "loaded",
      status: status === "loaded" ? "loaded" : "loading",
      error: null,
    });
    try {
      const [goals, repos] = await Promise.all([
        client.listGoals(filter, repoKey),
        client.listGoalRepos(),
      ]);
      // A filter change mid-flight must not land stale rows under the new filter.
      if (
        getClawMuseStatusApiClient() !== client ||
        get().filter !== filter ||
        get().repoKey !== repoKey
      ) {
        return;
      }
      set({ goals: sortGoalsForFilter(goals, filter), repos, status: "loaded", refreshing: false });
    } catch (error) {
      if (getClawMuseStatusApiClient() !== client) return;
      set({ status: "error", refreshing: false, error: describe(error) });
    }
  },

  openDetail: async (goalId) => {
    set({ detail: { goalId, status: "loading", goal: null, error: null } });
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
    const client = requireClient();
    set({ pendingActionGoalId: goalId });
    try {
      const goal = await sendGoalAction(client, goalId, action, input);
      if (getClawMuseStatusApiClient() !== client) return null;
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
    } finally {
      if (get().pendingActionGoalId === goalId) {
        set({ pendingActionGoalId: null });
      }
    }
  },

  createGoal: async (input) => {
    const client = requireClient();
    const goal = await client.createGoal(input);
    if (getClawMuseStatusApiClient() !== client) throw new Error("status_session_changed");
    const { goals, filter } = get();
    set({ goals: mergeGoalIntoList(goals, goal, filter) });
    void get().reloadRepos();
    return goal;
  },

  requestPlan: async (repoKey, target) => {
    const result = await requireClient().requestGoalPlan(repoKey, target);
    void get().reloadRepos();
    return result.outcome;
  },

  reloadRepos: async () => {
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
    await requireClient().setGoalRepoPlanEnabled(repoKey, planEnabled);
    const repos: GoalRepo[] = [];
    for (const repo of get().repos) {
      repos.push(repo.repoKey === repoKey ? { ...repo, planEnabled } : repo);
    }
    set({ repos });
  },
}));

subscribeClawMuseStatusApiClient(() => {
  useGoalsStore.setState({
    goals: [],
    repos: [],
    detail: null,
    status: "idle",
    error: null,
    pendingActionGoalId: null,
    unavailable: false,
    refreshing: false,
  });
});
