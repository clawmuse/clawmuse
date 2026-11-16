import { describe, expect, it } from "vitest";
import {
  hasGoalVerificationShaDrift,
  runGoalVerification,
  verificationContinuation,
  type GoalVerifierPort,
} from "./verifier.js";

const HEAD_SHA = "a".repeat(40);

function createPort(results: Array<{ exitCode: number; output?: string }>): GoalVerifierPort & {
  checkoutHeads: string[];
  commands: Array<{ command: string; cwd: string }>;
  disposed: boolean;
} {
  const checkoutHeads: string[] = [];
  const commands: Array<{ command: string; cwd: string }> = [];
  let disposed = false;
  return {
    checkoutHeads,
    commands,
    get disposed() {
      return disposed;
    },
    async checkout(headSha) {
      checkoutHeads.push(headSha);
      return {
        cwd: "/isolated/verifier-worktree",
        async dispose() {
          disposed = true;
        },
      };
    },
    async run(input) {
      commands.push(input);
      return results.shift() ?? { exitCode: 1, output: "unexpected command" };
    },
  };
}

describe("goal verifier", () => {
  it("runs each gate in an isolated checkout and records fixed-SHA structured evidence", async () => {
    const port = createPort([{ exitCode: 0, output: "ok" }, { exitCode: 0 }]);

    const result = await runGoalVerification({
      headSha: HEAD_SHA,
      verifierRunId: "verify-run",
      commands: [
        { name: "unit tests", command: "npm run test:unit" },
        { name: "lint", command: "npm run lint" },
      ],
      port,
    });

    expect(result).toMatchObject({
      passed: true,
      shaDrifted: false,
      evidence: {
        source: "verifier",
        revision: HEAD_SHA,
        headSha: HEAD_SHA,
        verifiedByRunId: "verify-run",
        checks: [
          { name: "unit tests", result: "passed", exitCode: 0, detail: "ok" },
          { name: "lint", result: "passed", exitCode: 0 },
        ],
      },
    });
    expect(result.evidence.checks.every((check) => check.durationMs !== undefined)).toBe(true);
    expect(port.checkoutHeads).toEqual([HEAD_SHA]);
    expect(port.commands).toEqual([
      { command: "npm run test:unit", cwd: "/isolated/verifier-worktree" },
      { command: "npm run lint", cwd: "/isolated/verifier-worktree" },
    ]);
    expect(port.disposed).toBe(true);
  });

  it("records a failing check and permits only an in-budget repair round", async () => {
    const port = createPort([{ exitCode: 2, output: "type mismatch" }]);
    const result = await runGoalVerification({
      headSha: HEAD_SHA,
      verifierRunId: "verify-run",
      commands: [{ name: "typecheck", command: "npm run typecheck" }],
      port,
    });

    expect(result.passed).toBe(false);
    expect(result.evidence.checks).toMatchObject([
      { name: "typecheck", result: "failed", exitCode: 2, detail: "type mismatch" },
    ]);
    expect(
      verificationContinuation({ checks: result.evidence.checks, runsUsed: 1, budgetRuns: 2 }),
    ).toEqual({
      shouldContinue: true,
      instruction:
        "独立核验未通过。请只修复下列失败项，重新提交并如实汇报：\n- typecheck（退出码 2）：type mismatch",
    });
    expect(
      verificationContinuation({ checks: result.evidence.checks, runsUsed: 2, budgetRuns: 2 }),
    ).toEqual({ shouldContinue: false, instruction: null });
  });

  it("rejects stale evidence before creating a checkout when the remote head moved", async () => {
    const port = createPort([]);
    const result = await runGoalVerification({
      headSha: HEAD_SHA,
      remoteHeadSha: "b".repeat(40),
      verifierRunId: "verify-run",
      commands: [{ name: "test", command: "npm test" }],
      port,
    });

    expect(result).toMatchObject({
      passed: false,
      shaDrifted: true,
      evidence: {
        source: "verifier",
        headSha: HEAD_SHA,
        checks: [{ name: "PR head SHA", result: "failed" }],
      },
    });
    expect(port.checkoutHeads).toEqual([]);
    expect(
      hasGoalVerificationShaDrift({ verifiedHeadSha: HEAD_SHA, remoteHeadSha: HEAD_SHA }),
    ).toBe(false);
  });

  it("rejects abbreviated revisions because evidence must bind a full commit SHA", async () => {
    await expect(
      runGoalVerification({
        headSha: "abc1234",
        verifierRunId: "verify-run",
        commands: [{ name: "test", command: "npm test" }],
        port: createPort([]),
      }),
    ).rejects.toThrow("40-character commit SHA");
  });
});
