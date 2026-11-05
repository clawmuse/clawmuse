/** Relay-reported network metadata. It never establishes daemon identity or trust. */
export interface RelayRoutePlace {
  id: string;
  label: string;
}
export interface RelayRouteLeg {
  ingress: RelayRoutePlace;
  path: "direct" | "private" | "public-fallback" | "unknown";
  uplink: (RelayRoutePlace & { fallback: boolean; observedAt: string; expiresAt: string }) | null;
}
export interface RelayRouteInfo {
  version: 1;
  observedAt: string;
  relay: RelayRoutePlace;
  client: RelayRouteLeg;
  daemon: RelayRouteLeg | null;
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const label = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 80 &&
  Array.from(value).every((char) => char.charCodeAt(0) > 31 && char.charCodeAt(0) !== 127);
const place = (value: unknown): value is RelayRoutePlace & Record<string, unknown> =>
  record(value) && label(value.id) && label(value.label);
const date = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

function leg(value: unknown, now: number): RelayRouteLeg | null {
  if (
    !record(value) ||
    !place(value.ingress) ||
    !["direct", "private", "public-fallback", "unknown"].includes(String(value.path))
  )
    return null;
  const input = value.uplink;
  const uplink =
    value.path === "private" &&
    place(input) &&
    record(input) &&
    typeof input.fallback === "boolean" &&
    date(input.observedAt) &&
    date(input.expiresAt) &&
    Date.parse(input.observedAt) <= now + 60_000 &&
    Date.parse(input.expiresAt) > now &&
    Date.parse(input.expiresAt) > Date.parse(input.observedAt) &&
    Date.parse(input.expiresAt) - Date.parse(input.observedAt) <= 180_000
      ? {
          id: input.id,
          label: input.label,
          fallback: input.fallback,
          observedAt: input.observedAt,
          expiresAt: input.expiresAt,
        }
      : null;
  return {
    ingress: { id: value.ingress.id, label: value.ingress.label },
    path: value.path as RelayRouteLeg["path"],
    uplink,
  };
}

export function parseRelayRouteInfo(value: unknown, now = Date.now()): RelayRouteInfo | null {
  if (!record(value) || value.version !== 1 || !place(value.relay) || !date(value.observedAt))
    return null;
  const age = now - Date.parse(value.observedAt);
  if (age < -60_000 || age > 90_000) return null;
  const client = leg(value.client, now);
  const daemon = value.daemon === null ? null : leg(value.daemon, now);
  if (!client || (value.daemon !== null && !daemon)) return null;
  return {
    version: 1,
    observedAt: value.observedAt,
    relay: { id: value.relay.id, label: value.relay.label },
    client,
    daemon,
  };
}

/** Each WebSocket attempt gets a separate read capability; no daemon credential is sent. */
export function relayRouteAttempt(
  url: string,
): { url: string; routeUrl: string; token: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (
    !["wss:", "ws:"].includes(parsed.protocol) ||
    parsed.pathname !== "/ws" ||
    parsed.searchParams.get("role") !== "client" ||
    parsed.searchParams.get("v") !== "2" ||
    parsed.username ||
    parsed.password ||
    typeof globalThis.crypto?.randomUUID !== "function"
  )
    return null;
  const token = globalThis.crypto.randomUUID();
  parsed.searchParams.set("routeToken", token);
  const socketUrl = parsed.toString();
  parsed.protocol = parsed.protocol === "wss:" ? "https:" : "http:";
  parsed.pathname = "/route";
  parsed.search = "";
  parsed.hash = "";
  return { url: socketUrl, routeUrl: parsed.toString(), token };
}
