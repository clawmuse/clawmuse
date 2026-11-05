import { describe, expect, it } from "vitest";
import {
  buildAgentLiveActivitySummary,
  type AgentLiveActivity,
  type AgentLiveActivityPhase,
} from "./agent-live-activity";
import {
  CLAWMUSE_LIVE_ACTIVITY_DEEP_LINK,
  INITIAL_CLAWMUSE_LIVE_ACTIVITY_STATE,
  buildClawMuseLiveActivityPayload,
  planClawMuseLiveActivityAction,
  type ClawMuseLiveActivityCopy,
} from "./system-live-activity";

const NOW = 1_000_000;

const COPY: ClawMuseLiveActivityCopy = {
  phase: {
    attention: "Needs you",
    error: "Failed",
    completed: "Done",
    working: "Working",
    monitoring: "Monitoring",
    unverifiable: "Unverifiable",
  },
  compactCount: (status, total) => `${status} · ${total}`,
};

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
    startedAt: NOW,
    stateChangedAt: NOW,
    updatedAt: NOW,
    unseen: true,
    ...overrides,
  };
}

describe("buildClawMuseLiveActivityPayload", () => {
  it("returns null with nothing to show", () => {
    expect(
      buildClawMuseLiveActivityPayload(buildAgentLiveActivitySummary([], NOW), COPY),
    ).toBeNull();
  });

  it("counts the phases the capsule renders and carries the fixed deep link", () => {
    const summary = buildAgentLiveActivitySummary(
      [
        activity("attention", "attention"),
        activity("working", "working"),
        activity("unverifiable", "unverifiable"),
      ],
      NOW,
    );
    const payload = buildClawMuseLiveActivityPayload(summary, COPY);
    expect(payload).toMatchObject({
      phase: "attention",
      status: "Needs you",
      compact: "Needs you · 3",
      activeCount: 3,
      needsActionCount: 1,
      runningCount: 1,
      unverifiableCount: 1,
      connectionState: "unverifiable",
      deepLink: CLAWMUSE_LIVE_ACTIVITY_DEEP_LINK,
    });
  });

  it("omits the count suffix for a single item", () => {
    const summary = buildAgentLiveActivitySummary([activity("working", "working")], NOW);
    expect(buildClawMuseLiveActivityPayload(summary, COPY)?.compact).toBe("Working");
  });

  it("passes the workspace and detail through when present", () => {
    const summary = buildAgentLiveActivitySummary(
      [activity("working", "working", { detail: "claude", workspaceLabel: "paseo · Studio" })],
      NOW,
    );
    expect(buildClawMuseLiveActivityPayload(summary, COPY)).toMatchObject({
      detail: "claude",
      workspace: "paseo · Studio",
    });
  });
});

describe("planClawMuseLiveActivityAction", () => {
  it("syncs once and then goes quiet for an unchanged payload", () => {
    const summary = buildAgentLiveActivitySummary([activity("working", "working")], NOW);
    const first = planClawMuseLiveActivityAction(
      INITIAL_CLAWMUSE_LIVE_ACTIVITY_STATE,
      summary,
      COPY,
    );
    expect(first.action.type).toBe("sync");
    expect(planClawMuseLiveActivityAction(first.state, summary, COPY).action.type).toBe("none");
  });

  it("refreshes unchanged local counts before ActivityKit marks them stale", () => {
    const summary = buildAgentLiveActivitySummary([activity("working", "working")], NOW);
    const first = planClawMuseLiveActivityAction(
      INITIAL_CLAWMUSE_LIVE_ACTIVITY_STATE,
      summary,
      COPY,
      [],
      NOW,
    );
    expect(
      planClawMuseLiveActivityAction(first.state, summary, COPY, [], NOW + 59_999).action.type,
    ).toBe("none");
    const refreshed = planClawMuseLiveActivityAction(first.state, summary, COPY, [], NOW + 60_000);
    expect(refreshed.action).toMatchObject({
      type: "sync",
      payload: { runningCount: 1, updatedAt: NOW + 60_000 },
    });
  });

  it("syncs again when the usage figures move", () => {
    const summary = buildAgentLiveActivitySummary([activity("working", "working")], NOW);
    const first = planClawMuseLiveActivityAction(
      INITIAL_CLAWMUSE_LIVE_ACTIVITY_STATE,
      summary,
      COPY,
    );
    const next = planClawMuseLiveActivityAction(first.state, summary, COPY, [
      { provider: "claude", session: { usedPercent: 37, windowMinutes: 300 }, weekly: null },
    ]);
    expect(next.action.type).toBe("sync");
  });

  it("clears the displayed counts when the last task leaves the capsule", () => {
    const first = planClawMuseLiveActivityAction(
      INITIAL_CLAWMUSE_LIVE_ACTIVITY_STATE,
      buildAgentLiveActivitySummary([activity("working", "working")], NOW),
      COPY,
      [],
      NOW,
    );
    const idle = planClawMuseLiveActivityAction(
      first.state,
      buildAgentLiveActivitySummary([], NOW + 1),
      COPY,
      [],
      NOW + 1,
    );
    expect(idle.action).toMatchObject({
      type: "sync",
      payload: {
        phase: "monitoring",
        runningCount: 0,
        needsActionCount: 0,
        completedUnreadCount: 0,
        unverifiableCount: 0,
        activeCount: 0,
        connectionState: "live",
        updatedAt: NOW + 1,
      },
    });
  });

  it("does nothing when there is no primary item", () => {
    const plan = planClawMuseLiveActivityAction(
      INITIAL_CLAWMUSE_LIVE_ACTIVITY_STATE,
      buildAgentLiveActivitySummary([], NOW),
      COPY,
    );
    expect(plan.action.type).toBe("none");
    expect(plan.state).toBe(INITIAL_CLAWMUSE_LIVE_ACTIVITY_STATE);
  });
});
