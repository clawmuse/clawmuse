import { randomUUID } from "node:crypto";
import type pino from "pino";

import type { AgentManager } from "../agent/agent-manager.js";
import type { AgentMode, McpServerConfig } from "../agent/agent-sdk-types.js";
import type { BoundCreateAgentCommand } from "../agent/create-agent/create.js";
import type { PersistedProjectRecord, PersistedWorkspaceRecord } from "../workspace-registry.js";
import type { CreatePaseoWorktreeWorkflowResult } from "../worktree-session.js";
import type { FirstAgentContext } from "@getpaseo/protocol/messages";
import type {
  ClawMuseGoalHeartbeatState,
  ClawMuseGoalProposal,
  ClawMuseGoalReportKind,
  ClawMuseGoalRun,
  ClawMuseStatusClient,
} from "./client.js";
import { ClawMuseStatusRequestError } from "./client.js";
import { readGoalWorkspace, saveGoalWorkspace } from "./goal-workspaces.js";
import { goalRunProviderOptions, resolveGoalRunModeId } from "./goal-modes.js";
import {
  buildClawMuseGoalExecutePrompt,
  buildClawMuseGoalPlanPrompt,
  CLAWMUSE_GOAL_REPORT_TOOL,
  CLAWMUSE_GOAL_PROPOSE_TOOL,
} from "./goal-prompts.js";
import {
  formatClawMuseGoalsProviderTarget,
  parseClawMuseGoalsProviderTarget,
  readClawMuseGoalsSettings,
  type ClawMuseGoalsProviderTarget,
  type ClawMuseGoalsSettings,
} from "./goals-config.js";
import { findGoalRepoRoot, listGoalRepos, type ClawMuseGoalRepo } from "./repo-inventory.js";

/** Agent labels that tie a daemon agent back to its goal run. */
export const CLAWMUSE_GOAL_RUN_LABEL = "clawmuse.goal-run";
export const CLAWMUSE_GOAL_KIND_LABEL = "clawmuse.goal-kind";

const OUTCOME_MAX_LENGTH = 4000;

type GoalRunnerAgentManager = Pick<
  AgentManager,
  "runAgent" | "waitForAgentEvent" | "getAgent" | "cancelAgentRun"
>;

interface GoalWorkspaceCreateInput {
  cwd: string;
  firstAgentContext: FirstAgentContext;
}

export interface ClawMuseGoalRunnerOptions {
  listSchedules?: () => Promise<import("@getpaseo/protocol/schedule/types").StoredSchedule[]>;
  paseoHome: string;
  logger: pino.Logger;
  agentManager: GoalRunnerAgentManager;
  createAgent: BoundCreateAgentCommand;
  createDirectoryWorkspace: (input: GoalWorkspaceCreateInput) => Promise<PersistedWorkspaceRecord>;
  createPaseoWorktreeWorkspace: (
    input: GoalWorkspaceCreateInput,
  ) => Promise<CreatePaseoWorktreeWorkflowResult>;
  archiveWorkspace: (workspaceId: string) => Promise<void>;
  listProjects: () => Promise<PersistedProjectRecord[]>;
  getWorkspace: (workspaceId: string) => Promise<PersistedWorkspaceRecord | null>;
  getGoalMcpServer: (agentId: string) => McpServerConfig;
  /** The provider's modes for a cwd; only permission-preserving modes are eligible. */
  listProviderModes: (provider: string, cwd: string) => Promise<AgentMode[]>;
  readSettings?: () => ClawMuseGoalsSettings;
}

/** How the runner reaches the service: through the publisher's single host session. */
export interface ClawMuseGoalTransport {
  client: ClawMuseStatusClient;
  request<T>(operation: (accessToken: string, signal: AbortSignal) => Promise<T>): Promise<T>;
}

export interface ClawMuseGoalRunnerState {
  enabled: boolean;
  bound: boolean;
  activeRuns: number;
  planner: string;
  executor: string;
}

interface ActiveRun {
  run: ClawMuseGoalRun;
  /** Assigned before the agent is created, so tool catalogs built during launch see it. */
  agentId: string | null;
  workspaceId: string | null;
  canceled: boolean;
  /** A planning run that never called the propose tool produced nothing the owner can see. */
  proposed: boolean;
}

export class ClawMuseGoalReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClawMuseGoalReportError";
  }
}

function truncate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.length > OUTCOME_MAX_LENGTH
    ? `${trimmed.slice(0, OUTCOME_MAX_LENGTH - 1)}…`
    : trimmed;
}

/** A model chosen on the phone wins over this host's configured default for the run kind. */
function resolveRunTarget(
  run: ClawMuseGoalRun,
  settings: ClawMuseGoalsSettings,
): ClawMuseGoalsProviderTarget {
  if (run.agent) {
    return parseClawMuseGoalsProviderTarget(run.agent);
  }
  return run.kind === "plan" ? settings.planner : settings.executor;
}

interface RunOutcome {
  status: "succeeded" | "failed";
  outcome: string | null;
}

function resolveRunOutcome(input: {
  canceled: boolean;
  permission: boolean;
  status: string;
  lastMessage: string | null;
  finalText: string;
  planWithoutProposals: boolean;
}): RunOutcome {
  if (input.canceled) {
    return { status: "failed", outcome: "Canceled" };
  }
  if (input.permission) {
    return {
      status: "failed",
      outcome: "需要额外操作权限；请在主机会话审查权限，或补充可在现有权限内执行的指令。",
    };
  }
  if (input.status === "error") {
    return { status: "failed", outcome: truncate(input.lastMessage) ?? "The agent failed" };
  }
  if (input.planWithoutProposals) {
    return {
      status: "failed",
      outcome: truncate(
        `规划 Agent 结束时没有提交建议。${input.lastMessage ?? input.finalText ?? ""}`,
      ),
    };
  }
  return { status: "succeeded", outcome: truncate(input.lastMessage ?? input.finalText) };
}

/**
 * Leases goal runs from the status service and turns each into an unattended
 * agent on this host. One instance per daemon; the publisher binds it to the live
 * host session and drives it from the heartbeat, so it owns no timers of its own.
 */
export class ClawMuseGoalRunner {
  private readonly logger: pino.Logger;
  private readonly readSettings: () => ClawMuseGoalsSettings;
  private readonly active = new Map<string, ActiveRun>();
  private transport: ClawMuseGoalTransport | null = null;
  private pumping = false;
  private readonly recordedSchedules = new Set<string>();
  private recordingSchedules = false;
  private lastPublishedRepos: string | null = null;

  constructor(private readonly options: ClawMuseGoalRunnerOptions) {
    this.logger = options.logger.child({ module: "clawmuse-goals" });
    this.readSettings =
      options.readSettings ?? (() => readClawMuseGoalsSettings(options.paseoHome));
  }

  state(): ClawMuseGoalRunnerState {
    const settings = this.readSettings();
    return {
      enabled: settings.enabled,
      bound: this.transport !== null,
      activeRuns: this.active.size,
      planner: formatClawMuseGoalsProviderTarget(settings.planner),
      executor: formatClawMuseGoalsProviderTarget(settings.executor),
    };
  }

  /** The publisher opened a goal-aware host session. */
  bind(transport: ClawMuseGoalTransport): void {
    this.recordedSchedules.clear();
    this.transport = transport;
    this.lastPublishedRepos = null;
  }

  /** The session is gone. Running agents finish on their own; their reports retry through a new session. */
  unbind(): void {
    this.transport = null;
    this.lastPublishedRepos = null;
  }

  activeRunIds(): string[] {
    return [...this.active.keys()];
  }

  /**
   * The run an agent belongs to. Matched on the id the runner assigned before
   * creating the agent, not on its labels: the agent is not registered yet
   * when its tool catalog is built during launch.
   */
  runIdForAgent(agentId: string): string | null {
    for (const [runId, entry] of this.active) {
      if (entry.agentId === agentId) {
        return runId;
      }
    }
    return null;
  }

  async listRepos(): Promise<ClawMuseGoalRepo[]> {
    return listGoalRepos(await this.options.listProjects());
  }

  /** Publish the checkout inventory when it changed since the last publication on this session. */
  async publishReposIfChanged(): Promise<void> {
    const transport = this.transport;
    if (!transport) {
      return;
    }
    const repos = await this.listRepos();
    const signature = JSON.stringify(repos);
    if (signature === this.lastPublishedRepos) {
      return;
    }
    await transport.request((accessToken, signal) =>
      transport.client.publishRepos({ accessToken, repos, signal }),
    );
    this.lastPublishedRepos = signature;
    this.logger.info({ count: repos.length }, "Published goal repositories");
  }

  /** Called with every heartbeat response. */
  onHeartbeat(state: ClawMuseGoalHeartbeatState): void {
    void this.recordScheduledTasks().catch((error) =>
      this.logger.warn({ err: error }, "Scheduled tasks will retry on the next heartbeat"),
    );
    for (const runId of state.canceledRunIds) {
      void this.cancelRun(runId);
    }
    if (state.queuedCount > 0) {
      void this.pump();
    }
  }

  private async recordScheduledTasks(): Promise<void> {
    const transport = this.transport;
    if (
      this.recordingSchedules ||
      !this.readSettings().enabled ||
      !transport?.client.supportsTasks() ||
      !this.options.listSchedules
    )
      return;
    this.recordingSchedules = true;
    try {
      const schedules = await this.options.listSchedules();
      const projects = await this.options.listProjects();
      let attempts = 0;
      const retained = new Set(schedules.flatMap((schedule) => schedule.runs.map((run) => run.id)));
      for (const id of this.recordedSchedules)
        if (!retained.has(id)) this.recordedSchedules.delete(id);
      for (const schedule of schedules) {
        for (const run of schedule.runs.toReversed()) {
          if (attempts >= 10) return;
          if (run.status === "running" || !run.endedAt || this.recordedSchedules.has(run.id))
            continue;
          const workspace = run.workspaceId
            ? await this.options.getWorkspace(run.workspaceId)
            : null;
          const project = projects.find(
            (candidate) => candidate.projectId === workspace?.projectId,
          );
          if (!project?.projectKey?.startsWith("remote:")) continue;
          const repoKey = project.projectKey;
          const status = run.status;
          const finishedAt = run.endedAt;
          attempts += 1;
          const recorded = await transport
            .request((accessToken, signal) =>
              transport.client.recordScheduledTask({
                accessToken,
                signal,
                body: {
                  repoKey,
                  title: (schedule.name?.trim() || "定时开发任务").slice(0, 200),
                  summary: "定时任务执行记录，请打开原会话查看结果并核对验收证据。",
                  scheduleId: schedule.id,
                  runId: run.id,
                  agentRef: run.agentId,
                  status,
                  startedAt: run.startedAt,
                  finishedAt,
                },
              }),
            )
            .then(
              () => true,
              (error) => {
                this.logger.warn(
                  { err: error, scheduleId: schedule.id, runId: run.id },
                  "Scheduled result will retry on the next heartbeat",
                );
                return false;
              },
            );
          if (this.transport !== transport) return;
          if (recorded) this.recordedSchedules.add(run.id);
        }
      }
    } finally {
      this.recordingSchedules = false;
    }
  }

  /** Report from the agent's tool. The run is found through the agent's label, never from tool input. */
  async report(input: {
    evidence?: import("./goal-evidence.js").GoalEvidence;
    callerAgentId: string;
    kind: ClawMuseGoalReportKind;
    message: string;
    prUrl: string | null;
  }): Promise<void> {
    const runId = this.runIdForAgent(input.callerAgentId);
    const transport = this.transport;
    if (!runId) {
      throw new ClawMuseGoalReportError("This agent is not running a ClawMuse goal");
    }
    if (!transport) {
      throw new ClawMuseGoalReportError("The ClawMuse Status session is not connected");
    }
    await transport.request((accessToken, signal) =>
      transport.client.reportGoalRun({
        accessToken,
        runId,
        kind: input.kind,
        message: input.message,
        prUrl: input.prUrl,
        ...(input.evidence ? { evidence: input.evidence } : {}),
        signal,
      }),
    );
  }

  async propose(input: {
    callerAgentId: string;
    proposals: ClawMuseGoalProposal[];
  }): Promise<{ created: number; skipped: number }> {
    const runId = this.runIdForAgent(input.callerAgentId);
    const transport = this.transport;
    if (!runId) {
      throw new ClawMuseGoalReportError("This agent is not running a ClawMuse goal");
    }
    if (this.active.get(runId)?.run.kind !== "plan") {
      throw new ClawMuseGoalReportError("Only a planning run can propose goals");
    }
    if (!transport) {
      throw new ClawMuseGoalReportError("The ClawMuse Status session is not connected");
    }
    const result = await transport.request((accessToken, signal) =>
      transport.client.proposeGoals({ accessToken, runId, proposals: input.proposals, signal }),
    );
    const entry = this.active.get(runId);
    if (entry) {
      entry.proposed = true;
    }
    return result;
  }

  /** Stop leasing and interrupt what is running. Used on daemon shutdown. */
  async stop(): Promise<void> {
    const runIds = this.activeRunIds();
    await Promise.allSettled(runIds.map((runId) => this.cancelRun(runId)));
    this.unbind();
  }

  private async pump(): Promise<void> {
    if (this.pumping) {
      return;
    }
    this.pumping = true;
    try {
      for (;;) {
        const transport = this.transport;
        const settings = this.readSettings();
        if (!transport || !settings.enabled || this.active.size >= settings.maxConcurrentRuns) {
          return;
        }
        const leased = await transport.request((accessToken, signal) =>
          transport.client.leaseGoalRun({ accessToken, activeRunIds: this.activeRunIds(), signal }),
        );
        if (!leased) {
          return;
        }
        this.active.set(leased.runId, {
          run: leased,
          agentId: null,
          workspaceId: null,
          canceled: false,
          proposed: false,
        });
        void this.execute(leased, settings).finally(() => {
          this.active.delete(leased.runId);
        });
      }
    } catch (error) {
      this.logger.warn({ err: error }, "Failed to lease a goal run");
    } finally {
      this.pumping = false;
    }
  }

  private async observeAttachedAgent(run: ClawMuseGoalRun, agentId: string): Promise<void> {
    const agent = this.options.agentManager.getAgent(agentId);
    if (!agent?.workspaceId) throw new ClawMuseGoalReportError("关联会话不存在，请在原主机检查。");
    const workspace = await this.options.getWorkspace(agent.workspaceId);
    const projects = await this.options.listProjects();
    const project = projects.find((candidate) => candidate.projectId === workspace?.projectId);
    if (!workspace || workspace.archivedAt || project?.projectKey !== run.repoKey) {
      throw new ClawMuseGoalReportError("关联会话不属于这个项目，或工作区已经归档。");
    }
    const entry = this.active.get(run.runId);
    if (!entry || entry.canceled) return;
    if ([...this.active.values()].some((other) => other !== entry && other.agentId === agentId)) {
      throw new ClawMuseGoalReportError("这个会话已由另一个任务跟踪，请查看原任务。");
    }
    entry.agentId = agentId;
    entry.workspaceId = workspace.workspaceId;
    await this.request((client, accessToken, signal) =>
      client.startGoalRun({
        accessToken,
        runId: run.runId,
        agentRef: agentId,
        signal,
      }),
    );
    // Attaching observes the existing turn. It never resubmits its prompt or
    // infers acceptance from idle, including when the process was restored.
    const result = await this.options.agentManager.waitForAgentEvent(agentId);
    await this.report({
      callerAgentId: agentId,
      kind: "needs_decision",
      message:
        "关联会话已到达检查点，请查看原会话并提交验收证据。" +
        (result.permission ? " 会话正在等待操作权限。" : ""),
      prUrl: null,
    });
    await this.finish(
      run.runId,
      result.status === "error" ? "failed" : "succeeded",
      "等待核对原会话结果",
    );
  }

  private async execute(run: ClawMuseGoalRun, settings: ClawMuseGoalsSettings): Promise<void> {
    const entry = this.active.get(run.runId);
    if (!entry) {
      return;
    }
    const log = this.logger.child({ runId: run.runId, kind: run.kind, repoKey: run.repoKey });
    let workspace: PersistedWorkspaceRecord | null = null;
    let execution: ReturnType<GoalRunnerAgentManager["runAgent"]> | null = null;
    try {
      const root = findGoalRepoRoot(await this.options.listProjects(), run.repoKey);
      if (!root) {
        await this.finish(
          run.runId,
          "failed",
          `Repository ${run.repoKey} is not checked out on this host`,
        );
        return;
      }
      if (run.attachedAgentRef) {
        await this.observeAttachedAgent(run, run.attachedAgentRef);
        return;
      }
      const prompt =
        run.kind === "plan"
          ? buildClawMuseGoalPlanPrompt(run)
          : buildClawMuseGoalExecutePrompt(run);
      workspace = await this.createRunWorkspace(run, settings, root, prompt);
      entry.workspaceId = workspace.workspaceId;
      if (entry.canceled) {
        await this.finish(run.runId, "failed", "Canceled before the agent started");
        return;
      }
      const agentId = randomUUID();
      entry.agentId = agentId;
      await this.spawnRunAgent(run, settings, workspace, agentId);
      await this.request((client, accessToken, signal) =>
        client.startGoalRun({ accessToken, runId: run.runId, agentRef: agentId, signal }),
      );
      log.info({ agentId }, "Goal run started");
      if (entry.canceled) {
        await this.options.agentManager.cancelAgentRun(agentId);
        return;
      }
      // runAgent can remain pending at a provider permission prompt. Observe it
      // concurrently so the owner receives a decision instead of a hung lease.
      execution = this.options.agentManager.runAgent(agentId, prompt);
      // Attach immediately; a rejection before the event arrives must be observed.
      void execution.catch(() => {});
      const waited = await this.options.agentManager.waitForAgentEvent(agentId, {
        waitForActive: true,
      });
      if (waited.permission !== null) {
        await this.report({
          callerAgentId: agentId,
          kind: "needs_decision",
          message: truncate(
            `执行需要额外权限，已暂停。操作：${waited.permission.title ?? waited.permission.name}。${waited.permission.description ?? "请在主机会话审查具体操作，或补充现有权限内的指令。"}`,
          )!,
          prUrl: null,
        });
        await this.options.agentManager.cancelAgentRun(agentId);
        await execution;
        await this.finish(run.runId, "succeeded", "等待用户审查操作权限");
        return;
      }
      const result = await execution;
      const outcome = resolveRunOutcome({
        canceled: entry.canceled || result.canceled === true,
        permission: waited.permission !== null,
        status: waited.status,
        lastMessage: waited.lastMessage,
        finalText: result.finalText,
        planWithoutProposals: run.kind === "plan" && !entry.proposed,
      });
      await this.finish(run.runId, outcome.status, outcome.outcome);
    } catch (error) {
      log.warn({ err: error }, "Goal run failed");
      if (execution && entry.agentId) {
        try {
          await this.options.agentManager.cancelAgentRun(entry.agentId);
        } catch (cancelError) {
          log.warn({ err: cancelError }, "Cannot confirm goal executor stopped");
        }
        // Keep it in activeRunIds until the provider turn settles, including
        // when cancellation is refused or reporting failed during a permission.
        await execution.catch(() => undefined);
      }
      await this.finish(
        run.runId,
        "failed",
        truncate(error instanceof Error ? error.message : String(error)),
      );
    } finally {
      // Planners leave nothing behind. Executor worktrees stay so the owner can
      // inspect them; auto-archive-on-merge reclaims them once the PR lands.
      if (workspace && run.kind === "plan") {
        try {
          await this.options.archiveWorkspace(workspace.workspaceId);
        } catch (error) {
          log.warn(
            { err: error, workspaceId: workspace.workspaceId },
            "Failed to archive plan workspace",
          );
        }
      }
    }
  }

  /**
   * Planners only read, so they work in the checkout; executors change files and
   * get a worktree unless the owner opted out.
   */
  private async createRunWorkspace(
    run: ClawMuseGoalRun,
    settings: ClawMuseGoalsSettings,
    root: string,
    prompt: string,
  ): Promise<PersistedWorkspaceRecord> {
    if (run.kind === "execute" && run.goal) {
      const workspaceId = await readGoalWorkspace(this.options.paseoHome, run.goal.id, run.repoKey);
      if (workspaceId) {
        const existing = await this.options.getWorkspace(workspaceId);
        if (!existing || existing.archivedAt)
          throw new Error("目标工作区已移除或归档，请复核已有成果后重建目标");
        return existing;
      }
    }
    const firstAgentContext = { prompt };
    if (run.kind === "execute" && settings.isolation === "worktree") {
      const { workspace } = await this.options.createPaseoWorktreeWorkspace({
        cwd: root,
        firstAgentContext,
      });
      if (run.goal)
        await saveGoalWorkspace(
          this.options.paseoHome,
          run.goal.id,
          run.repoKey,
          workspace.workspaceId,
        );
      return workspace;
    }
    const workspace = await this.options.createDirectoryWorkspace({ cwd: root, firstAgentContext });
    if (run.kind === "execute" && run.goal)
      await saveGoalWorkspace(
        this.options.paseoHome,
        run.goal.id,
        run.repoKey,
        workspace.workspaceId,
      );
    return workspace;
  }

  private async spawnRunAgent(
    run: ClawMuseGoalRun,
    settings: ClawMuseGoalsSettings,
    workspace: PersistedWorkspaceRecord,
    agentId: string,
  ): Promise<void> {
    const target = resolveRunTarget(run, settings);
    // Continuous execution does not authorize a provider-wide permission bypass.
    const modeId = resolveGoalRunModeId(
      await this.options.listProviderModes(target.provider, workspace.cwd),
    );
    const created = await this.options.createAgent({
      kind: "mcp",
      agentId,
      provider: formatClawMuseGoalsProviderTarget(target),
      config: {
        provider: target.provider,
        cwd: workspace.cwd,
        model: target.model ?? undefined,
        providerOptions: goalRunProviderOptions(modeId, run.kind),
        mcpServers: { clawmuse_goals: this.options.getGoalMcpServer(agentId) },
        toolPolicy: {
          preapproved: [
            {
              kind: "mcp",
              server: "clawmuse_goals",
              tool: run.kind === "plan" ? CLAWMUSE_GOAL_PROPOSE_TOOL : CLAWMUSE_GOAL_REPORT_TOOL,
            },
          ],
        },
      },
      cwd: workspace.cwd,
      workspaceId: workspace.workspaceId,
      title:
        run.kind === "plan"
          ? `规划目标：${run.repoDisplayName}`
          : `目标：${run.goal?.title ?? run.repoDisplayName}`,
      labels: {
        [CLAWMUSE_GOAL_RUN_LABEL]: run.runId,
        [CLAWMUSE_GOAL_KIND_LABEL]: run.kind,
        ...(run.goal ? { "clawmuse.goal-id": run.goal.id } : {}),
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

  private async finish(
    runId: string,
    status: "succeeded" | "failed",
    outcome: string | null,
  ): Promise<void> {
    try {
      await this.request((client, accessToken, signal) =>
        client.finishGoalRun({ accessToken, runId, status, outcome, signal }),
      );
      this.logger.info({ runId, status }, "Goal run finished");
    } catch (error) {
      // 409: the service already closed it (canceled, expired). Nothing to repair.
      if (error instanceof ClawMuseStatusRequestError && error.statusCode === 409) {
        return;
      }
      this.logger.warn({ err: error, runId, status }, "Failed to report goal run completion");
    }
  }

  private async cancelRun(runId: string): Promise<void> {
    const entry = this.active.get(runId);
    if (!entry || entry.canceled) {
      return;
    }
    entry.canceled = true;
    if (entry.agentId) {
      try {
        await this.options.agentManager.cancelAgentRun(entry.agentId);
      } catch (error) {
        this.logger.warn(
          { err: error, runId, agentId: entry.agentId },
          "Failed to cancel goal agent",
        );
      }
    }
  }

  private request<T>(
    operation: (
      client: ClawMuseStatusClient,
      accessToken: string,
      signal: AbortSignal,
    ) => Promise<T>,
  ): Promise<T> {
    const transport = this.transport;
    if (!transport) {
      return Promise.reject(
        new ClawMuseGoalReportError("The ClawMuse Status session is not connected"),
      );
    }
    return transport.request((accessToken, signal) =>
      operation(transport.client, accessToken, signal),
    );
  }
}
