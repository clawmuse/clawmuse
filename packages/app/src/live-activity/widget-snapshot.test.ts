import { describe, expect, it } from "vitest";
import type { ClawMuseStatusSummary } from "@/clawmuse-status/summary";
import type { ClawMuseProviderPlan } from "@/clawmuse-status/usage-windows";
import {
  buildAgentLiveActivitySummary,
  type AgentLiveActivity,
  type AgentLiveActivityPhase,
} from "./agent-live-activity";
import { mergePlanUsages } from "./widget-plan-usages";
import { buildAgentWidgetSnapshot, widgetSnapshotFingerprint } from "./widget-snapshot";

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
    workspaceLabel: "paseo · Studio",
    startedAt: NOW,
    stateChangedAt: NOW,
    updatedAt: NOW,
    unseen: true,
    ...overrides,
  };
}

const STATUS: ClawMuseStatusSummary = {
  connectivity: "live",
  runningCount: 7,
  needsActionCount: 2,
  completedUnreadCount: 1,
  unverifiableCount: 0,
  observedAt: "2026-08-30T12:00:20.000Z",
  goals: null,
  usages: [
    {
      provider: "minimax",
      label: "MiniMax",
      session: { usedPercent: 20, windowMinutes: 300, resetsAt: 2_000_000, unlimited: false },
      weekly: null,
      updatedAt: null,
    },
  ],
  hosts: [],
};

const CLAUDE_PLAN: ClawMuseProviderPlan = {
  provider: "claude",
  name: "Claude",
  planLabel: null,
  session: { usedPercent: 37, windowMinutes: 300, resetsAt: 2_000_000, unlimited: false },
  weekly: null,
};

describe("buildAgentWidgetSnapshot", () => {
  it("takes counts from the service and task titles from the hosts", () => {
    const snapshot = buildAgentWidgetSnapshot({
      activities: buildAgentLiveActivitySummary([activity("a", "working")], NOW),
      status: STATUS,
      hostPlans: [],
      now: NOW,
    });
    expect(snapshot.runningCount).toBe(7);
    expect(snapshot.tasks).toHaveLength(1);
    // The feed appends " · <host>"; the widget's name column shows the workspace alone.
    expect(snapshot.tasks[0]).toMatchObject({ repo: "paseo", title: "a", phase: "working" });
    expect(snapshot.updatedAt).toBe(Math.floor(NOW / 1_000));
  });

  it("falls back to its own counts when the service has said nothing yet", () => {
    const snapshot = buildAgentWidgetSnapshot({
      activities: buildAgentLiveActivitySummary(
        [activity("a", "attention"), activity("b", "unverifiable")],
        NOW,
      ),
      status: null,
      hostPlans: [],
      now: NOW,
    });
    expect(snapshot).toMatchObject({
      needsActionCount: 1,
      unverifiableCount: 1,
      connectionState: "unverifiable",
    });
  });

  it("keeps at most three tasks, most urgent first", () => {
    const snapshot = buildAgentWidgetSnapshot({
      activities: buildAgentLiveActivitySummary(
        [
          activity("working-1", "working"),
          activity("working-2", "working"),
          activity("working-3", "working"),
          activity("attention", "attention"),
        ],
        NOW,
      ),
      status: null,
      hostPlans: [],
      now: NOW,
    });
    expect(snapshot.tasks).toHaveLength(3);
    expect(snapshot.tasks[0]?.phase).toBe("attention");
  });
});

describe("mergePlanUsages", () => {
  it("puts host plans first and converts reset times to epoch seconds", () => {
    const usages = mergePlanUsages([CLAUDE_PLAN], STATUS.usages);
    expect(usages.map((usage) => usage.provider)).toEqual(["claude", "minimax"]);
    expect(usages[0]?.session?.resetsAt).toBe(2_000);
  });

  it("drops a service entry for a provider a host already reported", () => {
    const duplicate = { ...STATUS.usages[0]!, provider: "claude" };
    expect(mergePlanUsages([CLAUDE_PLAN], [duplicate])).toHaveLength(1);
  });

  it("drops a service entry with no windows at all", () => {
    expect(
      mergePlanUsages(
        [],
        [{ provider: "zai", label: null, session: null, weekly: null, updatedAt: null }],
      ),
    ).toEqual([]);
  });
});

describe("widgetSnapshotFingerprint", () => {
  it("ignores the timestamp so an unchanged picture does not rewrite the App Group", () => {
    const input = {
      activities: buildAgentLiveActivitySummary([activity("a", "working")], NOW),
      status: STATUS,
      hostPlans: [CLAUDE_PLAN],
    };
    expect(widgetSnapshotFingerprint(buildAgentWidgetSnapshot({ ...input, now: NOW }))).toBe(
      widgetSnapshotFingerprint(buildAgentWidgetSnapshot({ ...input, now: NOW + 60_000 })),
    );
  });
});
