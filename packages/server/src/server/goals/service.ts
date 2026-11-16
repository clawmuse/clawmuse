import { execFile as execFileCallback } from "node:child_process";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { promisify } from "node:util";
import type pino from "pino";
import type {
  GoalActionId,
  GoalDetailWire,
  GoalEvidence,
  GoalListFilter,
  GoalMergeMethod,
  GoalReportKind,
  GoalRepoWire,
  GoalRun,
  GoalWire,
} from "@getpaseo/protocol/goals";
import type { FirstAgentContext } from "@getpaseo/protocol/messages";
import type { AgentManager } from "../agent/agent-manager.js";
import type { AgentMode, McpServerConfig } from "../agent/agent-sdk-types.js";
import type { BoundCreateAgentCommand } from "../agent/create-agent/create.js";
import type { PersistedProjectRecord, PersistedWorkspaceRecord } from "../workspace-registry.js";
import type { CreatePaseoWorktreeWorkflowResult } from "../worktree-session.js";
import type { ClawMuseGoalProposal } from "../clawmuse-status/client.js";
import type { ClawMuseGoalToolBridge } from "../clawmuse-status/goal-tool-bridge.js";
import { goalRunProviderOptions } from "../clawmuse-status/goal-modes.js";
import {
  paseoOwnedWorktreeProbe,
  resolveGoalRunIsolation,
} from "../clawmuse-status/goal-unattended-policy.js";
import {
  buildClawMuseGoalExecutePrompt,
  buildClawMuseGoalPlanPrompt,
  CLAWMUSE_GOAL_PROPOSE_TOOL,
  CLAWMUSE_GOAL_REPORT_TOOL,
} from "../clawmuse-status/goal-prompts.js";
import {
  CLAWMUSE_GOAL_KIND_LABEL,
  CLAWMUSE_GOAL_RUN_LABEL,
  ClawMuseGoalReportError,
} from "../clawmuse-status/goal-runner.js";
import { readGoalWorkspace, saveGoalWorkspace } from "../clawmuse-status/goal-workspaces.js";
import {
  formatClawMuseGoalsProviderTarget,
  parseClawMuseGoalsProviderTarget,
  readClawMuseGoalsSettings,
  type ClawMuseGoalsProviderTarget,
} from "../clawmuse-status/goals-config.js";
import { deriveRelayHostId } from "../clawmuse-status/relay-host-id.js";
import { goalRepoDisplayName } from "../clawmuse-status/repo-inventory.js";
import { landGoal, type LandCommandRunner } from "./land.js";
import { LocalGoalStore, type StoredGoal } from "./store.js";
import { pathScopePrompt } from "./scheduler-guard.js";
import {
  createIsolatedGoalVerifierPort,
  runGoalVerification,
  verificationContinuation,
  type GoalVerifierPort,
} from "./verifier.js";

const OUTCOME_MAX_LENGTH = 4000;
const execFile = promisify(execFileCallback);
const AUTO_PLAN_CHECK_MS = 15 * 60 * 1000;
const AUTO_PLAN_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_OPEN_SUGGESTIONS_FOR_AUTO_PLAN = 8;

const PREFERRED_PROVIDER_ORDER = [
  "claude",
  "codex",
  "antigravity",
  "opencode",
  "copilot",
  "pi",
  "omp",
] as const;

const DISALLOWED_UNATTENDED_MODES = new Set([
  "bypassPermissions",
  "full-access",
  "yolo",
  "dangerously-skip-permissions",
]);

function truncate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > OUTCOME_MAX_LENGTH
    ? `${trimmed.slice(0, OUTCOME_MAX_LENGTH - 1)}…`
    : trimmed;
}

function verificationOutcome(input: { passed: boolean; shaDrifted: boolean }): string {
  if (input.shaDrifted) return "独立核验已失效：PR head SHA 已变更。";
  if (input.passed) return "独立核验通过。";
  return "独立核验失败。";
}

export function resolveLocalGoalModeId(
  modes: readonly AgentMode[],
  kind: "plan" | "execute",
): string | undefined {
  const safeModes = modes.filter((mode) => !DISALLOWED_UNATTENDED_MODES.has(mode.id));
  const preferred =
    kind === "plan"
      ? ["plan", "auto", "default", "acceptEdits"]
      : ["auto", "acceptEdits", "build", "default"];
  for (const id of preferred) {
    if (safeModes.some((mode) => mode.id === id)) {
      return id;
    }
  }
  return safeModes[0]?.id;
}

interface ResolvedLocalRepo {
  repoKey: string;
  displayName: string;
  project: PersistedProjectRecord;
}

interface ActiveLocalRun {
  runId: string;
  kind: "plan" | "execute";
  repoKey: string;
  repoDisplayName: string;
  goalId: string | null;
  agentId: string | null;
  workspaceId: string | null;
  canceled: boolean;
  proposed: boolean;
  queued: boolean;
  queuedLaunch?: { goalId: string; run: GoalRun; repo: ResolvedLocalRepo };
}

export interface GoalToolBridge {
  runIdForAgent(agentId: string): string | null;
  report(input: {
    evidence?: GoalEvidence;
    callerAgentId: string;
    kind: GoalReportKind;
    message: string;
    prUrl: string | null;
  }): Promise<void>;
  propose(input: {
    callerAgentId: string;
    proposals: ClawMuseGoalProposal[];
  }): Promise<{ created: number; skipped: number }>;
}

export interface LocalGoalServiceOptions {
  paseoHome: string;
  serverId: string;
  hostDisplayName?: string;
  logger: pino.Logger;
  agentManager: Pick<
    AgentManager,
    "runAgent" | "waitForAgentEvent" | "getAgent" | "cancelAgentRun"
  >;
  createAgent: BoundCreateAgentCommand;
  createDirectoryWorkspace: (input: {
    cwd: string;
    firstAgentContext: FirstAgentContext;
  }) => Promise<PersistedWorkspaceRecord>;
  createPaseoWorktreeWorkspace: (input: {
    cwd: string;
    firstAgentContext: FirstAgentContext;
  }) => Promise<CreatePaseoWorktreeWorkflowResult>;
  archiveWorkspace: (workspaceId: string) => Promise<void>;
  listProjects: () => Promise<PersistedProjectRecord[]>;
  getWorkspace: (workspaceId: string) => Promise<PersistedWorkspaceRecord | null>;
  getGoalMcpServer: (agentId: string) => McpServerConfig;
  listProviderModes: (provider: string, cwd: string) => Promise<AgentMode[]>;
  listReadyProviders?: (cwd: string) => Promise<string[]>;
  /** Creates a disposable fixed-SHA verifier checkout; tests provide an in-memory port. */
  createVerifierPort?: (repoRoot: string) => GoalVerifierPort;
  landCommandRunner?: LandCommandRunner;
  fallbackBridge?: GoalToolBridge;
  onChanged?: (goalId: string | null) => void;
}

export class LocalGoalService implements ClawMuseGoalToolBridge {
  private readonly logger: pino.Logger;
  private readonly store: LocalGoalStore;
  private readonly relayHostId: string;
  private readonly hostDisplayName: string;
  private readonly activeRuns = new Map<string, ActiveLocalRun>();
  private autoPlanTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly options: LocalGoalServiceOptions) {
    this.logger = options.logger.child({ module: "local-goals" });
    this.store = new LocalGoalStore(options.paseoHome, this.logger);
    this.relayHostId = deriveRelayHostId(options.serverId);
    this.hostDisplayName = options.hostDisplayName?.trim() || hostname();
  }

  async start(): Promise<void> {
    await this.store.recoverInterruptedRuns();
    if (!this.autoPlanTimer) {
      this.autoPlanTimer = setInterval(() => {
        void this.runDueAutoPlans().catch((err) => {
          this.logger.warn({ err }, "Auto-plan check failed");
        });
      }, AUTO_PLAN_CHECK_MS);
      this.autoPlanTimer.unref?.();
    }
  }

  async stop(): Promise<void> {
    if (this.autoPlanTimer) {
      clearInterval(this.autoPlanTimer);
      this.autoPlanTimer = null;
    }
    const ids = [...this.activeRuns.keys()];
    await Promise.allSettled(ids.map((id) => this.cancelRun(id)));
  }

  private notifyChanged(goalId: string | null = null): void {
    try {
      this.options.onChanged?.(goalId);
    } catch (err) {
      this.logger.warn({ err }, "Failed emitting goals.changed");
    }
  }

  private resolveProjectRepoKey(project: PersistedProjectRecord): string {
    const key = project.projectKey?.trim();
    if (key && key.startsWith("remote:") && !/\s/.test(key)) {
      return key;
    }
    return `local:${this.options.serverId}:${project.projectId}`;
  }

  private resolveProjectDisplayName(project: PersistedProjectRecord, repoKey: string): string {
    if (project.customName?.trim()) {
      return project.customName.trim();
    }
    if (repoKey.startsWith("remote:")) {
      return goalRepoDisplayName(repoKey);
    }
    return project.displayName;
  }

  private async listResolvedRepos(): Promise<ResolvedLocalRepo[]> {
    const projects = await this.options.listProjects();
    const byKey = new Map<string, ResolvedLocalRepo>();
    for (const project of projects) {
      if (project.archivedAt) continue;
      const repoKey = this.resolveProjectRepoKey(project);
      if (!byKey.has(repoKey)) {
        byKey.set(repoKey, {
          repoKey,
          displayName: this.resolveProjectDisplayName(project, repoKey),
          project,
        });
      }
    }
    return [...byKey.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  private buildRepoWires(
    resolvedRepos: readonly ResolvedLocalRepo[],
    allGoals: readonly StoredGoal[],
    repoSettingsMap: Record<
      string,
      {
        planEnabled: boolean;
        lastPlannedAt: number | null;
        preferredHostId: string | null;
        planAgent: string | null;
        executeAgent: string | null;
        lastPlanRun: GoalRepoWire["lastPlanRun"];
      }
    >,
  ): GoalRepoWire[] {
    const verifierSettings = readClawMuseGoalsSettings(this.options.paseoHome);
    return resolvedRepos.map((entry) => {
      const settings = repoSettingsMap[entry.repoKey];
      const repoGoals = allGoals.filter((g) => g.repoKey === entry.repoKey);
      const suggestedCount = repoGoals.filter((g) => g.status === "suggested").length;
      const activeCount = repoGoals.filter((g) =>
        [
          "accepted",
          "running",
          "paused",
          "waiting_on_children",
          "waiting_on_dependencies",
        ].includes(g.status),
      ).length;
      return {
        repoKey: entry.repoKey,
        displayName: entry.displayName,
        planEnabled: settings?.planEnabled ?? false,
        lastPlannedAt: settings?.lastPlannedAt ?? null,
        preferredHostId: settings?.preferredHostId ?? this.options.serverId,
        planAgent: settings?.planAgent ?? null,
        executeAgent: settings?.executeAgent ?? null,
        verifierAgent: verifierSettings.verifierAgent
          ? formatClawMuseGoalsProviderTarget(verifierSettings.verifierAgent)
          : null,
        verificationCommands: verifierSettings.verificationCommands,
        lastPlanRun: settings?.lastPlanRun ?? null,
        hosts: [
          {
            hostId: this.options.serverId,
            serverId: this.options.serverId,
            relayHostId: this.relayHostId,
            displayName: this.hostDisplayName,
            connectivity: "live",
          },
        ],
        suggestedCount,
        activeCount,
      };
    });
  }

  async list(
    options: {
      filter?: GoalListFilter;
      repoKey?: string | null;
      parentGoalId?: string;
    } = {},
  ): Promise<{ goals: GoalWire[]; repos: GoalRepoWire[] }> {
    const [resolvedRepos, snap] = await Promise.all([
      this.listResolvedRepos(),
      this.store.snapshot(options),
    ]);
    return {
      goals: snap.goals,
      repos: this.buildRepoWires(resolvedRepos, snap.allGoals, snap.repos),
    };
  }

  async get(goalId: string): Promise<GoalDetailWire> {
    const detail = await this.store.getDetail(goalId);
    if (!detail) {
      throw new Error("目标不存在");
    }
    return detail;
  }

  async create(input: {
    idempotencyKey?: string;
    repoKey: string;
    title: string;
    summary: string;
    acceptance?: string;
    priority?: number;
    budgetRuns?: number;
    start?: boolean;
    parentGoalId?: string;
    dependsOn?: string[];
    source?: { kind: string; key: string | null; url?: string | null };
    paths?: string[];
    agent?: string | null;
    attachedAgentRef?: string | null;
  }): Promise<GoalWire> {
    const resolvedRepos = await this.listResolvedRepos();
    const repo = resolvedRepos.find((r) => r.repoKey === input.repoKey);
    if (!repo) {
      throw new Error("所选项目在当前主机上不存在或已归档");
    }
    const summary = input.summary.trim();
    const rawTitle = input.title.trim();
    const title = rawTitle || summary.split(/\r?\n/)[0]?.slice(0, 80) || "未命名目标";
    const acceptance =
      input.acceptance?.trim() || "完成上述目标要求，通过项目相关检查并可供主人审查。";
    const budgetRuns = Math.max(1, Math.min(50, input.budgetRuns ?? 3));
    const priority = Math.max(1, Math.min(5, input.priority ?? 3));

    const { goal, runToStart } = await this.store.createManualGoal({
      idempotencyKey: input.idempotencyKey,
      serverId: this.options.serverId,
      relayHostId: this.relayHostId,
      hostDisplayName: this.hostDisplayName,
      repoKey: repo.repoKey,
      repoDisplayName: repo.displayName,
      title,
      summary: summary || title,
      acceptance,
      priority,
      budgetRuns,
      start: input.start !== false,
      parentGoalId: input.parentGoalId,
      dependsOn: input.dependsOn,
      source: input.source,
      paths: input.paths,
      maxConcurrentRuns: readClawMuseGoalsSettings(this.options.paseoHome).maxConcurrentRuns,
      agent: input.agent ?? null,
      attachedAgentRef: input.attachedAgentRef ?? null,
    });

    this.notifyChanged(goal.id);
    if (runToStart) {
      this.launchExecuteRun(goal.id, runToStart, repo);
    }
    return goal;
  }

  async act(input: {
    goalId: string;
    action: GoalActionId;
    budgetRuns?: number;
    instruction?: string;
    agent?: string | null;
    confirmExecutionStopped?: boolean;
    mergeMethod?: GoalMergeMethod;
  }): Promise<GoalWire> {
    // `land` merges the production branch, so it lives outside store.act: the
    // only way in is this owner RPC (`goals.act.request`); the agent-facing
    // `clawmuse_goals` MCP bridge exposes no path to it.
    if (input.action === "land") {
      return this.land(input);
    }
    const result = await this.store.act({
      goalId: input.goalId,
      action: input.action,
      budgetRuns: input.budgetRuns,
      instruction: input.instruction,
      agent: input.agent,
      confirmExecutionStopped: input.confirmExecutionStopped,
      serverId: this.options.serverId,
      relayHostId: this.relayHostId,
      hostDisplayName: this.hostDisplayName,
      maxConcurrentRuns: readClawMuseGoalsSettings(this.options.paseoHome).maxConcurrentRuns,
    });
    if (result.runIdToCancel) {
      await this.cancelRun(result.runIdToCancel);
    }
    this.notifyChanged(input.goalId);
    await this.startQueuedRuns(result.runsToStart);
    return result.goal;
  }

  private async land(input: { goalId: string; mergeMethod?: GoalMergeMethod }): Promise<GoalWire> {
    const detail = await this.store.getDetail(input.goalId);
    if (!detail) {
      throw new Error("目标不存在");
    }
    const resolvedRepos = await this.listResolvedRepos();
    const repo = resolvedRepos.find((r) => r.repoKey === detail.repoKey);
    if (!repo) {
      throw new Error("所选项目在当前主机上不存在或已归档");
    }
    if (repo.project.kind !== "git") {
      throw new Error("只有 Git 项目支持合入并结单");
    }
    const result = await landGoal(
      {
        store: this.store,
        paseoHome: this.options.paseoHome,
        logger: this.logger,
        repoKey: repo.repoKey,
        repoRootPath: repo.project.rootPath,
        serverId: this.options.serverId,
        relayHostId: this.relayHostId,
        hostDisplayName: this.hostDisplayName,
        archiveWorkspace: this.options.archiveWorkspace,
        ...(this.options.landCommandRunner ? { runCommand: this.options.landCommandRunner } : {}),
      },
      input,
    );
    this.notifyChanged(input.goalId);
    await this.startQueuedRuns(result.runsToStart);
    return result.goal;
  }

  private async startQueuedRuns(
    runsToStart: ReadonlyArray<{ goalId: string; run: GoalRun }>,
  ): Promise<void> {
    if (runsToStart.length === 0) {
      return;
    }
    const resolvedRepos = await this.listResolvedRepos();
    for (const entry of runsToStart) {
      const detail = await this.store.getDetail(entry.goalId);
      const repo = detail ? resolvedRepos.find((r) => r.repoKey === detail.repoKey) : undefined;
      if (repo) {
        this.launchExecuteRun(entry.goalId, entry.run, repo);
      } else {
        await this.finishExecute(entry.goalId, entry.run.id, "failed", "项目在当前主机上不存在");
      }
    }
  }

  async requestPlan(input: {
    repoKey: string;
    agent?: string | null;
  }): Promise<{ outcome: "queued" | "already_open"; repos: GoalRepoWire[] }> {
    const resolvedRepos = await this.listResolvedRepos();
    const repo = resolvedRepos.find((r) => r.repoKey === input.repoKey);
    if (!repo) {
      throw new Error("所选项目在当前主机上不存在或已归档");
    }
    const alreadyOpen = [...this.activeRuns.values()].some(
      (r) => r.kind === "plan" && r.repoKey === repo.repoKey && !r.canceled,
    );
    if (alreadyOpen) {
      const { repos } = await this.list();
      return { outcome: "already_open", repos };
    }

    const runId = randomUUID();
    const now = Date.now();
    await this.store.updateRepoPlanState(repo.repoKey, {
      ...(input.agent !== undefined ? { planAgent: input.agent } : {}),
      lastPlanRun: {
        status: "running",
        outcome: null,
        hostDisplayName: this.hostDisplayName,
        createdAt: now,
        finishedAt: null,
      },
    });

    const snap = await this.store.snapshot({ repoKey: repo.repoKey });
    const openTitles = snap.allGoals
      .filter((g) => g.repoKey === repo.repoKey && g.status !== "discarded")
      .map((g) => g.title);

    this.launchPlanRun({
      runId,
      repo,
      agent: input.agent ?? snap.repos[repo.repoKey]?.planAgent ?? null,
      openGoalTitles: openTitles,
      createdAt: now,
    });
    this.notifyChanged(null);
    const { repos } = await this.list();
    return { outcome: "queued", repos };
  }

  async setRepoPlanEnabled(repoKey: string, planEnabled: boolean): Promise<GoalRepoWire> {
    await this.store.setRepoPlanEnabled(repoKey, planEnabled);
    this.notifyChanged(null);
    const { repos } = await this.list();
    const found = repos.find((r) => r.repoKey === repoKey);
    if (!found) {
      throw new Error("项目不存在");
    }
    return found;
  }

  async submitReview(input: {
    goalId: string;
    runId: string;
    message: string;
    evidence: GoalEvidence;
  }): Promise<GoalDetailWire> {
    const updated = await this.store.submitOwnerReview(input);
    this.notifyChanged(input.goalId);
    return updated;
  }

  // ============================================================================
  // GoalToolBridge (MCP tools called by Planner & Executor agents)
  // ============================================================================

  runIdForAgent(agentId: string): string | null {
    for (const [runId, entry] of this.activeRuns) {
      if (entry.agentId === agentId) {
        return runId;
      }
    }
    return this.options.fallbackBridge?.runIdForAgent(agentId) ?? null;
  }

  async report(input: {
    evidence?: GoalEvidence;
    callerAgentId: string;
    kind: GoalReportKind;
    message: string;
    prUrl: string | null;
  }): Promise<void> {
    const local = [...this.activeRuns.values()].find((r) => r.agentId === input.callerAgentId);
    if (!local) {
      if (this.options.fallbackBridge) {
        return this.options.fallbackBridge.report(input);
      }
      throw new ClawMuseGoalReportError("This agent is not running a goal");
    }
    if (!local.goalId) {
      throw new ClawMuseGoalReportError("Only an execution run can submit a goal report");
    }
    await this.store.recordReport({
      goalId: local.goalId,
      runId: local.runId,
      kind: input.kind,
      message: input.message,
      prUrl: input.prUrl,
      evidence: input.evidence,
    });
    this.notifyChanged(local.goalId);
  }

  async propose(input: {
    callerAgentId: string;
    proposals: ClawMuseGoalProposal[];
  }): Promise<{ created: number; skipped: number }> {
    const local = [...this.activeRuns.values()].find((r) => r.agentId === input.callerAgentId);
    if (!local) {
      if (this.options.fallbackBridge) {
        return this.options.fallbackBridge.propose(input);
      }
      throw new ClawMuseGoalReportError("This agent is not running a goal");
    }
    if (local.kind !== "plan") {
      throw new ClawMuseGoalReportError("Only a planning run can propose goals");
    }
    const result = await this.store.addProposals({
      serverId: this.options.serverId,
      hostDisplayName: this.hostDisplayName,
      repoKey: local.repoKey,
      repoDisplayName: local.repoDisplayName,
      proposals: input.proposals,
    });
    local.proposed = true;
    this.notifyChanged(null);
    return result;
  }

  // ============================================================================
  // Execution Engine
  // ============================================================================

  private async resolveProviderTarget(
    explicitAgent: string | null,
    kind: "plan" | "execute",
    cwd: string,
  ): Promise<ClawMuseGoalsProviderTarget> {
    if (explicitAgent?.trim()) {
      return parseClawMuseGoalsProviderTarget(explicitAgent);
    }
    const ready = (await this.options.listReadyProviders?.(cwd)) ?? [];
    const settings = readClawMuseGoalsSettings(this.options.paseoHome);
    const configured = kind === "plan" ? settings.planner : settings.executor;
    if (ready.length === 0 || ready.includes(configured.provider)) {
      return configured;
    }
    for (const candidate of PREFERRED_PROVIDER_ORDER) {
      if (ready.includes(candidate)) {
        return { provider: candidate, model: null };
      }
    }
    return { provider: ready[0]!, model: null };
  }

  private launchPlanRun(params: {
    runId: string;
    repo: ResolvedLocalRepo;
    agent: string | null;
    openGoalTitles: string[];
    createdAt: number;
  }): void {
    const active: ActiveLocalRun = {
      runId: params.runId,
      kind: "plan",
      repoKey: params.repo.repoKey,
      repoDisplayName: params.repo.displayName,
      goalId: null,
      agentId: null,
      workspaceId: null,
      canceled: false,
      proposed: false,
      queued: false,
    };
    this.activeRuns.set(params.runId, active);

    void (async () => {
      let workspace: PersistedWorkspaceRecord | null = null;
      let execution: ReturnType<LocalGoalServiceOptions["agentManager"]["runAgent"]> | null = null;
      try {
        const prompt = buildClawMuseGoalPlanPrompt({
          runId: params.runId,
          kind: "plan",
          repoKey: params.repo.repoKey,
          repoDisplayName: params.repo.displayName,
          agent: params.agent,
          instruction: null,
          attachedAgentRef: null,
          leaseExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          openGoalTitles: params.openGoalTitles,
          goal: null,
          priorReports: [],
        });
        workspace = await this.options.createDirectoryWorkspace({
          cwd: params.repo.project.rootPath,
          firstAgentContext: { prompt },
        });
        active.workspaceId = workspace.workspaceId;
        const agentId = randomUUID();
        active.agentId = agentId;

        const target = await this.resolveProviderTarget(params.agent, "plan", workspace.cwd);
        const modes = await this.options.listProviderModes(target.provider, workspace.cwd);
        const modeId = resolveLocalGoalModeId(modes, "plan");

        const created = await this.options.createAgent({
          kind: "mcp",
          agentId,
          provider: formatClawMuseGoalsProviderTarget(target),
          config: {
            provider: target.provider,
            cwd: workspace.cwd,
            model: target.model ?? undefined,
            providerOptions: modeId
              ? goalRunProviderOptions(target.provider, modeId, "plan")
              : undefined,
            mcpServers: { clawmuse_goals: this.options.getGoalMcpServer(agentId) },
            toolPolicy: {
              preapproved: [
                {
                  kind: "mcp",
                  server: "clawmuse_goals",
                  tool: CLAWMUSE_GOAL_PROPOSE_TOOL,
                },
              ],
            },
          },
          cwd: workspace.cwd,
          workspaceId: workspace.workspaceId,
          title: `规划建议：${params.repo.displayName}`,
          labels: {
            [CLAWMUSE_GOAL_RUN_LABEL]: params.runId,
            [CLAWMUSE_GOAL_KIND_LABEL]: "plan",
          },
          ...(modeId ? { mode: modeId } : {}),
          unattended: false,
          promptFailure: "return-error",
          notifyOnFinish: false,
        });
        if (created.initialPromptError) {
          throw created.initialPromptError;
        }
        execution = this.options.agentManager.runAgent(agentId, prompt);
        void execution.catch(() => {});
        const waited = await this.options.agentManager.waitForAgentEvent(agentId, {
          waitForActive: true,
        });
        if (waited.permission !== null) {
          await this.options.agentManager.cancelAgentRun(agentId);
          await execution.catch(() => {});
          await this.finishPlanRun(
            params.repo.repoKey,
            params.createdAt,
            "failed",
            "规划时请求了额外权限，已停止",
          );
          return;
        }
        const result = await execution;
        if (active.canceled || result.canceled === true) {
          await this.finishPlanRun(params.repo.repoKey, params.createdAt, "canceled", "已取消");
          return;
        }
        if (waited.status === "error") {
          await this.finishPlanRun(
            params.repo.repoKey,
            params.createdAt,
            "failed",
            truncate(waited.lastMessage) ?? "规划 Agent 执行失败",
          );
          return;
        }
        if (!active.proposed) {
          await this.finishPlanRun(
            params.repo.repoKey,
            params.createdAt,
            "failed",
            truncate(`规划结束时未调用建议工具。${waited.lastMessage ?? result.finalText ?? ""}`),
          );
          return;
        }
        await this.finishPlanRun(
          params.repo.repoKey,
          params.createdAt,
          "succeeded",
          truncate(waited.lastMessage ?? result.finalText),
        );
      } catch (error) {
        this.logger.warn({ err: error, runId: params.runId }, "Local plan run failed");
        if (execution && active.agentId) {
          await this.options.agentManager.cancelAgentRun(active.agentId).catch(() => {});
          await execution.catch(() => {});
        }
        await this.finishPlanRun(
          params.repo.repoKey,
          params.createdAt,
          "failed",
          truncate(error instanceof Error ? error.message : String(error)),
        );
      } finally {
        this.activeRuns.delete(params.runId);
        if (workspace) {
          const planWorkspaceId = workspace.workspaceId;
          await this.options.archiveWorkspace(planWorkspaceId).catch((err) => {
            this.logger.warn(
              { err, workspaceId: planWorkspaceId },
              "Failed archiving plan workspace",
            );
          });
        }
      }
    })();
  }

  private async finishPlanRun(
    repoKey: string,
    createdAt: number,
    status: "succeeded" | "failed" | "canceled",
    outcome: string | null,
  ): Promise<void> {
    const now = Date.now();
    await this.store.updateRepoPlanState(repoKey, {
      ...(status === "succeeded" ? { lastPlannedAt: now } : {}),
      lastPlanRun: {
        status,
        outcome,
        hostDisplayName: this.hostDisplayName,
        createdAt,
        finishedAt: now,
      },
    });
    this.notifyChanged(null);
  }

  private maxConcurrentExecuteRuns(): number {
    try {
      return readClawMuseGoalsSettings(this.options.paseoHome).maxConcurrentRuns;
    } catch (err) {
      this.logger.warn({ err }, "Failed reading goals settings; using maxConcurrentRuns=1");
      return 1;
    }
  }

  private runningExecuteCount(): number {
    let count = 0;
    for (const entry of this.activeRuns.values()) {
      if (entry.kind === "execute" && !entry.canceled && !entry.queued) {
        count += 1;
      }
    }
    return count;
  }

  private launchExecuteRun(goalId: string, run: GoalRun, repo: ResolvedLocalRepo): void {
    const active: ActiveLocalRun = {
      runId: run.id,
      kind: "execute",
      repoKey: repo.repoKey,
      repoDisplayName: repo.displayName,
      goalId,
      agentId: null,
      workspaceId: null,
      canceled: false,
      proposed: false,
      queued: false,
    };

    if (this.runningExecuteCount() >= this.maxConcurrentExecuteRuns()) {
      active.queued = true;
      active.queuedLaunch = { goalId, run, repo };
      this.activeRuns.set(run.id, active);
      void this.store
        .updateRunQueueState({ goalId, runId: run.id, queued: true })
        .then(() => this.notifyChanged(goalId))
        .catch((err) => {
          this.logger.warn({ err, goalId, runId: run.id }, "Failed marking execute run queued");
        });
      return;
    }

    this.activeRuns.set(run.id, active);
    void this.runExecuteLoop(goalId, run, repo, active);
  }

  private pumpExecuteQueue(): void {
    const limit = this.maxConcurrentExecuteRuns();
    for (const entry of this.activeRuns.values()) {
      if (entry.kind !== "execute" || !entry.queued) continue;
      if (entry.canceled) {
        this.activeRuns.delete(entry.runId);
        continue;
      }
      if (!entry.queuedLaunch || this.runningExecuteCount() >= limit) continue;
      const { goalId, run, repo } = entry.queuedLaunch;
      entry.queued = false;
      entry.queuedLaunch = undefined;
      void this.store.updateRunQueueState({ goalId, runId: run.id, queued: false }).catch((err) => {
        this.logger.warn({ err, goalId, runId: run.id }, "Failed resuming queued execute run");
      });
      void this.runExecuteLoop(goalId, run, repo, entry);
    }
  }

  private buildExecutePrompt(
    detail: GoalDetailWire,
    run: GoalRun,
    repo: ResolvedLocalRepo,
  ): string {
    const prompt = buildClawMuseGoalExecutePrompt({
      runId: run.id,
      kind: "execute",
      repoKey: repo.repoKey,
      repoDisplayName: repo.displayName,
      agent: run.agent,
      instruction: run.instruction,
      attachedAgentRef: null,
      leaseExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      openGoalTitles: [],
      goal: {
        id: detail.id,
        title: detail.title,
        summary: detail.summary,
        acceptance: detail.acceptance,
        priority: detail.priority,
        budgetRuns: detail.budgetRuns,
        runsUsed: Math.max(0, detail.runsUsed - 1),
      },
      priorReports: detail.reports.map((r) => ({
        seq: r.seq,
        kind: r.kind,
        message: r.message,
        prUrl: r.prUrl,
        createdAt: new Date(r.createdAt).toISOString(),
      })),
    });
    const scope = pathScopePrompt(detail.paths);
    return scope ? `${prompt}\n\n${scope}` : prompt;
  }

  private async launchExecuteAgent(
    detail: GoalDetailWire,
    run: GoalRun,
    workspace: Pick<PersistedWorkspaceRecord, "workspaceId" | "cwd" | "kind" | "branch">,
    agentId: string,
  ): Promise<void> {
    const target = await this.resolveProviderTarget(run.agent, "execute", workspace.cwd);
    const modes = await this.options.listProviderModes(target.provider, workspace.cwd);
    const modeId = resolveLocalGoalModeId(modes, "execute");
    const isolation = await resolveGoalRunIsolation(
      workspace,
      paseoOwnedWorktreeProbe(this.options.paseoHome),
    );

    const created = await this.options.createAgent({
      kind: "mcp",
      agentId,
      provider: formatClawMuseGoalsProviderTarget(target),
      config: {
        provider: target.provider,
        cwd: workspace.cwd,
        model: target.model ?? undefined,
        providerOptions: goalRunProviderOptions(target.provider, modeId, "execute", isolation),
        mcpServers: { clawmuse_goals: this.options.getGoalMcpServer(agentId) },
        toolPolicy: {
          preapproved: [
            {
              kind: "mcp",
              server: "clawmuse_goals",
              tool: CLAWMUSE_GOAL_REPORT_TOOL,
            },
          ],
        },
      },
      cwd: workspace.cwd,
      workspaceId: workspace.workspaceId,
      title: `目标：${detail.title}`,
      labels: {
        [CLAWMUSE_GOAL_RUN_LABEL]: run.id,
        [CLAWMUSE_GOAL_KIND_LABEL]: "execute",
        "clawmuse.goal-id": detail.id,
      },
      ...(modeId ? { mode: modeId } : {}),
      unattended: false,
      promptFailure: "return-error",
      notifyOnFinish: false,
    });
    if (created.initialPromptError) {
      throw created.initialPromptError;
    }
  }

  private async runExecuteLoop(
    goalId: string,
    run: GoalRun,
    repo: ResolvedLocalRepo,
    active: ActiveLocalRun,
  ): Promise<void> {
    let execution: ReturnType<LocalGoalServiceOptions["agentManager"]["runAgent"]> | null = null;
    try {
      const detail = await this.store.getDetail(goalId);
      if (!detail || active.canceled) {
        await this.finishExecute(goalId, run.id, "canceled", "已取消");
        return;
      }
      if (detail.attachedAgentRef) {
        await this.observeAttachedSession(detail, run, active);
        return;
      }

      const prompt = this.buildExecutePrompt(detail, run, repo);
      const workspace = await this.ensureExecuteWorkspace(detail, repo, prompt);
      active.workspaceId = workspace.workspaceId;
      if (active.canceled) {
        await this.finishExecute(goalId, run.id, "canceled", "已取消");
        return;
      }

      const agentId = randomUUID();
      active.agentId = agentId;
      await this.launchExecuteAgent(detail, run, workspace, agentId);
      await this.store.bindRunAgent(goalId, run.id, agentId);
      this.notifyChanged(goalId);

      if (active.canceled) {
        await this.options.agentManager.cancelAgentRun(agentId);
        await this.finishExecute(goalId, run.id, "canceled", "已取消");
        return;
      }

      execution = this.options.agentManager.runAgent(agentId, prompt);
      void execution.catch(() => {});
      const waited = await this.options.agentManager.waitForAgentEvent(agentId, {
        waitForActive: true,
      });
      if (waited.permission !== null) {
        const permTitle = waited.permission.title ?? waited.permission.name;
        const permDesc =
          waited.permission.description ??
          "可打开执行记录授权，或在「继续」中补充无需该权限的方案。";
        await this.report({
          callerAgentId: agentId,
          kind: "needs_decision",
          message:
            truncate(`执行需要额外权限，已暂停等待决定。操作：${permTitle}。${permDesc}`) ??
            "执行需要额外权限",
          prUrl: null,
        });
        await this.options.agentManager.cancelAgentRun(agentId);
        await execution.catch(() => {});
        await this.finishExecute(goalId, run.id, "succeeded", "等待审查操作权限");
        return;
      }

      const result = await execution;
      if (active.canceled || result.canceled === true) {
        await this.finishExecute(goalId, run.id, "canceled", "已取消");
        return;
      }
      if (waited.status === "error") {
        await this.finishExecute(
          goalId,
          run.id,
          "failed",
          truncate(waited.lastMessage) ?? "执行失败",
        );
        return;
      }
      await this.finishExecute(
        goalId,
        run.id,
        "succeeded",
        truncate(waited.lastMessage ?? result.finalText),
      );
    } catch (error) {
      this.logger.warn({ err: error, goalId, runId: run.id }, "Local execute run failed");
      if (execution && active.agentId) {
        await this.options.agentManager.cancelAgentRun(active.agentId).catch(() => {});
        await execution.catch(() => {});
      }
      await this.finishExecute(
        goalId,
        run.id,
        "failed",
        truncate(error instanceof Error ? error.message : String(error)),
      );
    } finally {
      this.activeRuns.delete(run.id);
      this.pumpExecuteQueue();
    }
  }

  private async observeAttachedSession(
    detail: GoalDetailWire,
    run: GoalRun,
    active: ActiveLocalRun,
  ): Promise<void> {
    const agentId = detail.attachedAgentRef!;
    const agent = this.options.agentManager.getAgent(agentId);
    if (!agent?.workspaceId) {
      throw new Error("关联会话不存在或尚未激活");
    }
    active.agentId = agentId;
    active.workspaceId = agent.workspaceId;
    await this.store.bindRunAgent(detail.id, run.id, agentId);
    this.notifyChanged(detail.id);
    const waited = await this.options.agentManager.waitForAgentEvent(agentId);
    await this.store.recordReport({
      goalId: detail.id,
      runId: run.id,
      kind: "needs_decision",
      message:
        "关联会话已到达检查点，请打开会话核对结果。" +
        (waited.permission ? " 会话正在等待操作权限。" : ""),
      prUrl: null,
    });
    await this.finishExecute(
      detail.id,
      run.id,
      waited.status === "error" ? "failed" : "succeeded",
      "等待核对关联会话结果",
    );
  }

  private async ensureExecuteWorkspace(
    detail: GoalDetailWire,
    repo: ResolvedLocalRepo,
    prompt: string,
  ): Promise<PersistedWorkspaceRecord> {
    const savedId = await readGoalWorkspace(this.options.paseoHome, detail.id, repo.repoKey);
    if (savedId) {
      const existing = await this.options.getWorkspace(savedId);
      if (existing && !existing.archivedAt) {
        return existing;
      }
    }
    const settings = readClawMuseGoalsSettings(this.options.paseoHome);
    const firstAgentContext = { prompt };
    if (repo.project.kind === "git" && settings.isolation === "worktree") {
      try {
        const { workspace } = await this.options.createPaseoWorktreeWorkspace({
          cwd: repo.project.rootPath,
          firstAgentContext,
        });
        await saveGoalWorkspace(
          this.options.paseoHome,
          detail.id,
          repo.repoKey,
          workspace.workspaceId,
        );
        return workspace;
      } catch (err) {
        this.logger.warn(
          { err, repoKey: repo.repoKey },
          "Worktree creation unavailable for goal; falling back to directory workspace",
        );
      }
    }
    const workspace = await this.options.createDirectoryWorkspace({
      cwd: repo.project.rootPath,
      firstAgentContext,
    });
    await saveGoalWorkspace(this.options.paseoHome, detail.id, repo.repoKey, workspace.workspaceId);
    return workspace;
  }

  private async finishExecute(
    goalId: string,
    runId: string,
    status: "succeeded" | "failed" | "canceled",
    outcome: string | null,
  ): Promise<void> {
    const { goal, nextRun } = await this.store.finishExecuteRun({
      goalId,
      runId,
      status,
      outcome,
      serverId: this.options.serverId,
      relayHostId: this.relayHostId,
      hostDisplayName: this.hostDisplayName,
    });
    this.notifyChanged(goalId);
    const resolvedRepos = await this.listResolvedRepos();
    const detail = await this.store.getDetail(goalId);
    const repo = detail
      ? resolvedRepos.find((entry) => entry.repoKey === detail.repoKey)
      : undefined;
    if (!nextRun && goal && repo) {
      await this.verifyCompletedExecute(goalId, runId, repo);
      return;
    }
    if (nextRun) {
      if (repo) {
        this.launchExecuteRun(goalId, nextRun, repo);
      } else {
        await this.finishExecute(goalId, nextRun.id, "failed", "项目已移除");
      }
    }
  }

  private async runVerifier(input: {
    commands: ReturnType<typeof readClawMuseGoalsSettings>["verificationCommands"];
    headSha: string;
    prUrl: string | null;
    repoRoot: string;
    verifierRunId: string;
  }) {
    try {
      const remoteHeadSha = input.prUrl
        ? await this.resolvePullRequestHeadSha(input.prUrl, input.repoRoot)
        : undefined;
      return await runGoalVerification({
        commands: input.commands,
        headSha: input.headSha,
        ...(remoteHeadSha !== undefined ? { remoteHeadSha } : {}),
        verifierRunId: input.verifierRunId,
        port:
          this.options.createVerifierPort?.(input.repoRoot) ??
          createIsolatedGoalVerifierPort(input.repoRoot),
      });
    } catch (error) {
      return {
        passed: false,
        shaDrifted: false,
        evidence: {
          revision: input.headSha,
          headSha: input.headSha,
          source: "verifier" as const,
          verifiedByRunId: input.verifierRunId,
          artifacts: [],
          checks: [
            {
              name: "独立核验环境",
              result: "failed" as const,
              detail: error instanceof Error ? error.message : String(error),
            },
          ],
        },
      };
    }
  }

  private async verifyCompletedExecute(
    goalId: string,
    executeRunId: string,
    repo: ResolvedLocalRepo,
  ): Promise<void> {
    const settings = readClawMuseGoalsSettings(this.options.paseoHome);
    if (settings.verificationCommands.length === 0) return;
    const detail = await this.store.getDetail(goalId);
    const report = detail?.reports
      .toReversed()
      .find((entry) => entry.runId === executeRunId && entry.kind === "done");
    const headSha = report?.evidence?.revision;
    if (!headSha || !/^[0-9a-f]{40}$/i.test(headSha)) return;

    const verifierRun = await this.store.startVerifierRun({
      goalId,
      executeRunId,
      agent: settings.verifierAgent
        ? formatClawMuseGoalsProviderTarget(settings.verifierAgent)
        : null,
    });
    if (!verifierRun) return;
    this.notifyChanged(goalId);

    const result = await this.runVerifier({
      commands: settings.verificationCommands,
      headSha,
      prUrl: report?.prUrl ?? null,
      repoRoot: repo.project.rootPath,
      verifierRunId: verifierRun.id,
    });
    const continuation = verificationContinuation({
      checks: result.evidence.checks,
      runsUsed: detail?.runsUsed ?? 0,
      budgetRuns: detail?.budgetRuns ?? 0,
    });
    const nextRun = await this.store.finishVerifierRun({
      goalId,
      runId: verifierRun.id,
      evidence: result.evidence,
      passed: result.passed,
      outcome: verificationOutcome(result),
      continuationInstruction: continuation.instruction,
      serverId: this.options.serverId,
      relayHostId: this.relayHostId,
      hostDisplayName: this.hostDisplayName,
    });
    this.notifyChanged(goalId);
    if (nextRun) this.launchExecuteRun(goalId, nextRun, repo);
  }

  private async resolvePullRequestHeadSha(prUrl: string, cwd: string): Promise<string | null> {
    try {
      const { stdout } = await execFile(
        "gh",
        ["pr", "view", prUrl, "--json", "headRefOid", "--jq", ".headRefOid"],
        {
          cwd,
        },
      );
      const headSha = stdout.trim();
      return /^[0-9a-f]{40}$/i.test(headSha) ? headSha : null;
    } catch (error) {
      this.logger.warn({ err: error, prUrl }, "Failed reading pull request head for verifier");
      return null;
    }
  }

  private async cancelRun(runId: string): Promise<void> {
    const entry = this.activeRuns.get(runId);
    if (!entry || entry.canceled) return;
    entry.canceled = true;
    if (entry.agentId) {
      await this.options.agentManager.cancelAgentRun(entry.agentId).catch((err) => {
        this.logger.warn({ err, runId, agentId: entry.agentId }, "Failed canceling goal agent");
      });
    }
  }

  private async runDueAutoPlans(): Promise<void> {
    const [resolvedRepos, snap] = await Promise.all([
      this.listResolvedRepos(),
      this.store.snapshot(),
    ]);
    const now = Date.now();
    for (const repo of resolvedRepos) {
      const settings = snap.repos[repo.repoKey];
      if (!settings?.planEnabled) continue;
      if (settings.lastPlannedAt !== null && now - settings.lastPlannedAt < AUTO_PLAN_INTERVAL_MS) {
        continue;
      }
      const suggestedCount = snap.allGoals.filter(
        (g) => g.repoKey === repo.repoKey && g.status === "suggested",
      ).length;
      if (suggestedCount >= MAX_OPEN_SUGGESTIONS_FOR_AUTO_PLAN) continue;
      const alreadyOpen = [...this.activeRuns.values()].some(
        (r) => r.kind === "plan" && r.repoKey === repo.repoKey && !r.canceled,
      );
      if (alreadyOpen) continue;
      await this.requestPlan({ repoKey: repo.repoKey, agent: settings.planAgent });
    }
  }
}
