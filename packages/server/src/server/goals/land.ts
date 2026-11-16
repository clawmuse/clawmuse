import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import type pino from "pino";
import type { GoalDetailWire, GoalMergeMethod, GoalRun, GoalWire } from "@getpaseo/protocol/goals";
import { execCommand } from "../../utils/spawn.js";
import { runGitCommand } from "../../utils/run-git-command.js";
import { readGoalWorkspace } from "../clawmuse-status/goal-workspaces.js";
import type { LocalGoalStore } from "./store.js";

/**
 * Owner-triggered merge & close ("land") for a reviewed goal.
 *
 * This module is reachable only through `LocalGoalService.act({ action: "land" })`,
 * which is dispatched from the owner channel `goals.act.request`. The
 * `clawmuse_goals` MCP bridge (`report`/`propose`) has no path to it, so an
 * executor agent can never merge production branches by itself.
 */

export type GoalLandErrorCode =
  | "goal_not_found"
  | "not_landable"
  | "unfinished_children"
  | "missing_pull_request"
  | "missing_verified_sha"
  | "head_sha_mismatch"
  | "pull_request_not_open"
  | "merge_failed";

export class GoalLandError extends Error {
  constructor(
    public readonly code: GoalLandErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "GoalLandError";
  }
}

export interface LandCommandRequest {
  command: "gh" | "git";
  args: string[];
  cwd: string;
  timeoutMs?: number;
}

export interface LandCommandOutput {
  stdout: string;
  stderr: string;
}

export type LandCommandRunner = (request: LandCommandRequest) => Promise<LandCommandOutput>;

const GIT_NONINTERACTIVE_ENV = {
  GIT_TERMINAL_PROMPT: "0",
  GIT_ASKPASS: "",
  GCM_INTERACTIVE: "0",
};

export const defaultLandCommandRunner: LandCommandRunner = async (request) => {
  if (request.command === "git") {
    const result = await runGitCommand(request.args, {
      cwd: request.cwd,
      envOverlay: GIT_NONINTERACTIVE_ENV,
      timeout: request.timeoutMs ?? 60_000,
    });
    return { stdout: result.stdout, stderr: result.stderr };
  }
  const result = await execCommand("gh", request.args, {
    cwd: request.cwd,
    envOverlay: { GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1" },
    timeout: request.timeoutMs ?? 60_000,
  });
  return { stdout: result.stdout, stderr: result.stderr };
};

const FULL_COMMIT_SHA = /\b[0-9a-f]{40}\b/i;

/** Latest verified commit across reports; only a full 40-char SHA gates a merge. */
export function verifiedHeadSha(detail: Pick<GoalDetailWire, "reports">): string | null {
  for (let index = detail.reports.length - 1; index >= 0; index -= 1) {
    const evidence = detail.reports[index]!.evidence;
    const candidate = evidence?.headSha ?? evidence?.revision;
    const match = candidate ? FULL_COMMIT_SHA.exec(candidate) : null;
    if (match) {
      return match[0].toLowerCase();
    }
  }
  return null;
}

function latestPullRequestUrl(detail: Pick<GoalDetailWire, "reports">): string | null {
  for (let index = detail.reports.length - 1; index >= 0; index -= 1) {
    const prUrl = detail.reports[index]!.prUrl;
    if (prUrl?.trim()) {
      return prUrl.trim();
    }
  }
  return null;
}

function assertLandable(detail: GoalDetailWire): void {
  if (
    detail.status !== "needs_review" ||
    (detail.reviewReason !== "completed" && detail.reviewReason !== "nothing_to_do")
  ) {
    throw new GoalLandError(
      "not_landable",
      "只有验收通过前的任务可以合入；请先在手机端验收或重新核验",
    );
  }
  const latestReport = detail.reports[detail.reports.length - 1];
  if (latestReport?.evidence?.checks.some((check) => check.result === "failed")) {
    throw new GoalLandError("not_landable", "cannot_land_failed_checks");
  }
  const unfinishedChildren = (detail.children ?? []).some(
    (child) => child.status !== "done" && child.status !== "discarded",
  );
  if (unfinishedChildren) {
    throw new GoalLandError("unfinished_children", "请先完成或丢弃所有子任务后再合入");
  }
}

interface PullRequestFacts {
  state?: string;
  headRefOid?: string;
  baseRefName?: string;
  mergeCommit?: { oid?: string } | null;
}

async function readPullRequestFacts(
  run: LandCommandRunner,
  cwd: string,
  prUrl: string,
): Promise<PullRequestFacts> {
  const fields = "state,headRefOid,baseRefName,mergeCommit";
  const result = await run({
    command: "gh",
    args: ["pr", "view", prUrl, "--json", fields],
    cwd,
  });
  return JSON.parse(result.stdout) as PullRequestFacts;
}

function describeCommandError(error: unknown): string {
  if (error instanceof Error) {
    const stderr = (error as { stderr?: string }).stderr;
    const detail = stderr?.trim();
    if (detail) {
      return detail.split("\n").slice(-3).join("\n");
    }
    return error.message;
  }
  return String(error);
}

async function listOriginPushUrls(run: LandCommandRunner, cwd: string): Promise<string[]> {
  const result = await run({
    command: "git",
    args: ["remote", "get-url", "--push", "--all", "origin"],
    cwd,
  });
  return [
    ...new Set(
      result.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * Repositories with several `origin` pushurls (e.g. GitHub + CNB dual push) only
 * have the merge commit on the primary remote after `gh pr merge`. Push it to
 * every configured push remote from a clean detached worktree so all stay equal.
 */
async function syncMergeCommitToPushRemotes(
  run: LandCommandRunner,
  cwd: string,
  mergeCommitSha: string,
  baseBranch: string,
): Promise<void> {
  await run({
    command: "git",
    args: ["fetch", "origin", baseBranch],
    cwd,
    timeoutMs: 120_000,
  });
  const worktreePath = await mkdtemp(nodePath.join(tmpdir(), "clawmuse-land-"));
  let worktreeAdded = false;
  try {
    await run({
      command: "git",
      args: ["worktree", "add", "--detach", worktreePath, mergeCommitSha],
      cwd,
    });
    worktreeAdded = true;
    await run({
      command: "git",
      args: ["push", "origin", `HEAD:refs/heads/${baseBranch}`],
      cwd: worktreePath,
      timeoutMs: 120_000,
    });
  } finally {
    if (worktreeAdded) {
      try {
        await run({
          command: "git",
          args: ["worktree", "remove", "--force", worktreePath],
          cwd,
        });
      } catch {
        // Removal failure is cleaned up below by deleting the directory.
      }
    }
    await rm(worktreePath, { recursive: true, force: true }).catch(() => {});
  }
}

export interface GoalLandDeps {
  store: LocalGoalStore;
  paseoHome: string;
  logger: pino.Logger;
  repoKey: string;
  repoRootPath: string;
  serverId: string;
  relayHostId: string;
  hostDisplayName: string;
  archiveWorkspace: (workspaceId: string) => Promise<void>;
  runCommand?: LandCommandRunner;
}

export interface GoalLandResult {
  goal: GoalWire;
  mergeCommitSha: string;
  runsToStart: Array<{ goalId: string; run: GoalRun }>;
}

interface MergeSyncOutcome {
  mergeCommitSha: string | null;
  syncWarning: string | null;
}

async function resolveAndSyncMergeCommit(
  run: LandCommandRunner,
  deps: Pick<GoalLandDeps, "repoRootPath" | "logger">,
  prUrl: string,
  baseBranch: string,
): Promise<MergeSyncOutcome> {
  let mergeCommitSha: string | null = null;
  try {
    const after = await readPullRequestFacts(run, deps.repoRootPath, prUrl);
    mergeCommitSha = after.mergeCommit?.oid ?? null;
  } catch (error) {
    deps.logger.warn({ err: error, prUrl }, "Failed reading merge commit after land");
  }
  try {
    const pushUrls = await listOriginPushUrls(run, deps.repoRootPath);
    if (pushUrls.length > 1 || !mergeCommitSha) {
      await run({
        command: "git",
        args: ["fetch", "origin", baseBranch],
        cwd: deps.repoRootPath,
        timeoutMs: 120_000,
      });
    }
    if (!mergeCommitSha) {
      const resolved = await run({
        command: "git",
        args: ["rev-parse", "FETCH_HEAD"],
        cwd: deps.repoRootPath,
      });
      mergeCommitSha = resolved.stdout.trim() || null;
    }
    if (pushUrls.length > 1 && mergeCommitSha) {
      await syncMergeCommitToPushRemotes(run, deps.repoRootPath, mergeCommitSha, baseBranch);
    }
    return { mergeCommitSha, syncWarning: null };
  } catch (error) {
    deps.logger.warn({ err: error }, "Failed syncing merge commit to push remotes");
    return { mergeCommitSha, syncWarning: describeCommandError(error) };
  }
}

async function recordSyncWarning(
  deps: Pick<GoalLandDeps, "store" | "logger">,
  detail: GoalDetailWire,
  prUrl: string,
  mergeCommitSha: string,
  syncWarning: string,
): Promise<void> {
  const runId = detail.currentRun?.id ?? detail.runs[detail.runs.length - 1]?.id;
  if (!runId) {
    return;
  }
  await deps.store
    .recordReport({
      goalId: detail.id,
      runId,
      kind: "progress",
      message: `已合入主干（merge commit ${mergeCommitSha}），但同步到其他 push 远端失败：${syncWarning}`,
      prUrl,
    })
    .catch((err) => {
      deps.logger.warn({ err }, "Failed recording remote sync warning report");
    });
}

async function archiveGoalWorkspace(
  deps: Pick<GoalLandDeps, "paseoHome" | "repoKey" | "archiveWorkspace" | "logger">,
  goalId: string,
): Promise<void> {
  try {
    const workspaceId = await readGoalWorkspace(deps.paseoHome, goalId, deps.repoKey);
    if (workspaceId) {
      await deps.archiveWorkspace(workspaceId);
    }
  } catch (error) {
    deps.logger.warn({ err: error, goalId }, "Failed archiving goal workspace after land");
  }
}

export async function landGoal(
  deps: GoalLandDeps,
  input: { goalId: string; mergeMethod?: GoalMergeMethod },
): Promise<GoalLandResult> {
  const run = deps.runCommand ?? defaultLandCommandRunner;
  const detail = await deps.store.getDetail(input.goalId);
  if (!detail) {
    throw new GoalLandError("goal_not_found", "目标不存在");
  }
  assertLandable(detail);

  const prUrl = latestPullRequestUrl(detail);
  if (!prUrl) {
    throw new GoalLandError(
      "missing_pull_request",
      "该任务没有关联的 Pull Request，无法合入；请改用「通过」结单",
    );
  }
  const headSha = verifiedHeadSha(detail);
  if (!headSha) {
    throw new GoalLandError(
      "missing_verified_sha",
      "缺少已核验的 40 位提交 SHA；请重新核验后再合入",
    );
  }
  const mergeMethod = input.mergeMethod ?? "merge";

  const before = await readPullRequestFacts(run, deps.repoRootPath, prUrl);
  if (before.state && before.state !== "OPEN") {
    throw new GoalLandError(
      "pull_request_not_open",
      `Pull Request 当前状态为 ${before.state}，无法合入`,
    );
  }
  if (before.headRefOid && before.headRefOid.toLowerCase() !== headSha) {
    throw new GoalLandError(
      "head_sha_mismatch",
      `PR 分支最新提交 ${before.headRefOid} 与已核验提交 ${headSha} 不一致，请重新核验`,
    );
  }

  try {
    await run({
      command: "gh",
      args: ["pr", "merge", prUrl, "--match-head-commit", headSha, `--${mergeMethod}`],
      cwd: deps.repoRootPath,
      timeoutMs: 120_000,
    });
  } catch (error) {
    throw new GoalLandError(
      "merge_failed",
      `Pull Request 合入失败：${describeCommandError(error)}`,
      { cause: error },
    );
  }

  const baseBranch = /^[A-Za-z0-9/_-]+$/.test(before.baseRefName ?? "")
    ? before.baseRefName!
    : "main";
  const { mergeCommitSha, syncWarning } = await resolveAndSyncMergeCommit(
    run,
    deps,
    prUrl,
    baseBranch,
  );
  if (!mergeCommitSha) {
    throw new GoalLandError(
      "merge_failed",
      "已发起合入但未能读取 merge commit SHA；请在仓库中确认后手工结单",
    );
  }

  const { goal, runsToStart } = await deps.store.completeLand({
    goalId: input.goalId,
    mergeCommitSha,
    serverId: deps.serverId,
    relayHostId: deps.relayHostId,
    hostDisplayName: deps.hostDisplayName,
  });

  if (syncWarning) {
    await recordSyncWarning(deps, detail, prUrl, mergeCommitSha, syncWarning);
  }
  await archiveGoalWorkspace(deps, input.goalId);

  return { goal, mergeCommitSha, runsToStart };
}
