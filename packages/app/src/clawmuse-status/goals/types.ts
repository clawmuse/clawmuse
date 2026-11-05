/**
 * Phone-side view of the status service's goals (see
 * services/clawmuse-status/docs/api-contract.md#goals). Dates are unix ms.
 */
export type GoalStatus =
  | "suggested"
  | "accepted"
  | "running"
  | "needs_review"
  | "done"
  | "discarded"
  | "paused"
  | "waiting_on_children"
  | "waiting_on_dependencies";

export type GoalReviewReason =
  | "completed"
  | "blocked"
  | "needs_decision"
  | "nothing_to_do"
  | "failed"
  | "budget_exhausted";

export type GoalReportKind = "progress" | "blocked" | "needs_decision" | "done" | "nothing_to_do";

export type GoalRunKind = "plan" | "execute";

export type GoalRunStatus =
  | "queued"
  | "leased"
  | "running"
  | "succeeded"
  | "failed"
  | "expired"
  | "canceled";

export type GoalListFilter = "all" | "suggested" | "active" | "needs_review" | "closed";

export interface GoalEvidence {
  revision: string;
  checks: Array<{ name: string; result: "passed" | "failed" | "not_run"; detail?: string }>;
  artifacts: Array<{ label: string; url: string }>;
}

export interface GoalReport {
  evidence?: GoalEvidence | null;
  id: string;
  runId: string;
  seq: number;
  kind: GoalReportKind;
  message: string;
  prUrl: string | null;
  createdAt: number;
}

/**
 * Where and with what a goal runs. `hostId` is the status service's host id;
 * `agent` is `provider` or `provider/model`. Null means automatic placement /
 * the host's configured default.
 */
export interface GoalTarget {
  hostId: string | null;
  agent: string | null;
}

export interface GoalRun {
  agentRef?: string | null;
  relayHostId?: string | null;
  id: string;
  kind: GoalRunKind;
  status: GoalRunStatus;
  /** The run stays with its host instead of moving to another live one. */
  pinned: boolean;
  agent: string | null;
  hostId: string | null;
  hostDisplayName: string | null;
  instruction: string | null;
  outcome: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  createdAt: number;
}

export interface Goal {
  parentGoalId?: string | null;
  parentGoalTitle?: string | null;
  dependsOn?: string[];
  blockedBy?: string[];
  children?: Array<{ id: string; title: string; status: GoalStatus }>;
  source?: { kind: string; key: string | null; url: string | null };
  attachedAgentRef?: string | null;
  executionUnconfirmed?: boolean;
  reviewEventVersion?: number;
  id: string;
  repoKey: string;
  repoDisplayName: string;
  title: string;
  summary: string;
  acceptance: string;
  origin: "planner" | "manual";
  status: GoalStatus;
  reviewReason: GoalReviewReason | null;
  priority: number;
  budgetRuns: number;
  runsUsed: number;
  expiresAt: number | null;
  decidedAt: number | null;
  createdAt: number;
  updatedAt: number;
  hostId: string | null;
  hostDisplayName: string | null;
  agent: string | null;
  latestReport: GoalReport | null;
  currentRun: GoalRun | null;
}

export interface GoalDetail extends Goal {
  runs: GoalRun[];
  reports: GoalReport[];
}

export interface GoalRepoHost {
  hostId: string;
  relayHostId: string;
  displayName: string;
  connectivity: "live" | "unverifiable";
}

export interface GoalRepoPlanRun {
  status: GoalRunStatus;
  outcome: string | null;
  hostDisplayName: string | null;
  createdAt: number;
  finishedAt: number | null;
}

export interface GoalRepo {
  repoKey: string;
  displayName: string;
  planEnabled: boolean;
  lastPlannedAt: number | null;
  /** Remembered by the service from the last explicit choice. */
  preferredHostId: string | null;
  planAgent: string | null;
  executeAgent: string | null;
  /** The newest plan run, so "suggest now" can say why nothing appeared. */
  lastPlanRun: GoalRepoPlanRun | null;
  hosts: GoalRepoHost[];
  suggestedCount: number;
  activeCount: number;
}

export interface GoalCounts {
  suggestedCount: number;
  activeCount: number;
  needsReviewCount: number;
}

export interface CreateGoalInput {
  parentGoalId?: string;
  dependsOn?: string[];
  start?: boolean;
  requestId?: string;
  repoKey: string;
  title: string;
  summary: string;
  acceptance?: string;
  priority?: number;
  budgetRuns?: number;
  hostId?: string | null;
  agent?: string | null;
}
