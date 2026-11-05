import { describe, expect, it } from "vitest";
import type {
  ProviderSelectionModelRow,
  ProviderSelectorProvider,
} from "@/provider-selection/provider-selection";
import {
  resolveInitialActiveProviderId,
  resolveModelBrowserAllView,
  groupProfilesByProviderModel,
  resolveModelBrowserScrolling,
  resolveRecentModelRows,
} from "./model-browser-view";

function provider(
  id: string,
  label: string,
  rows: ProviderSelectionModelRow[] = [],
): ProviderSelectorProvider {
  return {
    id,
    label,
    modelSelection: { kind: "models", rows },
  };
}

function modelRow(
  providerId: string,
  providerLabel: string,
  modelId: string,
  modelLabel: string,
): ProviderSelectionModelRow {
  return {
    favoriteKey: `${providerId}:${modelId}`,
    provider: providerId,
    providerLabel,
    modelId,
    modelLabel,
    description: modelId,
  };
}

describe("model browser scrolling", () => {
  it("participates in native compact bottom-sheet scrolling", () => {
    expect(resolveModelBrowserScrolling({ isNative: true, isCompact: true })).toBe("sheet");
  });

  it.each([
    { platform: "native wide", isNative: true, isCompact: false },
    { platform: "compact web", isNative: false, isCompact: true },
    { platform: "wide web", isNative: false, isCompact: false },
  ])("owns scrolling on $platform surfaces", ({ isNative, isCompact }) => {
    expect(resolveModelBrowserScrolling({ isNative, isCompact })).toBe("independent");
  });
});

describe("model browser initial tab", () => {
  const codex = provider("codex", "Codex");
  const pi = provider("pi", "Pi");

  it("opens a sole provider directly", () => {
    expect(
      resolveInitialActiveProviderId({
        providers: [pi],
        selectedProvider: "",
      }),
    ).toBe("pi");
  });

  it("opens the selected provider when there is one", () => {
    expect(
      resolveInitialActiveProviderId({
        providers: [codex, pi],
        selectedProvider: "pi",
      }),
    ).toBe("pi");
  });

  it("falls back to the first provider when the selected one is gone", () => {
    expect(
      resolveInitialActiveProviderId({
        providers: [codex, pi],
        selectedProvider: "gemini",
      }),
    ).toBe("codex");
  });

  it("reports no active tab when nothing is selectable", () => {
    expect(
      resolveInitialActiveProviderId({
        providers: [],
        selectedProvider: "pi",
      }),
    ).toBeNull();
  });
});

describe("resolveRecentModelRows", () => {
  const claude = provider("claude", "Claude Code", [
    modelRow("claude", "Claude Code", "opus-5", "Opus 5"),
    modelRow("claude", "Claude Code", "sonnet-4.6", "Sonnet 4.6"),
  ]);
  const codex = provider("codex", "Codex", [modelRow("codex", "Codex", "gpt-5.4", "GPT-5.4")]);
  const providers = [claude, codex];

  it("resolves stored picks to catalog rows, most recent first", () => {
    const rows = resolveRecentModelRows({
      recentModels: [
        { provider: "codex", modelId: "gpt-5.4" },
        { provider: "claude", modelId: "opus-5" },
      ],
      providers,
    });

    expect(rows.map((row) => row.favoriteKey)).toEqual(["codex:gpt-5.4", "claude:opus-5"]);
  });

  it("drops picks whose provider or model is no longer listed", () => {
    const rows = resolveRecentModelRows({
      recentModels: [
        { provider: "gemini", modelId: "gemini-3" },
        { provider: "claude", modelId: "opus-4" },
        { provider: "claude", modelId: "sonnet-4.6" },
      ],
      providers,
    });

    expect(rows.map((row) => row.favoriteKey)).toEqual(["claude:sonnet-4.6"]);
  });

  it("caps the list at the display limit", () => {
    const many = provider("many", "Many", [
      modelRow("many", "Many", "m1", "M1"),
      modelRow("many", "Many", "m2", "M2"),
      modelRow("many", "Many", "m3", "M3"),
      modelRow("many", "Many", "m4", "M4"),
      modelRow("many", "Many", "m5", "M5"),
      modelRow("many", "Many", "m6", "M6"),
    ]);
    const rows = resolveRecentModelRows({
      recentModels: ["m6", "m5", "m4", "m3", "m2", "m1"].map((modelId) => ({
        provider: "many",
        modelId,
      })),
      providers: [many],
    });

    expect(rows.map((row) => row.modelId)).toEqual(["m6", "m5", "m4", "m3", "m2"]);
  });

  it("returns nothing without stored picks", () => {
    expect(resolveRecentModelRows({ recentModels: undefined, providers })).toEqual([]);
    expect(resolveRecentModelRows({ recentModels: [], providers })).toEqual([]);
  });
});

describe("groupProfilesByProviderModel", () => {
  it("groups profiles by provider and model, skipping profiles without a model", () => {
    const lookup = groupProfilesByProviderModel([
      { provider: "claude", modelId: "opus-5" },
      { provider: "claude", modelId: "opus-5" },
      { provider: "claude", modelId: "sonnet-4.6" },
      { provider: "claude", modelId: "" },
      { provider: "codex", modelId: "gpt-5.4" },
    ]);

    expect(lookup.get("claude:opus-5")).toHaveLength(2);
    expect(lookup.get("claude:sonnet-4.6")).toHaveLength(1);
    expect(lookup.get("codex:gpt-5.4")).toHaveLength(1);
    expect(lookup.has("claude:")).toBe(false);
  });

  it("trims model ids so whitespace cannot create a separate key", () => {
    const lookup = groupProfilesByProviderModel([
      { provider: "claude", modelId: "opus-5" },
      { provider: "claude", modelId: "  opus-5  " },
    ]);

    expect(lookup.get("claude:opus-5")).toHaveLength(2);
  });

  it("returns an empty map for no refs", () => {
    expect(groupProfilesByProviderModel([]).size).toBe(0);
  });
});

describe("model browser all view", () => {
  const claude = provider("claude", "Claude Code", [
    modelRow("claude", "Claude Code", "opus-5", "Opus 5"),
    modelRow("claude", "Claude Code", "sonnet-4.6", "Sonnet 4.6"),
  ]);
  const copilot = provider("copilot", "Copilot", [
    modelRow("copilot", "Copilot", "claude-opus-5", "Opus 5"),
  ]);
  const codex = provider("codex", "Codex", [modelRow("codex", "Codex", "gpt-5.4", "GPT-5.4")]);
  const providers = [claude, copilot, codex];

  it("browses providers while the query is empty", () => {
    expect(
      resolveModelBrowserAllView({ providers, normalizedQuery: "", isSearchFocused: false }),
    ).toEqual({
      kind: "browse",
    });
  });

  it("shows every searchable model as soon as empty search receives focus", () => {
    const view = resolveModelBrowserAllView({
      providers,
      normalizedQuery: "",
      isSearchFocused: true,
    });

    expect(view.kind).toBe("searchResults");
    expect(view.kind === "searchResults" ? view.rows.map((row) => row.favoriteKey) : []).toEqual([
      "claude:opus-5",
      "claude:sonnet-4.6",
      "copilot:claude-opus-5",
      "codex:gpt-5.4",
    ]);
  });

  it("ranks the same model label across every provider that offers it", () => {
    const view = resolveModelBrowserAllView({
      providers,
      normalizedQuery: "opus",
      isSearchFocused: true,
    });

    expect(view.kind).toBe("searchResults");
    expect(view.kind === "searchResults" ? view.rows.map((row) => row.favoriteKey) : []).toEqual([
      "claude:opus-5",
      "copilot:claude-opus-5",
    ]);
  });

  it("matches models by their provider label", () => {
    const view = resolveModelBrowserAllView({
      providers,
      normalizedQuery: "codex",
      isSearchFocused: true,
    });

    expect(view.kind === "searchResults" ? view.rows.map((row) => row.modelId) : []).toEqual([
      "gpt-5.4",
    ]);
  });

  it("reports no matches instead of falling back to the provider list", () => {
    expect(
      resolveModelBrowserAllView({
        providers,
        normalizedQuery: "zzzz",
        isSearchFocused: true,
      }),
    ).toEqual({ kind: "noSearchMatches" });
  });

  it("ignores providers that are still loading or errored", () => {
    const loading: ProviderSelectorProvider = {
      id: "opencode",
      label: "OpenCode",
      modelSelection: { kind: "loading" },
    };
    const failed: ProviderSelectorProvider = {
      id: "pi",
      label: "Pi",
      modelSelection: { kind: "error", message: "unavailable" },
    };

    expect(
      resolveModelBrowserAllView({
        providers: [loading, failed],
        normalizedQuery: "opus",
        isSearchFocused: true,
      }),
    ).toEqual({ kind: "noSearchMatches" });
  });
});
