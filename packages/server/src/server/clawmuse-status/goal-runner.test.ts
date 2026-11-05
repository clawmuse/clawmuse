import pino from "pino";
import type { StoredSchedule } from "@getpaseo/protocol/schedule/types";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentManager, ManagedAgent } from "../agent/agent-manager.js";
import type {
  CreateAgentCommandInput,
  CreateAgentCommandResult,
} from "../agent/create-agent/create.js";
import type { PersistedProjectRecord, PersistedWorkspaceRecord } from "../workspace-registry.js";
import type { CreatePaseoWorktreeWorkflowResult } from "../worktree-session.js";
import { ClawMuseStatusClient, type ClawMuseGoalRun, type ClawMuseStatusFetch } from "./client.js";
import {
  CLAWMUSE_GOAL_RUN_LABEL,
  ClawMuseGoalRunner,
  type ClawMuseGoalTransport,
} from "./goal-runner.js";
import type { ClawMuseGoalsSettings } from "./goals-config.js";

const logger = pino({ level: "silent" });
const testHomes: string[] = [];
afterEach(() => {
  for (const home of testHomes.splice(0)) rmSync(home, { recursive: true, force: true });
});
const REPO = "remote:github.com/acme/app";

const PROJECTS: PersistedProjectRecord[] = [
  {
    projectId: "p1",
    rootPath: "/srv/app",
    kind: "git",
    displayName: "app",
    projectKey: REPO,
    customName: null,
    customIconRevision: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    archivedAt: null,
  },
];

function executeRun(overrides: Partial<ClawMuseGoalRun> = {}): ClawMuseGoalRun {
  return {
    runId: "11111111-1111-4111-8111-111111111111",
    kind: "execute",
    repoKey: REPO,
    repoDisplayName: "acme/app",
    leaseExpiresAt: "2026-10-11T12:30:00.000Z",
    goal: {
      id: "22222222-2222-4222-8222-222222222222",
      title: "Fix the flaky schedule test",
      summary: "It fails twice a week.",
      acceptance: "CI green three runs in a row.",
      priority: 2,
      budgetRuns: 3,
      runsUsed: 0,
    },
    instruction: null,
    agent: null,
    priorReports: [],
    openGoalTitles: ["Fix the flaky schedule test"],
    ...overrides,
  };
}

interface Recorded {
  method: string;
  path: string;
  body: unknown;
}

interface Harness {
  runner: ClawMuseGoalRunner;
  requests: Recorded[];
  agents: Map<string, { labels: Record<string, string>; workspaceId?: string }>;
  createAgent: ReturnType<typeof vi.fn>;
  cancelAgentRun: ReturnType<typeof vi.fn>;
  archiveWorkspace: ReturnType<typeof vi.fn>;
  createDirectoryWorkspace: ReturnType<typeof vi.fn>;
  createPaseoWorktreeWorkspace: ReturnType<typeof vi.fn>;
  queue: ClawMuseGoalRun[];
  /** What runIdForAgent answered while each agent was still being created (tool catalog time). */
  runIdsAtLaunch: Array<string | null>;
}

/** The id the runner assigned to the n-th agent it created. */
function launchedAgentId(h: Harness, index = 0): string {
  const input = h.createAgent.mock.calls[index]?.[0] as { agentId?: string } | undefined;
  if (!input?.agentId) {
    throw new Error("the runner did not assign an agent id");
  }
  return input.agentId;
}

function harness(options: {
  settings?: Partial<ClawMuseGoalsSettings>;
  queue?: ClawMuseGoalRun[];
  runAgent?: (agentId: string) => Promise<{ canceled: boolean; finalText: string }>;
  lastMessage?: string | null;
  status?: "idle" | "error";
  permission?: boolean;
  reportFails?: boolean;
  onCancel?: () => void;
  schedules?: StoredSchedule[];
  scheduleFailure?: () => boolean;
}): Harness {
  const requests: Recorded[] = [];
  const queue = options.queue ?? [];
  const agents = new Map<string, { labels: Record<string, string>; workspaceId?: string }>();
  const fetchImplementation: ClawMuseStatusFetch = async (url, init) => {
    const path = new URL(url).pathname;
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ method: init.method ?? "GET", path, body });
    if (path === "/v1/host/tasks/scheduled" && options.scheduleFailure?.())
      return new Response("unavailable", { status: 503 });
    if (path === "/v1/host/goal-runs/lease") {
      return new Response(JSON.stringify({ run: queue.shift() ?? null }), { status: 200 });
    }
    if (path.endsWith("/reports") && options.reportFails)
      return new Response("unavailable", { status: 503 });
    if (path.endsWith("/finish")) {
      return new Response(JSON.stringify({ goalStatus: "needs_review", queuedRunId: null }), {
        status: 200,
      });
    }
    if (path.endsWith("/proposals")) {
      return new Response(JSON.stringify({ created: body.proposals.length, skipped: 0 }), {
        status: 201,
      });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  const client = new ClawMuseStatusClient("https://status.example", fetchImplementation);
  if (options.schedules) vi.spyOn(client, "supportsTasks").mockReturnValue(true);
  let nextAgent = 1;
  const runIdsAtLaunch: Array<string | null> = [];
  const runnerRef: { current: ClawMuseGoalRunner | null } = { current: null };
  const createAgent = vi.fn(
    async (input: CreateAgentCommandInput): Promise<CreateAgentCommandResult> => {
      if (input.kind !== "mcp") {
        throw new Error("expected mcp creation");
      }
      const id = input.agentId ?? `agent-${nextAgent++}`;
      // The real manager builds the agent's tool catalog here, before the agent
      // is registered: getAgent(id) is still null at this point.
      runIdsAtLaunch.push(runnerRef.current?.runIdForAgent(id) ?? null);
      agents.set(id, { labels: input.labels ?? {} });
      const snapshot = { id, labels: input.labels ?? {} } as unknown as ManagedAgent;
      return {
        snapshot,
        liveSnapshot: snapshot,
        background: true,
        initialPromptStarted: false,
        initialPromptError: null,
      };
    },
  );
  const cancelAgentRun = vi.fn(async () => {
    options.onCancel?.();
    return { status: "settled" as const };
  });
  const archiveWorkspace = vi.fn(async () => undefined);
  const workspace = (cwd: string): PersistedWorkspaceRecord =>
    ({
      workspaceId: `ws-${cwd}`,
      cwd,
      projectId: "p1",
      kind: "directory",
    }) as PersistedWorkspaceRecord;
  const createDirectoryWorkspace = vi.fn(async (input: { cwd: string }) => workspace(input.cwd));
  const createPaseoWorktreeWorkspace = vi.fn(
    async (input: { cwd: string }) =>
      ({
        workspace: workspace(`${input.cwd}-worktree`),
      }) as unknown as CreatePaseoWorktreeWorkflowResult,
  );
  const agentManager = {
    getAgent: (id: string) => (agents.get(id) as unknown as ManagedAgent | undefined) ?? null,
    runAgent:
      options.runAgent ??
      (async () => ({ canceled: false, finalText: "final", sessionId: "s", timeline: [] })),
    waitForAgentEvent: async () => ({
      status: options.status ?? "idle",
      permission: options.permission ? { id: "permission-1" } : null,
      lastMessage:
        options.lastMessage === undefined ? "All done, PR #7 open." : options.lastMessage,
    }),
    cancelAgentRun,
  } as unknown as Pick<
    AgentManager,
    "runAgent" | "waitForAgentEvent" | "getAgent" | "cancelAgentRun"
  >;
  const settings: ClawMuseGoalsSettings = {
    enabled: true,
    planner: { provider: "zai", model: "glm-4.6" },
    executor: { provider: "claude", model: null },
    isolation: "worktree",
    maxConcurrentRuns: 1,
    ...options.settings,
  };
  const paseoHome = mkdtempSync(nodePath.join(tmpdir(), "clawmuse-goal-runner-"));
  testHomes.push(paseoHome);
  const runner = new ClawMuseGoalRunner({
    paseoHome,
    logger,
    agentManager,
    createAgent,
    createDirectoryWorkspace,
    createPaseoWorktreeWorkspace,
    archiveWorkspace,
    listProjects: async () => PROJECTS,
    ...(options.schedules ? { listSchedules: async () => options.schedules! } : {}),
    getWorkspace: async (id) => workspace(id.replace("ws-", "")),
    getGoalMcpServer: () => ({ type: "http", url: "http://127.0.0.1:12345/mcp/agents" }),
    listProviderModes: async (provider) =>
      provider === "claude"
        ? [
            { id: "default", label: "Always Ask" },
            { id: "bypassPermissions", label: "Bypass" },
          ]
        : [{ id: "auto", label: "Default" }],
    readSettings: () => settings,
  });
  runnerRef.current = runner;
  const transport: ClawMuseGoalTransport = {
    client,
    request: (operation) => operation("host-access-token", new AbortController().signal),
  };
  runner.bind(transport);
  return {
    runner,
    requests,
    agents,
    createAgent,
    cancelAgentRun,
    archiveWorkspace,
    createDirectoryWorkspace,
    createPaseoWorktreeWorkspace,
    queue,
    runIdsAtLaunch,
  };
}

/** The pump is fire-and-forget, so wait for the leased run to be reported finished. */
async function settled(h: Harness): Promise<void> {
  await vi.waitFor(
    () => {
      expect(h.queue).toHaveLength(0);
      expect(h.requests.some((request) => request.path.endsWith("/finish"))).toBe(true);
      expect(h.runner.activeRunIds()).toEqual([]);
    },
    { timeout: 2_000 },
  );
}

describe("ClawMuseGoalRunner", () => {
  it("retries a retained schedule result after failure and suppresses repeat uploads", async () => {
    const date = "2026-11-02T00:00:00.000Z";
    const schedules: StoredSchedule[] = [
      {
        id: "schedule",
        name: "Nightly check",
        prompt: "Private prompt must stay local",
        cadence: { type: "every", everyMs: 3600000 },
        target: { type: "agent", agentId: "33333333-3333-4333-8333-333333333333" },
        status: "active",
        createdAt: date,
        updatedAt: date,
        nextRunAt: null,
        lastRunAt: date,
        pausedAt: null,
        expiresAt: null,
        maxRuns: null,
        runs: [
          {
            id: "scheduled-run",
            scheduledFor: date,
            startedAt: date,
            endedAt: date,
            status: "succeeded",
            agentId: "33333333-3333-4333-8333-333333333333",
            workspaceId: "ws-/srv/app",
            output: "Private output",
            error: null,
          },
        ],
      },
    ];
    let fail = true;
    const h = harness({ schedules, scheduleFailure: () => fail });
    const uploads = () =>
      h.requests.filter((request) => request.path === "/v1/host/tasks/scheduled");
    h.runner.onHeartbeat({ queuedCount: 0, canceledRunIds: [] });
    await vi.waitFor(() => expect(uploads()).toHaveLength(1));
    fail = false;
    h.runner.onHeartbeat({ queuedCount: 0, canceledRunIds: [] });
    await vi.waitFor(() => expect(uploads()).toHaveLength(2));
    h.runner.onHeartbeat({ queuedCount: 0, canceledRunIds: [] });
    await Promise.resolve();
    await Promise.resolve();
    expect(uploads()).toHaveLength(2);
    expect(uploads()[1]?.body).toMatchObject({
      repoKey: REPO,
      scheduleId: "schedule",
      runId: "scheduled-run",
      status: "succeeded",
    });
    expect(JSON.stringify(uploads())).not.toContain("Private");
    expect(h.createAgent).not.toHaveBeenCalled();
  });

  it("observes an attached session without creating a workspace or sending a prompt", async () => {
    const runAgent = vi.fn();
    const agentId = "33333333-3333-4333-8333-333333333333";
    const h = harness({ queue: [executeRun({ attachedAgentRef: agentId })], runAgent });
    h.agents.set(agentId, { labels: {}, workspaceId: "ws-/srv/app" });
    h.runner.onHeartbeat({ queuedCount: 1, canceledRunIds: [] });
    await settled(h);
    expect(h.createAgent).not.toHaveBeenCalled();
    expect(runAgent).not.toHaveBeenCalled();
    expect(h.createPaseoWorktreeWorkspace).not.toHaveBeenCalled();
    expect(h.requests.find((request) => request.path.endsWith("/start"))?.body).toEqual({
      agentRef: agentId,
    });
    expect(h.requests.find((request) => request.path.endsWith("/reports"))?.body).toMatchObject({
      kind: "needs_decision",
    });
  });

  it("fails an unavailable attachment without falling back to a new execution", async () => {
    const h = harness({
      queue: [executeRun({ attachedAgentRef: "33333333-3333-4333-8333-333333333333" })],
    });
    h.runner.onHeartbeat({ queuedCount: 1, canceledRunIds: [] });
    await settled(h);
    expect(h.createAgent).not.toHaveBeenCalled();
    expect(h.requests.find((request) => request.path.endsWith("/finish"))?.body).toMatchObject({
      status: "failed",
    });
  });

  it("does not lease while goals are disabled on this host", async () => {
    const h = harness({ settings: { enabled: false }, queue: [executeRun()] });
    h.runner.onHeartbeat({ queuedCount: 1, canceledRunIds: [] });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(h.requests).toEqual([]);
    expect(h.runner.state()).toMatchObject({ enabled: false, bound: true, activeRuns: 0 });
  });

  it("runs an execute lease in a worktree with the executor model and reports the outcome", async () => {
    const h = harness({ queue: [executeRun()] });
    h.runner.onHeartbeat({ queuedCount: 1, canceledRunIds: [] });
    await settled(h);

    expect(h.requests.map((request) => `${request.method} ${request.path}`)).toEqual([
      "POST /v1/host/goal-runs/lease",
      "POST /v1/host/goal-runs/11111111-1111-4111-8111-111111111111/start",
      "POST /v1/host/goal-runs/11111111-1111-4111-8111-111111111111/finish",
    ]);
    // Capacity was full while the run was live; the next heartbeat, not the finish, leases again.
    expect(h.requests[1]?.body).toEqual({ agentRef: launchedAgentId(h) });
    // The run is already known while the agent is being created, which is when
    // the real manager builds its tool catalog.
    expect(h.runIdsAtLaunch).toEqual(["11111111-1111-4111-8111-111111111111"]);
    expect(h.requests[2]?.body).toEqual({ status: "succeeded", outcome: "All done, PR #7 open." });
    expect(h.createPaseoWorktreeWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: "/srv/app" }),
    );
    expect(h.createAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "mcp",
        provider: "claude",
        cwd: "/srv/app-worktree",
        mode: "default",
        config: expect.objectContaining({
          toolPolicy: {
            preapproved: [{ kind: "mcp", server: "clawmuse_goals", tool: "clawmuse_goal_report" }],
          },
        }),
        unattended: false,
        labels: expect.objectContaining({
          [CLAWMUSE_GOAL_RUN_LABEL]: "11111111-1111-4111-8111-111111111111",
          "clawmuse.goal-kind": "execute",
        }),
      }),
    );
    // Executor worktrees stay for review; auto-archive-on-merge reclaims them later.
    expect(h.archiveWorkspace).not.toHaveBeenCalled();
  });

  it("runs a plan lease in the checkout with the planner model and archives the workspace", async () => {
    const h = harness({
      queue: [
        executeRun({ runId: "33333333-3333-4333-8333-333333333333", kind: "plan", goal: null }),
      ],
      lastMessage: null,
    });
    h.runner.onHeartbeat({ queuedCount: 1, canceledRunIds: [] });
    await settled(h);

    expect(h.createDirectoryWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: "/srv/app" }),
    );
    expect(h.createPaseoWorktreeWorkspace).not.toHaveBeenCalled();
    expect(h.createAgent).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "zai/glm-4.6", title: "规划目标：acme/app" }),
    );
    expect(h.createAgent.mock.calls[0]?.[0]).toHaveProperty("mode", "auto");
    expect(h.archiveWorkspace).toHaveBeenCalledWith("ws-/srv/app");
    // The planner never called the propose tool, so the owner would see nothing:
    // that is a failure with a reason, not a silent success.
    const finish = h.requests.find((request) => request.path.endsWith("/finish"));
    expect(finish?.body).toMatchObject({
      status: "failed",
      outcome: expect.stringContaining("没有提交建议"),
    });
  });

  it("succeeds a plan run once the planner has submitted its proposals", async () => {
    const holder: { runner: ClawMuseGoalRunner | null } = { runner: null };
    const h = harness({
      queue: [
        executeRun({ runId: "44444444-4444-4444-8444-444444444444", kind: "plan", goal: null }),
      ],
      lastMessage: "提交了 1 条建议",
      runAgent: async (agentId) => {
        // What the agent does through clawmuse_goal_propose mid-turn.
        const runner = holder.runner;
        if (!runner) {
          throw new Error("runner not ready");
        }
        await runner.propose({
          callerAgentId: agentId,
          proposals: [
            { title: "升级 ws", summary: "有漏洞", acceptance: "audit 通过", priority: 2 },
          ],
        });
        return { canceled: false, finalText: "" };
      },
    });
    holder.runner = h.runner;
    h.runner.onHeartbeat({ queuedCount: 1, canceledRunIds: [] });
    await settled(h);
    expect(h.requests.map((request) => request.path)).toContain(
      "/v1/host/goal-runs/44444444-4444-4444-8444-444444444444/proposals",
    );
    const finish = h.requests.find((request) => request.path.endsWith("/finish"));
    expect(finish?.body).toEqual({ status: "succeeded", outcome: "提交了 1 条建议" });
  });

  it("fails a lease for a repository this host no longer has, without creating an agent", async () => {
    const h = harness({ queue: [executeRun({ repoKey: "remote:github.com/acme/other" })] });
    h.runner.onHeartbeat({ queuedCount: 1, canceledRunIds: [] });
    await settled(h);

    expect(h.createAgent).not.toHaveBeenCalled();
    const finish = h.requests.find((request) => request.path.endsWith("/finish"));
    expect(finish?.body).toEqual({
      status: "failed",
      outcome: "Repository remote:github.com/acme/other is not checked out on this host",
    });
  });

  it("reports an agent error as a failed run", async () => {
    const h = harness({ queue: [executeRun()], status: "error", lastMessage: "provider crashed" });
    h.runner.onHeartbeat({ queuedCount: 1, canceledRunIds: [] });
    await settled(h);
    const finish = h.requests.find((request) => request.path.endsWith("/finish"));
    expect(finish?.body).toEqual({ status: "failed", outcome: "provider crashed" });
  });

  it("relays tool reports for the agent's own run and refuses proposals outside plan runs", async () => {
    let release: () => void = () => undefined;
    const h = harness({
      queue: [executeRun()],
      runAgent: () =>
        new Promise((resolve) => {
          release = () => resolve({ canceled: false, finalText: "" });
        }),
    });
    h.runner.onHeartbeat({ queuedCount: 1, canceledRunIds: [] });
    await vi.waitFor(() => expect(h.agents.size).toBe(1));

    const agentId = launchedAgentId(h);
    expect(h.runner.runIdForAgent(agentId)).toBe("11111111-1111-4111-8111-111111111111");
    expect(h.runner.runIdForAgent("agent-9")).toBeNull();
    await h.runner.report({
      callerAgentId: agentId,
      kind: "progress",
      message: "Found the race.",
      prUrl: "https://github.com/acme/app/pull/7",
    });
    expect(h.requests.at(-1)).toEqual({
      method: "POST",
      path: "/v1/host/goal-runs/11111111-1111-4111-8111-111111111111/reports",
      body: {
        kind: "progress",
        message: "Found the race.",
        prUrl: "https://github.com/acme/app/pull/7",
      },
    });
    await expect(h.runner.propose({ callerAgentId: agentId, proposals: [] })).rejects.toThrow(
      /Only a planning run can propose goals/,
    );
    await expect(
      h.runner.report({ callerAgentId: "agent-9", kind: "done", message: "x", prUrl: null }),
    ).rejects.toThrow(/not running a ClawMuse goal/);

    release();
    await settled(h);
  });

  it("cancels the agent when the service withdraws a run", async () => {
    let release: () => void = () => undefined;
    const h = harness({
      queue: [executeRun()],
      runAgent: () =>
        new Promise((resolve) => {
          release = () => resolve({ canceled: true, finalText: "" });
        }),
    });
    h.runner.onHeartbeat({ queuedCount: 1, canceledRunIds: [] });
    await vi.waitFor(() => expect(h.agents.size).toBe(1));

    h.runner.onHeartbeat({
      queuedCount: 0,
      canceledRunIds: ["11111111-1111-4111-8111-111111111111"],
    });
    await vi.waitFor(() => expect(h.cancelAgentRun).toHaveBeenCalledWith(launchedAgentId(h)));
    release();
    await settled(h);
    const finish = h.requests.find((request) => request.path.endsWith("/finish"));
    expect(finish?.body).toEqual({ status: "failed", outcome: "Canceled" });
  });

  it("runs with the model chosen on the phone instead of the host default", async () => {
    const h = harness({ queue: [executeRun({ agent: "claude/claude-opus-5-5" })] });
    h.runner.onHeartbeat({ queuedCount: 1, canceledRunIds: [] });
    await settled(h);
    expect(h.createAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "claude/claude-opus-5-5",
        config: expect.objectContaining({ provider: "claude", model: "claude-opus-5-5" }),
        mode: "default",
      }),
    );
  });

  it("fails the run cleanly when the chosen model is malformed", async () => {
    const h = harness({ queue: [executeRun({ agent: "claude/" })] });
    h.runner.onHeartbeat({ queuedCount: 1, canceledRunIds: [] });
    await settled(h);
    expect(h.createAgent).not.toHaveBeenCalled();
    const finish = h.requests.find((request) => request.path.endsWith("/finish"));
    expect(finish?.body).toMatchObject({ status: "failed" });
  });

  it("publishes the repository inventory once per change", async () => {
    const h = harness({});
    await h.runner.publishReposIfChanged();
    await h.runner.publishReposIfChanged();
    expect(h.requests).toEqual([
      {
        method: "PUT",
        path: "/v1/host/repos",
        body: { repos: [{ repoKey: REPO, displayName: "acme/app" }] },
      },
    ]);
    h.runner.unbind();
    await h.runner.publishReposIfChanged();
    expect(h.requests).toHaveLength(1);
  });
  it("reuses the same goal workspace across rounds instead of losing uncommitted progress", async () => {
    const h = harness({ queue: [executeRun()] });
    h.runner.onHeartbeat({ queuedCount: 1, canceledRunIds: [] });
    await settled(h);
    h.queue.push(executeRun({ runId: "33333333-3333-4333-8333-333333333333" }));
    h.runner.onHeartbeat({ queuedCount: 1, canceledRunIds: [] });
    await vi.waitFor(() => expect(h.createAgent).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(h.runner.activeRunIds()).toEqual([]));
    expect(h.createPaseoWorktreeWorkspace).toHaveBeenCalledTimes(1);
    expect(h.createAgent.mock.calls.map((call) => call[0].workspaceId)).toEqual([
      "ws-/srv/app-worktree",
      "ws-/srv/app-worktree",
    ]);
  });

  it("turns a pending permission into a decision and cancels before finishing the lease", async () => {
    let release!: (result: { canceled: boolean; finalText: string }) => void;
    const execution = new Promise<{ canceled: boolean; finalText: string }>((resolve) => {
      release = resolve;
    });
    const h = harness({
      queue: [executeRun()],
      permission: true,
      runAgent: () => execution,
      onCancel: () => release({ canceled: true, finalText: "" }),
    });
    h.runner.onHeartbeat({ queuedCount: 1, canceledRunIds: [] });
    await settled(h);
    expect(h.cancelAgentRun).toHaveBeenCalledTimes(1);
    const report = h.requests.find((request) => request.path.endsWith("/reports"));
    expect(report?.body).toMatchObject({ kind: "needs_decision" });
    expect(h.requests.find((request) => request.path.endsWith("/finish"))?.body).toMatchObject({
      status: "succeeded",
    });
  });
  it("stops the provider before releasing a run whose decision report cannot be sent", async () => {
    let release!: (result: { canceled: boolean; finalText: string }) => void;
    const execution = new Promise<{ canceled: boolean; finalText: string }>((resolve) => {
      release = resolve;
    });
    const h = harness({
      queue: [executeRun()],
      permission: true,
      reportFails: true,
      runAgent: () => execution,
      onCancel: () => release({ canceled: true, finalText: "" }),
    });
    h.runner.onHeartbeat({ queuedCount: 1, canceledRunIds: [] });
    await settled(h);
    expect(h.cancelAgentRun).toHaveBeenCalledTimes(1);
    expect(h.requests.find((request) => request.path.endsWith("/finish"))?.body).toMatchObject({
      status: "failed",
    });
  });
});
