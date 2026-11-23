/**
 * @vitest-environment jsdom
 */
import React from "react";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderSelectorProvider } from "@/provider-selection/provider-selection";

const sheetScrollViewSpy = vi.hoisted(() => vi.fn());
const sheetFlatListSpy = vi.hoisted(() => vi.fn());

vi.mock("@/components/ui/scroll-view", async () => {
  const ReactModule = await import("react");
  const { ScrollView, FlatList } = await import("react-native");
  return {
    ScrollView: ReactModule.forwardRef((props: React.ComponentProps<typeof ScrollView>, ref) => {
      sheetScrollViewSpy(props);
      return ReactModule.createElement(ScrollView, {
        ...props,
        ref: ref as never,
      });
    }),
    FlatList: ReactModule.forwardRef(
      (props: React.ComponentProps<typeof FlatList<unknown>>, ref) => {
        sheetFlatListSpy(props);
        return ReactModule.createElement(FlatList<unknown>, {
          ...props,
          ref: ref as never,
        });
      },
    ),
  };
});

vi.mock("@/constants/platform", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/constants/platform")>();
  return {
    ...actual,
    isNative: true,
    isWeb: false,
  };
});

vi.mock("@/constants/layout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/constants/layout")>();
  return {
    ...actual,
    useIsCompactFormFactor: () => true,
  };
});

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

import { ModelBrowser, useModelBrowser } from "./model-browser";

const PROVIDERS: ProviderSelectorProvider[] = [
  {
    id: "claude",
    label: "Claude",
    modelSelection: {
      kind: "models",
      rows: [
        {
          provider: "claude",
          providerLabel: "Claude",
          modelId: "claude-sonnet",
          modelLabel: "Claude Sonnet",
          description: "claude-sonnet",
          favoriteKey: "claude:claude-sonnet",
        },
      ],
    },
  },
  {
    id: "codex",
    label: "Codex",
    modelSelection: {
      kind: "loading",
    },
  },
  {
    id: "antigravity",
    label: "Antigravity",
    modelSelection: {
      kind: "error",
      message: "Catalog failed",
    },
  },
];

function noop() {}

function Harness({
  selectedProvider,
  scrolling = "sheet",
}: {
  selectedProvider: string;
  scrolling?: "sheet" | "independent";
}) {
  const state = useModelBrowser({
    providers: PROVIDERS,
    selectedProvider,
    selectedModel: "",
    isLoading: false,
  });
  const { selectProviderTab } = state;
  React.useEffect(() => {
    selectProviderTab(selectedProvider);
  }, [selectedProvider, selectProviderTab]);
  return <ModelBrowser state={state} onSelect={noop} scrolling={scrolling} />;
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  sheetScrollViewSpy.mockClear();
  sheetFlatListSpy.mockClear();
});

describe("ModelBrowser sheet scrolling", () => {
  it("renders the horizontal provider tab bar through the sheet-aware ScrollView", () => {
    render(<Harness selectedProvider="claude" scrolling="sheet" />);

    expect(sheetScrollViewSpy).toHaveBeenCalled();
    expect(sheetScrollViewSpy.mock.calls.some(([props]) => props.horizontal === true)).toBe(true);
    expect(sheetFlatListSpy).toHaveBeenCalled();
  });

  it("wraps loading and error provider states in the sheet-aware vertical ScrollView", () => {
    render(<Harness selectedProvider="codex" scrolling="sheet" />);
    expect(sheetScrollViewSpy.mock.calls.some(([props]) => !props.horizontal)).toBe(true);

    sheetScrollViewSpy.mockClear();
    render(<Harness selectedProvider="antigravity" scrolling="sheet" />);
    expect(sheetScrollViewSpy.mock.calls.some(([props]) => !props.horizontal)).toBe(true);
  });
});
