import { z } from "zod";
import type {
  Goal,
  GoalCounts,
  GoalDetail,
  GoalRepo,
  GoalRepoHost,
  GoalRepoPlanRun,
  GoalReport,
  GoalReportKind,
  GoalReviewReason,
  GoalRun,
  GoalRunKind,
  GoalRunStatus,
  GoalStatus,
} from "./types";

const GOAL_STATUSES: ReadonlySet<string> = new Set([
  "suggested",
  "accepted",
  "running",
  "needs_review",
  "done",
  "discarded",
  "paused",
  "waiting_on_children",
  "waiting_on_dependencies",
]);
const REVIEW_REASONS: ReadonlySet<string> = new Set([
  "completed",
  "blocked",
  "needs_decision",
  "nothing_to_do",
  "failed",
  "budget_exhausted",
]);
const REPORT_KINDS: ReadonlySet<string> = new Set([
  "progress",
  "blocked",
  "needs_decision",
  "done",
  "nothing_to_do",
]);
const RUN_STATUSES: ReadonlySet<string> = new Set([
  "queued",
  "leased",
  "running",
  "succeeded",
  "failed",
  "expired",
  "canceled",
]);

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid status service response: ${name}`);
  }
  return value as Record<string, unknown>;
}

function text(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== "string") {
    throw new Error(`Invalid status service response: ${key}`);
  }
  return value;
}

function optionalText(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function integer(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Invalid status service response: ${key}`);
  }
  return value;
}

function timestamp(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid status service response: ${key}`);
  }
  return parsed;
}

function optionalTimestamp(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  if (value === null || value === undefined) {
    return null;
  }
  return timestamp(source, key);
}

function member<T extends string>(
  source: Record<string, unknown>,
  key: string,
  allowed: ReadonlySet<string>,
): T {
  const value = text(source, key);
  if (!allowed.has(value)) {
    throw new Error(`Invalid status service response: ${key}`);
  }
  return value as T;
}

const evidenceSchema = z.object({
  revision: z.string(),
  checks: z.array(
    z.object({
      name: z.string(),
      result: z.enum(["passed", "failed", "not_run"]),
      detail: z.string().optional(),
    }),
  ),
  artifacts: z.array(z.object({ label: z.string(), url: z.string().url() })),
});
const taskRelationsSchema = z.object({
  parentGoalId: z.string().nullable().optional(),
  parentGoalTitle: z.string().nullable().optional(),
  dependsOn: z.array(z.string()).optional(),
  blockedBy: z.array(z.string()).optional(),
  children: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        status: z.enum([
          "suggested",
          "accepted",
          "running",
          "needs_review",
          "done",
          "discarded",
          "paused",
        ]),
      }),
    )
    .optional(),
  source: z
    .object({ kind: z.string(), key: z.string().nullable(), url: z.string().nullable() })
    .optional(),
  attachedAgentRef: z.string().nullable().optional(),
});

export function parseGoalReport(value: unknown): GoalReport {
  const source = record(value, "report");
  return {
    id: text(source, "id"),
    evidence: source.evidence == null ? null : evidenceSchema.parse(source.evidence),
    runId: text(source, "runId"),
    seq: integer(source, "seq"),
    kind: member<GoalReportKind>(source, "kind", REPORT_KINDS),
    message: text(source, "message"),
    prUrl: optionalText(source, "prUrl"),
    createdAt: timestamp(source, "createdAt"),
  };
}

export function parseGoalRun(value: unknown): GoalRun {
  const source = record(value, "run");
  const kind = text(source, "kind");
  if (kind !== "plan" && kind !== "execute") {
    throw new Error("Invalid status service response: run kind");
  }
  return {
    id: text(source, "id"),
    kind: kind as GoalRunKind,
    agentRef: optionalText(source, "agentRef"),
    relayHostId: optionalText(source, "relayHostId"),
    status: member<GoalRunStatus>(source, "status", RUN_STATUSES),
    // Older services omit these; an unpinned run with the host default is what they meant.
    pinned: source.pinned === true,
    agent: optionalText(source, "agent"),
    hostId: optionalText(source, "hostId"),
    hostDisplayName: optionalText(source, "hostDisplayName"),
    instruction: optionalText(source, "instruction"),
    outcome: optionalText(source, "outcome"),
    startedAt: optionalTimestamp(source, "startedAt"),
    finishedAt: optionalTimestamp(source, "finishedAt"),
    createdAt: timestamp(source, "createdAt"),
  };
}

export function parseGoal(value: unknown): Goal {
  const source = record(value, "goal");
  const origin = text(source, "origin");
  if (origin !== "planner" && origin !== "manual") {
    throw new Error("Invalid status service response: origin");
  }
  const reviewReason = source.reviewReason;
  return {
    ...(source.reviewEventVersion === undefined
      ? {}
      : { reviewEventVersion: integer(source, "reviewEventVersion") }),
    ...taskRelationsSchema.parse(source),
    executionUnconfirmed: source.executionUnconfirmed === true,
    id: text(source, "id"),
    repoKey: text(source, "repoKey"),
    repoDisplayName: text(source, "repoDisplayName"),
    title: text(source, "title"),
    summary: text(source, "summary"),
    acceptance: text(source, "acceptance"),
    origin,
    status: member<GoalStatus>(source, "status", GOAL_STATUSES),
    reviewReason:
      reviewReason === null || reviewReason === undefined
        ? null
        : member<GoalReviewReason>(source, "reviewReason", REVIEW_REASONS),
    priority: integer(source, "priority"),
    budgetRuns: integer(source, "budgetRuns"),
    runsUsed: integer(source, "runsUsed"),
    expiresAt: optionalTimestamp(source, "expiresAt"),
    decidedAt: optionalTimestamp(source, "decidedAt"),
    createdAt: timestamp(source, "createdAt"),
    updatedAt: timestamp(source, "updatedAt"),
    hostId: optionalText(source, "hostId"),
    hostDisplayName: optionalText(source, "hostDisplayName"),
    agent: optionalText(source, "agent"),
    latestReport:
      source.latestReport === null || source.latestReport === undefined
        ? null
        : parseGoalReport(source.latestReport),
    currentRun:
      source.currentRun === null || source.currentRun === undefined
        ? null
        : parseGoalRun(source.currentRun),
  };
}

export function parseGoalDetail(value: unknown): GoalDetail {
  const source = record(value, "goal");
  const goal = parseGoal(source);
  const runs = Array.isArray(source.runs) ? source.runs.map(parseGoalRun) : [];
  const reports = Array.isArray(source.reports) ? source.reports.map(parseGoalReport) : [];
  return { ...goal, runs, reports };
}

export function parseGoalList(value: unknown): Goal[] {
  const source = record(value, "goals");
  if (!Array.isArray(source.goals)) {
    throw new Error("Invalid status service response: goals");
  }
  return source.goals.map(parseGoal);
}

function parseRepoHost(value: unknown): GoalRepoHost {
  const source = record(value, "host");
  const connectivity = text(source, "connectivity");
  if (connectivity !== "live" && connectivity !== "unverifiable") {
    throw new Error("Invalid status service response: host connectivity");
  }
  return {
    hostId: text(source, "hostId"),
    relayHostId: optionalText(source, "relayHostId") ?? "",
    displayName: text(source, "displayName"),
    connectivity,
  };
}

function parseLastPlanRun(value: unknown): GoalRepoPlanRun | null {
  if (value === null || value === undefined) {
    return null;
  }
  const source = record(value, "lastPlanRun");
  return {
    status: member<GoalRunStatus>(source, "status", RUN_STATUSES),
    outcome: optionalText(source, "outcome"),
    hostDisplayName: optionalText(source, "hostDisplayName"),
    createdAt: timestamp(source, "createdAt"),
    finishedAt: optionalTimestamp(source, "finishedAt"),
  };
}

export function parseGoalRepo(value: unknown): GoalRepo {
  const source = record(value, "repo");
  if (typeof source.planEnabled !== "boolean") {
    throw new Error("Invalid status service response: planEnabled");
  }
  return {
    repoKey: text(source, "repoKey"),
    displayName: text(source, "displayName"),
    planEnabled: source.planEnabled,
    lastPlannedAt: optionalTimestamp(source, "lastPlannedAt"),
    preferredHostId: optionalText(source, "preferredHostId"),
    planAgent: optionalText(source, "planAgent"),
    executeAgent: optionalText(source, "executeAgent"),
    lastPlanRun: parseLastPlanRun(source.lastPlanRun),
    hosts: Array.isArray(source.hosts) ? source.hosts.map(parseRepoHost) : [],
    suggestedCount: integer(source, "suggestedCount"),
    activeCount: integer(source, "activeCount"),
  };
}

export function parseGoalRepoList(value: unknown): GoalRepo[] {
  const source = record(value, "repos");
  if (!Array.isArray(source.repos)) {
    throw new Error("Invalid status service response: repos");
  }
  return source.repos.map(parseGoalRepo);
}

export function parseGoalEnvelope(value: unknown): Goal {
  return parseGoal(record(value, "goal").goal);
}

export function parseGoalDetailEnvelope(value: unknown): GoalDetail {
  return parseGoalDetail(record(value, "goal").goal);
}

/** Older servers omit `goals` on the summary; that is "no goals", not an error. */
export function parseGoalCounts(value: unknown): GoalCounts | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const source = value as Record<string, unknown>;
  try {
    return {
      suggestedCount: integer(source, "suggestedCount"),
      activeCount: integer(source, "activeCount"),
      needsReviewCount: integer(source, "needsReviewCount"),
    };
  } catch {
    return null;
  }
}

export interface PlanRequestOutcome {
  outcome: "queued" | "already_open";
  runId: string;
}

export function parsePlanRequest(value: unknown): PlanRequestOutcome {
  const source = record(value, "plan");
  const outcome = text(source, "outcome");
  if (outcome !== "queued" && outcome !== "already_open") {
    throw new Error("Invalid status service response: outcome");
  }
  return { outcome, runId: text(source, "runId") };
}

export function parseGoalNextCursor(value: unknown): string | null {
  return optionalText(record(value, "goal list"), "nextCursor");
}
