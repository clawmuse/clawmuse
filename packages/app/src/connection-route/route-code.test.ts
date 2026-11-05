import { describe, expect, it } from "vitest";
import type { RelayRouteInfo, RelayRouteLeg } from "@getpaseo/client/internal/daemon-client";
import { connectionRouteCode, connectionRouteStatus } from "./route-code";

const now = Date.parse("2026-10-28T12:00:00Z");
const direct: RelayRouteLeg = {
  ingress: { id: "sg", label: "Singapore" },
  path: "direct",
  uplink: null,
};
function privateLeg(id: string): RelayRouteLeg {
  return {
    ...direct,
    path: "private",
    uplink: {
      id,
      label: "Private carrier",
      fallback: false,
      observedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 180_000).toISOString(),
    },
  };
}
function info(client = direct, daemon: RelayRouteLeg | null = direct): RelayRouteInfo {
  return {
    version: 1,
    observedAt: new Date(now).toISOString(),
    relay: direct.ingress,
    client,
    daemon,
  };
}

describe("connectionRouteStatus", () => {
  it("shows only the device leg, regardless of the computer route", () => {
    expect(connectionRouteStatus(info(), now)).toBe("direct");
    expect(connectionRouteStatus(info(direct, privateLeg("shenzhen-hk")), now)).toBe("direct");
    expect(connectionRouteStatus(info(privateLeg("shenzhen-hk")), now)).toBe("private");
    expect(connectionRouteStatus(info(privateLeg("shenzhen-hk"), privateLeg("sg")), now)).toBe(
      "private",
    );
  });
  it("accepts observed carriers without a hardcoded carrier registry", () => {
    expect(connectionRouteStatus(info(privateLeg("new-carrier"), null), now)).toBe("private");
    const backup = privateLeg("sg");
    backup.uplink!.fallback = true;
    expect(connectionRouteStatus(info(backup), now)).toBe("private");
  });
  it("does not label public fallback as direct or private", () => {
    expect(connectionRouteStatus(info({ ...direct, path: "public-fallback" }), now)).toBe(
      "publicFallback",
    );
  });
  it("labels a confirmed private ingress even without current carrier telemetry", () => {
    const unreported = info({ ...direct, path: "private" });
    expect(connectionRouteCode(unreported, now)).toBe("zx");
    const expired = privateLeg("shenzhen-hk");
    expired.uplink!.expiresAt = new Date(now).toISOString();
    expect(connectionRouteCode(info(expired), now)).toBe("zx");
    expect(connectionRouteCode(unreported, now + 90_001)).toBe("--");
  });
  it("does not infer a route from missing or stale observations", () => {
    expect(connectionRouteStatus(null, now)).toBe("unknown");
    expect(connectionRouteStatus(info({ ...direct, path: "unknown" }), now)).toBe("unknown");
    expect(connectionRouteStatus(info(), now + 90_001)).toBe("unknown");
    expect(connectionRouteStatus(info(), now - 60_001)).toBe("unknown");
    expect(connectionRouteStatus({ ...info(), observedAt: "invalid" }, now)).toBe("unknown");
  });
});

describe("connectionRouteCode", () => {
  it("uses short device-route labels without a computer-route suffix", () => {
    expect(connectionRouteCode(info(), now)).toBe("zl");
    expect(connectionRouteCode(info(privateLeg("shenzhen-hk")), now)).toBe("zx");
    expect(connectionRouteCode(info(privateLeg("shenzhen-hk"), privateLeg("sg")), now)).toBe("zx");
    expect(connectionRouteCode(null, now)).toBe("--");
    expect(connectionRouteCode(info({ ...direct, path: "public-fallback" }), now)).toBe("--");
  });
});
