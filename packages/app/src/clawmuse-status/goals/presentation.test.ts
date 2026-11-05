import { describe, expect, it } from "vitest";

import {
  filterForStatus,
  goalActions,
  goalExecutionTarget,
  goalStatusBadgeVariant,
  goalStatusLabelKey,
  mergeGoalIntoList,
  sortGoalsForFilter,
} from "./presentation";
import type { Goal } from "./types";

it("opens execution only through the matching host bound to the current installation", () => {
  const run = { agentRef: "agent-id", relayHostId: "AbCdEfGhIjKlMnOp" };
  expect(
    goalExecutionTarget(run, { other: { kind: "bound", relayHostId: "other-host" } }),
  ).toBeNull();
  expect(goalExecutionTarget(run, { server: { kind: "offline" } })).toBeNull();
  expect(
    goalExecutionTarget(
      { ...run, agentRef: null },
      { server: { kind: "bound", relayHostId: run.relayHostId } },
    ),
  ).toBeNull();
  expect(
    goalExecutionTarget(run, { server: { kind: "bound", relayHostId: run.relayHostId } }),
  ).toEqual({ serverId: "server", agentId: "agent-id" });
});

function goal(overrides: Partial<Goal>): Goal {
  return {
    id: "g1",
    repoKey: "remote:github.com/acme/app",
    repoDisplayName: "acme/app",
    title: "t",
    summary: "s",
    acceptance: "a",
    origin: "planner",
    status: "suggested",
    reviewReason: null,
    priority: 3,
    budgetRuns: 3,
    runsUsed: 0,
    expiresAt: null,
    decidedAt: null,
    createdAt: 1,
    updatedAt: 1,
    hostId: null,
    hostDisplayName: null,
    agent: null,
    latestReport: null,
    currentRun: null,
    ...overrides,
  };
}

describe("goal presentation", () => {
  it("labels review goals by their reason and everything else by status", () => {
    expect(goalStatusLabelKey(goal({ status: "needs_review", reviewReason: "blocked" }))).toBe(
      "clawmuseStatus.goals.reviewReason.blocked",
    );
    expect(goalStatusLabelKey(goal({ status: "running" }))).toBe(
      "clawmuseStatus.goals.status.running",
    );
  });

  it("colors failure red, decisions amber, and completion green", () => {
    expect(goalStatusBadgeVariant(goal({ status: "needs_review", reviewReason: "failed" }))).toBe(
      "error",
    );
    expect(
      goalStatusBadgeVariant(goal({ status: "needs_review", reviewReason: "needs_decision" })),
    ).toBe("warning");
    expect(
      goalStatusBadgeVariant(goal({ status: "needs_review", reviewReason: "completed" })),
    ).toBe("success");
    expect(goalStatusBadgeVariant(goal({ status: "suggested" }))).toBe("muted");
  });

  it("offers one primary action per state", () => {
    for (const status of ["suggested", "accepted", "running", "needs_review", "paused"] as const) {
      const actions = goalActions(goal({ status }));
      expect(actions.filter((action) => action.primary).length).toBeLessThanOrEqual(1);
      expect(actions.some((action) => action.id === "discard")).toBe(true);
    }
    expect(goalActions(goal({ status: "done" }))).toEqual([]);
    expect(
      goalActions(goal({ status: "needs_review", reviewReason: "completed" })).map(
        (action) => action.id,
      ),
    ).toEqual(["approve", "continue", "discard"]);
  });

  it("maps every status to the filter that lists it", () => {
    expect(filterForStatus("paused")).toBe("active");
    expect(filterForStatus("discarded")).toBe("closed");
    expect(filterForStatus("needs_review")).toBe("needs_review");
  });

  it("keeps a mutated goal in the list only while it still matches the filter", () => {
    const list = [goal({ id: "a", status: "suggested" }), goal({ id: "b", status: "suggested" })];
    expect(
      mergeGoalIntoList(list, goal({ id: "a", status: "accepted" }), "suggested").map((g) => g.id),
    ).toEqual(["b"]);
    expect(
      mergeGoalIntoList(
        list,
        goal({ id: "b", status: "suggested", title: "renamed" }),
        "suggested",
      )[1]?.title,
    ).toBe("renamed");
    expect(
      mergeGoalIntoList([], goal({ id: "c", status: "accepted" }), "active").map((g) => g.id),
    ).toEqual(["c"]);
  });

  it("sorts suggestions by priority and everything else by recency", () => {
    const suggestions = sortGoalsForFilter(
      [goal({ id: "low", priority: 4 }), goal({ id: "urgent", priority: 1 })],
      "suggested",
    );
    expect(suggestions.map((g) => g.id)).toEqual(["urgent", "low"]);
    const active = sortGoalsForFilter(
      [
        goal({ id: "old", updatedAt: 1, status: "running" }),
        goal({ id: "new", updatedAt: 5, status: "running" }),
      ],
      "active",
    );
    expect(active.map((g) => g.id)).toEqual(["new", "old"]);
  });
  it("does not offer acceptance for a failure or another round at the hard cap", () => {
    expect(
      goalActions(goal({ status: "needs_review", reviewReason: "failed", runsUsed: 50 })).map(
        (action) => action.id,
      ),
    ).toEqual(["discard"]);
  });
});
