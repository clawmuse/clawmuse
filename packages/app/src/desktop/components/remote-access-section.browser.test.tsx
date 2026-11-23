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
  decideRemotePairing:
    vi.fn<
      (input: { controllerId: string; approve: boolean; persistent: boolean }) => Promise<unknown>
    >(),
  createRemoteAccessInvitation: vi.fn<
    (input?: { bootstrap?: boolean; manager?: boolean }) => Promise<{
      url: string;
      expiresAt: string;
    }>
  >(),
  getDaemonConfig: vi.fn<() => Promise<{ config: { relay?: { enabled?: boolean } } }>>(),
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
    decideRemotePairing: fixture.decideRemotePairing,
    createRemoteAccessInvitation: fixture.createRemoteAccessInvitation,
    getDaemonConfig: fixture.getDaemonConfig,
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

function mount(onPendingAppear?: () => void) {
  act(() =>
    root.render(
      <QueryClientProvider client={queryClient}>
        <RemoteAccessSection serverId="srv_1" onPendingAppear={onPendingAppear} />
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
  fixture.decideRemotePairing.mockReset().mockResolvedValue({});
  fixture.createRemoteAccessInvitation.mockReset().mockResolvedValue({
    url: "paseo://pair?invite=test-token",
    expiresAt: "2026-11-19T12:00:00.000Z",
  });
  fixture.getDaemonConfig.mockReset().mockResolvedValue({ config: { relay: { enabled: true } } });
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

  it("renders pending pairing requests above authorized controllers and approves them", async () => {
    fixture.getRemoteAccessState.mockResolvedValue({
      state: {
        enabled: true,
        controlledOnly: false,
        receiving: true,
        canToggleReceiving: true,
        canManage: true,
        canRevoke: true,
        canPair: true,
        controllers: [
          {
            id: "controller_auth",
            label: "Existing Manager",
            fingerprint: "92388187d55e",
            manager: true,
            status: "authorized",
            createdAt: "2026-11-18T00:00:00.000Z",
            expiresAt: null,
          },
          {
            id: "controller_pending",
            label: "New Phone",
            fingerprint: "abcdef123456",
            manager: false,
            status: "pending",
            createdAt: "2026-11-19T00:00:00.000Z",
            expiresAt: "2026-11-19T01:00:00.000Z",
          },
        ],
      },
    });

    mount();

    const pendingCard = page.getByTestId("remote-access-pending-controller_pending");
    await expect.element(pendingCard).toBeVisible();
    await expect.element(page.getByText("待确认", { exact: true })).toBeVisible();
    await expect.element(page.getByText("核对码：abcdef123456", { exact: true })).toBeVisible();

    const pendingTop = (await pendingCard.element()).getBoundingClientRect().top;
    const authorizedTop = (
      await page.getByText("Existing Manager · 管理员", { exact: true }).element()
    ).getBoundingClientRect().top;
    expect(pendingTop).toBeLessThan(authorizedTop);

    await page.getByRole("button", { name: "允许长期访问", exact: true }).click();
    await vi.waitFor(() => {
      expect(fixture.decideRemotePairing).toHaveBeenCalledExactlyOnceWith({
        controllerId: "controller_pending",
        approve: true,
        persistent: true,
      });
    });
  });

  it("dismisses the consumed QR code and notifies onPendingAppear when a scanned device arrives", async () => {
    const onPendingAppear = vi.fn();
    let currentState: RemoteAccessState = {
      enabled: true,
      controlledOnly: false,
      receiving: true,
      canToggleReceiving: true,
      canManage: true,
      canRevoke: true,
      canPair: true,
      controllers: [
        {
          id: "controller_existing_pending",
          label: "Earlier Pending",
          fingerprint: "111111111111",
          manager: false,
          status: "pending",
          createdAt: "2026-11-18T00:00:00.000Z",
          expiresAt: "2026-11-19T01:00:00.000Z",
        },
      ],
    };
    fixture.getRemoteAccessState.mockImplementation(async () => ({ state: currentState }));

    mount(onPendingAppear);

    await expect
      .element(page.getByTestId("remote-access-pending-controller_existing_pending"))
      .toBeVisible();
    expect(onPendingAppear).not.toHaveBeenCalled();

    await page.getByRole("button", { name: "生成控制端配对链接", exact: true }).click();
    await expect.element(page.getByText("paseo://pair?invite=test-token")).toBeVisible();
    await expect
      .element(page.getByText("等待扫码，扫码后确认卡片会显示在顶部", { exact: true }))
      .toBeVisible();

    currentState = {
      ...currentState,
      controllers: [
        ...currentState.controllers,
        {
          id: "controller_scanned",
          label: "Scanned Phone",
          fingerprint: "222222222222",
          manager: false,
          status: "pending",
          createdAt: "2026-11-19T00:00:00.000Z",
          expiresAt: "2026-11-19T01:00:00.000Z",
        },
      ],
    };

    await vi.waitFor(
      () => {
        expect(onPendingAppear).toHaveBeenCalledTimes(1);
      },
      { timeout: 3000 },
    );
    await expect
      .element(page.getByTestId("remote-access-pending-controller_scanned"))
      .toBeVisible();
    await expect.element(page.getByText("paseo://pair?invite=test-token")).not.toBeInTheDocument();

    const scannedTop = (
      await page.getByTestId("remote-access-pending-controller_scanned").element()
    ).getBoundingClientRect().top;
    const earlierTop = (
      await page.getByTestId("remote-access-pending-controller_existing_pending").element()
    ).getBoundingClientRect().top;
    expect(scannedTop).toBeLessThan(earlierTop);
  });
});
