import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import pino from "pino";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentManager } from "../agent/agent-manager.js";
import type {
  CreateAgentCommandInput,
  CreateAgentCommandResult,
} from "../agent/create-agent/create.js";
import { CLAWMUSE_GOAL_KIND_LABEL } from "../clawmuse-status/goal-runner.js";
import { saveClawMuseGoalsSettings } from "../clawmuse-status/goals-config.js";
import type { GoalVerifierPort } from "./verifier.js";
import type { PersistedProjectRecord, PersistedWorkspaceRecord } from "../workspace-registry.js";
import type { CreatePaseoWorktreeWorkflowResult } from "../worktree-session.js";
import { LocalGoalService } from "./service.js";

const logger = pino({ level: "silent" });
const testHomes: string[] = [];

afterEach(() => {
  for (const home of testHomes.splice(0)) {
    rmSync(home, { recursive: true, force: true });
  }
});

const PROJECTS: PersistedProjectRecord[] = [
  {
    projectId: "p-remote",
    rootPath: "/srv/remote-app",
    kind: "git",
    displayName: "remote-app",
    projectKey: "remote:github.com/acme/remote-app",
    customName: null,
    customIconRevision: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    archivedAt: null,
  },
  {
    projectId: "p-local",
    rootPath: "/Users/dev/local-notes",
    kind: "directory",
    displayName: "local-notes",
    projectKey: "path:/Users/dev/local-notes",
    customName: "Local Notes",
    customIconRevision: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    archivedAt: null,
  },
];

function createTestService(options: {
  maxConcurrentRuns?: number;
  onAgentRun?: (ctx: {
    service: LocalGoalService;
    agentId: string;
    input: CreateAgentCommandInput;
  }) => Promise<void>;
  createVerifierPort?: () => GoalVerifierPort;
}) {
  const paseoHome = mkdtempSync(nodePath.join(tmpdir(), "clawmuse-local-goals-"));
  testHomes.push(paseoHome);
  if (options.maxConcurrentRuns) {
    saveClawMuseGoalsSettings(paseoHome, { maxConcurrentRuns: options.maxConcurrentRuns });
  }

  const changes: Array<string | null> = [];
  const workspaces = new Map<string, PersistedWorkspaceRecord>();
  const runIdsDuringCreate: Array<string | null> = [];
  let serviceRef!: LocalGoalService;

  const createDirectoryWorkspace = vi.fn(
    async ({ cwd }: { cwd: string }): Promise<PersistedWorkspaceRecord> => {
      const workspaceId = `ws-dir-${workspaces.size + 1}`;
      const record: PersistedWorkspaceRecord = {
        workspaceId,
        projectId: "p-local",
        name: "Goal workspace",
        kind: "directory",
        cwd,
        gitBranch: null,
        baseRef: null,
        hasCommitsAheadOfBase: null,
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
        archivedAt: null,
      } as unknown as PersistedWorkspaceRecord;
      workspaces.set(workspaceId, record);
      return record;
    },
  );

  const createPaseoWorktreeWorkspace = vi.fn(
    async ({ cwd }: { cwd: string }): Promise<CreatePaseoWorktreeWorkflowResult> => {
      const workspaceId = `ws-wt-${workspaces.size + 1}`;
      const record = {
        workspaceId,
        projectId: "p-remote",
        name: "goal-branch",
        kind: "worktree",
        cwd: `${cwd}/.worktrees/${workspaceId}`,
        gitBranch: "goal-branch",
        baseRef: "main",
        hasCommitsAheadOfBase: false,
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:00:00.000Z",
        archivedAt: null,
      } as unknown as PersistedWorkspaceRecord;
      workspaces.set(workspaceId, record);
      return {
        workspace: record,
        gitStatus: {
          isGit: true,
          repoRoot: cwd,
          currentBranch: "goal-branch",
          defaultBranch: "main",
        },
        branchName: "goal-branch",
        baseBranch: "main",
        worktreePath: record.cwd,
        scripts: { setup: null, run: null, archive: null },
      } as unknown as CreatePaseoWorktreeWorkflowResult;
    },
  );

  const archiveWorkspace = vi.fn(async (workspaceId: string) => {
    const existing = workspaces.get(workspaceId);
    if (existing) {
      workspaces.set(workspaceId, { ...existing, archivedAt: new Date().toISOString() });
    }
  });

  const lastInputs = new Map<string, CreateAgentCommandInput>();

  const createAgent = vi.fn(
    async (input: CreateAgentCommandInput): Promise<CreateAgentCommandResult> => {
      const agentId = input.agentId ?? "generated-agent";
      runIdsDuringCreate.push(serviceRef.runIdForAgent(agentId));
      lastInputs.set(agentId, input);
      return {
        agentId,
        agent: {} as CreateAgentCommandResult["agent"],
        initialPromptError: null,
      } as unknown as CreateAgentCommandResult;
    },
  );

  const agentManager = {
    runAgent: vi.fn(async (agentId: string) => {
      const input = lastInputs.get(agentId)!;
      await options.onAgentRun?.({ service: serviceRef, agentId, input });
      return { canceled: false, finalText: "completed" };
    }),
    waitForAgentEvent: vi.fn(async () => ({
      status: "idle" as const,
      permission: null,
      lastMessage: "completed",
    })),
    getAgent: vi.fn(() => ({ status: "idle", error: null })),
    cancelAgentRun: vi.fn(async () => {}),
  } as unknown as Pick<
    AgentManager,
    "runAgent" | "waitForAgentEvent" | "getAgent" | "cancelAgentRun"
  >;

  serviceRef = new LocalGoalService({
    paseoHome,
    serverId: "srv-local",
    hostDisplayName: "Local Mac",
    logger,
    agentManager,
    createAgent: createAgent as never,
    createDirectoryWorkspace,
    createPaseoWorktreeWorkspace,
    archiveWorkspace,
    listProjects: async () => PROJECTS,
    getWorkspace: async (id: string) => workspaces.get(id) ?? null,
    getGoalMcpServer: () => ({ type: "stdio", command: "node", args: [] }),
    listProviderModes: async () => [
      { id: "default", name: "Default" },
      { id: "acceptEdits", name: "Accept Edits" },
    ],
    listReadyProviders: async () => ["claude"],
    ...(options.createVerifierPort ? { createVerifierPort: options.createVerifierPort } : {}),
    onChanged: (goalId) => changes.push(goalId),
  });

  return {
    paseoHome,
    service: serviceRef,
    changes,
    runIdsDuringCreate,
    archiveWorkspace,
    createDirectoryWorkspace,
    createPaseoWorktreeWorkspace,
    createAgent,
    agentManager,
  };
}

describe("LocalGoalService", () => {
  it("discovers both remote git and local directory projects, proposes goals, executes, and approves", async () => {
    const h = createTestService({
      onAgentRun: async ({ service, agentId, input }) => {
        if (input.labels?.[CLAWMUSE_GOAL_KIND_LABEL] === "plan") {
          await service.propose({
            callerAgentId: agentId,
            proposals: [
              {
                title: "Add README quickstart",
                summary: "Document how to run local notes.",
                acceptance: "README includes quickstart commands.",
                priority: 1,
                budgetRuns: 2,
              },
            ],
          });
          return;
        }
        await service.report({
          callerAgentId: agentId,
          kind: "done",
          message: "Added quickstart section and verified markdown links.",
          prUrl: null,
          evidence: {
            revision: "commit:abc1234",
            checks: [{ name: "markdown-lint", result: "passed" }],
            artifacts: [],
          },
        });
      },
    });

    await h.service.start();
    const initial = await h.service.list({ filter: "all" });
    expect(initial.repos.map((r) => r.repoKey)).toEqual([
      "remote:github.com/acme/remote-app",
      "local:srv-local:p-local",
    ]);

    const planRes = await h.service.requestPlan({ repoKey: "local:srv-local:p-local" });
    expect(planRes.outcome).toBe("queued");

    await vi.waitFor(async () => {
      const listed = await h.service.list({ filter: "suggested" });
      expect(listed.goals).toHaveLength(1);
      expect(h.archiveWorkspace).toHaveBeenCalledTimes(1);
    });
    expect(h.runIdsDuringCreate[0]).toBeTruthy();

    const suggested = (await h.service.list({ filter: "suggested" })).goals[0]!;
    expect(suggested.title).toBe("Add README quickstart");
    expect(suggested.serverId).toBe("srv-local");

    await h.service.act({ goalId: suggested.id, action: "accept" });

    await vi.waitFor(async () => {
      const reviewList = await h.service.list({ filter: "needs_review" });
      expect(reviewList.goals).toHaveLength(1);
    });

    const detail = await h.service.get(suggested.id);
    expect(detail.reviewReason).toBe("completed");
    expect(detail.runs[0]?.serverId).toBe("srv-local");
    expect(detail.latestReport?.evidence?.revision).toBe("commit:abc1234");

    const approved = await h.service.act({ goalId: suggested.id, action: "approve" });
    expect(approved.status).toBe("done");
    expect(h.changes.length).toBeGreaterThan(0);
    await h.service.stop();
  });

  it("deduplicates idempotent manual creates and unlocks approval after owner review submission", async () => {
    const h = createTestService({
      onAgentRun: async ({ service, agentId }) => {
        await service.report({
          callerAgentId: agentId,
          kind: "blocked",
          message: "Could not run integration suite without local env file.",
          prUrl: null,
        });
      },
    });

    await h.service.start();
    const created1 = await h.service.create({
      idempotencyKey: "req-1",
      repoKey: "remote:github.com/acme/remote-app",
      title: "Tighten API error handling",
      summary: "Return structured errors.",
      acceptance: "Unit tests pass.",
      budgetRuns: 2,
    });
    const created2 = await h.service.create({
      idempotencyKey: "req-1",
      repoKey: "remote:github.com/acme/remote-app",
      title: "Tighten API error handling",
      summary: "Return structured errors.",
      acceptance: "Unit tests pass.",
      budgetRuns: 2,
    });
    expect(created2.id).toBe(created1.id);

    await vi.waitFor(async () => {
      const detail = await h.service.get(created1.id);
      expect(detail.status).toBe("needs_review");
      expect(detail.reviewReason).toBe("blocked");
    });

    await expect(h.service.act({ goalId: created1.id, action: "approve" })).rejects.toThrow(
      /cannot_approve_uncompleted_goal/,
    );

    const blockedDetail = await h.service.get(created1.id);
    const updatedDetail = await h.service.submitReview({
      goalId: created1.id,
      runId: blockedDetail.currentRun!.id,
      message: "Ran integration suite locally after adding .env.",
      evidence: {
        revision: "commit:def5678",
        checks: [{ name: "integration", result: "passed" }],
        artifacts: [],
      },
    });
    expect(updatedDetail.reviewReason).toBe("completed");

    const doneGoal = await h.service.act({ goalId: created1.id, action: "approve" });
    expect(doneGoal.status).toBe("done");
    await h.service.stop();
  });

  it("deduplicates external sources and schedules only disjoint file scopes concurrently", async () => {
    const h = createTestService({ maxConcurrentRuns: 2 });
    await h.service.start();

    const first = await h.service.create({
      repoKey: "remote:github.com/acme/remote-app",
      title: "Guard the server goals module",
      summary: "Add scheduler safeguards.",
      source: { kind: "bianpai-idea", key: "idea-42", url: "https://bianpai.example/42" },
      paths: ["packages/server/src/server/goals"],
    });
    const duplicate = await h.service.create({
      repoKey: "remote:github.com/acme/remote-app",
      title: "A retried delivery must not create work",
      summary: "This must return the original card.",
      source: { kind: "bianpai-idea", key: "idea-42", url: "https://bianpai.example/42" },
      paths: ["packages/server/src/server/goals"],
    });
    const disjoint = await h.service.create({
      repoKey: "remote:github.com/acme/remote-app",
      title: "Touch app code separately",
      summary: "This may run concurrently with the server goal.",
      paths: ["packages/app/src"],
    });
    const overlap = await h.service.create({
      repoKey: "remote:github.com/acme/remote-app",
      title: "Touch a nested goals path",
      summary: "This waits for the active conflicting task.",
      paths: ["packages/server/src/server/goals/store.ts"],
    });

    expect(duplicate.id).toBe(first.id);
    expect((await h.service.get(first.id)).source).toMatchObject({
      kind: "bianpai-idea",
      key: "idea-42",
    });
    expect(disjoint.status).toBe("running");
    expect(overlap.status).toBe("accepted");
    await h.service.stop();
  });

  it("runs a verifier after a completed executor report and bounds automatic repair runs", async () => {
    let executions = 0;
    const h = createTestService({
      createVerifierPort: () => ({
        async checkout() {
          return { cwd: "/isolated/verifier", async dispose() {} };
        },
        async run() {
          return { exitCode: 1, output: "failing test" };
        },
      }),
      onAgentRun: async ({ service, agentId }) => {
        executions += 1;
        await service.report({
          callerAgentId: agentId,
          kind: "done",
          message: "Implemented the requested change.",
          prUrl: null,
          evidence: {
            revision: "a".repeat(40),
            checks: [{ name: "executor test", result: "passed" }],
            artifacts: [],
          },
        });
      },
    });
    saveClawMuseGoalsSettings(h.paseoHome, {
      verifierAgent: "codex/gpt-5",
      verificationCommands: [{ name: "unit test", command: "npm run test:unit" }],
    });

    await h.service.start();
    const created = await h.service.create({
      repoKey: "remote:github.com/acme/remote-app",
      title: "Verify a change",
      summary: "The verifier should reject the failing test.",
      budgetRuns: 2,
    });

    await vi.waitFor(async () => {
      const detail = await h.service.get(created.id);
      expect(detail.status).toBe("needs_review");
      expect(detail.reviewReason).toBe("failed");
      const runKinds: string[] = [];
      for (const run of detail.runs) runKinds.push(run.kind);
      expect(runKinds).toEqual(["execute", "verify", "execute", "verify"]);
      let verifierEvidenceCount = 0;
      for (const report of detail.reports) {
        if (report.evidence?.source === "verifier") verifierEvidenceCount += 1;
      }
      expect(verifierEvidenceCount).toBe(2);
    });
    expect(executions).toBe(2);
    await h.service.stop();
  });

  it("filters by parentGoalId, dedupes source-keyed creates, and validates relations", async () => {
    const h = createTestService({ onAgentRun: async () => {} });
    await h.service.start();
    const repoKey = "remote:github.com/acme/remote-app";

    const parent = await h.service.create({
      repoKey,
      title: "Parent goal",
      summary: "Decompose me.",
      start: false,
    });
    const child = await h.service.create({
      repoKey,
      title: "Child task",
      summary: "One slice.",
      parentGoalId: parent.id,
      start: false,
    });
    await h.service.create({ repoKey, title: "Unrelated", summary: "Other.", start: false });

    const children = await h.service.list({ parentGoalId: parent.id });
    expect(children.goals.map((goal) => goal.id)).toEqual([child.id]);

    const source = {
      kind: "github",
      key: "https://github.com/acme/remote-app/issues/7",
      url: "https://github.com/acme/remote-app/issues/7",
    };
    const first = await h.service.create({
      repoKey,
      title: "Imported issue",
      summary: "From GitHub.",
      source,
      start: false,
    });
    const duplicate = await h.service.create({
      repoKey,
      title: "Imported issue again",
      summary: "From GitHub.",
      source,
      start: false,
    });
    expect(duplicate.id).toBe(first.id);
    const otherRepo = await h.service.create({
      repoKey: "local:srv-local:p-local",
      title: "Same source elsewhere",
      summary: "Different repo.",
      source,
      start: false,
    });
    expect(otherRepo.id).not.toBe(first.id);

    await expect(
      h.service.create({ repoKey, title: "Bad dep", summary: "x", dependsOn: ["missing"] }),
    ).rejects.toThrow("前置任务不存在");
    await expect(
      h.service.create({ repoKey, title: "Bad parent", summary: "x", parentGoalId: "missing" }),
    ).rejects.toThrow("父目标不存在");
    await h.service.stop();
  });

  it("queues execute runs beyond maxConcurrentRuns and pumps when a slot frees", async () => {
    let releaseFirst!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let executeCount = 0;
    const h = createTestService({
      onAgentRun: async ({ service, agentId, input }) => {
        if (input.labels?.[CLAWMUSE_GOAL_KIND_LABEL] !== "execute") return;
        executeCount += 1;
        if (executeCount === 1) {
          await gate;
          return;
        }
        await service.report({
          callerAgentId: agentId,
          kind: "done",
          message: "Finished.",
          prUrl: null,
        });
      },
    });
    await h.service.start();
    const repoKey = "remote:github.com/acme/remote-app";

    const first = await h.service.create({ repoKey, title: "First", summary: "Run me." });
    await vi.waitFor(() => expect(h.createAgent).toHaveBeenCalledTimes(1));

    const second = await h.service.create({ repoKey, title: "Second", summary: "Queue me." });
    await vi.waitFor(async () => {
      const queuedDetail = await h.service.get(second.id);
      expect(queuedDetail.status).toBe("running");
      expect(queuedDetail.currentRun?.status).toBe("queued");
    });
    expect(h.createAgent).toHaveBeenCalledTimes(1);

    releaseFirst();
    await vi.waitFor(async () => {
      expect((await h.service.get(first.id)).status).toBe("needs_review");
      expect(h.createAgent).toHaveBeenCalledTimes(2);
      const secondDetail = await h.service.get(second.id);
      expect(secondDetail.currentRun?.status).toBe("succeeded");
      expect(secondDetail.status).toBe("needs_review");
    });
    await h.service.stop();
  });

  it("requires confirmExecutionStopped to continue a goal with an active run", async () => {
    let releaseFirst!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let executeCount = 0;
    const h = createTestService({
      onAgentRun: async ({ service, agentId, input }) => {
        if (input.labels?.[CLAWMUSE_GOAL_KIND_LABEL] !== "execute") return;
        executeCount += 1;
        if (executeCount === 1) {
          await gate;
          return;
        }
        await service.report({
          callerAgentId: agentId,
          kind: "done",
          message: "Finished.",
          prUrl: null,
        });
      },
    });
    await h.service.start();

    const goal = await h.service.create({
      repoKey: "remote:github.com/acme/remote-app",
      title: "Long running",
      summary: "Keep working.",
    });
    await vi.waitFor(() => expect(h.createAgent).toHaveBeenCalledTimes(1));

    await expect(h.service.act({ goalId: goal.id, action: "continue" })).rejects.toThrow(
      /confirm-execution-stopped/,
    );
    expect(h.agentManager.cancelAgentRun).not.toHaveBeenCalled();

    await h.service.act({
      goalId: goal.id,
      action: "continue",
      confirmExecutionStopped: true,
      instruction: "Try a different approach.",
    });
    releaseFirst();
    await vi.waitFor(async () => {
      const detail = await h.service.get(goal.id);
      expect(detail.runs).toHaveLength(2);
      expect(detail.runs[0]?.status).toBe("canceled");
      expect(detail.runs[1]?.status).toBe("succeeded");
      expect(detail.status).toBe("needs_review");
    });
    expect(h.agentManager.cancelAgentRun).toHaveBeenCalled();
    await h.service.stop();
  });

  it("unlocks dependents only on approval and never on discard", async () => {
    const h = createTestService({
      onAgentRun: async ({ service, agentId, input }) => {
        if (input.labels?.[CLAWMUSE_GOAL_KIND_LABEL] !== "execute") return;
        await service.report({
          callerAgentId: agentId,
          kind: "done",
          message: "Finished.",
          prUrl: null,
        });
      },
    });
    await h.service.start();
    const repoKey = "remote:github.com/acme/remote-app";

    const prerequisite = await h.service.create({
      repoKey,
      title: "Prerequisite",
      summary: "Must be accepted.",
      start: false,
    });
    const dependent = await h.service.create({
      repoKey,
      title: "Dependent",
      summary: "Waits.",
      dependsOn: [prerequisite.id],
    });
    expect(dependent.status).toBe("waiting_on_dependencies");

    await h.service.act({ goalId: prerequisite.id, action: "continue" });
    await vi.waitFor(async () => {
      expect((await h.service.get(prerequisite.id)).status).toBe("needs_review");
    });
    expect((await h.service.get(dependent.id)).status).toBe("waiting_on_dependencies");

    await h.service.act({ goalId: prerequisite.id, action: "approve" });
    await vi.waitFor(async () => {
      const detail = await h.service.get(dependent.id);
      expect(detail.status).toBe("needs_review");
      expect(detail.runsUsed).toBe(1);
    });

    const discarded = await h.service.create({
      repoKey,
      title: "Dropped prerequisite",
      summary: "Will be discarded.",
      start: false,
    });
    const stillBlocked = await h.service.create({
      repoKey,
      title: "Still blocked",
      summary: "Stays waiting.",
      dependsOn: [discarded.id],
      start: true,
    });
    await h.service.act({ goalId: discarded.id, action: "discard" });
    expect((await h.service.get(stillBlocked.id)).status).toBe("waiting_on_dependencies");
    await h.service.stop();
  });
});
