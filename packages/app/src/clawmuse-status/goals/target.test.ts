import { describe, expect, it } from "vitest";

import { initialGoalTarget, joinGoalAgent, resolveModelSourceHost, splitGoalAgent } from "./target";
import type { GoalRepo } from "./types";

const repo: GoalRepo = {
  repoKey: "remote:github.com/acme/app",
  displayName: "acme/app",
  planEnabled: false,
  lastPlannedAt: null,
  preferredHostId: "host-b",
  planAgent: "claude/claude-haiku-5-5",
  executeAgent: "claude/claude-opus-5-5",
  lastPlanRun: null,
  hosts: [
    {
      hostId: "host-a",
      relayHostId: "relay-a",
      displayName: "工作电脑",
      connectivity: "unverifiable",
    },
    { hostId: "host-b", relayHostId: "relay-b", displayName: "家里的服务器", connectivity: "live" },
  ],
  suggestedCount: 0,
  activeCount: 0,
};

describe("goal targets", () => {
  it("splits and joins provider/model strings", () => {
    expect(splitGoalAgent("claude/claude-opus-5-5")).toEqual({
      provider: "claude",
      model: "claude-opus-5-5",
    });
    expect(splitGoalAgent("codex")).toEqual({ provider: "codex", model: "" });
    expect(splitGoalAgent(null)).toEqual({ provider: "", model: "" });
    expect(joinGoalAgent("claude", "claude-opus-5-5")).toBe("claude/claude-opus-5-5");
    expect(joinGoalAgent("codex", "")).toBe("codex");
    expect(joinGoalAgent("", "x")).toBeNull();
  });

  it("starts from the remembered choice for the kind of run", () => {
    expect(initialGoalTarget({ repo, kind: "execute" })).toEqual({
      hostId: "host-b",
      agent: "claude/claude-opus-5-5",
    });
    expect(initialGoalTarget({ repo, kind: "plan" })).toEqual({
      hostId: "host-b",
      agent: "claude/claude-haiku-5-5",
    });
  });

  it("prefers the goal's own target and drops a host that lost the repository", () => {
    expect(
      initialGoalTarget({ repo, kind: "execute", own: { hostId: "host-a", agent: "codex" } }),
    ).toEqual({ hostId: "host-a", agent: "codex" });
    expect(
      initialGoalTarget({ repo: { ...repo, preferredHostId: "gone" }, kind: "execute" }).hostId,
    ).toBeNull();
    expect(initialGoalTarget({ repo: null, kind: "execute" })).toEqual({
      hostId: null,
      agent: null,
    });
  });

  it("reads models from the chosen host, or the first live paired host when automatic", () => {
    const paired = (relay: string) => ({ "relay-a": "srv-a", "relay-b": "srv-b" })[relay] ?? null;
    expect(
      resolveModelSourceHost({ repo, hostId: "host-a", serverIdForRelayHost: paired })?.serverId,
    ).toBe("srv-a");
    expect(
      resolveModelSourceHost({ repo, hostId: null, serverIdForRelayHost: paired })?.serverId,
    ).toBe("srv-b");
    expect(
      resolveModelSourceHost({ repo, hostId: "host-a", serverIdForRelayHost: () => null }),
    ).toBeNull();
  });
});
