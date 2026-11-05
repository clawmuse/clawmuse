import { loadPersistedConfig, savePersistedConfig } from "../persisted-config.js";

export type ClawMuseGoalsIsolation = "local" | "worktree";

export interface ClawMuseGoalsProviderTarget {
  provider: string;
  model: string | null;
}

export interface ClawMuseGoalsSettings {
  /** Off by default: a host only runs goals once its owner has chosen the models. */
  enabled: boolean;
  /** Scans a repository and proposes goal cards. Meant for a cheap model. */
  planner: ClawMuseGoalsProviderTarget;
  /** Advances an accepted goal. Meant for the strongest model available. */
  executor: ClawMuseGoalsProviderTarget;
  /** Execute runs get their own worktree unless the owner wants them in the checkout. */
  isolation: ClawMuseGoalsIsolation;
  maxConcurrentRuns: number;
}

export interface ClawMuseGoalsSettingsPatch {
  enabled?: boolean;
  planner?: string;
  executor?: string;
  isolation?: ClawMuseGoalsIsolation;
  maxConcurrentRuns?: number;
}

export const CLAWMUSE_GOALS_MAX_CONCURRENT_RUNS = 8;

const DEFAULT_TARGET: ClawMuseGoalsProviderTarget = { provider: "claude", model: null };

/** `provider` or `provider/model`; the same shape the schedule form stores. */
export function parseClawMuseGoalsProviderTarget(value: string): ClawMuseGoalsProviderTarget {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("A provider is required, as `provider` or `provider/model`");
  }
  const slash = trimmed.indexOf("/");
  if (slash === -1) {
    return { provider: trimmed, model: null };
  }
  const provider = trimmed.slice(0, slash).trim();
  const model = trimmed.slice(slash + 1).trim();
  if (!provider || !model) {
    throw new Error(`Invalid provider target "${value}": use \`provider\` or \`provider/model\``);
  }
  return { provider, model };
}

export function formatClawMuseGoalsProviderTarget(target: ClawMuseGoalsProviderTarget): string {
  return target.model ? `${target.provider}/${target.model}` : target.provider;
}

export function readClawMuseGoalsSettings(paseoHome: string): ClawMuseGoalsSettings {
  const persisted = loadPersistedConfig(paseoHome).clawmuseStatus?.goals;
  return {
    enabled: persisted?.enabled ?? false,
    planner: persisted?.planner
      ? parseClawMuseGoalsProviderTarget(persisted.planner)
      : DEFAULT_TARGET,
    executor: persisted?.executor
      ? parseClawMuseGoalsProviderTarget(persisted.executor)
      : DEFAULT_TARGET,
    isolation: persisted?.isolation ?? "worktree",
    maxConcurrentRuns: persisted?.maxConcurrentRuns ?? 1,
  };
}

/**
 * Goals live under the status relationship because they ride its host session.
 * Saving them before `clawmuse status connect` is allowed; they take effect once
 * the relationship exists.
 */
export function saveClawMuseGoalsSettings(
  paseoHome: string,
  patch: ClawMuseGoalsSettingsPatch,
): ClawMuseGoalsSettings {
  if (patch.planner !== undefined) {
    parseClawMuseGoalsProviderTarget(patch.planner);
  }
  if (patch.executor !== undefined) {
    parseClawMuseGoalsProviderTarget(patch.executor);
  }
  if (
    patch.maxConcurrentRuns !== undefined &&
    (!Number.isInteger(patch.maxConcurrentRuns) ||
      patch.maxConcurrentRuns < 1 ||
      patch.maxConcurrentRuns > CLAWMUSE_GOALS_MAX_CONCURRENT_RUNS)
  ) {
    throw new Error(
      `maxConcurrentRuns must be an integer between 1 and ${CLAWMUSE_GOALS_MAX_CONCURRENT_RUNS}`,
    );
  }
  const persisted = loadPersistedConfig(paseoHome);
  const current = persisted.clawmuseStatus?.goals ?? {};
  const next = {
    ...current,
    ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    ...(patch.planner !== undefined ? { planner: patch.planner.trim() } : {}),
    ...(patch.executor !== undefined ? { executor: patch.executor.trim() } : {}),
    ...(patch.isolation !== undefined ? { isolation: patch.isolation } : {}),
    ...(patch.maxConcurrentRuns !== undefined
      ? { maxConcurrentRuns: patch.maxConcurrentRuns }
      : {}),
  };
  savePersistedConfig(paseoHome, {
    ...persisted,
    clawmuseStatus: {
      // A relationship may not exist yet; keep the URL slot valid for the schema
      // by only writing `goals` alongside whatever is already stored.
      ...persisted.clawmuseStatus,
      goals: next,
    },
  });
  return readClawMuseGoalsSettings(paseoHome);
}
