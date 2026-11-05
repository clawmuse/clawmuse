import type { RelaySelectionReport } from "./relay-selection-report.js";

const REQUEST_TIMEOUT_MS = 15_000;

export type ClawMuseStatusPhase = "running" | "needs_action" | "completed" | "failed";

export interface ClawMuseStatusSnapshotItem {
  itemId: string;
  eventId: string;
  phase: ClawMuseStatusPhase;
  stateChangedAt: string;
  observation: "live";
}

export interface ClawMuseStatusUsageWindow {
  usedPercent: number;
  windowMinutes: number;
  resetsAt: string | null;
  unlimited?: boolean;
}

/** Consumption numbers only: no account, organization, or credential ever leaves the daemon. */
export interface ClawMuseStatusUsage {
  provider: string;
  label?: string;
  session: ClawMuseStatusUsageWindow | null;
  weekly: ClawMuseStatusUsageWindow | null;
  updatedAt: string;
}

export interface ClawMuseStatusSnapshot {
  revision: number;
  items: readonly ClawMuseStatusSnapshotItem[];
  usages: readonly ClawMuseStatusUsage[];
}

export interface ClawMuseStatusHostSession {
  hostId: string;
  epoch: string;
  accessToken: string;
  expiresIn: number;
  heartbeatInterval: number;
  snapshotSchemaVersion: number;
  hostSessionClose: boolean;
  /** The service runs goals: repos may be published and runs leased. */
  goals: boolean;
  /** The service stores relay selections; older servers omit the flag. */
  relaySelectionTelemetry: boolean;
}

export type ClawMuseGoalReportKind =
  | "progress"
  | "blocked"
  | "needs_decision"
  | "done"
  | "nothing_to_do";

export interface ClawMuseGoalRunGoal {
  id: string;
  title: string;
  summary: string;
  acceptance: string;
  priority: number;
  budgetRuns: number;
  runsUsed: number;
}

export interface ClawMuseGoalPriorReport {
  kind: ClawMuseGoalReportKind;
  message: string;
  prUrl: string | null;
  createdAt: string;
}

/** One leased unit of work, exactly as the service hands it out. */
export interface ClawMuseGoalRun {
  attachedAgentRef?: string | null;
  runId: string;
  kind: "plan" | "execute";
  repoKey: string;
  repoDisplayName: string;
  leaseExpiresAt: string;
  goal: ClawMuseGoalRunGoal | null;
  instruction: string | null;
  /** `provider[/model]` chosen on the phone; null means this host's configured default. */
  agent: string | null;
  priorReports: ClawMuseGoalPriorReport[];
  openGoalTitles: string[];
}

export interface ClawMuseGoalProposal {
  title: string;
  summary: string;
  acceptance: string;
  priority: number;
}

export interface ClawMuseGoalHeartbeatState {
  queuedCount: number;
  canceledRunIds: string[];
}

export interface ClawMuseStatusHeartbeatResult {
  /** Null from a server (or token) without goals. */
  goals: ClawMuseGoalHeartbeatState | null;
}

export interface ClawMuseStatusEnrollment {
  enrollmentCode: string;
  expiresAt: string;
}

export class ClawMuseStatusRequestError extends Error {
  constructor(
    readonly statusCode: number,
    readonly errorCode: string | null,
  ) {
    super(`clawmuse_status_request_failed_${statusCode}${errorCode ? `_${errorCode}` : ""}`);
    this.name = "ClawMuseStatusRequestError";
  }
}

export type ClawMuseStatusFetch = (url: string, init: RequestInit) => Promise<Response>;

/** Snapshot schema that introduced `usages: HostUsage[]`; older servers take a single `usage`. */
export const CLAWMUSE_STATUS_MULTI_USAGE_SCHEMA_VERSION = 4;
const CLAWMUSE_STATUS_USAGE_SCHEMA_VERSION = 3;

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`invalid_clawmuse_status_${name}`);
  }
  return value as Record<string, unknown>;
}

function requireString(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`invalid_clawmuse_status_${field}`);
  }
  return value;
}

function requirePositiveNumber(record: Record<string, unknown>, field: string): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`invalid_clawmuse_status_${field}`);
  }
  return value;
}

function optionalString(record: Record<string, unknown>, field: string): string | null {
  const value = record[field];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function requireInteger(record: Record<string, unknown>, field: string): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`invalid_clawmuse_status_${field}`);
  }
  return value;
}

function requireStringArray(record: Record<string, unknown>, field: string): string[] {
  const value = record[field];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`invalid_clawmuse_status_${field}`);
  }
  return value as string[];
}

const GOAL_REPORT_KINDS: ReadonlySet<string> = new Set([
  "progress",
  "blocked",
  "needs_decision",
  "done",
  "nothing_to_do",
]);

function parseGoalRun(value: unknown): ClawMuseGoalRun {
  const record = requireRecord(value, "goal_run");
  const kind = requireString(record, "kind");
  if (kind !== "plan" && kind !== "execute") {
    throw new Error("invalid_clawmuse_status_goal_run_kind");
  }
  const goalValue = record.goal;
  let goal: ClawMuseGoalRunGoal | null = null;
  if (goalValue !== null && goalValue !== undefined) {
    const goalRecord = requireRecord(goalValue, "goal");
    goal = {
      id: requireString(goalRecord, "id"),
      title: requireString(goalRecord, "title"),
      summary: requireString(goalRecord, "summary"),
      acceptance: requireString(goalRecord, "acceptance"),
      priority: requireInteger(goalRecord, "priority"),
      budgetRuns: requireInteger(goalRecord, "budgetRuns"),
      runsUsed: requireInteger(goalRecord, "runsUsed"),
    };
  }
  const reportsValue = Array.isArray(record.priorReports) ? record.priorReports : [];
  const priorReports: ClawMuseGoalPriorReport[] = reportsValue.map((entry) => {
    const report = requireRecord(entry, "prior_report");
    const reportKind = requireString(report, "kind");
    if (!GOAL_REPORT_KINDS.has(reportKind)) {
      throw new Error("invalid_clawmuse_status_prior_report_kind");
    }
    return {
      kind: reportKind as ClawMuseGoalReportKind,
      message: requireString(report, "message"),
      prUrl: optionalString(report, "prUrl"),
      createdAt: requireString(report, "createdAt"),
    };
  });
  return {
    attachedAgentRef: optionalString(record, "attachedAgentRef"),
    runId: requireString(record, "runId"),
    kind,
    repoKey: requireString(record, "repoKey"),
    repoDisplayName: requireString(record, "repoDisplayName"),
    leaseExpiresAt: requireString(record, "leaseExpiresAt"),
    goal,
    instruction: optionalString(record, "instruction"),
    agent: optionalString(record, "agent"),
    priorReports,
    openGoalTitles: Array.isArray(record.openGoalTitles)
      ? requireStringArray(record, "openGoalTitles")
      : [],
  };
}

function optionalPositiveInteger(record: Record<string, unknown>, field: string): number {
  const value = record[field];
  if (value === undefined) {
    return 0;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`invalid_clawmuse_status_${field}`);
  }
  return value;
}

function snapshotBody(snapshot: ClawMuseStatusSnapshot, schemaVersion: number): unknown {
  const base = {
    revision: snapshot.revision,
    items: snapshot.items,
  };
  if (schemaVersion >= CLAWMUSE_STATUS_MULTI_USAGE_SCHEMA_VERSION) {
    return snapshot.usages.length > 0 ? { ...base, usages: snapshot.usages } : base;
  }
  // A v3 server rejects unknown snapshot fields and stores one usage per host,
  // so the newest provider is the only one it can represent.
  const newest = [...snapshot.usages].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  )[0];
  if (schemaVersion < CLAWMUSE_STATUS_USAGE_SCHEMA_VERSION || !newest) {
    return base;
  }
  return { ...base, usage: newest };
}

export interface ScheduledTaskRecord {
  repoKey: string;
  title: string;
  summary: string;
  scheduleId: string;
  runId: string;
  agentRef: string | null;
  status: "succeeded" | "failed";
  startedAt: string;
  finishedAt: string;
}

export class ClawMuseStatusClient {
  private tasksVersion = 0;
  private readonly requestFetch: ClawMuseStatusFetch;

  constructor(
    readonly baseUrl: string,
    requestFetch: ClawMuseStatusFetch = (url, init) => globalThis.fetch(url, init),
  ) {
    this.requestFetch = requestFetch;
  }

  async createHostSession(args: {
    hostToken: string;
    relayHostId: string;
    displayName: string;
    signal?: AbortSignal;
  }): Promise<ClawMuseStatusHostSession> {
    const value = requireRecord(
      await this.request(
        "/v1/host/sessions",
        args.hostToken,
        { relayHostId: args.relayHostId, displayName: args.displayName },
        args.signal,
      ),
      "host_session",
    );
    this.tasksVersion = optionalPositiveInteger(value, "tasksVersion");
    return {
      hostId: requireString(value, "hostId"),
      epoch: requireString(value, "epoch"),
      accessToken: requireString(value, "accessToken"),
      expiresIn: requirePositiveNumber(value, "expiresIn"),
      heartbeatInterval: requirePositiveNumber(value, "heartbeatInterval"),
      snapshotSchemaVersion: optionalPositiveInteger(value, "snapshotSchemaVersion"),
      hostSessionClose: value.hostSessionClose === true,
      goals: value.goals === true,
      relaySelectionTelemetry: value.relaySelectionTelemetry === true,
    };
  }

  async publishSnapshot(args: {
    accessToken: string;
    snapshot: ClawMuseStatusSnapshot;
    schemaVersion: number;
    signal?: AbortSignal;
  }): Promise<void> {
    await this.request(
      "/v1/host/status-snapshots",
      args.accessToken,
      snapshotBody(args.snapshot, args.schemaVersion),
      args.signal,
    );
  }

  async heartbeat(
    accessToken: string,
    signal?: AbortSignal,
    options?: { goalRunIds?: readonly string[] },
  ): Promise<ClawMuseStatusHeartbeatResult> {
    const body = options?.goalRunIds ? { goalRunIds: [...options.goalRunIds] } : {};
    const value = await this.request("/v1/host/heartbeat", accessToken, body, signal);
    const record = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
    const goalsValue = record?.goals;
    if (!goalsValue || typeof goalsValue !== "object") {
      return { goals: null };
    }
    const goals = goalsValue as Record<string, unknown>;
    return {
      goals: {
        queuedCount: requireInteger(goals, "queuedCount"),
        canceledRunIds: requireStringArray(goals, "canceledRunIds"),
      },
    };
  }

  // ---- goals -----------------------------------------------------------------

  async publishRepos(args: {
    accessToken: string;
    repos: readonly { repoKey: string; displayName: string }[];
    signal?: AbortSignal;
  }): Promise<void> {
    await this.request(
      "/v1/host/repos",
      args.accessToken,
      { repos: args.repos },
      args.signal,
      "PUT",
    );
  }

  supportsTasks(): boolean {
    return this.tasksVersion >= 1;
  }

  async recordScheduledTask(args: {
    accessToken: string;
    body: ScheduledTaskRecord;
    signal?: AbortSignal;
  }): Promise<void> {
    if (!this.supportsTasks())
      throw new Error("Update the status service to record scheduled tasks");
    await this.request("/v1/host/tasks/scheduled", args.accessToken, args.body, args.signal);
  }

  async leaseGoalRun(args: {
    accessToken: string;
    activeRunIds: readonly string[];
    signal?: AbortSignal;
  }): Promise<ClawMuseGoalRun | null> {
    const value = requireRecord(
      await this.request(
        "/v1/host/goal-runs/lease",
        args.accessToken,
        {
          activeRunIds: [...args.activeRunIds],
          ...(this.tasksVersion >= 1 ? { supportsAttachedAgents: true } : {}),
        },
        args.signal,
      ),
      "goal_lease",
    );
    return value.run === null || value.run === undefined ? null : parseGoalRun(value.run);
  }

  async startGoalRun(args: {
    accessToken: string;
    runId: string;
    agentRef: string;
    signal?: AbortSignal;
  }): Promise<void> {
    await this.request(
      `/v1/host/goal-runs/${encodeURIComponent(args.runId)}/start`,
      args.accessToken,
      { agentRef: args.agentRef },
      args.signal,
    );
  }

  async reportGoalRun(args: {
    evidence?: import("./goal-evidence.js").GoalEvidence;
    accessToken: string;
    runId: string;
    kind: ClawMuseGoalReportKind;
    message: string;
    prUrl: string | null;
    signal?: AbortSignal;
  }): Promise<void> {
    await this.request(
      `/v1/host/goal-runs/${encodeURIComponent(args.runId)}/reports`,
      args.accessToken,
      {
        kind: args.kind,
        message: args.message,
        ...(args.prUrl ? { prUrl: args.prUrl } : {}),
        ...(args.evidence && this.tasksVersion >= 1 ? { evidence: args.evidence } : {}),
      },
      args.signal,
    );
  }

  async proposeGoals(args: {
    accessToken: string;
    runId: string;
    proposals: readonly ClawMuseGoalProposal[];
    signal?: AbortSignal;
  }): Promise<{ created: number; skipped: number }> {
    const value = requireRecord(
      await this.request(
        `/v1/host/goal-runs/${encodeURIComponent(args.runId)}/proposals`,
        args.accessToken,
        { proposals: [...args.proposals] },
        args.signal,
      ),
      "goal_proposals",
    );
    return { created: requireInteger(value, "created"), skipped: requireInteger(value, "skipped") };
  }

  async finishGoalRun(args: {
    accessToken: string;
    runId: string;
    status: "succeeded" | "failed";
    outcome: string | null;
    signal?: AbortSignal;
  }): Promise<{ goalStatus: string | null; queuedRunId: string | null }> {
    const value = requireRecord(
      await this.request(
        `/v1/host/goal-runs/${encodeURIComponent(args.runId)}/finish`,
        args.accessToken,
        { status: args.status, outcome: args.outcome },
        args.signal,
      ),
      "goal_finish",
    );
    return {
      goalStatus: optionalString(value, "goalStatus"),
      queuedRunId: optionalString(value, "queuedRunId"),
    };
  }

  async createMobileEnrollment(args: {
    accessToken: string;
    pairedDeviceId: string;
    signal?: AbortSignal;
  }): Promise<ClawMuseStatusEnrollment> {
    const value = requireRecord(
      await this.request(
        "/v1/host/mobile-enrollments",
        args.accessToken,
        { pairedDeviceId: args.pairedDeviceId },
        args.signal,
      ),
      "mobile_enrollment",
    );
    return {
      enrollmentCode: requireString(value, "enrollmentCode"),
      expiresAt: requireString(value, "expiresAt"),
    };
  }

  async reportRelaySelection(args: {
    accessToken: string;
    report: RelaySelectionReport;
    signal?: AbortSignal;
  }): Promise<void> {
    await this.request(
      "/v1/host/telemetry/relay-selections",
      args.accessToken,
      args.report,
      args.signal,
    );
  }

  async closeHostSession(accessToken: string, signal?: AbortSignal): Promise<void> {
    await this.request("/v1/host/session", accessToken, undefined, signal, "DELETE");
  }

  private async request(
    path: string,
    token: string,
    body: unknown,
    signal?: AbortSignal,
    method: "POST" | "DELETE" | "PUT" = "POST",
  ): Promise<unknown> {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const response = await this.requestFetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "error",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    const value = await response.json().catch(() => null);
    if (!response.ok) {
      const record = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
      const errorCode = typeof record?.error === "string" ? record.error : null;
      throw new ClawMuseStatusRequestError(response.status, errorCode);
    }
    return value;
  }
}
