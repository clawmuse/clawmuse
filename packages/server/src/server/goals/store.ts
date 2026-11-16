import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type pino from "pino";
import { z } from "zod";
import {
  GoalDetailWireSchema,
  GoalEvidenceSchema,
  GoalReportSchema,
  GoalRepoPlanRunWireSchema,
  GoalRunSchema,
  type GoalDetailWire,
  type GoalEvidence,
  type GoalListFilter,
  type GoalReport,
  type GoalReportKind,
  type GoalReviewReason,
  type GoalRun,
  type GoalStatus,
  type GoalWire,
} from "@getpaseo/protocol/goals";
import { writeJsonFileAtomic } from "../atomic-file.js";
import {
  findExistingGoalByExternalSource,
  hasPathScopeOverlap,
  normalizePathScopes,
  type GoalExternalSource,
} from "./scheduler-guard.js";

const StoredGoalSchema = GoalDetailWireSchema.extend({
  idempotencyKey: z.string().nullable().optional(),
});
export type StoredGoal = z.infer<typeof StoredGoalSchema>;

interface NormalizedGoalSource {
  [key: string]: unknown;
  kind: string;
  key: string | null;
  url: string | null;
}

interface CreateManualGoalInput {
  idempotencyKey?: string;
  serverId: string;
  relayHostId: string;
  hostDisplayName: string;
  repoKey: string;
  repoDisplayName: string;
  title: string;
  summary: string;
  acceptance: string;
  priority: number;
  budgetRuns: number;
  start: boolean;
  parentGoalId?: string;
  dependsOn?: string[];
  source?: GoalExternalSource;
  paths?: string[];
  maxConcurrentRuns?: number;
  agent: string | null;
  attachedAgentRef?: string | null;
}

const StoredRepoSettingsSchema = z.object({
  planEnabled: z.boolean().default(false),
  lastPlannedAt: z.number().nullable().default(null),
  preferredHostId: z.string().nullable().default(null),
  planAgent: z.string().nullable().default(null),
  executeAgent: z.string().nullable().default(null),
  lastPlanRun: GoalRepoPlanRunWireSchema.nullable().default(null),
});
export type StoredRepoSettings = z.infer<typeof StoredRepoSettingsSchema>;

const StoredGoalsStateSchema = z.object({
  version: z.literal(1).default(1),
  goals: z.array(StoredGoalSchema).default([]),
  repos: z.record(z.string(), StoredRepoSettingsSchema).default({}),
});
type StoredGoalsState = z.infer<typeof StoredGoalsStateSchema>;

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

export function resolveExecuteOutcome(input: {
  runStatus: "succeeded" | "failed";
  lastReportKind: GoalReportKind | null;
  runsUsed: number;
  budgetRuns: number;
}): {
  goalStatus: "running" | "needs_review";
  reviewReason: GoalReviewReason | null;
  queueNextRun: boolean;
} {
  if (input.runStatus === "failed") {
    return { goalStatus: "needs_review", reviewReason: "failed", queueNextRun: false };
  }
  switch (input.lastReportKind) {
    case "done":
      return { goalStatus: "needs_review", reviewReason: "completed", queueNextRun: false };
    case "blocked":
      return { goalStatus: "needs_review", reviewReason: "blocked", queueNextRun: false };
    case "needs_decision":
      return { goalStatus: "needs_review", reviewReason: "needs_decision", queueNextRun: false };
    case "nothing_to_do":
      return { goalStatus: "needs_review", reviewReason: "nothing_to_do", queueNextRun: false };
    case null:
      return { goalStatus: "needs_review", reviewReason: "failed", queueNextRun: false };
    case "progress":
      if (input.runsUsed < input.budgetRuns) {
        return { goalStatus: "running", reviewReason: null, queueNextRun: true };
      }
      return { goalStatus: "needs_review", reviewReason: "budget_exhausted", queueNextRun: false };
  }
}

export function budgetForContinue(budgetRuns: number, runsUsed: number): number {
  return runsUsed >= budgetRuns ? Math.min(50, runsUsed + 1) : budgetRuns;
}

function emptyRepoSettings(): StoredRepoSettings {
  return {
    planEnabled: false,
    lastPlannedAt: null,
    preferredHostId: null,
    planAgent: null,
    executeAgent: null,
    lastPlanRun: null,
  };
}

function normalizeTitleKey(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

export class LocalGoalStore {
  private readonly dir: string;
  private readonly filePath: string;
  private chain: Promise<unknown> = Promise.resolve();
  private cached: StoredGoalsState | null = null;

  constructor(
    paseoHome: string,
    private readonly logger: pino.Logger,
  ) {
    this.dir = join(paseoHome, "goals");
    this.filePath = join(this.dir, "state.json");
  }

  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn);
    this.chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async loadState(): Promise<StoredGoalsState> {
    if (this.cached) {
      return this.cached;
    }
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = StoredGoalsStateSchema.safeParse(JSON.parse(raw));
      if (parsed.success) {
        this.cached = parsed.data;
        return parsed.data;
      }
      this.logger.warn({ err: parsed.error }, "Invalid goals state file; starting clean");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code !== "ENOENT") {
        this.logger.warn({ err: error }, "Failed reading goals state file; starting clean");
      }
    }
    const fresh: StoredGoalsState = { version: 1, goals: [], repos: {} };
    this.cached = fresh;
    return fresh;
  }

  private async saveState(state: StoredGoalsState): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeJsonFileAtomic(this.filePath, state);
    this.cached = state;
  }

  private projectWireRelations(goal: StoredGoal, allGoals: readonly StoredGoal[]): StoredGoal {
    const byId = new Map(allGoals.map((entry) => [entry.id, entry]));
    const parent = goal.parentGoalId ? byId.get(goal.parentGoalId) : undefined;
    const children = allGoals
      .filter((candidate) => candidate.parentGoalId === goal.id)
      .map((child) => ({
        id: child.id,
        title: child.title,
        status: child.status,
      }));
    const dependsOn = goal.dependsOn ?? [];
    const blockedBy = dependsOn.filter((depId) => {
      const dep = byId.get(depId);
      return dep !== undefined && dep.status !== "done";
    });
    const latestReport = goal.reports.length > 0 ? goal.reports[goal.reports.length - 1]! : null;
    const currentRun = goal.runs.length > 0 ? goal.runs[goal.runs.length - 1]! : null;
    return {
      ...goal,
      parentGoalTitle: parent?.title ?? goal.parentGoalTitle ?? null,
      children,
      dependsOn,
      blockedBy,
      latestReport,
      currentRun,
    };
  }

  private toSummary(goal: StoredGoal, allGoals: readonly StoredGoal[]): GoalWire {
    const projected = this.projectWireRelations(goal, allGoals);
    const { runs: _runs, reports: _reports, idempotencyKey: _idem, ...wire } = projected;
    return wire;
  }

  private toDetail(goal: StoredGoal, allGoals: readonly StoredGoal[]): GoalDetailWire {
    const projected = this.projectWireRelations(goal, allGoals);
    const { idempotencyKey: _idem, ...detail } = projected;
    return detail;
  }

  async recoverInterruptedRuns(): Promise<void> {
    await this.serialize(async () => {
      const state = await this.loadState();
      let dirty = false;
      const now = Date.now();
      for (const goal of state.goals) {
        let hadInterrupted = false;
        for (const run of goal.runs) {
          if (run.status === "queued" || run.status === "leased" || run.status === "running") {
            run.status = "failed";
            run.finishedAt = now;
            run.outcome = "主机重启时中断，点击「继续」即可接着执行。";
            dirty = true;
            hadInterrupted = true;
          }
        }
        if (hadInterrupted || goal.status === "running" || goal.status === "accepted") {
          goal.status = "needs_review";
          goal.reviewReason = "failed";
          goal.updatedAt = now;
          dirty = true;
        }
      }
      for (const repo of Object.values(state.repos)) {
        if (repo.lastPlanRun && ["queued", "leased", "running"].includes(repo.lastPlanRun.status)) {
          repo.lastPlanRun = {
            ...repo.lastPlanRun,
            status: "failed",
            finishedAt: now,
            outcome: "主机重启时规划中断",
          };
          dirty = true;
        }
      }
      if (dirty) {
        await this.saveState(state);
      }
    });
  }

  async snapshot(
    options: {
      filter?: GoalListFilter;
      repoKey?: string | null;
      parentGoalId?: string;
    } = {},
  ): Promise<{
    goals: GoalWire[];
    allGoals: StoredGoal[];
    repos: Record<string, StoredRepoSettings>;
  }> {
    return this.serialize(async () => {
      const state = await this.loadState();
      const filter = options.filter ?? "all";
      const allowed = FILTER_STATUSES[filter];
      const filtered = state.goals
        .filter((goal) => {
          if (!allowed.includes(goal.status)) return false;
          if (options.repoKey && goal.repoKey !== options.repoKey) return false;
          if (options.parentGoalId && goal.parentGoalId !== options.parentGoalId) return false;
          return true;
        })
        .map((goal) => this.toSummary(goal, state.goals));
      return {
        goals: filtered,
        allGoals: state.goals.map((g) => this.projectWireRelations(g, state.goals)),
        repos: { ...state.repos },
      };
    });
  }

  async getDetail(goalId: string): Promise<GoalDetailWire | null> {
    return this.serialize(async () => {
      const state = await this.loadState();
      const found = state.goals.find((goal) => goal.id === goalId);
      return found ? this.toDetail(found, state.goals) : null;
    });
  }

  async setRepoPlanEnabled(repoKey: string, planEnabled: boolean): Promise<StoredRepoSettings> {
    return this.serialize(async () => {
      const state = await this.loadState();
      const prev = state.repos[repoKey] ?? emptyRepoSettings();
      const next: StoredRepoSettings = { ...prev, planEnabled };
      state.repos[repoKey] = next;
      await this.saveState(state);
      return next;
    });
  }

  async updateRepoPlanState(
    repoKey: string,
    patch: Partial<StoredRepoSettings>,
  ): Promise<StoredRepoSettings> {
    return this.serialize(async () => {
      const state = await this.loadState();
      const prev = state.repos[repoKey] ?? emptyRepoSettings();
      const next: StoredRepoSettings = { ...prev, ...patch };
      state.repos[repoKey] = next;
      await this.saveState(state);
      return next;
    });
  }

  private resolveStoredSource(input: CreateManualGoalInput): NormalizedGoalSource {
    if (input.source) {
      return {
        kind: input.source.kind.trim(),
        key: input.source.key?.trim() || null,
        url: input.source.url?.trim() || null,
      };
    }
    if (input.attachedAgentRef) {
      return { kind: "session", key: input.attachedAgentRef, url: null };
    }
    return { kind: "manual", key: null, url: null };
  }

  private validateManualGoalRelations(
    input: CreateManualGoalInput,
    goals: readonly StoredGoal[],
  ): { dependsOn: string[]; hasUnmetDeps: boolean } {
    const byId = new Map(goals.map((goal) => [goal.id, goal]));
    if (input.parentGoalId) {
      const parent = byId.get(input.parentGoalId);
      if (!parent) throw new Error("父目标不存在");
      if (parent.repoKey !== input.repoKey) throw new Error("子任务必须与父目标属于同一个项目");
    }
    const dependsOn = [...new Set((input.dependsOn ?? []).filter(Boolean))];
    for (const depId of dependsOn) {
      const dependency = byId.get(depId);
      if (!dependency) throw new Error("前置任务不存在");
      if (dependency.repoKey !== input.repoKey) throw new Error("前置任务必须属于同一个项目");
    }
    return {
      dependsOn,
      hasUnmetDeps: dependsOn.some((depId) => byId.get(depId)?.status !== "done"),
    };
  }

  async createManualGoal(
    input: CreateManualGoalInput,
  ): Promise<{ goal: GoalWire; runToStart: GoalRun | null }> {
    return this.serialize(async () => {
      const state = await this.loadState();
      const resolvedSource = this.resolveStoredSource(input);
      const existingBySource = findExistingGoalByExternalSource(
        state.goals,
        input.repoKey,
        resolvedSource.key ? resolvedSource : input.source,
      );
      if (existingBySource) {
        return { goal: this.toSummary(existingBySource, state.goals), runToStart: null };
      }
      if (input.idempotencyKey) {
        const existing = state.goals.find((g) => g.idempotencyKey === input.idempotencyKey);
        if (existing) {
          return { goal: this.toSummary(existing, state.goals), runToStart: null };
        }
      }
      const { dependsOn, hasUnmetDeps } = this.validateManualGoalRelations(input, state.goals);
      const paths = normalizePathScopes(input.paths);
      const canStartNow = this.canStartExecuteForPaths(
        undefined,
        input.repoKey,
        paths,
        state.goals,
        input.maxConcurrentRuns ?? 1,
      );

      const now = Date.now();
      const goalId = randomUUID();
      let status: GoalStatus;
      let runToStart: GoalRun | null = null;
      const runs: GoalRun[] = [];

      if (!input.start) {
        status = "paused";
      } else if (hasUnmetDeps) {
        status = "waiting_on_dependencies";
      } else if (!canStartNow) {
        status = "accepted";
      } else {
        status = "running";
        runToStart = {
          id: randomUUID(),
          kind: "execute",
          status: "running",
          pinned: true,
          agent: input.agent,
          agentRef: input.attachedAgentRef ?? null,
          relayHostId: input.relayHostId,
          serverId: input.serverId,
          hostId: input.serverId,
          hostDisplayName: input.hostDisplayName,
          instruction: null,
          outcome: null,
          startedAt: now,
          finishedAt: null,
          createdAt: now,
        };
        runs.push(runToStart);
      }

      const stored: StoredGoal = {
        id: goalId,
        idempotencyKey: input.idempotencyKey ?? null,
        serverId: input.serverId,
        repoKey: input.repoKey,
        repoDisplayName: input.repoDisplayName,
        title: input.title,
        summary: input.summary,
        acceptance: input.acceptance,
        origin: "manual",
        status,
        reviewReason: null,
        priority: input.priority,
        budgetRuns: input.budgetRuns,
        runsUsed: runToStart ? 1 : 0,
        expiresAt: null,
        decidedAt: now,
        createdAt: now,
        updatedAt: now,
        hostId: input.serverId,
        hostDisplayName: input.hostDisplayName,
        agent: input.agent,
        latestReport: null,
        currentRun: runToStart,
        parentGoalId: input.parentGoalId ?? null,
        dependsOn,
        paths,
        source: resolvedSource,
        attachedAgentRef: input.attachedAgentRef ?? null,
        runs,
        reports: [],
      };

      const repoSettings = state.repos[input.repoKey] ?? emptyRepoSettings();
      state.repos[input.repoKey] = {
        ...repoSettings,
        preferredHostId: input.serverId,
        ...(input.agent !== null ? { executeAgent: input.agent } : {}),
      };

      state.goals.unshift(stored);
      await this.saveState(state);
      return { goal: this.toSummary(stored, state.goals), runToStart };
    });
  }

  async addProposals(input: {
    serverId: string;
    hostDisplayName: string;
    repoKey: string;
    repoDisplayName: string;
    proposals: ReadonlyArray<{
      title: string;
      summary: string;
      acceptance: string;
      priority: number;
    }>;
  }): Promise<{ created: number; skipped: number }> {
    return this.serialize(async () => {
      const state = await this.loadState();
      const existingTitles = new Set(
        state.goals
          .filter((g) => g.repoKey === input.repoKey)
          .map((g) => normalizeTitleKey(g.title)),
      );
      let created = 0;
      let skipped = 0;
      const now = Date.now();
      for (const proposal of input.proposals) {
        const key = normalizeTitleKey(proposal.title);
        if (!key || existingTitles.has(key)) {
          skipped += 1;
          continue;
        }
        existingTitles.add(key);
        created += 1;
        state.goals.unshift({
          id: randomUUID(),
          idempotencyKey: null,
          serverId: input.serverId,
          repoKey: input.repoKey,
          repoDisplayName: input.repoDisplayName,
          title: proposal.title.trim(),
          summary: proposal.summary.trim(),
          acceptance: proposal.acceptance.trim(),
          origin: "planner",
          status: "suggested",
          reviewReason: null,
          priority: proposal.priority,
          budgetRuns: 3,
          runsUsed: 0,
          expiresAt: null,
          decidedAt: null,
          createdAt: now,
          updatedAt: now,
          hostId: input.serverId,
          hostDisplayName: input.hostDisplayName,
          agent: null,
          latestReport: null,
          currentRun: null,
          parentGoalId: null,
          dependsOn: [],
          source: { kind: "manual", key: null, url: null },
          attachedAgentRef: null,
          runs: [],
          reports: [],
        });
      }
      if (created > 0) {
        await this.saveState(state);
      }
      return { created, skipped };
    });
  }

  async updateRunQueueState(input: {
    goalId: string;
    runId: string;
    queued: boolean;
  }): Promise<void> {
    await this.serialize(async () => {
      const state = await this.loadState();
      const goal = state.goals.find((g) => g.id === input.goalId);
      const run = goal?.runs.find((r) => r.id === input.runId);
      if (!goal || !run) return;
      if (run.status !== "queued" && run.status !== "running") return;
      run.status = input.queued ? "queued" : "running";
      goal.updatedAt = Date.now();
      await this.saveState(state);
    });
  }

  async bindRunAgent(goalId: string, runId: string, agentId: string): Promise<void> {
    await this.serialize(async () => {
      const state = await this.loadState();
      const goal = state.goals.find((g) => g.id === goalId);
      const run = goal?.runs.find((r) => r.id === runId);
      if (!goal || !run) return;
      run.agentRef = agentId;
      run.status = "running";
      run.startedAt = run.startedAt ?? Date.now();
      goal.updatedAt = Date.now();
      await this.saveState(state);
    });
  }

  async recordReport(input: {
    goalId: string;
    runId: string;
    kind: GoalReportKind;
    message: string;
    prUrl: string | null;
    evidence?: GoalEvidence;
  }): Promise<void> {
    await this.serialize(async () => {
      const state = await this.loadState();
      const goal = state.goals.find((g) => g.id === input.goalId);
      if (!goal) throw new Error("目标不存在");
      const report: GoalReport = GoalReportSchema.parse({
        id: randomUUID(),
        runId: input.runId,
        seq: goal.reports.length + 1,
        kind: input.kind,
        message: input.message,
        prUrl: input.prUrl,
        ...(input.evidence
          ? {
              evidence: GoalEvidenceSchema.parse({
                ...input.evidence,
                source: input.evidence.source ?? "executor",
              }),
            }
          : {}),
        createdAt: Date.now(),
      });
      goal.reports.push(report);
      goal.updatedAt = report.createdAt;
      await this.saveState(state);
    });
  }

  async submitOwnerReview(input: {
    goalId: string;
    runId: string;
    message: string;
    evidence: GoalEvidence;
  }): Promise<GoalDetailWire> {
    return this.serialize(async () => {
      const state = await this.loadState();
      const goal = state.goals.find((g) => g.id === input.goalId);
      if (!goal) throw new Error("目标不存在");
      const currentRun = goal.runs[goal.runs.length - 1];
      if (!currentRun || currentRun.id !== input.runId) {
        throw new Error("运行记录已过期，请刷新后重试");
      }
      if (input.evidence.checks.length === 0) {
        throw new Error("请至少填写一项通过的检查");
      }
      const now = Date.now();
      goal.reports.push({
        id: randomUUID(),
        runId: input.runId,
        seq: goal.reports.length + 1,
        kind: "done",
        message: input.message,
        prUrl: null,
        evidence: GoalEvidenceSchema.parse({
          ...input.evidence,
          source: input.evidence.source ?? "owner",
        }),
        createdAt: now,
      });
      goal.status = "needs_review";
      goal.reviewReason = "completed";
      goal.updatedAt = now;
      await this.saveState(state);
      return this.toDetail(goal, state.goals);
    });
  }

  async startVerifierRun(input: {
    goalId: string;
    executeRunId: string;
    agent: string | null;
  }): Promise<GoalRun | null> {
    return this.serialize(async () => {
      const state = await this.loadState();
      const goal = state.goals.find((entry) => entry.id === input.goalId);
      if (!goal || goal.status !== "needs_review") return null;
      const executeRun = goal.runs.find((run) => run.id === input.executeRunId);
      const report = goal.reports
        .toReversed()
        .find((entry) => entry.runId === input.executeRunId && entry.kind === "done");
      if (
        !executeRun ||
        executeRun.kind !== "execute" ||
        !report?.evidence?.revision.match(/^[0-9a-f]{40}$/i)
      ) {
        return null;
      }
      const now = Date.now();
      const run: GoalRun = {
        id: randomUUID(),
        kind: "verify",
        status: "running",
        pinned: true,
        agent: input.agent,
        agentRef: null,
        relayHostId: executeRun.relayHostId,
        serverId: executeRun.serverId,
        hostId: executeRun.hostId,
        hostDisplayName: executeRun.hostDisplayName,
        instruction: null,
        outcome: null,
        startedAt: now,
        finishedAt: null,
        createdAt: now,
      };
      goal.runs.push(run);
      goal.updatedAt = now;
      await this.saveState(state);
      return run;
    });
  }

  async finishVerifierRun(input: {
    goalId: string;
    runId: string;
    evidence: GoalEvidence;
    passed: boolean;
    outcome: string;
    continuationInstruction: string | null;
    serverId: string;
    relayHostId: string;
    hostDisplayName: string;
  }): Promise<GoalRun | null> {
    return this.serialize(async () => {
      const state = await this.loadState();
      const goal = state.goals.find((entry) => entry.id === input.goalId);
      const run = goal?.runs.find((entry) => entry.id === input.runId);
      if (!goal || !run || run.kind !== "verify") return null;
      const now = Date.now();
      run.status = input.passed ? "succeeded" : "failed";
      run.outcome = input.outcome;
      run.finishedAt = now;
      goal.reports.push({
        id: randomUUID(),
        runId: run.id,
        seq: goal.reports.length + 1,
        kind: input.passed ? "done" : "blocked",
        message: input.outcome,
        prUrl: null,
        evidence: GoalEvidenceSchema.parse(input.evidence),
        createdAt: now,
      });

      if (!input.passed && input.continuationInstruction && goal.runsUsed < goal.budgetRuns) {
        const nextRun: GoalRun = {
          id: randomUUID(),
          kind: "execute",
          status: "running",
          pinned: true,
          agent: goal.agent,
          agentRef: goal.attachedAgentRef ?? null,
          relayHostId: input.relayHostId,
          serverId: input.serverId,
          hostId: input.serverId,
          hostDisplayName: input.hostDisplayName,
          instruction: input.continuationInstruction,
          outcome: null,
          startedAt: now,
          finishedAt: null,
          createdAt: now,
        };
        goal.runs.push(nextRun);
        goal.runsUsed += 1;
        goal.status = "running";
        goal.reviewReason = null;
        goal.updatedAt = now;
        await this.saveState(state);
        return nextRun;
      }

      goal.status = "needs_review";
      goal.reviewReason = input.passed ? "completed" : "failed";
      goal.updatedAt = now;
      await this.saveState(state);
      return null;
    });
  }

  async finishExecuteRun(input: {
    goalId: string;
    runId: string;
    status: "succeeded" | "failed" | "canceled";
    outcome: string | null;
    serverId: string;
    relayHostId: string;
    hostDisplayName: string;
  }): Promise<{
    goal: StoredGoal | null;
    nextRun: GoalRun | null;
    enteredReview: boolean;
  }> {
    return this.serialize(async () => {
      const state = await this.loadState();
      const goal = state.goals.find((g) => g.id === input.goalId);
      if (!goal) return { goal: null, nextRun: null, enteredReview: false };
      const run = goal.runs.find((r) => r.id === input.runId);
      const now = Date.now();
      if (run) {
        run.status = input.status;
        run.outcome = input.outcome;
        run.finishedAt = now;
      }

      if (goal.status === "paused" || goal.status === "discarded" || input.status === "canceled") {
        goal.updatedAt = now;
        await this.saveState(state);
        return {
          goal: this.projectWireRelations(goal, state.goals),
          nextRun: null,
          enteredReview: false,
        };
      }

      const runReports = goal.reports.filter((r) => r.runId === input.runId);
      const lastReport = runReports.length > 0 ? runReports[runReports.length - 1]! : null;
      const transition = resolveExecuteOutcome({
        runStatus: input.status === "succeeded" ? "succeeded" : "failed",
        lastReportKind: lastReport?.kind ?? null,
        runsUsed: goal.runsUsed,
        budgetRuns: goal.budgetRuns,
      });

      let nextRun: GoalRun | null = null;
      if (transition.queueNextRun) {
        const prevInstruction = run?.instruction ?? null;
        nextRun = GoalRunSchema.parse({
          id: randomUUID(),
          kind: "execute",
          status: "running",
          pinned: true,
          agent: goal.agent,
          agentRef: goal.attachedAgentRef ?? null,
          relayHostId: input.relayHostId,
          serverId: input.serverId,
          hostId: input.serverId,
          hostDisplayName: input.hostDisplayName,
          instruction: prevInstruction,
          outcome: null,
          startedAt: now,
          finishedAt: null,
          createdAt: now,
        });
        goal.runs.push(nextRun);
        goal.runsUsed += 1;
        goal.status = "running";
        goal.reviewReason = null;
      } else {
        const unfinishedChildren = state.goals.some(
          (child) =>
            child.parentGoalId === goal.id &&
            child.status !== "done" &&
            child.status !== "discarded",
        );
        if (transition.reviewReason === "completed" && unfinishedChildren) {
          goal.status = "waiting_on_children";
          goal.reviewReason = null;
        } else {
          goal.status = transition.goalStatus;
          goal.reviewReason = transition.reviewReason;
        }
      }
      goal.updatedAt = now;
      await this.saveState(state);
      return {
        goal: this.projectWireRelations(goal, state.goals),
        nextRun,
        enteredReview: goal.status === "needs_review",
      };
    });
  }

  private applyAcceptAction(
    goal: StoredGoal,
    state: StoredGoalsState,
    byId: ReadonlyMap<string, StoredGoal>,
    input: {
      budgetRuns?: number;
      agent?: string | null;
      serverId: string;
    },
    now: number,
    startExecuteForGoal: (targetGoal: StoredGoal, instruction: string | null) => void,
  ): void {
    if (goal.status !== "suggested") {
      throw new Error("只有建议中的目标可以接受");
    }
    if (input.budgetRuns !== undefined) {
      goal.budgetRuns = Math.max(1, Math.min(50, input.budgetRuns));
    }
    if (input.agent !== undefined) {
      goal.agent = input.agent;
    }
    goal.decidedAt = now;
    const repoSettings = state.repos[goal.repoKey] ?? emptyRepoSettings();
    state.repos[goal.repoKey] = {
      ...repoSettings,
      preferredHostId: input.serverId,
      ...(input.agent !== undefined ? { executeAgent: input.agent } : {}),
    };
    const unmetDeps = (goal.dependsOn ?? []).some((depId) => byId.get(depId)?.status !== "done");
    if (unmetDeps) {
      goal.status = "waiting_on_dependencies";
      goal.updatedAt = now;
    } else {
      startExecuteForGoal(goal, null);
    }
  }

  private applyContinueAction(
    goal: StoredGoal,
    state: StoredGoalsState,
    byId: ReadonlyMap<string, StoredGoal>,
    input: {
      instruction?: string;
      agent?: string | null;
      serverId: string;
    },
    now: number,
    startExecuteForGoal: (targetGoal: StoredGoal, instruction: string | null) => void,
  ): void {
    if (input.agent !== undefined && !goal.attachedAgentRef) {
      goal.agent = input.agent;
    }
    goal.budgetRuns = budgetForContinue(goal.budgetRuns, goal.runsUsed);
    const repoSettings = state.repos[goal.repoKey] ?? emptyRepoSettings();
    state.repos[goal.repoKey] = {
      ...repoSettings,
      preferredHostId: input.serverId,
      ...(input.agent !== undefined ? { executeAgent: input.agent } : {}),
    };
    const unmetDeps = (goal.dependsOn ?? []).some((depId) => byId.get(depId)?.status !== "done");
    const unfinishedChildren = state.goals.some(
      (child) =>
        child.parentGoalId === goal.id && child.status !== "done" && child.status !== "discarded",
    );
    if (unmetDeps) {
      goal.status = "waiting_on_dependencies";
      goal.reviewReason = null;
      goal.updatedAt = now;
    } else if (unfinishedChildren && goal.runsUsed === 0) {
      goal.status = "waiting_on_children";
      goal.reviewReason = null;
      goal.updatedAt = now;
    } else {
      startExecuteForGoal(goal, input.instruction?.trim() || null);
    }
  }

  private applyApproveAction(
    goal: StoredGoal,
    state: StoredGoalsState,
    byId: ReadonlyMap<string, StoredGoal>,
    now: number,
    startExecuteForGoal: (targetGoal: StoredGoal, instruction: string | null) => void,
    checkParentUnblocked: (parentId: string | null | undefined) => void,
  ): void {
    if (
      goal.status !== "needs_review" ||
      (goal.reviewReason !== "completed" && goal.reviewReason !== "nothing_to_do")
    ) {
      throw new Error("cannot_approve_uncompleted_goal");
    }
    const latestReport = goal.reports[goal.reports.length - 1];
    if (latestReport?.evidence?.checks.some((check) => check.result === "failed")) {
      throw new Error("cannot_approve_failed_checks");
    }
    const unfinishedChildren = state.goals.some(
      (child) =>
        child.parentGoalId === goal.id && child.status !== "done" && child.status !== "discarded",
    );
    if (unfinishedChildren) {
      throw new Error("请先完成或丢弃所有子任务后再通过验收");
    }
    goal.status = "done";
    goal.reviewReason = null;
    goal.updatedAt = now;

    for (const candidate of state.goals) {
      if (
        candidate.status === "waiting_on_dependencies" &&
        (candidate.dependsOn ?? []).includes(goal.id)
      ) {
        const stillBlocked = (candidate.dependsOn ?? []).some(
          (depId) => byId.get(depId)?.status !== "done",
        );
        if (!stillBlocked) {
          startExecuteForGoal(candidate, null);
        }
      }
    }
    checkParentUnblocked(goal.parentGoalId);
  }

  private canStartExecute(
    goal: StoredGoal,
    allGoals: readonly StoredGoal[],
    maxConcurrentRuns: number,
  ): boolean {
    return this.canStartExecuteForPaths(
      goal.id,
      goal.repoKey,
      goal.paths ?? [],
      allGoals,
      maxConcurrentRuns,
    );
  }

  private canStartExecuteForPaths(
    excludeGoalId: string | undefined,
    repoKey: string,
    paths: readonly string[],
    allGoals: readonly StoredGoal[],
    maxConcurrentRuns: number,
  ): boolean {
    const active = allGoals.filter(
      (candidate) =>
        candidate.id !== excludeGoalId &&
        candidate.repoKey === repoKey &&
        (candidate.status === "running" ||
          (candidate.status === "needs_review" && (candidate.paths?.length ?? 0) > 0)),
    );
    if (
      maxConcurrentRuns <= 1 &&
      paths.length === 0 &&
      active.every((candidate) => (candidate.paths?.length ?? 0) === 0)
    ) {
      return true;
    }
    return (
      active.filter((candidate) => candidate.status === "running").length < maxConcurrentRuns &&
      !hasPathScopeOverlap(
        paths,
        active.map((candidate) => candidate.paths ?? []),
      )
    );
  }

  /**
   * Records an owner-confirmed merge: marks the goal done with the PR's merge
   * commit, then unblocks dependents and the parent exactly like `approve`.
   * The merge itself already happened by the time this runs — see `land.ts`.
   */
  async completeLand(input: {
    goalId: string;
    mergeCommitSha: string;
    serverId: string;
    relayHostId: string;
    hostDisplayName: string;
  }): Promise<{
    goal: GoalWire;
    runsToStart: Array<{ goalId: string; run: GoalRun }>;
  }> {
    return this.serialize(async () => {
      const state = await this.loadState();
      const byId = new Map(state.goals.map((g) => [g.id, g]));
      const goal = byId.get(input.goalId);
      if (!goal) throw new Error("目标不存在");
      if (
        goal.status !== "needs_review" ||
        (goal.reviewReason !== "completed" && goal.reviewReason !== "nothing_to_do")
      ) {
        throw new Error("cannot_land_uncompleted_goal");
      }
      const unfinishedChildren = state.goals.some(
        (child) =>
          child.parentGoalId === goal.id && child.status !== "done" && child.status !== "discarded",
      );
      if (unfinishedChildren) {
        throw new Error("请先完成或丢弃所有子任务后再合入");
      }

      const now = Date.now();
      const runsToStart: Array<{ goalId: string; run: GoalRun }> = [];
      const startExecuteForGoal = (targetGoal: StoredGoal, instruction: string | null) => {
        const run: GoalRun = {
          id: randomUUID(),
          kind: "execute",
          status: "running",
          pinned: true,
          agent: targetGoal.agent,
          agentRef: targetGoal.attachedAgentRef ?? null,
          relayHostId: input.relayHostId,
          serverId: input.serverId,
          hostId: input.serverId,
          hostDisplayName: input.hostDisplayName,
          instruction,
          outcome: null,
          startedAt: now,
          finishedAt: null,
          createdAt: now,
        };
        targetGoal.runs.push(run);
        targetGoal.runsUsed += 1;
        targetGoal.status = "running";
        targetGoal.reviewReason = null;
        targetGoal.updatedAt = now;
        runsToStart.push({ goalId: targetGoal.id, run });
      };

      goal.status = "done";
      goal.mergeCommitSha = input.mergeCommitSha;
      goal.reviewReason = null;
      goal.decidedAt = goal.decidedAt ?? now;
      goal.updatedAt = now;

      for (const candidate of state.goals) {
        if (
          candidate.status === "waiting_on_dependencies" &&
          (candidate.dependsOn ?? []).includes(goal.id)
        ) {
          const stillBlocked = (candidate.dependsOn ?? []).some(
            (depId) => byId.get(depId)?.status !== "done",
          );
          if (!stillBlocked) {
            startExecuteForGoal(candidate, null);
          }
        }
      }

      const parent = goal.parentGoalId ? byId.get(goal.parentGoalId) : undefined;
      if (parent?.status === "waiting_on_children") {
        const stillWaiting = state.goals.some(
          (child) =>
            child.parentGoalId === parent.id &&
            child.status !== "done" &&
            child.status !== "discarded",
        );
        if (!stillWaiting) {
          parent.status = "needs_review";
          parent.reviewReason = "completed";
          parent.updatedAt = now;
        }
      }

      await this.saveState(state);
      return {
        goal: this.toSummary(goal, state.goals),
        runsToStart,
      };
    });
  }

  async act(input: {
    goalId: string;
    action: "accept" | "discard" | "approve" | "continue" | "pause";
    budgetRuns?: number;
    instruction?: string;
    agent?: string | null;
    confirmExecutionStopped?: boolean;
    serverId: string;
    relayHostId: string;
    hostDisplayName: string;
    maxConcurrentRuns?: number;
  }): Promise<{
    goal: GoalWire;
    runsToStart: Array<{ goalId: string; run: GoalRun }>;
    runIdToCancel: string | null;
  }> {
    return this.serialize(async () => {
      const state = await this.loadState();
      const byId = new Map(state.goals.map((g) => [g.id, g]));
      const goal = byId.get(input.goalId);
      if (!goal) throw new Error("目标不存在");

      const now = Date.now();
      const runsToStart: Array<{ goalId: string; run: GoalRun }> = [];
      let runIdToCancel: string | null = null;

      const activeRun = goal.runs
        .toReversed()
        .find((r) => r.status === "queued" || r.status === "leased" || r.status === "running");

      const startExecuteForGoal = (targetGoal: StoredGoal, instruction: string | null) => {
        if (!this.canStartExecute(targetGoal, state.goals, input.maxConcurrentRuns ?? 1)) {
          targetGoal.status = "accepted";
          targetGoal.reviewReason = null;
          targetGoal.updatedAt = now;
          return;
        }
        const run: GoalRun = {
          id: randomUUID(),
          kind: "execute",
          status: "running",
          pinned: true,
          agent: targetGoal.agent,
          agentRef: targetGoal.attachedAgentRef ?? null,
          relayHostId: input.relayHostId,
          serverId: input.serverId,
          hostId: input.serverId,
          hostDisplayName: input.hostDisplayName,
          instruction,
          outcome: null,
          startedAt: now,
          finishedAt: null,
          createdAt: now,
        };
        targetGoal.runs.push(run);
        targetGoal.runsUsed += 1;
        targetGoal.status = "running";
        targetGoal.reviewReason = null;
        targetGoal.updatedAt = now;
        runsToStart.push({ goalId: targetGoal.id, run });
      };

      const checkParentUnblocked = (parentId: string | null | undefined) => {
        if (!parentId) return;
        const parent = byId.get(parentId);
        if (!parent || parent.status !== "waiting_on_children") return;
        const stillWaiting = state.goals.some(
          (child) =>
            child.parentGoalId === parent.id &&
            child.status !== "done" &&
            child.status !== "discarded",
        );
        if (!stillWaiting) {
          parent.status = "needs_review";
          parent.reviewReason = "completed";
          parent.updatedAt = now;
        }
      };

      switch (input.action) {
        case "accept":
          this.applyAcceptAction(goal, state, byId, input, now, startExecuteForGoal);
          break;
        case "discard":
          if (activeRun) {
            activeRun.status = "canceled";
            activeRun.finishedAt = now;
            activeRun.outcome = "已丢弃";
            runIdToCancel = activeRun.id;
          }
          goal.status = "discarded";
          goal.reviewReason = null;
          goal.decidedAt = goal.decidedAt ?? now;
          goal.updatedAt = now;
          checkParentUnblocked(goal.parentGoalId);
          break;
        case "pause":
          if (activeRun) {
            activeRun.status = "canceled";
            activeRun.finishedAt = now;
            activeRun.outcome = "已暂停";
            runIdToCancel = activeRun.id;
          }
          goal.status = "paused";
          goal.reviewReason = null;
          goal.updatedAt = now;
          break;
        case "continue":
          if (activeRun) {
            if (input.confirmExecutionStopped !== true) {
              throw new Error(
                "该任务仍有执行进行中。确认原执行已停止后，请带 --confirm-execution-stopped 重试。",
              );
            }
            activeRun.status = "canceled";
            activeRun.finishedAt = now;
            activeRun.outcome = "已被新的继续执行取代";
            runIdToCancel = activeRun.id;
          }
          this.applyContinueAction(goal, state, byId, input, now, startExecuteForGoal);
          break;
        case "approve":
          this.applyApproveAction(
            goal,
            state,
            byId,
            now,
            startExecuteForGoal,
            checkParentUnblocked,
          );
          break;
      }

      for (const candidate of state.goals) {
        if (
          candidate.status === "accepted" &&
          this.canStartExecute(candidate, state.goals, input.maxConcurrentRuns ?? 1)
        ) {
          startExecuteForGoal(candidate, null);
        }
      }

      await this.saveState(state);
      return {
        goal: this.toSummary(goal, state.goals),
        runsToStart,
        runIdToCancel,
      };
    });
  }
}
