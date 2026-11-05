import type { RelayRouteInfo } from "@getpaseo/client/internal/daemon-client";

export function connectionRouteStatus(info: RelayRouteInfo | null, now = Date.now()) {
  if (!info) return "unknown";
  const age = now - Date.parse(info.observedAt);
  if (!Number.isFinite(age) || age < -60_000 || age > 90_000) return "unknown";
  const leg = info.client;
  if (leg.path === "direct") return "direct";
  if (leg.path === "public-fallback") return "publicFallback";
  // The trusted ingress identifies the path; uplink telemetry only names its carrier.
  if (leg.path === "private") return "private";
  return "unknown";
}

export function connectionRouteCode(info: RelayRouteInfo | null, now = Date.now()): string {
  const status = connectionRouteStatus(info, now);
  if (status === "direct") return "zl";
  if (status === "private") return "zx";
  return "--";
}
