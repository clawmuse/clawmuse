import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViewportToolbar } from "./toolbar";

const { theme, resolveBreakpoints } = vi.hoisted(() => {
  const hoistedTheme = {
    spacing: { 2: 8 },
    borderRadius: { md: 6, full: 999 },
    opacity: { 50: 0.5 },
    colors: {
      surface2: "#f4f4f5",
      foreground: "#111",
      foregroundMuted: "#666",
      interactionHighlight: "#0001",
    },
  };

  function resolveStyleBreakpoints(value: unknown): unknown {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value;
    const entries = Object.entries(value);
    const breakpoints: Record<string, number> = { xs: 0, sm: 576, md: 600, lg: 992, xl: 1200 };
    if (entries.length > 0 && entries.every(([key]) => key in breakpoints)) {
      return resolveStyleBreakpoints(entries.find(([key]) => key === "md")?.[1]);
    }
    return Object.fromEntries(entries.map(([key, child]) => [key, resolveStyleBreakpoints(child)]));
  }

  return { theme: hoistedTheme, resolveBreakpoints: resolveStyleBreakpoints };
});

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) =>
      resolveBreakpoints(typeof factory === "function" ? factory(theme) : factory),
  },
  useUnistyles: () => ({ theme, rt: { breakpoint: "lg" } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "message.diagram.zoomIn": "Zoom in",
        "message.diagram.zoomOut": "Zoom out",
        "message.diagram.resetZoom": "Reset view",
      })[key] ?? key,
  }),
}));

vi.mock("@/constants/layout", () => ({
  useIsCompactFormFactor: () => false,
}));

vi.mock("@/components/icons/app-icons", () => {
  const createIcon = (name: string) => () => React.createElement("span", { "data-icon": name });
  return {
    Scan: createIcon("Scan"),
    X: createIcon("X"),
    ZoomIn: createIcon("ZoomIn"),
    ZoomOut: createIcon("ZoomOut"),
  };
});

let root: Root | null = null;
let container: HTMLElement | null = null;

beforeEach(() => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
  vi.stubGlobal("Node", dom.window.Node);
  vi.stubGlobal("navigator", dom.window.navigator);

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
  }
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

function render(element: React.ReactElement) {
  act(() => {
    root?.render(element);
  });
}

function button(label: string): HTMLElement {
  const element = document.querySelector(`[aria-label="${label}"]`);
  if (!(element instanceof HTMLElement)) throw new Error(`missing ${label}`);
  return element;
}

function opacity(element: HTMLElement): string {
  return element.style.opacity;
}

const closeAction = {
  icon: () => React.createElement("span", { "data-icon": "X" }),
  label: "Close image",
  onPress: () => undefined,
  testID: "attachment-lightbox-close",
  alwaysVisible: true,
};

describe("ViewportToolbar", () => {
  it("hides disabled zoom controls but keeps the close button when the toolbar is idle", () => {
    render(
      <ViewportToolbar
        actions={[closeAction]}
        maxScale={8}
        minScale={1}
        onReset={vi.fn()}
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        placement="inline"
        scale={1}
        visible={false}
      />,
    );

    expect(opacity(button("Zoom in"))).toBe("0");
    expect(opacity(button("Zoom out"))).toBe("0");
    expect(opacity(button("Reset view"))).toBe("0");
    expect(opacity(button("Close image"))).toBe("1");
  });

  it("dims a disabled zoom control only while the toolbar is visible", () => {
    render(
      <ViewportToolbar
        actions={[closeAction]}
        maxScale={8}
        minScale={1}
        onReset={vi.fn()}
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        placement="inline"
        scale={1}
        visible
      />,
    );

    expect(opacity(button("Zoom in"))).toBe("1");
    expect(opacity(button("Zoom out"))).toBe("0.5");
    expect(opacity(button("Reset view"))).toBe("0.5");
    expect(opacity(button("Close image"))).toBe("1");
  });
});
