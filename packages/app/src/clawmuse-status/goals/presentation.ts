import type { StatusBadgeVariant } from "@/components/ui/status-badge";
import type { Goal, GoalListFilter, GoalReviewReason, GoalRun, GoalStatus } from "./types";
import type { ClawMuseStatusHostBinding } from "../binding-state";

export function goalExecutionTarget(
  run: Pick<GoalRun, "agentRef" | "relayHostId">,
  hosts: Readonly<Record<string, ClawMuseStatusHostBinding>>,
): { serverId: string; agentId: string } | null {
  if (!run.agentRef || !run.relayHostId) return null;
  const serverId = Object.entries(hosts).find(
    ([, binding]) => binding.kind === "bound" && binding.relayHostId === run.relayHostId,
  )?.[0];
  return serverId ? { serverId, agentId: run.agentRef } : null;
}

export const GOAL_LIST_FILTERS: readonly GoalListFilter[] = [
  "suggested",
  "active",
  "needs_review",
  "closed",
  "all",
];

const FILTER_STATUSES: Record<GoalListFilter, readonly GoalStatus[]> = {
  all: [
    "suggested",
    "accepted",
    "running",
    "needs_review",
    "done",
    "discarded",
    "paused",
    "waiting_on_children",
    "waiting_on_dependencies",
  ],
  suggested: ["suggested"],
  active: ["accepted", "running", "paused", "waiting_on_children", "waiting_on_dependencies"],
  needs_review: ["needs_review"],
  closed: ["done", "discarded"],
};

export function filterForStatus(status: GoalStatus): GoalListFilter {
  for (const filter of GOAL_LIST_FILTERS) {
    if (FILTER_STATUSES[filter].includes(status)) {
      return filter;
    }
  }
  return "closed";
}

/** Which translation key names a goal's status pill; `needs_review` says why. */
export function goalStatusLabelKey(
  goal: Pick<Goal, "status" | "reviewReason" | "blockedBy">,
): string {
  if (
    goal.status === "waiting_on_dependencies" ||
    (goal.status === "accepted" && goal.blockedBy?.length)
  )
    return "clawmuseStatus.goals.status.waiting_on_dependencies";
  if (goal.status === "needs_review" && goal.reviewReason) {
    return `clawmuseStatus.goals.reviewReason.${goal.reviewReason}`;
  }
  return `clawmuseStatus.goals.status.${goal.status}`;
}

export function goalStatusBadgeVariant(
  goal: Pick<Goal, "status" | "reviewReason">,
): StatusBadgeVariant {
  switch (goal.status) {
    case "running":
    case "accepted":
      return "success";
    case "waiting_on_children":
    case "waiting_on_dependencies":
      return "warning";
    case "needs_review":
      return reviewVariant(goal.reviewReason);
    case "done":
      return "success";
    case "suggested":
    case "paused":
    case "discarded":
      return "muted";
  }
}

function reviewVariant(reason: GoalReviewReason | null): StatusBadgeVariant {
  switch (reason) {
    case "completed":
      return "success";
    case "failed":
      return "error";
    case "blocked":
    case "needs_decision":
    case "budget_exhausted":
      return "warning";
    case "nothing_to_do":
    case null:
      return "muted";
  }
}

/**
 * After a mutation the service returns the whole goal. It stays in the list only
 * while it still belongs to the active filter; otherwise it leaves so the list
 * matches what a fresh load would show.
 */
export function mergeGoalIntoList(
  goals: readonly Goal[],
  goal: Goal,
  filter: GoalListFilter,
): Goal[] {
  const belongs = FILTER_STATUSES[filter].includes(goal.status);
  const index = goals.findIndex((candidate) => candidate.id === goal.id);
  if (index === -1) {
    return belongs ? [goal, ...goals] : [...goals];
  }
  if (!belongs) {
    return goals.filter((candidate) => candidate.id !== goal.id);
  }
  const next = [...goals];
  next[index] = goal;
  return next;
}

export interface GoalAction {
  id: "accept" | "discard" | "approve" | "continue" | "pause";
  /** The one accent button per surface; everything else is secondary/outline. */
  primary: boolean;
  destructive: boolean;
  /**
   * Opens the inline run setup (host, model, and for continue an instruction)
   * instead of acting immediately.
   */
  setup: "accept" | "continue" | null;
}

/** The actions a goal offers from its current state, in display order. */
export function goalActions(
  goal: Pick<Goal, "status"> & Partial<Pick<Goal, "reviewReason" | "runsUsed">>,
): GoalAction[] {
  switch (goal.status) {
    case "suggested":
      return [
        { id: "accept", primary: true, destructive: false, setup: "accept" },
        { id: "discard", primary: false, destructive: true, setup: null },
      ];
    case "accepted":
    case "running":
    case "waiting_on_children":
    case "waiting_on_dependencies":
      return [
        { id: "pause", primary: false, destructive: false, setup: null },
        { id: "discard", primary: false, destructive: true, setup: null },
      ];
    case "needs_review":
      return [
        ...(goal.reviewReason === "completed" || goal.reviewReason === "nothing_to_do"
          ? [{ id: "approve", primary: true, destructive: false, setup: null } as const]
          : []),
        ...(goal.runsUsed === undefined || goal.runsUsed < 50
          ? [{ id: "continue", primary: false, destructive: false, setup: "continue" } as const]
          : []),
        { id: "discard", primary: false, destructive: true, setup: null },
      ];
    case "paused":
      return [
        ...(goal.runsUsed === undefined || goal.runsUsed < 50
          ? [{ id: "continue", primary: true, destructive: false, setup: "continue" } as const]
          : []),
        { id: "discard", primary: false, destructive: true, setup: null },
      ];
    case "done":
    case "discarded":
      return [];
  }
}

/** Progress line for a card: "2 / 3 runs" style, driven by the caller's t(). */
export function goalBudgetProgress(goal: Pick<Goal, "runsUsed" | "budgetRuns">): {
  used: number;
  budget: number;
} {
  return { used: Math.min(goal.runsUsed, goal.budgetRuns), budget: goal.budgetRuns };
}

export function sortGoalsForFilter(goals: readonly Goal[], filter: GoalListFilter): Goal[] {
  const sorted = [...goals];
  if (filter === "suggested") {
    sorted.sort(
      (left, right) => left.priority - right.priority || right.createdAt - left.createdAt,
    );
  } else {
    sorted.sort((left, right) => right.updatedAt - left.updatedAt);
  }
  return sorted;
}
