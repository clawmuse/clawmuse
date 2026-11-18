import { createHash } from "node:crypto";
import type {
  ProviderCatalog,
  ProviderLaunch,
  ProviderModel,
  ProviderMode,
  ProviderStatus,
} from "@getpaseo/plugin/server/provider";
import { probe } from "./process.js";
import { AntigravityError } from "./wire.js";

export const DEFAULT_STATUS_CACHE_TTL_MS = 5 * 60_000;
const MAX_STATUS_CACHE_ENTRIES = 16;

export interface StatusProbeOptions {
  now?: () => number;
  ttlMs?: number;
}

export interface StatusProbe {
  getStatus(launch: ProviderLaunch): Promise<ProviderStatus>;
  invalidate(launch: ProviderLaunch): void;
}

export type AntigravityModeId = "default" | "accept-edits" | "plan" | "full-access";

export const DEFAULT_MODE: AntigravityModeId = "default";

export const modes: readonly ProviderMode[] = [
  {
    id: "default",
    icon: "ShieldCheck",
    colorTier: "safe",
    label: "Default",
    description: "Asks for permission before running shell commands or editing files.",
  },
  {
    id: "accept-edits",
    icon: "ShieldAlert",
    colorTier: "moderate",
    label: "Accept edits",
    description: "Automatically approves file edits and asks before running shell commands.",
  },
  {
    id: "plan",
    icon: "ShieldCheck",
    colorTier: "planning",
    label: "Plan",
    description: "Plans carefully before executing a task.",
  },
  {
    id: "full-access",
    icon: "ShieldOff",
    colorTier: "dangerous",
    label: "Full access",
    description: "Automatically approves all tool calls and shell commands without asking.",
    isUnattended: true,
  },
];

export function launchCacheKey(launch: ProviderLaunch, credential?: unknown): string {
  const env = Object.entries(launch.env).sort(([left], [right]) => left.localeCompare(right));
  return createHash("sha256")
    .update(
      JSON.stringify(
        credential === undefined
          ? [launch.command, launch.args, env]
          : [launch.command, launch.args, env, credential],
      ),
    )
    .digest("hex");
}

export function inferModelContextWindowMaxTokens(
  modelId: string | null | undefined,
): number | undefined {
  if (!modelId) return undefined;
  const normalized = modelId.trim().toLowerCase();
  if (normalized.startsWith("gemini-")) return 1_048_576;
  if (normalized.startsWith("claude-")) return 200_000;
  if (normalized.startsWith("gpt-oss-")) return 131_072;
  return undefined;
}

export async function getCatalog(launch: ProviderLaunch, cwd?: string): Promise<ProviderCatalog> {
  const output = await probe({ launch, args: ["models"], cwd });
  const models: ProviderModel[] = [];
  for (const line of output.trim().split(/\r?\n/)) {
    const [id, label, ...extra] = line.split("\t");
    if (!id || !label || extra.length > 0)
      throw new AntigravityError("Invalid `agy models` output", "INVALID_CATALOG");
    if (models.some((model) => model.id === id))
      throw new AntigravityError(`Duplicate Antigravity model: ${id}`, "INVALID_CATALOG");
    const contextWindowMaxTokens = inferModelContextWindowMaxTokens(id);
    const isFirst = models.length === 0;
    models.push({
      id,
      label,
      ...(isFirst ? { isDefault: true } : {}),
      ...(contextWindowMaxTokens !== undefined ? { contextWindowMaxTokens } : {}),
    });
  }
  return {
    models,
    modes,
    thinkingOptions: [],
    ...(models[0] ? { defaultModel: models[0].id } : {}),
    defaultMode: DEFAULT_MODE,
  };
}

export async function getStatus(launch: ProviderLaunch): Promise<ProviderStatus> {
  try {
    const version = (await probe({ launch, args: ["--version"] })).trim();
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
    if (!match)
      return {
        available: false,
        diagnostic: "Could not read the Antigravity version. Update `agy` to 1.1.15 or later.",
      };
    const [, major, minor, patch] = match.map(Number);
    const supported = major > 1 || (major === 1 && (minor > 1 || (minor === 1 && patch >= 15)));
    if (!supported)
      return {
        available: false,
        diagnostic: `Antigravity ${version} is unsupported. Update \`agy\` to 1.1.15 or later.`,
      };
    await getCatalog(launch);
    return { available: true };
  } catch (error) {
    if (!(error instanceof AntigravityError)) throw error;
    return { available: false, diagnostic: error.message };
  }
}

export function createStatusProbe(options: StatusProbeOptions = {}): StatusProbe {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? DEFAULT_STATUS_CACHE_TTL_MS;
  const positiveCache = new Map<string, number>();
  const inFlight = new Map<string, Promise<ProviderStatus>>();

  function rememberAvailable(key: string, currentTime: number): void {
    if (ttlMs <= 0) return;
    for (const [entryKey, expiresAt] of positiveCache) {
      if (currentTime >= expiresAt) positiveCache.delete(entryKey);
    }
    positiveCache.delete(key);
    if (positiveCache.size >= MAX_STATUS_CACHE_ENTRIES) {
      const oldest = positiveCache.keys().next().value;
      if (oldest !== undefined) positiveCache.delete(oldest);
    }
    positiveCache.set(key, currentTime + ttlMs);
  }

  return {
    getStatus(launch) {
      const key = launchCacheKey(launch);
      const currentTime = now();
      const expiresAt = positiveCache.get(key);
      if (expiresAt !== undefined) {
        if (currentTime < expiresAt) return Promise.resolve({ available: true });
        positiveCache.delete(key);
      }
      const existing = inFlight.get(key);
      if (existing) return existing;
      const pending = getStatus(launch)
        .then((status) => {
          if (status.available) rememberAvailable(key, now());
          else positiveCache.delete(key);
          return status;
        })
        .finally(() => {
          inFlight.delete(key);
        });
      inFlight.set(key, pending);
      return pending;
    },
    invalidate(launch) {
      positiveCache.delete(launchCacheKey(launch));
    },
  };
}

export function validateSelection(
  config: { model?: string; mode?: string; thinkingOption?: string },
  catalog: ProviderCatalog,
): void {
  if (config.model && !catalog.models.some((model) => model.id === config.model))
    throw new AntigravityError(`Unknown Antigravity model: ${config.model}`, "INVALID_MODEL");
  if (config.mode && !catalog.modes.some((mode) => mode.id === config.mode))
    throw new AntigravityError(`Unknown Antigravity mode: ${config.mode}`, "INVALID_MODE");
  if (config.thinkingOption)
    throw new AntigravityError(
      "Antigravity effort is selected through the model ID",
      "UNSUPPORTED_THINKING",
    );
}
