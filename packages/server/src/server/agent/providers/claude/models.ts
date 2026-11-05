import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Logger } from "pino";

import type { AgentModelDefinition, AgentSelectOption } from "../../agent-sdk-types.js";
import {
  getClaudeCustomModelThinkingOptions,
  getClaudeManifestModels,
  normalizeClaudeManifestModelId,
  normalizeClaudeRuntimeModelId as normalizeClaudeManifestRuntimeModelId,
} from "./model-manifest.js";

const CLAUDE_SETTINGS_MODEL_ENV_KEYS = [
  "ANTHROPIC_MODEL",
  "ANTHROPIC_SMALL_FAST_MODEL",
  "ANTHROPIC_DEFAULT_FABLE_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
] as const;

export function getClaudeModels(claudeCodeVersion?: string): AgentModelDefinition[] {
  return getClaudeManifestModels(claudeCodeVersion);
}

export function resolveConfiguredClaudeModel(model: AgentModelDefinition): AgentModelDefinition {
  if (model.thinkingOptions !== undefined) return model;

  const manifestModelId = normalizeClaudeManifestModelId(model.id);
  const manifestModel = manifestModelId
    ? getClaudeModels().find((candidate) => candidate.id === manifestModelId)
    : undefined;
  if (manifestModel) {
    return manifestModel.thinkingOptions
      ? { ...model, thinkingOptions: manifestModel.thinkingOptions }
      : model;
  }
  return { ...model, thinkingOptions: getClaudeCustomModelThinkingOptions() };
}

export function findClaudeModel(
  modelId: string | null | undefined,
): AgentModelDefinition | undefined {
  const normalizedModelId = normalizeClaudeRuntimeModelId(modelId);
  if (!normalizedModelId) {
    return undefined;
  }
  return getClaudeModels().find((model) => model.id === normalizedModelId);
}

export function getClaudeContextWindowMaxTokens(
  modelId: string | null | undefined,
): number | undefined {
  if (modelId?.trim().toLowerCase().endsWith("[1m]")) {
    return 1_000_000;
  }
  return findClaudeModel(modelId)?.contextWindowMaxTokens;
}

export async function getClaudeModelsWithSettings(
  logger: Logger,
  configDir: string,
  claudeCodeVersion?: string,
  discoveredModelIds: ReadonlySet<string> = new Set(),
  gateway?: { env: NodeJS.ProcessEnv; signal?: AbortSignal },
): Promise<AgentModelDefinition[]> {
  const hardcodedModels = getClaudeManifestModels(claudeCodeVersion, discoveredModelIds);
  const { models: settingsModels, env: settingsEnv } = await readClaudeSettingsModels(
    logger,
    configDir,
  );
  if (settingsModels.length === 0) {
    return hardcodedModels;
  }

  if (gateway) {
    await applyGatewayModelCapabilities(logger, settingsModels, {
      ...gateway,
      env: { ...settingsEnv, ...gateway.env },
    });
  }

  const models = [...hardcodedModels];

  for (const model of settingsModels) {
    const existingIndex = models.findIndex((candidate) => candidate.id === model.id);
    if (existingIndex !== -1) {
      const existing = models[existingIndex];
      if (existing?.isSelectable === false) {
        models[existingIndex] = { ...existing, ...model, isSelectable: true };
      }
      continue;
    }
    const manifestModel = getClaudeModels(claudeCodeVersion).find(
      (candidate) => candidate.id === model.id,
    );
    models.push({ ...manifestModel, ...model });
  }

  return models;
}

// Claude's settings picker contains labels and IDs only. A compatible gateway can
// advertise different effort levels per model; never copy one model's levels to another.
async function applyGatewayModelCapabilities(
  logger: Logger,
  models: AgentModelDefinition[],
  { env, signal }: { env: NodeJS.ProcessEnv; signal?: AbortSignal },
): Promise<void> {
  const baseUrl = env.ANTHROPIC_BASE_URL;
  if (!baseUrl) return;

  try {
    const url = new URL(`${baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1/models`);
    const headers: Record<string, string> = { "anthropic-version": "2023-06-01" };
    if (env.ANTHROPIC_AUTH_TOKEN) {
      headers.Authorization = `Bearer ${env.ANTHROPIC_AUTH_TOKEN}`;
    } else if (env.ANTHROPIC_API_KEY) {
      headers["x-api-key"] = env.ANTHROPIC_API_KEY;
    }
    const timeout = AbortSignal.timeout(5_000);
    const response = await fetch(url, {
      headers,
      redirect: "error",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!response.ok) return;
    const body: unknown = await response.json();
    if (!isRecord(body) || !Array.isArray(body.data)) return;
    for (const entry of body.data) {
      if (!isRecord(entry)) continue;
      const model = models.find((candidate) => candidate.id === entry.id);
      if (!model) continue;
      const options = gatewayThinkingOptions(entry);
      if (options) model.thinkingOptions = options;
    }
  } catch {
    signal?.throwIfAborted();
    // Metadata discovery must not remove configured models when a gateway is offline.
    logger.debug("Claude gateway model capabilities unavailable");
  }
}

function gatewayThinkingOptions(entry: Record<string, unknown>): AgentSelectOption[] | undefined {
  let levels: unknown[];
  if (Array.isArray(entry.reasoning_levels)) {
    levels = entry.reasoning_levels;
  } else if (Array.isArray(entry.supported_reasoning_levels)) {
    levels = entry.supported_reasoning_levels.map((option) =>
      isRecord(option) ? option.effort : undefined,
    );
  } else {
    return undefined;
  }
  const options: AgentSelectOption[] = [];
  for (const level of levels) {
    if (
      typeof level !== "string" ||
      !["low", "medium", "high", "xhigh", "max"].includes(level) ||
      options.some((option) => option.id === level)
    )
      continue;
    options.push({
      id: level,
      label: level === "xhigh" ? "Extra High" : level[0].toUpperCase() + level.slice(1),
    });
  }
  return options;
}

async function readClaudeSettingsModels(
  logger: Logger,
  configDir: string,
): Promise<{ models: AgentModelDefinition[]; env: NodeJS.ProcessEnv }> {
  const settingsPath = path.join(configDir, "settings.json");

  let parsed: unknown;
  try {
    const rawSettings = await fs.readFile(settingsPath, "utf8");
    parsed = JSON.parse(rawSettings);
  } catch (error) {
    logger.debug({ err: error, settingsPath }, "Failed to read Claude settings models");
    return { models: [], env: {} };
  }

  if (!isRecord(parsed)) {
    logger.debug({ settingsPath }, "Claude settings.json is not an object");
    return { models: [], env: {} };
  }

  const models: AgentModelDefinition[] = [];
  // Gateways publish their selected models here; the main model and tier
  // aliases alone do not describe what Claude Code's picker can select.
  const picker = parsed.modelPicker;
  if (isRecord(picker) && Array.isArray(picker.options)) {
    for (const option of picker.options) {
      if (!isRecord(option)) continue;
      addSettingsModel({
        models,
        value: option.model,
        settingsKey: "modelPicker.options",
        label: option.label,
        description: option.description,
      });
    }
  }
  addSettingsModel({ models, value: parsed.model, settingsKey: "model" });

  const env = parsed.env;
  if (env === undefined) {
    return { models, env: {} };
  }
  if (!isRecord(env)) {
    logger.debug({ settingsPath }, "Claude settings.json env is not an object");
    return { models, env: {} };
  }

  for (const envKey of CLAUDE_SETTINGS_MODEL_ENV_KEYS) {
    addSettingsModel({ models, value: env[envKey], settingsKey: `env.${envKey}` });
  }

  return {
    models,
    env: Object.fromEntries(
      Object.entries(env).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    ),
  };
}

function addSettingsModel({
  models,
  value,
  settingsKey,
  label,
  description,
}: {
  models: AgentModelDefinition[];
  value: unknown;
  settingsKey: string;
  label?: unknown;
  description?: unknown;
}): void {
  if (typeof value !== "string") {
    return;
  }

  const id = value.trim();
  if (id.length === 0 || models.some((model) => model.id === id)) {
    return;
  }

  models.push({
    provider: "claude",
    id,
    label: typeof label === "string" && label.trim() ? label.trim() : id,
    description:
      typeof description === "string" && description.trim()
        ? description.trim()
        : `From Claude settings.json ${settingsKey}`,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Normalize a runtime model string (from SDK init message) to a known model ID.
 * Handles the `[1m]` suffix that the SDK appends for 1M context sessions.
 */
export function normalizeClaudeRuntimeModelId(value: string | null | undefined): string | null {
  return normalizeClaudeManifestRuntimeModelId(value);
}

/**
 * Placeholder model values Claude Code writes on frames with no real inference behind them.
 * These are not models and must never be displayed.
 */
const CLAUDE_PLACEHOLDER_MODEL_IDS = new Set(["<synthetic>"]);

/**
 * Resolve a model id observed on a Claude assistant frame, for display.
 *
 * Prefers the manifest-normalized id so equivalent spellings collapse (a dated alias and a
 * gateway prefix are the same model), but falls back to the raw string when the manifest does
 * not know it. The fallback matters: Claude Code is an Anthropic-compatible client, so subagents
 * routinely report models that are not Anthropic's — Z.AI GLM ids via `ANTHROPIC_BASE_URL`
 * (docs/custom-providers.md) among them. Manifest-only resolution would blank the model for
 * exactly those users.
 *
 * A `[1m]` suffix is preserved where it names its own manifest entry. Models such as Fable 5
 * that only have a 1M entry normalize the retired suffixed spelling to the canonical ID.
 *
 * Returns null for placeholders and empty values, meaning "not observed".
 */
export function resolveObservedClaudeModelId(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed || CLAUDE_PLACEHOLDER_MODEL_IDS.has(trimmed)) {
    return null;
  }
  return normalizeClaudeManifestRuntimeModelId(trimmed) ?? trimmed;
}
