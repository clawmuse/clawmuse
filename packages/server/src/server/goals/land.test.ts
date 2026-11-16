import { execFileSync } from "node:child_process";
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
import type { PersistedProjectRecord, PersistedWorkspaceRecord } from "../workspace-registry.js";
import type { CreatePaseoWorktreeWorkflowResult } from "../worktree-session.js";
import { runGitCommand } from "../../utils/run-git-command.js";
import { GoalLandError, type LandCommandRequest, type LandCommandRunner } from "./land.js";
import { LocalGoalService } from "./service.js";

const logger = pino({ level: "silent" });
const testDirs: string[] = [];

const HEAD_SHA = "a".repeat(40);
const MERGE_SHA = "b".repeat(40);
const OTHER_SHA = "c".repeat(40);
const PR_URL = "https://github.com/acme/remote-app/pull/42";

afterEach(() => {
  for (const dir of testDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function mkdtemp(prefix: string): string {
  const dir = mkdtempSync(nodePath.join(tmpdir(), prefix));
  testDirs.push(dir);
  return dir;
}

function gitProject(rootPath: string): PersistedProjectRecord {
  return {
    projectId: "p-remote",
    rootPath,
    kind: "git",
    displayName: "remote-app",
    projectKey: "remote:github.com/acme/remote-app",
    customName: null,
    customIconRevision: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    archivedAt: null,
  };
}

interface FakeGhState {
  merged: boolean;
  headSha: string;
  state: string;
  mergeCommitSha: string | null;
  failMerge: boolean;
}

function createRunner(state: FakeGhState, git?: LandCommandRunner) {
  const requests: LandCommandRequest[] = [];
  const run: LandCommandRunner = async (request) => {
    requests.push(request);
    if (request.command === "git" && git) {
      return git(request);
    }
    if (request.command === "gh" && request.args[0] === "pr" && request.args[1] === "view") {
      return {
        stdout: JSON.stringify({
          state: state.merged ? "MERGED" : state.state,
          headRefOid: state.headSha,
          baseRefName: "main",
          mergeCommit: state.merged && state.mergeCommitSha ? { oid: state.mergeCommitSha } : null,
        }),
        stderr: "",
      };
    }
    if (request.command === "gh" && request.args[0] === "pr" && request.args[1] === "merge") {
      if (state.failMerge) {
        throw Object.assign(new Error("gh pr merge failed"), {
          stderr: "Merge conflict in src/app.ts",
        });
      }
      if (!request.args.includes("--match-head-commit") || !request.args.includes(state.headSha)) {
        throw new Error(`--match-head-commit expected ${state.headSha}`);
      }
      state.merged = true;
      return { stdout: "", stderr: "" };
    }
    if (request.command === "git") {
      return { stdout: "", stderr: "" };
    }
    throw new Error(`unexpected command: ${request.command} ${request.args.join(" ")}`);
  };
  return { run, requests };
}

function createLandService(options: {
  projects: PersistedProjectRecord[];
  runLandCommand: LandCommandRunner;
  onAgentRun?: (ctx: { service: LocalGoalService; agentId: string }) => Promise<void>;
}) {
  const paseoHome = mkdtemp("clawmuse-land-home-");
  const workspaces = new Map<string, PersistedWorkspaceRecord>();

  const createDirectoryWorkspace = vi.fn(
    async ({ cwd }: { cwd: string }): Promise<PersistedWorkspaceRecord> => {
      const record = {
        workspaceId: `ws-dir-${workspaces.size + 1}`,
        projectId: "p-remote",
        name: "Goal workspace",
        kind: "directory",
        cwd,
        archivedAt: null,
      } as unknown as PersistedWorkspaceRecord;
      workspaces.set(record.workspaceId, record);
      return record;
    },
  );

  const createPaseoWorktreeWorkspace = vi.fn(
    async ({ cwd }: { cwd: string }): Promise<CreatePaseoWorktreeWorkflowResult> => {
      const record = {
        workspaceId: `ws-wt-${workspaces.size + 1}`,
        projectId: "p-remote",
        name: "goal-branch",
        kind: "worktree",
        cwd: `${cwd}/.worktrees/ws-wt-${workspaces.size + 1}`,
        archivedAt: null,
      } as unknown as PersistedWorkspaceRecord;
      workspaces.set(record.workspaceId, record);
      return {
        workspace: record,
        gitStatus: { isGit: true, repoRoot: cwd, currentBranch: "goal-branch" },
        branchName: "goal-branch",
        baseBranch: "main",
        worktreePath: record.cwd,
      } as unknown as CreatePaseoWorktreeWorkflowResult;
    },
  );

  const archiveWorkspace = vi.fn(async (workspaceId: string) => {
    const existing = workspaces.get(workspaceId);
    if (existing) {
      workspaces.set(workspaceId, { ...existing, archivedAt: new Date().toISOString() });
    }
  });

  let serviceRef!: LocalGoalService;
  const createAgent = vi.fn(
    async (input: CreateAgentCommandInput): Promise<CreateAgentCommandResult> => {
      return {
        agentId: input.agentId ?? "generated-agent",
        agent: {} as CreateAgentCommandResult["agent"],
        initialPromptError: null,
        input,
      } as unknown as CreateAgentCommandResult;
    },
  );

  const agentManager = {
    runAgent: vi.fn(async (agentId: string) => {
      await options.onAgentRun?.({ service: serviceRef, agentId });
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
    listProjects: async () => options.projects,
    getWorkspace: async (id: string) => workspaces.get(id) ?? null,
    getGoalMcpServer: () => ({ type: "stdio", command: "node", args: [] }),
    listProviderModes: async () => [{ id: "default", name: "Default" }],
    listReadyProviders: async () => ["claude"],
    landCommandRunner: options.runLandCommand,
    onChanged: () => {},
  });

  return { service: serviceRef, archiveWorkspace, workspaces };
}

const DONE_REPORT = {
  kind: "done" as const,
  message: "Built and verified.",
  prUrl: PR_URL,
  evidence: {
    revision: `commit:${HEAD_SHA}`,
    checks: [{ name: "vitest", result: "passed" as const }],
    artifacts: [],
  },
};

async function reachNeedsReview(
  service: LocalGoalService,
  goalId: string,
  expectedPrUrl: string | null = PR_URL,
): Promise<void> {
  await vi.waitFor(async () => {
    const detail = await service.get(goalId);
    expect(detail.status).toBe("needs_review");
    expect(detail.reviewReason).toBe("completed");
  });
  const detail = await service.get(goalId);
  expect(detail.latestReport?.prUrl).toBe(expectedPrUrl);
}

describe("goal land", () => {
  it("merges the verified PR, records the merge commit, archives the worktree, and unblocks dependents", async () => {
    const ghState: FakeGhState = {
      merged: false,
      headSha: HEAD_SHA,
      state: "OPEN",
      mergeCommitSha: MERGE_SHA,
      failMerge: false,
    };
    const { run, requests } = createRunner(ghState);
    const h = createLandService({
      projects: [gitProject("/srv/remote-app")],
      runLandCommand: run,
      onAgentRun: async ({ service, agentId }) => {
        await service.report({ callerAgentId: agentId, ...DONE_REPORT });
      },
    });
    await h.service.start();

    const parent = await h.service.create({
      repoKey: "remote:github.com/acme/remote-app",
      title: "Base task",
      summary: "Implement the owner-triggered merge.",
      acceptance: "Merge works.",
    });
    await reachNeedsReview(h.service, parent.id);

    const dependent = await h.service.create({
      repoKey: "remote:github.com/acme/remote-app",
      title: "Follow-up task",
      summary: "Depends on the base task.",
      acceptance: "Runs after the base lands.",
      dependsOn: [parent.id],
    });
    expect(dependent.status).toBe("waiting_on_dependencies");

    const landed = await h.service.act({ goalId: parent.id, action: "land" });
    expect(landed.status).toBe("done");
    expect(landed.mergeCommitSha).toBe(MERGE_SHA);
    expect(ghState.merged).toBe(true);

    const mergeRequest = requests.find(
      (r) => r.command === "gh" && r.args[0] === "pr" && r.args[1] === "merge",
    );
    expect(mergeRequest?.args).toContain("--match-head-commit");
    expect(mergeRequest?.args).toContain(HEAD_SHA);
    expect(mergeRequest?.args).toContain("--merge");
    expect(mergeRequest?.cwd).toBe("/srv/remote-app");

    const savedWorktree = [...h.workspaces.values()].find((ws) => ws.kind === "worktree");
    expect(savedWorktree).toBeTruthy();
    expect(h.archiveWorkspace).toHaveBeenCalledWith(savedWorktree!.workspaceId);

    await vi.waitFor(async () => {
      const next = await h.service.get(dependent.id);
      expect(["running", "needs_review"]).toContain(next.status);
    });
    await h.service.stop();
  });

  it("rejects when the PR head moved past the verified SHA and keeps worktree and status", async () => {
    const ghState: FakeGhState = {
      merged: false,
      headSha: OTHER_SHA,
      state: "OPEN",
      mergeCommitSha: MERGE_SHA,
      failMerge: false,
    };
    const { run } = createRunner(ghState);
    const h = createLandService({
      projects: [gitProject("/srv/remote-app")],
      runLandCommand: run,
      onAgentRun: async ({ service, agentId }) => {
        await service.report({ callerAgentId: agentId, ...DONE_REPORT });
      },
    });
    await h.service.start();
    const goal = await h.service.create({
      repoKey: "remote:github.com/acme/remote-app",
      title: "Base task",
      summary: "Implement the owner-triggered merge.",
      acceptance: "Merge works.",
    });
    await reachNeedsReview(h.service, goal.id);

    await expect(h.service.act({ goalId: goal.id, action: "land" })).rejects.toThrow(GoalLandError);
    const detail = await h.service.get(goal.id);
    expect(detail.status).toBe("needs_review");
    expect(ghState.merged).toBe(false);
    expect(h.archiveWorkspace).not.toHaveBeenCalled();
    await h.service.stop();
  });

  it("rejects a merge failure without touching worktree or task state", async () => {
    const ghState: FakeGhState = {
      merged: false,
      headSha: HEAD_SHA,
      state: "OPEN",
      mergeCommitSha: MERGE_SHA,
      failMerge: true,
    };
    const { run } = createRunner(ghState);
    const h = createLandService({
      projects: [gitProject("/srv/remote-app")],
      runLandCommand: run,
      onAgentRun: async ({ service, agentId }) => {
        await service.report({ callerAgentId: agentId, ...DONE_REPORT });
      },
    });
    await h.service.start();
    const goal = await h.service.create({
      repoKey: "remote:github.com/acme/remote-app",
      title: "Base task",
      summary: "Implement the owner-triggered merge.",
      acceptance: "Merge works.",
    });
    await reachNeedsReview(h.service, goal.id);

    await expect(h.service.act({ goalId: goal.id, action: "land" })).rejects.toThrow(/合入失败/);
    const detail = await h.service.get(goal.id);
    expect(detail.status).toBe("needs_review");
    expect(h.archiveWorkspace).not.toHaveBeenCalled();
    await h.service.stop();
  });

  it("requires a PR and rejects a goal without one", async () => {
    const { run } = createRunner({
      merged: false,
      headSha: HEAD_SHA,
      state: "OPEN",
      mergeCommitSha: MERGE_SHA,
      failMerge: false,
    });
    const h = createLandService({
      projects: [gitProject("/srv/remote-app")],
      runLandCommand: run,
      onAgentRun: async ({ service, agentId }) => {
        await service.report({
          callerAgentId: agentId,
          kind: "done",
          message: "Done but no PR.",
          prUrl: null,
          evidence: {
            revision: `commit:${HEAD_SHA}`,
            checks: [{ name: "vitest", result: "passed" }],
            artifacts: [],
          },
        });
      },
    });
    await h.service.start();
    const goal = await h.service.create({
      repoKey: "remote:github.com/acme/remote-app",
      title: "Base task",
      summary: "Implement the owner-triggered merge.",
      acceptance: "Merge works.",
    });
    await reachNeedsReview(h.service, goal.id, null);

    await expect(h.service.act({ goalId: goal.id, action: "land" })).rejects.toThrow(
      /没有关联的 Pull Request/,
    );
    await h.service.stop();
  });

  it("requires the latest verified revision to carry a full 40-char SHA", async () => {
    const { run } = createRunner({
      merged: false,
      headSha: HEAD_SHA,
      state: "OPEN",
      mergeCommitSha: MERGE_SHA,
      failMerge: false,
    });
    const h = createLandService({
      projects: [gitProject("/srv/remote-app")],
      runLandCommand: run,
      onAgentRun: async ({ service, agentId }) => {
        await service.report({
          callerAgentId: agentId,
          kind: "done",
          message: "Done but only a short sha.",
          prUrl: PR_URL,
          evidence: {
            revision: "commit:abc1234",
            checks: [{ name: "vitest", result: "passed" }],
            artifacts: [],
          },
        });
      },
    });
    await h.service.start();
    const goal = await h.service.create({
      repoKey: "remote:github.com/acme/remote-app",
      title: "Base task",
      summary: "Implement the owner-triggered merge.",
      acceptance: "Merge works.",
    });
    await reachNeedsReview(h.service, goal.id);

    await expect(h.service.act({ goalId: goal.id, action: "land" })).rejects.toThrow(
      /40 位提交 SHA/,
    );
    await h.service.stop();
  });

  it("pushes the merge commit to every origin pushurl in a detached worktree", async () => {
    const repoDir = mkdtemp("clawmuse-land-repo-");
    const remoteA = mkdtemp("clawmuse-land-remote-a-");
    const remoteB = mkdtemp("clawmuse-land-remote-b-");
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: repoDir, encoding: "utf8" }).trim();
    execFileSync("git", ["init", "--bare", "-b", "main"], { cwd: remoteA });
    execFileSync("git", ["init", "--bare", "-b", "main"], { cwd: remoteB });
    git("init", "-b", "main");
    git("config", "user.email", "land@test.dev");
    git("config", "user.name", "Land Test");
    git("commit", "--allow-empty", "-m", "base");
    git("remote", "add", "origin", remoteA);
    git("remote", "set-url", "--push", "--add", "origin", remoteA);
    git("remote", "set-url", "--push", "--add", "origin", remoteB);
    git("push", remoteA, "main");
    git("push", remoteB, "main");
    git("commit", "--allow-empty", "-m", "merge commit");
    const mergeSha = git("rev-parse", "HEAD");
    git("push", remoteA, "main");

    const ghState: FakeGhState = {
      merged: false,
      headSha: HEAD_SHA,
      state: "OPEN",
      mergeCommitSha: mergeSha,
      failMerge: false,
    };
    const realGit: LandCommandRunner = async (request) => {
      const result = await runGitCommand(request.args, {
        cwd: request.cwd,
        envOverlay: { GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "", GCM_INTERACTIVE: "0" },
        timeout: request.timeoutMs ?? 60_000,
      });
      return { stdout: result.stdout, stderr: result.stderr };
    };
    const { run, requests } = createRunner(ghState, realGit);
    const h = createLandService({
      projects: [gitProject(repoDir)],
      runLandCommand: run,
      onAgentRun: async ({ service, agentId }) => {
        await service.report({ callerAgentId: agentId, ...DONE_REPORT });
      },
    });
    await h.service.start();
    const goal = await h.service.create({
      repoKey: "remote:github.com/acme/remote-app",
      title: "Base task",
      summary: "Implement the owner-triggered merge.",
      acceptance: "Merge works.",
    });
    await reachNeedsReview(h.service, goal.id);

    const landed = await h.service.act({ goalId: goal.id, action: "land", mergeMethod: "squash" });
    expect(landed.status).toBe("done");
    expect(landed.mergeCommitSha).toBe(mergeSha);

    const pushRequest = requests.find(
      (r) => r.command === "git" && r.args[0] === "push" && r.args[1] === "origin",
    );
    expect(pushRequest?.args[2]).toBe("HEAD:refs/heads/main");
    expect(pushRequest?.cwd).not.toBe(repoDir);

    const remoteBHead = execFileSync("git", ["rev-parse", "main"], {
      cwd: remoteB,
      encoding: "utf8",
    }).trim();
    expect(remoteBHead).toBe(mergeSha);

    const worktreeList = git("worktree", "list", "--porcelain");
    expect(worktreeList.match(/worktree /g)).toHaveLength(1);
    await h.service.stop();
  });
});
