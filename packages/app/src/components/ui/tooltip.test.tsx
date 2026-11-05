import React from "react";
import { act, useCallback } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { Pressable, Text } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Tooltip, TooltipTrigger } from "./tooltip";

vi.mock("@/constants/platform", () => ({
  isWeb: true,
  isNative: false,
}));

vi.mock("@/constants/layout", () => ({
  useIsCompactFormFactor: () => false,
}));

vi.mock("@gorhom/portal", () => ({
  Portal: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@gorhom/bottom-sheet", () => ({
  useBottomSheetModalInternal: () => null,
}));

vi.mock("react-native-reanimated", () => ({
  default: {
    View: "div",
  },
  FadeIn: {},
  FadeOut: {},
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (styles: unknown) => styles,
  },
}));

let root: Root | null = null;
let container: HTMLElement | null = null;

beforeEach(() => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  vi.stubGlobal("React", React);
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

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
  }
  root = null;
  container = null;
  vi.unstubAllGlobals();
});

function renderTrigger({
  childDisabled,
  onPress,
}: {
  childDisabled: boolean;
  onPress: () => void;
}): void {
  act(() => {
    root?.render(
      <Tooltip>
        <TooltipTrigger asChild>
          <Pressable disabled={childDisabled} onPress={onPress} testID="trigger">
            <Text>Send</Text>
          </Pressable>
        </TooltipTrigger>
      </Tooltip>,
    );
  });
}

function pressTrigger(): void {
  const trigger = container?.querySelector('[data-testid="trigger"]');
  expect(trigger).not.toBeNull();

  act(() => {
    trigger?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
}

interface FeedbackTriggerOptions {
  label: string;
  selected: boolean;
}

function FeedbackTrigger({ label, selected }: FeedbackTriggerOptions) {
  const staleWebHover = { testOnly_hovered: true };
  const triggerStyle = useCallback(
    (state: { pressed: boolean; hovered?: boolean }) => ({
      backgroundColor: selected || state.hovered ? "#ff0000" : "transparent",
    }),
    [selected],
  );
  return (
    <Tooltip>
      <TooltipTrigger
        {...staleWebHover}
        accessibilityLabel={label}
        testID="feedback-trigger"
        style={triggerStyle}
      >
        <Text>{label}</Text>
      </TooltipTrigger>
    </Tooltip>
  );
}

function renderFeedbackTrigger(options: FeedbackTriggerOptions): HTMLElement {
  act(() => {
    root?.render(<FeedbackTrigger {...options} />);
  });
  const trigger = container?.querySelector('[data-testid="feedback-trigger"]');
  if (!(trigger instanceof HTMLElement)) throw new Error("Feedback trigger did not render");
  return trigger;
}

function moveMouse(trigger: HTMLElement, type: "mouseover" | "mouseout"): void {
  act(() => {
    trigger.dispatchEvent(
      new window.MouseEvent(type, { bubbles: true, relatedTarget: document.body }),
    );
  });
}

describe("TooltipTrigger", () => {
  it("clears hover styling after feedback changes while RN Web retains its hover state", () => {
    const trigger = renderFeedbackTrigger({ label: "Copy", selected: false });
    expect(trigger.style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    moveMouse(trigger, "mouseover");
    expect(trigger.style.backgroundColor).toBe("rgb(255, 0, 0)");
    act(() => trigger.focus());

    renderFeedbackTrigger({ label: "Copied", selected: true });
    moveMouse(trigger, "mouseout");
    expect(trigger.style.backgroundColor).toBe("rgb(255, 0, 0)");

    renderFeedbackTrigger({ label: "Copy", selected: false });
    expect(trigger.style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(document.activeElement).toBe(trigger);
    moveMouse(trigger, "mouseover");
    expect(trigger.style.backgroundColor).toBe("rgb(255, 0, 0)");
    moveMouse(trigger, "mouseout");
    expect(trigger.style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  });

  it("keeps an asChild trigger disabled when the child is disabled", () => {
    const onPress = vi.fn();

    renderTrigger({ childDisabled: true, onPress });
    pressTrigger();

    expect(onPress).not.toHaveBeenCalled();
  });

  it("keeps an asChild trigger interactive when the child is not disabled", () => {
    const onPress = vi.fn();

    renderTrigger({ childDisabled: false, onPress });
    pressTrigger();

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
