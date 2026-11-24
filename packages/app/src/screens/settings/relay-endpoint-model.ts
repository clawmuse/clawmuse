import { normalizeHostPort } from "@/utils/daemon-endpoints";

export type RelayNodeId = "guangzhou" | "singapore";
export type RelaySelectionMode = RelayNodeId | "custom";

export interface HostedRelayBrandConfig {
  relayEndpoint: string;
  relayEndpoints: readonly string[];
  regionalRelayEndpoints: readonly string[];
  relayPublicEndpoints: Readonly<Record<string, string>>;
}

export interface RelayNodePreset {
  id: RelayNodeId;
  endpoint: string;
  publicEndpoint: string;
  aliases: readonly string[];
}

export interface RelayProbeSample {
  endpoint: string;
  publicEndpoint: string;
  ok: boolean;
  ms: number | null;
}

export interface RelaySwitchRecommendation {
  targetNode: RelayNodeId;
  targetEndpoint: string;
  targetPublicEndpoint: string;
  targetMs: number;
  currentMs: number | null;
}

const RECOMMENDATION_MIN_GAIN_MS = 20;

function isGuangzhouRelayEndpoint(endpoint: string): boolean {
  return endpoint.toLowerCase().includes("-cn.");
}

export function resolveHostedRelayPresets(brandConfig: HostedRelayBrandConfig): RelayNodePreset[] {
  const presets: RelayNodePreset[] = [];
  for (const endpoint of brandConfig.regionalRelayEndpoints) {
    const id: RelayNodeId = isGuangzhouRelayEndpoint(endpoint) ? "guangzhou" : "singapore";
    if (presets.some((preset) => preset.id === id)) continue;
    const publicEndpoint = brandConfig.relayPublicEndpoints[endpoint] ?? endpoint;
    const aliases = new Set<string>([endpoint, publicEndpoint]);
    for (const candidate of brandConfig.relayEndpoints) {
      if (isGuangzhouRelayEndpoint(candidate) === (id === "guangzhou")) {
        aliases.add(candidate);
      }
    }
    presets.push({
      id,
      endpoint,
      publicEndpoint,
      aliases: Array.from(aliases),
    });
  }
  return presets.sort((a, b) => {
    if (a.id === b.id) return 0;
    return a.id === "guangzhou" ? -1 : 1;
  });
}

export function classifyRelaySelection(
  relay: { endpoint?: string; publicEndpoint?: string; useTls?: boolean } | null | undefined,
  presets: readonly RelayNodePreset[],
): RelaySelectionMode {
  const endpoint = relay?.endpoint?.trim();
  if (!endpoint) return "custom";
  if (relay?.useTls === false) return "custom";
  const matched = presets.find((preset) => preset.aliases.includes(endpoint));
  if (!matched) return "custom";
  const publicEndpoint = relay?.publicEndpoint?.trim();
  if (publicEndpoint && !matched.aliases.includes(publicEndpoint)) {
    return "custom";
  }
  return matched.id;
}

export function findProbeForPreset(
  preset: RelayNodePreset,
  probes: readonly RelayProbeSample[],
): RelayProbeSample | null {
  return (
    probes.find(
      (probe) =>
        preset.aliases.includes(probe.endpoint) || preset.aliases.includes(probe.publicEndpoint),
    ) ?? null
  );
}

export function recommendRelayNode(input: {
  currentMode: RelaySelectionMode;
  presets: readonly RelayNodePreset[];
  probes: readonly RelayProbeSample[];
}): RelaySwitchRecommendation | null {
  if (input.currentMode === "custom") return null;
  const currentPreset = input.presets.find((preset) => preset.id === input.currentMode);
  if (!currentPreset) return null;
  const currentProbe = findProbeForPreset(currentPreset, input.probes);
  const currentMs = currentProbe?.ok && currentProbe.ms !== null ? currentProbe.ms : null;

  let best: RelaySwitchRecommendation | null = null;
  for (const candidate of input.presets) {
    if (candidate.id === input.currentMode) continue;
    const probe = findProbeForPreset(candidate, input.probes);
    if (!probe?.ok || probe.ms === null) continue;
    const isUnreachableCurrent = currentProbe !== null && !currentProbe.ok;
    const isSignificantlyFaster =
      currentMs !== null && currentMs - probe.ms >= RECOMMENDATION_MIN_GAIN_MS;
    if (!isUnreachableCurrent && !isSignificantlyFaster) continue;
    if (!best || probe.ms < best.targetMs) {
      best = {
        targetNode: candidate.id,
        targetEndpoint: candidate.endpoint,
        targetPublicEndpoint: candidate.publicEndpoint,
        targetMs: probe.ms,
        currentMs,
      };
    }
  }
  return best;
}

export interface CustomRelayDraftValidation {
  ok: true;
  endpoint: string;
  publicEndpoint: string;
  useTls: boolean;
}

export interface CustomRelayDraftError {
  ok: false;
  field: "endpoint" | "publicEndpoint";
  message: string;
}

export function validateCustomRelayDraft(input: {
  endpoint: string;
  publicEndpoint: string;
  useTls: boolean;
}): CustomRelayDraftValidation | CustomRelayDraftError {
  let normalizedEndpoint: string;
  try {
    normalizedEndpoint = normalizeHostPort(input.endpoint);
  } catch (error) {
    return {
      ok: false,
      field: "endpoint",
      message: error instanceof Error ? error.message : "Invalid host:port",
    };
  }
  const trimmedPublic = input.publicEndpoint.trim();
  if (!trimmedPublic) {
    return {
      ok: true,
      endpoint: normalizedEndpoint,
      publicEndpoint: "",
      useTls: input.useTls,
    };
  }
  try {
    return {
      ok: true,
      endpoint: normalizedEndpoint,
      publicEndpoint: normalizeHostPort(trimmedPublic),
      useTls: input.useTls,
    };
  } catch (error) {
    return {
      ok: false,
      field: "publicEndpoint",
      message: error instanceof Error ? error.message : "Invalid host:port",
    };
  }
}
