import {
  PluginRegistryIndexSchema,
  type PublishedPluginSchema,
} from "@getpaseo/protocol/plugin-registry";
import { formatPluginSourceReference } from "@getpaseo/protocol/plugin-source-reference";
import type { PluginListItem } from "@getpaseo/protocol/messages";
import type { z } from "zod";
import { brand } from "@/brand.generated";

export const MARKETPLACE_URL = `${brand.pluginRegistryUrl}/index.json`;
export type PublishedPlugin = z.output<typeof PublishedPluginSchema>;
export type MarketplaceIndex = z.output<typeof PluginRegistryIndexSchema>;

export async function loadMarketplace(
  signal: AbortSignal,
  request: typeof fetch = fetch,
): Promise<MarketplaceIndex> {
  const response = await request(MARKETPLACE_URL, {
    signal,
    credentials: "omit",
    redirect: "error",
  });
  if (!response.ok) throw new Error(`Plugin directory returned ${response.status}`);
  const index = PluginRegistryIndexSchema.parse(await response.json());
  if (index.registry.url.replace(/\/+$/, "") !== brand.pluginRegistryUrl)
    throw new Error("The plugin directory is not the ClawMuse registry");
  if (index.plugins.some((plugin) => !Number.isFinite(Date.parse(plugin.reviewedAt))))
    throw new Error("The plugin directory contains a plugin without a review date");
  return index;
}

export function marketplaceListing(plugin: PublishedPlugin, language: string) {
  const translation =
    plugin.translations?.[language] ?? plugin.translations?.[language.split("-")[0]];
  return {
    name: translation?.name ?? plugin.name,
    description: translation?.description ?? plugin.description,
  };
}

export function marketplaceInstallation(plugin: PublishedPlugin): { source: string; ref?: string } {
  const artifact = plugin.artifact;
  if (artifact.kind === "npm") return { source: `npm:${artifact.package}@${artifact.version}` };
  return {
    source: formatPluginSourceReference(`git:${artifact.remote}`, artifact.pluginPath),
    ref: artifact.commit,
  };
}

export function installedMarketplacePlugin(
  plugin: PublishedPlugin,
  installed: PluginListItem[],
): PluginListItem | undefined {
  return installed.find(({ installation }) => {
    if (!installation) return false;
    const identity = installation.identity;
    if (identity.kind === "directory") return false;
    if (
      identity.registry?.id === plugin.id &&
      identity.registry.url.replace(/\/+$/, "") === brand.pluginRegistryUrl
    )
      return true;
    if (identity.kind === "npm" && plugin.artifact.kind === "npm")
      return identity.packageName === plugin.artifact.package;
    if (identity.kind === "git" && plugin.artifact.kind === "git")
      return (
        identity.remote === plugin.artifact.remote &&
        identity.pluginPath === (plugin.artifact.pluginPath ?? ".")
      );
    return false;
  });
}

export function marketplaceMatches(query: string, fields: string[]): boolean {
  const text = fields.join(" ").toLocaleLowerCase();
  return query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .every((term) => text.includes(term));
}

export function filterMarketplace(
  index: MarketplaceIndex,
  query: string,
  category: string,
  language: string,
): PublishedPlugin[] {
  const featured = new Set(index.featured);
  return index.plugins
    .filter((plugin) => {
      const listing = marketplaceListing(plugin, language);
      return (
        (category === "all" || plugin.categories.includes(category)) &&
        marketplaceMatches(query, [
          plugin.id,
          plugin.name,
          plugin.description,
          listing.name,
          listing.description,
          plugin.author.github,
          plugin.author.name ?? "",
          ...plugin.categories,
        ])
      );
    })
    .sort(
      (a, b) =>
        Number(featured.has(b.id)) - Number(featured.has(a.id)) ||
        marketplaceListing(a, language).name.localeCompare(
          marketplaceListing(b, language).name,
          language,
        ),
    );
}
