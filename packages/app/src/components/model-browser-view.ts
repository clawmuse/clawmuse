import type { RecentModelSelection } from "@/create-agent-preferences/preferences";
import {
  filterAndRankModelRows,
  getAllProviderModelRows,
  type ProviderSelectionModelRow,
  type ProviderSelectorProvider,
} from "@/provider-selection/provider-selection";

export function resolveModelBrowserScrolling({
  isNative,
  isCompact,
}: {
  isNative: boolean;
  isCompact: boolean;
}): "sheet" | "independent" {
  return isNative && isCompact ? "sheet" : "independent";
}

/** A profile's model reference; used to match profiles back to model rows. */
export interface ModelProfileRef {
  provider: string;
  modelId: string;
}

/**
 * Groups profiles by `provider:modelId`, skipping profiles that name no model.
 * Pure so the model browser can test it apart from the component tree.
 */
export function groupProfilesByProviderModel<T extends ModelProfileRef>(
  refs: readonly T[],
): Map<string, T[]> {
  const lookup = new Map<string, T[]>();
  for (const ref of refs) {
    const modelId = ref.modelId.trim();
    if (!modelId) {
      continue;
    }
    const key = `${ref.provider}:${modelId}`;
    const existing = lookup.get(key);
    if (existing) {
      existing.push(ref);
    } else {
      lookup.set(key, [ref]);
    }
  }
  return lookup;
}

/** What the browser shows: the tabbed browse view, or ranked cross-provider results. */
export type ModelBrowserAllView =
  | { kind: "browse" }
  | { kind: "searchResults"; rows: ProviderSelectionModelRow[] }
  | { kind: "noSearchMatches" };

export function resolveModelBrowserAllView({
  providers,
  normalizedQuery,
  isSearchFocused,
}: {
  providers: ProviderSelectorProvider[];
  normalizedQuery: string;
  isSearchFocused: boolean;
}): ModelBrowserAllView {
  if (!normalizedQuery && !isSearchFocused) {
    return { kind: "browse" };
  }
  const allRows = getAllProviderModelRows(providers);
  const rows = normalizedQuery ? filterAndRankModelRows(allRows, normalizedQuery) : allRows;
  if (rows.length === 0) {
    return { kind: "noSearchMatches" };
  }
  return { kind: "searchResults", rows };
}

/**
 * The provider tab the picker opens on: the current selection when the host
 * still offers it, else the first provider. `null` when nothing is selectable.
 */
export function resolveInitialActiveProviderId({
  providers,
  selectedProvider,
}: {
  providers: ProviderSelectorProvider[];
  selectedProvider: string;
}): string | null {
  if (selectedProvider.length > 0 && providers.some((entry) => entry.id === selectedProvider)) {
    return selectedProvider;
  }
  return providers[0]?.id ?? null;
}

export const RECENT_MODELS_DISPLAY_LIMIT = 5;

/**
 * Resolves stored recent picks to rows offered by the current providers, in
 * order, capped for display. Entries whose provider or model is no longer
 * listed drop out — recents never offer a row the list cannot select.
 */
export function resolveRecentModelRows({
  recentModels,
  providers,
  limit = RECENT_MODELS_DISPLAY_LIMIT,
}: {
  recentModels: readonly RecentModelSelection[] | undefined;
  providers: ProviderSelectorProvider[];
  limit?: number;
}): ProviderSelectionModelRow[] {
  if (!recentModels?.length) {
    return [];
  }
  const rowsByKey = new Map(
    getAllProviderModelRows(providers).map((row) => [row.favoriteKey, row]),
  );
  const rows: ProviderSelectionModelRow[] = [];
  for (const entry of recentModels) {
    if (rows.length >= limit) {
      break;
    }
    const row = rowsByKey.get(`${entry.provider}:${entry.modelId}`);
    if (row) {
      rows.push(row);
    }
  }
  return rows;
}
