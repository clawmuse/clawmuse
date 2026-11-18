import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { page } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteAccessState } from "@getpaseo/protocol/remote-access";
import { i18n } from "@/i18n/i18next";
import { RemoteAccessSection } from "./remote-access-section";

const fixture = vi.hoisted(() => ({
  getRemoteAccessState: vi.fn<() => Promise<{ state: RemoteAccessState }>>(),
  revokeRemoteController: vi.fn<(controllerId: string) => Promise<unknown>>(),
  enforceLocalAccessPolicy: vi.fn<() => Promise<void>>(),
}));

vi.mock("@/clawmuse/account-provider", () => ({
  useClawMuseAccount: () => ({
    state: { account: null, devices: [] },
    model: { registerDevice: vi.fn() },
  }),
}));

vi.mock("@/runtime/host-runtime", () => ({
  useHostRuntimeClient: () => ({
    isConnected: true,
    getRemoteAccessState: fixture.getRemoteAccessState,
    revokeRemoteController: fixture.revokeRemoteController,
    getLastServerInfoMessage: () => ({ serverId: "srv_1" }),
  }),
  getHostRuntimeStore: () => ({
    enforceLocalAccessPolicy: fixture.enforceLocalAccessPolicy,
    getHosts: () => [],
  }),
}));

let root: Root;
let container: HTMLDivElement;
let queryClient: QueryClient;

function mount() {
  act(() =>
    root.render(
      <QueryClientProvider client={queryClient}>
        <RemoteAccessSection serverId="srv_1" />
      </QueryClientProvider>,
    ),
  );
}

beforeEach(async () => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await page.viewport(1280, 900);
  await i18n.changeLanguage("zh-CN");
  fixture.getRemoteAccessState.mockReset();
  fixture.revokeRemoteController.mockReset().mockResolvedValue({});
  fixture.enforceLocalAccessPolicy.mockReset().mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});

afterEach(async () => {
  act(() => root.unmount());
  container.remove();
  queryClient.clear();
  await i18n.changeLanguage("en");
  vi.unstubAllGlobals();
});

describe("RemoteAccessSection", () => {
  it("shows and triggers revoke on the local controlled-only host when canRevoke is true", async () => {
    fixture.getRemoteAccessState.mockResolvedValue({
      state: {
        enabled: true,
        controlledOnly: true,
        receiving: true,
        canToggleReceiving: true,
        canManage: false,
        canRevoke: true,
        canPair: true,
        controllers: [
          {
            id: "controller_1",
            label: "ClawMuse controller",
            fingerprint: "61287f7839bd",
            manager: false,
            status: "authorized",
            createdAt: "2026-11-18T00:00:00.000Z",
            expiresAt: null,
          },
        ],
      },
    });

    mount();

    await expect.element(page.getByText("ClawMuse controller", { exact: true })).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "允许此电脑控制其他电脑", exact: true }))
      .not.toBeInTheDocument();

    const revokeButton = page.getByRole("button", { name: "撤销授权", exact: true });
    await expect.element(revokeButton).toBeVisible();
    await revokeButton.click();

    await vi.waitFor(() => {
      expect(fixture.revokeRemoteController).toHaveBeenCalledExactlyOnceWith("controller_1");
      expect(fixture.enforceLocalAccessPolicy).toHaveBeenCalledTimes(1);
    });
  });

  it("falls back to canManage when an older daemon omits canRevoke", async () => {
    fixture.getRemoteAccessState.mockResolvedValue({
      state: {
        enabled: true,
        controlledOnly: true,
        receiving: true,
        canToggleReceiving: true,
        canManage: false,
        canPair: true,
        controllers: [
          {
            id: "controller_legacy",
            label: "ClawMuse controller",
            fingerprint: "61287f7839bd",
            manager: false,
            status: "authorized",
            createdAt: "2026-11-18T00:00:00.000Z",
            expiresAt: null,
          },
        ],
      },
    });

    mount();

    await expect.element(page.getByText("ClawMuse controller", { exact: true })).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "撤销授权", exact: true }))
      .not.toBeInTheDocument();
  });
});
