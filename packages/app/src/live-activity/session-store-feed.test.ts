import { describe, expect, it } from "vitest";
import {
  buildClawMuseLiveActivities,
  resolveAgentLiveActivityPhase,
  type LiveActivityAgentSnapshot,
} from "./session-store-feed";

const NOW = 1_000_000;

function agent(overrides: Partial<LiveActivityAgentSnapshot> = {}): LiveActivityAgentSnapshot {
  return {
    serverId: "server-1",
    agentId: "agent-1",
    title: "Fix the parser",
    providerLabel: "claude",
    workspaceLabel: "paseo",
    lifecycle: "idle",
    turnOpen: false,
    pendingPermissionCount: 0,
    requiresAttention: false,
    attentionReason: null,
    attentionAt: null,
    lastActivityAt: NOW,
    updatedAt: NOW,
    archived: false,
    ...overrides,
  };
}

const ONLINE = new Set(["server-1"]);
const NO_HOST_NAMES = new Map<string, string>();
const NOTHING_ACKNOWLEDGED = new Set<string>();

describe("resolveAgentLiveActivityPhase", () => {
  it("puts a waiting permission above everything else", () => {
    expect(
      resolveAgentLiveActivityPhase(
        agent({ pendingPermissionCount: 1, turnOpen: true, lifecycle: "running" }),
      ),
    ).toBe("attention");
    expect(resolveAgentLiveActivityPhase(agent({ attentionReason: "permission" }))).toBe(
      "attention",
    );
  });

  it("maps the remaining attention reasons and the lifecycle", () => {
    expect(resolveAgentLiveActivityPhase(agent({ attentionReason: "error" }))).toBe("error");
    expect(resolveAgentLiveActivityPhase(agent({ lifecycle: "error" }))).toBe("error");
    expect(resolveAgentLiveActivityPhase(agent({ attentionReason: "finished" }))).toBe("completed");
    expect(resolveAgentLiveActivityPhase(agent({ turnOpen: true }))).toBe("working");
    expect(resolveAgentLiveActivityPhase(agent({ lifecycle: "running" }))).toBe("working");
  });

  it("has nothing to report for an idle, archived, or closed agent", () => {
    expect(resolveAgentLiveActivityPhase(agent())).toBeNull();
    expect(resolveAgentLiveActivityPhase(agent({ archived: true, turnOpen: true }))).toBeNull();
    expect(
      resolveAgentLiveActivityPhase(agent({ lifecycle: "closed", turnOpen: true })),
    ).toBeNull();
  });
});

describe("buildClawMuseLiveActivities", () => {
  it("marks in-flight work on an unreachable host as unverifiable", () => {
    const activities = buildClawMuseLiveActivities({
      agents: [agent({ turnOpen: true })],
      connectedServerIds: new Set(),
      hostNamesByServerId: NO_HOST_NAMES,
      acknowledgedEventIds: NOTHING_ACKNOWLEDGED,
    });
    expect(activities[0]?.phase).toBe("unverifiable");
  });

  it("keeps a terminal phase the phone already observed", () => {
    const activities = buildClawMuseLiveActivities({
      agents: [agent({ attentionReason: "finished", requiresAttention: true })],
      connectedServerIds: new Set(),
      hostNamesByServerId: NO_HOST_NAMES,
      acknowledgedEventIds: NOTHING_ACKNOWLEDGED,
    });
    expect(activities[0]?.phase).toBe("completed");
  });

  it("dates the state change from the attention timestamp", () => {
    const activities = buildClawMuseLiveActivities({
      agents: [
        agent({ attentionReason: "error", attentionAt: NOW - 5_000, requiresAttention: true }),
      ],
      connectedServerIds: ONLINE,
      hostNamesByServerId: NO_HOST_NAMES,
      acknowledgedEventIds: NOTHING_ACKNOWLEDGED,
    });
    expect(activities[0]?.stateChangedAt).toBe(NOW - 5_000);
    expect(activities[0]?.unseen).toBe(true);
  });

  it("treats an acknowledged event as seen", () => {
    const activities = buildClawMuseLiveActivities({
      agents: [agent({ attentionReason: "finished", requiresAttention: true, attentionAt: NOW })],
      connectedServerIds: ONLINE,
      hostNamesByServerId: NO_HOST_NAMES,
      acknowledgedEventIds: new Set([`server-1/agent-1@${NOW}`]),
    });
    expect(activities[0]?.unseen).toBe(false);
  });

  it("appends the host name to the workspace label when several hosts are paired", () => {
    const activities = buildClawMuseLiveActivities({
      agents: [agent({ turnOpen: true })],
      connectedServerIds: ONLINE,
      hostNamesByServerId: new Map([["server-1", "Studio"]]),
      acknowledgedEventIds: NOTHING_ACKNOWLEDGED,
    });
    expect(activities[0]?.workspaceLabel).toBe("paseo · Studio");
  });

  it("falls back to the provider when the agent has no title", () => {
    const activities = buildClawMuseLiveActivities({
      agents: [agent({ title: null, turnOpen: true })],
      connectedServerIds: ONLINE,
      hostNamesByServerId: NO_HOST_NAMES,
      acknowledgedEventIds: NOTHING_ACKNOWLEDGED,
    });
    expect(activities[0]?.title).toBe("claude");
    expect(activities[0]?.detail).toBeNull();
  });

  it("skips agents with nothing to report", () => {
    expect(
      buildClawMuseLiveActivities({
        agents: [agent(), agent({ agentId: "agent-2", archived: true, turnOpen: true })],
        connectedServerIds: ONLINE,
        hostNamesByServerId: NO_HOST_NAMES,
        acknowledgedEventIds: NOTHING_ACKNOWLEDGED,
      }),
    ).toEqual([]);
  });
});
