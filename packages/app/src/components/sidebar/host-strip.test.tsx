/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { defaultHostAppearance } from "@/hosts/appearance";
import { useHostOrderStore } from "@/hosts/host-order";
import { i18n as testI18n } from "@/i18n/i18next";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useCreateFlowStore } from "@/stores/create-flow-store";
import { useSessionStore, type WorkspaceDescriptor } from "@/stores/session-store";
import { useSidebarViewStore } from "@/stores/sidebar-view-store";
import { seedRuntimeWorkspaces } from "@/test/seed-session";
import type { HostProfile } from "@/types/host-connection";

vi.mock("react-native-reanimated", async () => {
  const { ScrollView, View } = await import("react-native");
  const AnimatedView = React.forwardRef(
    (
      { entering: _entering, exiting: _exiting, ...props }: Record<string, unknown>,
      ref: React.Ref<unknown>,
    ) => React.createElement(View as React.ElementType, { ...props, ref }),
  );
  return {
    default: {
      View: AnimatedView,
      ScrollView,
    },
    Easing: {
      ease: "ease",
      inOut: (value: unknown) => value,
    },
    interpolateColor: (value: number, _input: number[], output: string[]) =>
      value >= 1 ? output[1] : output[0],
    useSharedValue: (initial: number) => ({ value: initial }),
    useDerivedValue: (factory: () => unknown) => ({ value: factory() }),
    useAnimatedStyle: (factory: () => Record<string, unknown>) => factory(),
    useAnimatedScrollHandler: () => () => {},
    withTiming: (value: unknown) => value,
    Keyframe: class Keyframe {
      duration() {
        return this;
      }
    },
    runOnJS: (fn: unknown) => fn,
    FadeIn: { duration: () => undefined },
    FadeOut: { duration: () => undefined },
  };
});

vi.mock("react-native-gesture-handler", () => ({
  Gesture: {
    Native: () => ({
      blocksExternalGesture() {
        return this;
      },
    }),
  },
  GestureDetector: ({ children }: { children?: React.ReactNode }) => children,
}));

vi.mock("@gorhom/portal", () => ({
  Portal: ({ children }: { children?: React.ReactNode }) => children,
}));

import { SidebarHostStrip } from "./host-strip";

function makeHost(serverId: string, label: string): HostProfile {
  const now = "2026-11-18T00:00:00.000Z";
  return {
    serverId,
    label,
    appearance: defaultHostAppearance(),
    lifecycle: {},
    connections: [],
    preferredConnectionId: null,
    createdAt: now,
    updatedAt: now,
  };
}

function makeWorkspace(input: {
  id: string;
  projectId: string;
  status: WorkspaceDescriptor["status"];
}): WorkspaceDescriptor {
  return {
    createdAt: null,
    lastUserMessageAt: null,
    id: input.id,
    projectId: input.projectId,
    projectDisplayName: "Project",
    projectRootPath: `/repo/${input.projectId}`,
    workspaceDirectory: `/repo/${input.projectId}/${input.id}`,
    projectKind: "git",
    workspaceKind: "worktree",
    name: input.id,
    status: input.status,
    statusEnteredAt: null,
    archivingAt: null,
    diffStat: null,
    scripts: [],
  };
}

function setHostProfiles(hosts: HostProfile[]): void {
  (
    getHostRuntimeStore() as unknown as {
      setHostsAndSync: (hosts: HostProfile[]) => void;
    }
  ).setHostsAndSync(hosts);
}

function seedHostWorkspaces(serverId: string, workspaces: WorkspaceDescriptor[]): void {
  useSessionStore.getState().initializeSession(serverId, null as unknown as DaemonClient);
  seedRuntimeWorkspaces(serverId, new Map(workspaces.map((entry) => [entry.id, entry])));
  useSessionStore.getState().setHasHydratedWorkspaces(serverId, true);
}

describe("SidebarHostStrip", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;
  let queryClient: QueryClient | null = null;

  beforeEach(async () => {
    vi.stubGlobal("React", React);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    await testI18n.changeLanguage("en");

    useCreateFlowStore.setState({ pendingByDraftId: {} });
    useSidebarViewStore.getState().clearHostFilters();
    useHostOrderStore.setState({ hostOrder: [], pendingAccountOrder: null });

    setHostProfiles([makeHost("local", "Local"), makeHost("gd32", "GD32"), makeHost("sg", "SG")]);

    seedHostWorkspaces("local", [
      makeWorkspace({ id: "l-1", projectId: "p-1", status: "running" }),
      makeWorkspace({ id: "l-2", projectId: "p-1", status: "running" }),
      makeWorkspace({ id: "l-3", projectId: "p-1", status: "running" }),
    ]);
    seedHostWorkspaces("gd32", [
      makeWorkspace({ id: "g-1", projectId: "p-2", status: "running" }),
      makeWorkspace({ id: "g-2", projectId: "p-2", status: "needs_input" }),
    ]);
    seedHostWorkspaces("sg", [makeWorkspace({ id: "s-1", projectId: "p-3", status: "done" })]);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient();

    act(() => {
      root?.render(
        <QueryClientProvider client={queryClient!}>
          <SidebarHostStrip onOpenHostSettings={vi.fn()} />
        </QueryClientProvider>,
      );
    });
  });

  afterEach(async () => {
    vi.useRealTimers();
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    queryClient?.clear();
    container?.remove();
    document.getElementById("overlay-root")?.remove();
    useSidebarViewStore.getState().clearHostFilters();
    useHostOrderStore.setState({ hostOrder: [], pendingAccountOrder: null });
    for (const id of ["local", "gd32", "sg"]) {
      useSessionStore.getState().clearSession(id);
    }
    setHostProfiles([]);
    await testI18n.changeLanguage("en");
    vi.unstubAllGlobals();
  });

  it("renders icon corner activity dots without inline count text and keeps accessible activity labels", () => {
    const localChip = container?.querySelector('[data-testid="sidebar-host-strip-chip-local"]');
    const gd32Chip = container?.querySelector('[data-testid="sidebar-host-strip-chip-gd32"]');
    const sgChip = container?.querySelector('[data-testid="sidebar-host-strip-chip-sg"]');

    expect(localChip).not.toBeNull();
    expect(gd32Chip).not.toBeNull();
    expect(sgChip).not.toBeNull();

    expect(localChip?.textContent).toBe("Local");
    expect(gd32Chip?.textContent).toBe("GD32");
    expect(sgChip?.textContent).toBe("SG");

    expect(
      container?.querySelector('[data-testid="sidebar-host-strip-running-local"]'),
    ).not.toBeNull();
    expect(
      container?.querySelector('[data-testid="sidebar-host-strip-needs-input-local"]'),
    ).toBeNull();

    // needsInput takes precedence on the single corner dot when both running and needsInput apply.
    expect(
      container?.querySelector('[data-testid="sidebar-host-strip-needs-input-gd32"]'),
    ).not.toBeNull();
    expect(container?.querySelector('[data-testid="sidebar-host-strip-running-gd32"]')).toBeNull();

    expect(container?.querySelector('[data-testid="sidebar-host-strip-status-sg"]')).toBeNull();
    expect(container?.querySelector('[data-testid="sidebar-host-strip-running-sg"]')).toBeNull();
    expect(
      container?.querySelector('[data-testid="sidebar-host-strip-needs-input-sg"]'),
    ).toBeNull();

    expect(localChip?.getAttribute("aria-label")).toBe("Local, Running: 3");
    expect(gd32Chip?.getAttribute("aria-label")).toBe("GD32, Running: 1, Waiting for you");
    expect(sgChip?.getAttribute("aria-label")).toBe("SG");
  });

  it("reveals the host name and running count in a tooltip when hovered on desktop", async () => {
    vi.useFakeTimers();
    const localChip = container?.querySelector('[data-testid="sidebar-host-strip-chip-local"]');
    expect(localChip).not.toBeNull();

    act(() => {
      localChip?.dispatchEvent(
        new window.MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body }),
      );
    });
    expect(
      document.body.querySelector('[data-testid="sidebar-host-strip-tooltip-local"]'),
    ).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    const tooltip = document.body.querySelector('[data-testid="sidebar-host-strip-tooltip-local"]');
    expect(tooltip).not.toBeNull();
    expect(tooltip?.textContent).toBe("Local · Running: 3");

    act(() => {
      localChip?.dispatchEvent(
        new window.MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }),
      );
    });
    expect(
      document.body.querySelector('[data-testid="sidebar-host-strip-tooltip-local"]'),
    ).toBeNull();
  });

  it("filters to a clicked host and clears filters when clicking All", () => {
    const gd32Chip = container?.querySelector('[data-testid="sidebar-host-strip-chip-gd32"]');
    const allChip = container?.querySelector('[data-testid="sidebar-host-strip-all"]');
    expect(gd32Chip).not.toBeNull();
    expect(allChip).not.toBeNull();

    act(() => {
      fireEvent.click(gd32Chip!);
    });
    expect(useSidebarViewStore.getState().hostFilters).toEqual(["gd32"]);

    act(() => {
      fireEvent.click(allChip!);
    });
    expect(useSidebarViewStore.getState().hostFilters).toEqual([]);
  });

  it("renders hosts in deterministic default order and updates DOM when hostOrder changes", () => {
    const readRenderedChipIds = () =>
      Array.from(
        container?.querySelectorAll('[data-testid^="sidebar-host-strip-chip-"]') ?? [],
      ).map((node) => node.getAttribute("data-testid")?.replace("sidebar-host-strip-chip-", ""));

    expect(readRenderedChipIds()).toEqual(["gd32", "local", "sg"]);

    act(() => {
      useHostOrderStore.getState().setHostOrder(["sg", "local", "gd32"]);
    });

    expect(readRenderedChipIds()).toEqual(["sg", "local", "gd32"]);
  });

  it("reorders host chips on horizontal mouse drag without changing the active host filter", () => {
    const gd32Chip = container?.querySelector(
      '[data-testid="sidebar-host-strip-chip-gd32"]',
    ) as HTMLElement | null;
    const localChip = container?.querySelector(
      '[data-testid="sidebar-host-strip-chip-local"]',
    ) as HTMLElement | null;
    const sgChip = container?.querySelector(
      '[data-testid="sidebar-host-strip-chip-sg"]',
    ) as HTMLElement | null;
    expect(gd32Chip).not.toBeNull();
    expect(localChip).not.toBeNull();
    expect(sgChip).not.toBeNull();

    const setRect = (el: HTMLElement | null, left: number, width: number) => {
      const wrapper = el?.closest("[aria-roledescription='sortable']") as HTMLElement | null;
      if (!wrapper) throw new Error("missing sortable wrapper");
      Object.defineProperty(wrapper, "getBoundingClientRect", {
        configurable: true,
        value: () => ({
          left,
          right: left + width,
          top: 0,
          bottom: 26,
          width,
          height: 26,
          x: left,
          y: 0,
          toJSON: () => {},
        }),
      });
    };

    setRect(gd32Chip, 0, 60);
    setRect(localChip, 64, 60);
    setRect(sgChip, 128, 60);

    act(() => {
      sgChip!.dispatchEvent(
        new window.MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 158, clientY: 13 }),
      );
    });
    act(() => {
      document.dispatchEvent(
        new window.MouseEvent("mousemove", { bubbles: true, clientX: 148, clientY: 13 }),
      );
    });
    act(() => {
      document.dispatchEvent(
        new window.MouseEvent("mousemove", { bubbles: true, clientX: 20, clientY: 13 }),
      );
    });
    act(() => {
      document.dispatchEvent(new window.MouseEvent("mouseup", { bubbles: true }));
    });
    // Simulate trailing click event that browsers emit after mouseup.
    act(() => {
      fireEvent.click(sgChip!);
    });

    expect(useHostOrderStore.getState().hostOrder).toEqual(["sg", "gd32", "local"]);
    expect(useSidebarViewStore.getState().hostFilters).toEqual([]);
  });
});
