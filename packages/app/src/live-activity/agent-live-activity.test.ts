import { describe, expect, it } from "vitest";
import {
  AGENT_LIVE_ACTIVITY_COMPLETED_DWELL_MS,
  AGENT_LIVE_ACTIVITY_ERROR_DWELL_MS,
  buildAgentLiveActivitySummary,
  createAgentLiveActivityId,
  nextAgentLiveActivityRefreshAt,
  type AgentLiveActivity,
  type AgentLiveActivityPhase,
} from "./agent-live-activity";

const NOW = 1_000_000;

function activity(
  id: string,
  phase: AgentLiveActivityPhase,
  overrides: Partial<AgentLiveActivity> = {},
): AgentLiveActivity {
  return {
    id,
    serverId: "server-1",
    agentId: id,
    phase,
    title: id,
    detail: null,
    workspaceLabel: null,
    startedAt: NOW - 60_000,
    stateChangedAt: NOW,
    updatedAt: NOW,
    unseen: true,
    ...overrides,
  };
}

describe("createAgentLiveActivityId", () => {
  it("encodes both halves so a slash in either cannot collide", () => {
    expect(createAgentLiveActivityId("a/b", "c/d")).toBe("a%2Fb/c%2Fd");
  });
});

describe("buildAgentLiveActivitySummary", () => {
  it("puts what needs the user first, then finished work, then running work", () => {
    const summary = buildAgentLiveActivitySummary(
      [
        activity("working", "working"),
        activity("completed", "completed"),
        activity("attention", "attention"),
        activity("unverifiable", "unverifiable"),
      ],
      NOW,
    );
    expect(summary.items.map((item) => item.id)).toEqual([
      "attention",
      "completed",
      "working",
      "unverifiable",
    ]);
    expect(summary.primary?.id).toBe("attention");
    expect(summary.counts.attention).toBe(1);
    expect(summary.total).toBe(4);
  });

  it("keeps a finished item only while it is unseen and inside the dwell", () => {
    const seen = activity("seen", "completed", { unseen: false });
    const fresh = activity("fresh", "completed", {
      stateChangedAt: NOW - AGENT_LIVE_ACTIVITY_COMPLETED_DWELL_MS + 1,
    });
    const stale = activity("stale", "completed", {
      stateChangedAt: NOW - AGENT_LIVE_ACTIVITY_COMPLETED_DWELL_MS - 1,
    });
    const summary = buildAgentLiveActivitySummary([seen, fresh, stale], NOW);
    expect(summary.items.map((item) => item.id)).toEqual(["fresh"]);
  });

  it("gives a failure a longer dwell than a success", () => {
    const failed = activity("failed", "error", {
      stateChangedAt: NOW - AGENT_LIVE_ACTIVITY_COMPLETED_DWELL_MS - 1_000,
    });
    expect(buildAgentLiveActivitySummary([failed], NOW).total).toBe(1);
    expect(
      buildAgentLiveActivitySummary(
        [
          activity("failed", "error", {
            stateChangedAt: NOW - AGENT_LIVE_ACTIVITY_ERROR_DWELL_MS - 1,
          }),
        ],
        NOW,
      ).total,
    ).toBe(0);
  });

  it("caps the item list and reports the overflow", () => {
    const activities = Array.from({ length: 4 }, (_unused, index) =>
      activity(`working-${index}`, "working"),
    );
    const summary = buildAgentLiveActivitySummary(activities, NOW, 2);
    expect(summary.items).toHaveLength(2);
    expect(summary.overflowCount).toBe(2);
    expect(summary.total).toBe(4);
  });
});

describe("nextAgentLiveActivityRefreshAt", () => {
  it("returns the earliest dwell expiry still ahead", () => {
    const completed = activity("completed", "completed", { stateChangedAt: NOW });
    const failed = activity("failed", "error", { stateChangedAt: NOW });
    expect(nextAgentLiveActivityRefreshAt([completed, failed], NOW)).toBe(
      NOW + AGENT_LIVE_ACTIVITY_COMPLETED_DWELL_MS,
    );
  });

  it("returns null when nothing is on a timer", () => {
    expect(nextAgentLiveActivityRefreshAt([activity("working", "working")], NOW)).toBeNull();
    expect(
      nextAgentLiveActivityRefreshAt([activity("seen", "completed", { unseen: false })], NOW),
    ).toBeNull();
  });
});
