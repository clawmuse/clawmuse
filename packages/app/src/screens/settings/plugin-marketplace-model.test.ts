import { expect, test } from "vitest";
import {
  filterMarketplace,
  installedMarketplacePlugin,
  loadMarketplace,
  marketplaceInstallation,
  marketplaceListing,
  marketplaceMatches,
  MARKETPLACE_URL,
  type MarketplaceIndex,
  type PublishedPlugin,
} from "./plugin-marketplace-model";
import type { PluginListItem } from "@getpaseo/protocol/messages";

const plugin: PublishedPlugin = {
  id: "acme/review",
  name: "Review",
  description: "Review code changes",
  categories: ["development"],
  author: { github: "acme" },
  repository: { url: "https://github.com/acme/review" },
  artifact: {
    kind: "git",
    remote: "https://github.com/acme/review.git",
    commit: "a".repeat(40),
    pluginPath: "plugins/review",
  },
  media: [],
  submittedAt: "2026-10-29",
  reviewedAt: "2026-10-29",
  updatedAt: "2026-10-29",
  publishedAt: "2026-10-29",
  translations: { "zh-CN": { name: "代码审查" } },
};
const index: MarketplaceIndex = {
  schemaVersion: 1,
  registry: { name: "ClawMuse", url: "https://clawmuse.com/registry" },
  categories: [{ slug: "development", label: "Development" }],
  plugins: [plugin],
  featured: [],
  generatedAt: "2026-10-29",
};

test("searches translated names, author and all query terms while respecting category", () => {
  expect(filterMarketplace(index, "代码 acme", "all", "zh-CN")).toEqual([plugin]);
  expect(filterMarketplace(index, "review", "themes", "en")).toEqual([]);
  expect(filterMarketplace(index, "missing", "all", "en")).toEqual([]);
  expect(marketplaceMatches("  REVIEW code  ", ["Review", "code"])).toBe(true);
  expect(marketplaceListing(plugin, "zh-CN")).toEqual({
    name: "代码审查",
    description: plugin.description,
  });
});

test("features published plugins before sorting names", () => {
  const first = { ...plugin, id: "acme/first", name: "A" };
  expect(
    filterMarketplace(
      { ...index, plugins: [first, plugin], featured: [plugin.id] },
      "",
      "all",
      "en",
    ).map(({ id }) => id),
  ).toEqual([plugin.id, first.id]);
});

test("installs the catalog's exact commit and monorepo path or exact npm version", () => {
  expect(marketplaceInstallation(plugin)).toEqual({
    source: "git:https://github.com/acme/review.git:plugins/review",
    ref: "a".repeat(40),
  });
  expect(
    marketplaceInstallation({
      ...plugin,
      artifact: {
        kind: "npm",
        package: "@acme/review",
        version: "1.2.3",
        resolved: "https://registry.npmjs.org/review.tgz",
        integrity: "sha512-YQ==",
      },
    }),
  ).toEqual({ source: "npm:@acme/review@1.2.3" });
});

test("recognizes installed sources under a different runtime id without confusing sibling plugins", () => {
  const current: PluginListItem = {
    id: "custom-id",
    path: "/plugins/review",
    status: "running",
    enabled: true,
    installation: {
      identity: {
        kind: "git",
        remote: "https://github.com/acme/review.git",
        pluginPath: "plugins/review",
      },
    },
  };
  expect(installedMarketplacePlugin(plugin, [current])).toBe(current);
  expect(
    installedMarketplacePlugin(plugin, [
      {
        ...current,
        installation: {
          identity: {
            kind: "git",
            remote: "https://github.com/acme/review.git",
            pluginPath: "plugins/other",
          },
        },
      },
    ]),
  ).toBeUndefined();
  expect(
    installedMarketplacePlugin(plugin, [{ ...current, installation: undefined }]),
  ).toBeUndefined();
});

test("loads and validates catalog data with credentials omitted and redirects rejected", async () => {
  expect(MARKETPLACE_URL).toBe("https://clawmuse.com/registry/index.json");
  const signal = new AbortController().signal;
  const request: typeof fetch = async (url, options) => {
    expect(url).toBe(MARKETPLACE_URL);
    expect(options).toEqual({ signal, credentials: "omit", redirect: "error" });
    return Response.json(index);
  };
  expect(await loadMarketplace(signal, request)).toEqual(index);
  await expect(
    loadMarketplace(signal, async () => Response.json({ plugins: [] })),
  ).rejects.toThrow();
  await expect(
    loadMarketplace(signal, async () => new Response("offline", { status: 503 })),
  ).rejects.toThrow("503");
});

test("rejects another registry or unreviewed listings instead of showing upstream plugins", async () => {
  const signal = new AbortController().signal;
  await expect(
    loadMarketplace(signal, async () =>
      Response.json({ ...index, registry: { name: "Paseo", url: "https://plugins.paseo.sh" } }),
    ),
  ).rejects.toThrow("ClawMuse");
  await expect(
    loadMarketplace(signal, async () =>
      Response.json({ ...index, plugins: [{ ...plugin, reviewedAt: "" }] }),
    ),
  ).rejects.toThrow("review");
});
