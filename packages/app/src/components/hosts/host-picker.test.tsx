/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { View } from "react-native";
import { useHostOrderStore } from "@/hosts/host-order";
import { i18n as testI18n } from "@/i18n/i18next";
import { HostPicker } from "./host-picker";
import {
  ADD_HOST_OPTION_ID,
  ALL_HOSTS_OPTION_ID,
  getHostPickerLabel,
} from "./host-picker-constants";

const hosts = [{ serverId: "host-a", label: "Host A" }];
const pickerOptionTestID = (id: string) => `picker-opt-${id}`;

it.each([
  ["host-a", undefined, "Host A"],
  ["missing", undefined, "Host"],
  [ALL_HOSTS_OPTION_ID, { includeAllHost: true }, "All hosts"],
  ["missing", { includeAllHost: true }, "All hosts"],
  [ALL_HOSTS_OPTION_ID, undefined, "Host"],
  [ADD_HOST_OPTION_ID, { includeAddHost: true }, "Add host"],
])("resolves %s", (value, config, expected) => {
  expect(getHostPickerLabel(hosts, value, config)).toBe(expected);
});

describe("HostPicker reorderable", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;
  let queryClient: QueryClient | null = null;

  beforeEach(async () => {
    vi.stubGlobal("React", React);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    await testI18n.changeLanguage("en");
    useHostOrderStore.setState({ hostOrder: [], pendingAccountOrder: null });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient();
  });

  afterEach(async () => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    queryClient?.clear();
    container?.remove();
    document.getElementById("overlay-root")?.remove();
    useHostOrderStore.setState({ hostOrder: [], pendingAccountOrder: null });
    await testI18n.changeLanguage("en");
    vi.unstubAllGlobals();
  });

  it("renders drag handles in host order and reorders without closing the picker", () => {
    const onOpenChange = vi.fn();
    const onReorder = vi.fn();
    const anchorRef = React.createRef<View>();

    act(() => {
      root?.render(
        <QueryClientProvider client={queryClient!}>
          <View ref={anchorRef} />
          <HostPicker
            hosts={[
              { serverId: "srv_z", label: "Zulu" },
              { serverId: "srv_a", label: "Alpha" },
              { serverId: "srv_m", label: "Mike" },
            ]}
            value={ALL_HOSTS_OPTION_ID}
            onSelect={vi.fn()}
            open
            onOpenChange={onOpenChange}
            anchorRef={anchorRef}
            includeAllHost
            reorderable
            onReorder={onReorder}
            hostOptionTestID={pickerOptionTestID}
          >
            <View />
          </HostPicker>
        </QueryClientProvider>,
      );
    });

    const handleNodes = Array.from(
      document.body.querySelectorAll('[data-testid^="host-picker-drag-handle-"]'),
    );
    expect(handleNodes.map((node) => node.getAttribute("data-testid"))).toEqual([
      "host-picker-drag-handle-srv_a",
      "host-picker-drag-handle-srv_m",
      "host-picker-drag-handle-srv_z",
    ]);

    const sortableWrappers = handleNodes.map((handle) => {
      const row = document.body.querySelector(
        `[data-testid="picker-opt-${handle.getAttribute("data-testid")?.replace("host-picker-drag-handle-", "")}"]`,
      );
      const wrapper = row?.closest("div[style]")?.parentElement as HTMLElement | null;
      return { handle: handle as HTMLElement, wrapper };
    });

    sortableWrappers.forEach(({ wrapper }, index) => {
      if (!wrapper) throw new Error("missing sortable wrapper");
      Object.defineProperty(wrapper, "getBoundingClientRect", {
        configurable: true,
        value: () => ({
          left: 0,
          right: 240,
          top: index * 40,
          bottom: (index + 1) * 40,
          width: 240,
          height: 40,
          x: 0,
          y: index * 40,
          toJSON: () => {},
        }),
      });
    });

    const zuluHandle = sortableWrappers[2]!.handle;
    act(() => {
      zuluHandle.dispatchEvent(
        new window.MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
          clientX: 200,
          clientY: 100,
        }),
      );
    });
    act(() => {
      document.dispatchEvent(
        new window.MouseEvent("mousemove", { bubbles: true, clientX: 200, clientY: 90 }),
      );
    });
    act(() => {
      document.dispatchEvent(
        new window.MouseEvent("mousemove", { bubbles: true, clientX: 200, clientY: 10 }),
      );
    });
    act(() => {
      document.dispatchEvent(new window.MouseEvent("mouseup", { bubbles: true }));
    });

    expect(onReorder).toHaveBeenCalledWith({
      moved: "srv_z",
      after: ["srv_z", "srv_a", "srv_m"],
    });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
