import { existsSync } from "node:fs";
import path from "node:path";
import { brand } from "../brand.generated.js";
import { savePendingRelaySelection } from "./clawmuse-status/relay-selection-report.js";
import { editPersistedConfig } from "./persisted-config.js";
import type { PaseoDaemonConfig } from "./bootstrap.js";
import type { Logger } from "pino";

export async function resolveRegionalRelayConfig(
  config: PaseoDaemonConfig,
  logger?: Pick<Logger, "info" | "warn">,
): Promise<PaseoDaemonConfig> {
  if (!config.relayAutoSelect) return config;
  // Existing installations may have shared offers for the legacy overseas relay. Keep that
  // origin when upgrading; the new overseas hostname reaches the same relay as the old one.
  const endpoint = existsSync(path.join(config.paseoHome, "server-id"))
    ? brand.relayEndpoint
    : await selectAndRecordRegionalRelay(config.paseoHome, logger);
  // Keep existing offers valid across restarts and offline pairing. An explicit endpoint also
  // prevents a transient probe result from moving one device between independent origins.
  const persisted = editPersistedConfig(config.paseoHome, "daemon.relay.endpoint", {
    value: endpoint,
  });
  logger?.info({ endpoint }, "Selected regional ClawMuse relay");
  return {
    ...config,
    relayAutoSelect: false,
    relayEndpoint: endpoint,
    relayPublicEndpoint: getHostedRelayPublicEndpoint(endpoint),
    ...(config.configReload
      ? { configReload: { ...config.configReload, startupPersisted: persisted } }
      : {}),
  };
}

async function selectAndRecordRegionalRelay(
  paseoHome: string,
  logger: Pick<Logger, "warn"> | undefined,
): Promise<string> {
  const selection = await selectRegionalRelay(brand.regionalRelayEndpoints, brand.relayEndpoint);
  // Reported later, once a status host session exists; first run is usually not linked yet.
  // Telemetry is best effort: a write failure must not stop the daemon from starting.
  try {
    savePendingRelaySelection(paseoHome, selection);
  } catch (error) {
    logger?.warn({ err: error }, "Failed to record the regional relay selection for reporting");
  }
  return selection.selected;
}

/** One probed origin: `ms` is the time to a ready answer, absent when the origin was not ready. */
export type RegionalRelayProbe =
  | { endpoint: string; ok: true; ms: number }
  | { endpoint: string; ok: false; ms: null };

export interface RegionalRelaySelection {
  selected: string;
  probes: RegionalRelayProbe[];
}

/** Select the initial origin; both peers keep the selected origin in the offer. */
export async function selectRegionalRelay(
  endpoints: readonly string[],
  fallback: string,
  request: typeof fetch = fetch,
): Promise<RegionalRelaySelection> {
  const probes = await Promise.all(
    endpoints.map(async (endpoint): Promise<RegionalRelayProbe> => {
      const start = performance.now();
      const failed: RegionalRelayProbe = { endpoint, ok: false, ms: null };
      try {
        const response = await request(`https://${endpoint}/ready`, {
          signal: AbortSignal.timeout(1500),
          redirect: "error",
          cache: "no-store",
        });
        const body: unknown = await response.json();
        if (
          !response.ok ||
          typeof body !== "object" ||
          body === null ||
          !("status" in body) ||
          body.status !== "ready"
        )
          return failed;
        return { endpoint, ok: true, ms: Math.round(performance.now() - start) };
      } catch {
        return failed;
      }
    }),
  );
  const fastest = probes
    .filter((probe): probe is Extract<RegionalRelayProbe, { ok: true }> => probe.ok)
    .sort((a, b) => a.ms - b.ms)[0];
  return { selected: fastest?.endpoint ?? fallback, probes };
}

/** Filed public aliases keep mainland ingress usable without moving the origin. */
export function getHostedRelayPublicEndpoint(endpoint: string): string {
  return (
    Object.entries(brand.relayPublicEndpoints).find(([origin]) => origin === endpoint)?.[1] ??
    endpoint
  );
}
