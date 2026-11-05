import { describe, expect, it } from "vitest";
import { isClawMuseStatusHomeDeepLink, isClawMuseStatusHomeNotification } from "./deep-link";

describe("isClawMuseStatusHomeDeepLink", () => {
  it("accepts both registered schemes", () => {
    expect(isClawMuseStatusHomeDeepLink("clawmuse://home?focus=agent-activity")).toBe(true);
    expect(isClawMuseStatusHomeDeepLink("paseo://home?focus=agent-activity")).toBe(true);
  });

  it("rejects other schemes, hosts, paths, and focus values", () => {
    expect(isClawMuseStatusHomeDeepLink("https://home?focus=agent-activity")).toBe(false);
    expect(isClawMuseStatusHomeDeepLink("clawmuse://settings?focus=agent-activity")).toBe(false);
    expect(isClawMuseStatusHomeDeepLink("clawmuse://home/agent?focus=agent-activity")).toBe(false);
    expect(isClawMuseStatusHomeDeepLink("clawmuse://home?focus=workspace")).toBe(false);
    expect(isClawMuseStatusHomeDeepLink("not a url")).toBe(false);
  });
});

describe("isClawMuseStatusHomeNotification", () => {
  it("matches an aggregate alert carrying the home deep link", () => {
    expect(
      isClawMuseStatusHomeNotification({
        status: { deepLink: "clawmuse://home?focus=agent-activity" },
      }),
    ).toBe(true);
  });

  it("ignores Paseo's own per-agent notification payloads", () => {
    expect(isClawMuseStatusHomeNotification({ serverId: "a", agentId: "b" })).toBe(false);
    expect(isClawMuseStatusHomeNotification({ status: { deepLink: "clawmuse://home" } })).toBe(
      false,
    );
    expect(isClawMuseStatusHomeNotification(null)).toBe(false);
  });
});
