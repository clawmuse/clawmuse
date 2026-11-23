/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultHostAppearance } from "@/hosts/appearance";
import { i18n as testI18n } from "@/i18n/i18next";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { setNetworkStatus } from "@/runtime/network-status/model";
import { useSidebarViewStore } from "@/stores/sidebar-view-store";
import type { HostProfile } from "@/types/host-connection";
import { SidebarProjectEmptyState } from "./empty-states";
import { SidebarConnectivityBanner } from "./sidebar-connectivity-banner";

function makeHost(serverId: string, label: string): HostProfile {
  const now = "2026-11-21T00:00:00.000Z";
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

function setHostProfiles(hosts: HostProfile[]): void {
  (
    getHostRuntimeStore() as unknown as {
      setHostsAndSync: (hosts: HostProfile[]) => void;
    }
  ).setHostsAndSync(hosts);
}

describe("sidebar offline and unreachable states", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;
  let queryClient: QueryClient | null = null;

  const renderElement = (element: React.ReactElement) => {
    act(() => {
      root?.render(<QueryClientProvider client={queryClient!}>{element}</QueryClientProvider>);
    });
  };

  beforeEach(async () => {
    vi.stubGlobal("React", React);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    await testI18n.changeLanguage("en");
    useSidebarViewStore.getState().clearHostFilters();
    setNetworkStatus({ online: true, type: "wifi" });
    setHostProfiles([]);
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
    useSidebarViewStore.getState().clearHostFilters();
    setNetworkStatus({ online: true, type: "unknown" });
    setHostProfiles([]);
    await testI18n.changeLanguage("en");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows a non-blocking offline banner with retry when cached projects exist and the device is offline", () => {
    setNetworkStatus({ online: false, type: "none" });
    const onRefresh = vi.fn();
    const runtime = getHostRuntimeStore();
    const ensureSpy = vi.spyOn(runtime, "ensureConnectedAll").mockImplementation(() => {});
    const probeSpy = vi.spyOn(runtime, "runProbeCycleNow").mockResolvedValue();

    renderElement(<SidebarConnectivityBanner hasProjects onRefresh={onRefresh} />);

    const banner = container?.querySelector('[data-testid="sidebar-connectivity-banner"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("No internet connection");

    const retry = container?.querySelector('[data-testid="sidebar-connectivity-retry"]');
    expect(retry).not.toBeNull();
    act(() => {
      fireEvent.click(retry!);
    });

    expect(ensureSpy).toHaveBeenCalledWith({ verify: true });
    expect(probeSpy).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("hides the connectivity banner when online and no projects are shown", () => {
    renderElement(<SidebarConnectivityBanner hasProjects={false} />);

    expect(container?.querySelector('[data-testid="sidebar-connectivity-banner"]')).toBeNull();
  });

  it("shows a clear offline empty state with retry when the device has no network", () => {
    setNetworkStatus({ online: false, type: "none" });
    const onRefresh = vi.fn();
    const runtime = getHostRuntimeStore();
    const ensureSpy = vi.spyOn(runtime, "ensureConnectedAll").mockImplementation(() => {});
    const probeSpy = vi.spyOn(runtime, "runProbeCycleNow").mockResolvedValue();

    renderElement(<SidebarProjectEmptyState onRefresh={onRefresh} />);

    const card = container?.querySelector('[data-testid="sidebar-network-offline-empty-state"]');
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain("No internet connection");

    const retry = container?.querySelector('[data-testid="sidebar-network-offline-retry"]');
    expect(retry).not.toBeNull();
    act(() => {
      fireEvent.click(retry!);
    });

    expect(ensureSpy).toHaveBeenCalledWith({ verify: true });
    expect(probeSpy).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("shows an unreachable host empty state even without a host filter when every host is offline", () => {
    setHostProfiles([makeHost("srv-offline", "Work Mac")]);

    renderElement(<SidebarProjectEmptyState />);

    const card = container?.querySelector('[data-testid="sidebar-host-away-empty-state"]');
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain("Work Mac");
    expect(container?.querySelector('[data-testid="sidebar-host-away-retry"]')).not.toBeNull();
  });
});
