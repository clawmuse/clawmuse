import { describe, expect, it } from "vitest";

import {
  parseGoalCounts,
  parseGoalDetailEnvelope,
  parseGoalList,
  parseGoalRepoList,
  parsePlanRequest,
} from "./parse";

const GOAL = {
  id: "11111111-1111-4111-8111-111111111111",
  repoKey: "remote:github.com/acme/app",
  repoDisplayName: "acme/app",
  title: "Fix the flaky schedule test",
  summary: "Fails twice a week.",
  acceptance: "CI green three times in a row.",
  origin: "planner",
  status: "needs_review",
  reviewReason: "completed",
  priority: 2,
  budgetRuns: 3,
  runsUsed: 2,
  expiresAt: null,
  decidedAt: "2026-10-11T08:00:00.000Z",
  createdAt: "2026-10-11T07:00:00.000Z",
  updatedAt: "2026-10-11T09:00:00.000Z",
  latestReport: {
    id: "r1",
    runId: "run-2",
    seq: 1,
    kind: "done",
    message: "PR #42 is green.",
    prUrl: "https://github.com/acme/app/pull/42",
    createdAt: "2026-10-11T09:00:00.000Z",
  },
  currentRun: {
    id: "run-2",
    kind: "execute",
    status: "succeeded",
    hostId: "h1",
    hostDisplayName: "工作电脑",
    instruction: null,
    outcome: "done",
    startedAt: "2026-10-11T08:30:00.000Z",
    finishedAt: "2026-10-11T09:00:00.000Z",
    createdAt: "2026-10-11T08:29:00.000Z",
  },
};

describe("goal parsing", () => {
  it("retains task relationships, provenance and revision-bound evidence", () => {
    const evidence = {
      revision: "abc123",
      checks: [{ name: "Tests", result: "passed" }],
      artifacts: [{ label: "PR", url: "https://github.com/acme/app/pull/42" }],
    };
    const metadata = {
      parentGoalId: "parent",
      parentGoalTitle: "Release",
      dependsOn: ["before"],
      blockedBy: ["before"],
      children: [],
      source: { kind: "github", key: "issue", url: "https://github.com/acme/app/issues/42" },
      attachedAgentRef: null,
    };
    expect(
      parseGoalList({
        goals: [{ ...GOAL, ...metadata, latestReport: { ...GOAL.latestReport, evidence } }],
      })[0],
    ).toMatchObject({ ...metadata, latestReport: { evidence } });
    expect(() =>
      parseGoalList({
        goals: [
          {
            ...GOAL,
            latestReport: {
              ...GOAL.latestReport,
              evidence: { ...evidence, checks: [{ name: "Tests", result: "assumed" }] },
            },
          },
        ],
      }),
    ).toThrow();
  });
  it("keeps execution references when available and accepts older hosts without them", () => {
    expect(
      parseGoalList({ goals: [{ ...GOAL, executionUnconfirmed: true }] })[0]?.executionUnconfirmed,
    ).toBe(true);
    expect(parseGoalList({ goals: [GOAL] })[0]?.executionUnconfirmed).toBe(false);
    const run = { ...GOAL.currentRun, agentRef: "agent-id", relayHostId: "AbCdEfGhIjKlMnOp" };
    const detail = parseGoalDetailEnvelope({ goal: { ...GOAL, runs: [run], reports: [] } });
    expect(detail.runs[0]).toMatchObject({ agentRef: "agent-id", relayHostId: "AbCdEfGhIjKlMnOp" });
    expect(parseGoalList({ goals: [GOAL] })[0]?.currentRun).toMatchObject({
      agentRef: null,
      relayHostId: null,
    });
  });
  it("turns ISO timestamps into unix ms and keeps nested report and run", () => {
    const [goal] = parseGoalList({ goals: [GOAL] });
    expect(goal).toMatchObject({
      id: GOAL.id,
      status: "needs_review",
      reviewReason: "completed",
      updatedAt: Date.parse("2026-10-11T09:00:00.000Z"),
      expiresAt: null,
      latestReport: expect.objectContaining({
        kind: "done",
        prUrl: "https://github.com/acme/app/pull/42",
        createdAt: Date.parse("2026-10-11T09:00:00.000Z"),
      }),
      currentRun: expect.objectContaining({
        hostDisplayName: "工作电脑",
        finishedAt: Date.parse("2026-10-11T09:00:00.000Z"),
      }),
    });
  });

  it("reads a detail envelope with runs and reports", () => {
    const detail = parseGoalDetailEnvelope({
      goal: { ...GOAL, runs: [GOAL.currentRun], reports: [GOAL.latestReport] },
    });
    expect(detail.runs).toHaveLength(1);
    expect(detail.reports[0]?.message).toBe("PR #42 is green.");
  });

  it("rejects an unknown status instead of rendering it", () => {
    expect(() => parseGoalList({ goals: [{ ...GOAL, status: "exploded" }] })).toThrow(/status/);
  });

  it("parses repositories with their hosts", () => {
    const repos = parseGoalRepoList({
      repos: [
        {
          repoKey: "remote:github.com/acme/app",
          displayName: "acme/app",
          planEnabled: true,
          lastPlannedAt: null,
          hosts: [{ hostId: "h1", displayName: "工作电脑", connectivity: "live" }],
          suggestedCount: 2,
          activeCount: 1,
        },
      ],
    });
    expect(repos[0]).toMatchObject({
      displayName: "acme/app",
      lastPlannedAt: null,
      hosts: [{ connectivity: "live" }],
      suggestedCount: 2,
    });
  });

  it("treats a summary without goals as null rather than an error", () => {
    expect(parseGoalCounts(undefined)).toBeNull();
    expect(parseGoalCounts({ suggestedCount: 1, activeCount: 0, needsReviewCount: 2 })).toEqual({
      suggestedCount: 1,
      activeCount: 0,
      needsReviewCount: 2,
    });
  });

  it("parses plan request outcomes", () => {
    expect(parsePlanRequest({ outcome: "queued", runId: "x" })).toEqual({
      outcome: "queued",
      runId: "x",
    });
    expect(() => parsePlanRequest({ outcome: "later", runId: "x" })).toThrow(/outcome/);
  });
  it("keeps the optional review event version for local notification receipts", () => {
    const [goal] = parseGoalList({ goals: [{ ...GOAL, reviewEventVersion: 17 }] });
    expect(goal?.reviewEventVersion).toBe(17);
    expect(() => parseGoalList({ goals: [{ ...GOAL, reviewEventVersion: "foreign" }] })).toThrow();
  });
});
