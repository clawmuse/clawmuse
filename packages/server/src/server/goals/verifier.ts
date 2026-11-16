import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { GoalEvidence } from "@getpaseo/protocol/goals";

const execFile = promisify(execFileCallback);

export const GOAL_HEAD_SHA_PATTERN = /^[0-9a-f]{40}$/i;

export interface GoalVerificationCommand {
  name: string;
  command: string;
}

export interface GoalVerifierCommandResult {
  exitCode: number;
  output?: string;
}

export interface GoalVerifierPort {
  /** Creates an isolated checkout pinned to `headSha`, never the executor worktree. */
  checkout(headSha: string): Promise<{ cwd: string; dispose(): Promise<void> }>;
  run(input: { command: string; cwd: string }): Promise<GoalVerifierCommandResult>;
}

export interface GoalVerificationResult {
  evidence: GoalEvidence;
  passed: boolean;
  shaDrifted: boolean;
}

export interface VerificationContinuation {
  shouldContinue: boolean;
  instruction: string | null;
}

function outputDetail(output: string | undefined): string | undefined {
  const trimmed = output?.trim();
  if (!trimmed) return undefined;
  return trimmed.length > 2_000 ? `${trimmed.slice(0, 1_999)}…` : trimmed;
}

export function isGoalHeadSha(value: string | null | undefined): value is string {
  return typeof value === "string" && GOAL_HEAD_SHA_PATTERN.test(value);
}

/** A new remote head invalidates evidence even if all checks passed for the prior commit. */
export function hasGoalVerificationShaDrift(input: {
  verifiedHeadSha: string | null | undefined;
  remoteHeadSha: string | null | undefined;
}): boolean {
  return (
    !isGoalHeadSha(input.verifiedHeadSha) ||
    !isGoalHeadSha(input.remoteHeadSha) ||
    input.verifiedHeadSha.toLowerCase() !== input.remoteHeadSha.toLowerCase()
  );
}

/** Formats the only automatic retry instruction the executor receives after a failed verifier run. */
export function verificationContinuation(input: {
  checks: GoalEvidence["checks"];
  runsUsed: number;
  budgetRuns: number;
}): VerificationContinuation {
  const failed = input.checks.filter((check) => check.result === "failed");
  if (failed.length === 0 || input.runsUsed >= input.budgetRuns) {
    return { shouldContinue: false, instruction: null };
  }
  const details = failed.map((check) => {
    const exit = check.exitCode === undefined ? "" : `（退出码 ${check.exitCode}）`;
    return `- ${check.name}${exit}${check.detail ? `：${check.detail}` : ""}`;
  });
  return {
    shouldContinue: true,
    instruction: `独立核验未通过。请只修复下列失败项，重新提交并如实汇报：\n${details.join("\n")}`,
  };
}

/**
 * Runs configured gates in a newly-created checkout of the exact commit reported
 * by the executor. The port owns process spawning and worktree cleanup, so tests
 * can prove the state machine without a real provider or repository.
 */
export async function runGoalVerification(input: {
  commands: readonly GoalVerificationCommand[];
  headSha: string;
  remoteHeadSha?: string | null;
  verifierRunId: string;
  port: GoalVerifierPort;
}): Promise<GoalVerificationResult> {
  if (!isGoalHeadSha(input.headSha)) {
    throw new Error("Verifier requires a 40-character commit SHA");
  }
  const shaDrifted =
    input.remoteHeadSha !== undefined &&
    hasGoalVerificationShaDrift({
      verifiedHeadSha: input.headSha,
      remoteHeadSha: input.remoteHeadSha,
    });
  if (shaDrifted) {
    return {
      passed: false,
      shaDrifted: true,
      evidence: {
        revision: input.headSha,
        headSha: input.headSha,
        source: "verifier",
        verifiedByRunId: input.verifierRunId,
        artifacts: [],
        checks: [
          {
            name: "PR head SHA",
            result: "failed",
            detail: "远端分支已移动，必须对新的 head SHA 重新核验。",
          },
        ],
      },
    };
  }

  const checkout = await input.port.checkout(input.headSha);
  try {
    const checks: GoalEvidence["checks"] = [];
    for (const configured of input.commands) {
      const startedAt = Date.now();
      try {
        const result = await input.port.run({ command: configured.command, cwd: checkout.cwd });
        checks.push({
          name: configured.name,
          result: result.exitCode === 0 ? "passed" : "failed",
          exitCode: result.exitCode,
          durationMs: Date.now() - startedAt,
          ...(outputDetail(result.output) ? { detail: outputDetail(result.output) } : {}),
        });
      } catch (error) {
        checks.push({
          name: configured.name,
          result: "failed",
          durationMs: Date.now() - startedAt,
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return {
      passed: checks.length > 0 && checks.every((check) => check.result === "passed"),
      shaDrifted: false,
      evidence: {
        revision: input.headSha,
        headSha: input.headSha,
        source: "verifier",
        verifiedByRunId: input.verifierRunId,
        checks,
        artifacts: [],
      },
    };
  } finally {
    await checkout.dispose();
  }
}

/**
 * Production verifier port. The disposable worktree is the only directory where
 * configured checks run. Cleanup removes only the worktree created by this port.
 */
export function createIsolatedGoalVerifierPort(repoRoot: string): GoalVerifierPort {
  let worktreePath: string | null = null;
  return {
    async checkout(headSha) {
      worktreePath = await mkdtemp(join(tmpdir(), "clawmuse-goal-verify-"));
      await rm(worktreePath, { force: true, recursive: true });
      try {
        await execFile("git", ["worktree", "add", "--detach", worktreePath, headSha], {
          cwd: repoRoot,
        });
      } catch (error) {
        await rm(worktreePath, { force: true, recursive: true }).catch(() => {});
        worktreePath = null;
        throw error;
      }
      const path = worktreePath;
      return {
        cwd: path,
        async dispose() {
          if (!worktreePath) return;
          worktreePath = null;
          await execFile("git", ["worktree", "remove", "--force", path], { cwd: repoRoot }).catch(
            () => rm(path, { force: true, recursive: true }),
          );
        },
      };
    },
    async run({ command, cwd }) {
      const shell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
      const args = process.platform === "win32" ? ["/d", "/s", "/c", command] : ["-lc", command];
      try {
        const { stdout, stderr } = await execFile(shell, args, {
          cwd,
          maxBuffer: 2 * 1024 * 1024,
        });
        return { exitCode: 0, output: `${stdout}\n${stderr}` };
      } catch (error) {
        const failed = error as NodeJS.ErrnoException & {
          code?: number | string;
          stdout?: string;
          stderr?: string;
        };
        return {
          exitCode: typeof failed.code === "number" ? failed.code : 1,
          output: `${failed.stdout ?? ""}\n${failed.stderr ?? failed.message}`,
        };
      }
    },
  };
}
