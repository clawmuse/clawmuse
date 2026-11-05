import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DaemonClient, DaemonClientConfig } from "@getpaseo/client/internal/daemon-client";
import type { ConnectionOffer } from "@getpaseo/protocol/connection-offer";
import { loadDaemonClientConstructor } from "../../app/e2e/support/helpers/daemon-client-loader";
import { createNodeWebSocketFactory } from "../../app/e2e/support/helpers/node-ws-factory";
import { expect, test } from "../../app/e2e/support/fixtures";
import {
  startIsolatedHostDaemon,
  type IsolatedHostDaemon,
} from "../../app/e2e/support/helpers/isolated-host-daemon";
import { connectDaemonClient } from "../../app/e2e/support/helpers/daemon-client-loader";
import {
  closePairDeviceModal,
  declineRelay,
  enableRelayAndExpectFailure,
  enableRelayAndExpectOffer,
  expectDaemonPidUnchanged,
  expectPairingOffer,
  expectPairingDisconnected,
  expectRelayUpdateRequired,
  expectRelayConsent,
  openPairDeviceModal,
  openAccountFromHome,
  openRelaySecurityDocs,
  observePairingOfferRequests,
  prepareLocalPairingHost,
  preparePairingHost,
  reloadAndOpenPairDevice,
  retryRelayAndExpectFailure,
  switchPairDeviceToHost,
} from "../../app/e2e/support/helpers/pair-device";

interface RelayConfigDaemonClient {
  close(): Promise<void>;
  connect(): Promise<void>;
  patchDaemonConfig(config: { relay: { enabled: boolean } }): Promise<unknown>;
}

test.describe("local device relay pairing", () => {
  let relayOffDaemon: IsolatedHostDaemon;
  let relayEnableDaemon: IsolatedHostDaemon;
  let relayOverrideDaemon: IsolatedHostDaemon;
  let relayEnabledDaemon: IsolatedHostDaemon;
  let invalidRelayDaemon: IsolatedHostDaemon;

  test.beforeAll(async () => {
    [
      relayOffDaemon,
      relayEnableDaemon,
      relayOverrideDaemon,
      relayEnabledDaemon,
      invalidRelayDaemon,
    ] = await Promise.all([
      startIsolatedHostDaemon("pair-device-relay-off", {
        mutableRelay: { enabled: false },
      }),
      startIsolatedHostDaemon("pair-device-relay-enable", {
        mutableRelay: { enabled: false },
      }),
      startIsolatedHostDaemon("pair-device-relay-override"),
      startIsolatedHostDaemon("pair-device-relay-enabled", {
        mutableRelay: { enabled: true },
      }),
      startIsolatedHostDaemon("pair-device-relay-invalid", {
        mutableRelay: { enabled: false, endpoint: "invalid-endpoint" },
      }),
    ]);
  });

  test.afterAll(async () => {
    await Promise.all([
      relayOffDaemon.close(),
      relayEnableDaemon.close(),
      relayOverrideDaemon.close(),
      relayEnabledDaemon.close(),
      invalidRelayDaemon.close(),
    ]);
  });

  test("asks for consent and creates no QR when declined", async ({ page }) => {
    await prepareLocalPairingHost(page, relayOffDaemon);
    await openPairDeviceModal(page);
    await expectRelayConsent(page);
    await declineRelay(page);
    await openPairDeviceModal(page);
    await expectRelayConsent(page);
  });

  test("opens relay security documentation through the desktop opener", async ({ page }) => {
    await prepareLocalPairingHost(page, relayOffDaemon);
    await openPairDeviceModal(page);
    await openRelaySecurityDocs(page);
  });

  test("opens account connection from the home screen", async ({ page }) => {
    await prepareLocalPairingHost(page, relayOffDaemon);
    await openAccountFromHome(page);
    const modal = page.getByTestId("clawmuse-account-dialog");
    await expect(modal.getByText("ClawMuse account", { exact: true })).toBeVisible();
    await expect(modal.getByRole("button", { name: "Close", exact: true })).toBeVisible();
  });

  test("shows an actionable error when the daemon disconnects", async ({ page }) => {
    const daemon = await startIsolatedHostDaemon("pair-device-disconnect", {
      mutableRelay: { enabled: false },
    });
    try {
      await prepareLocalPairingHost(page, daemon);
      await openPairDeviceModal(page);
      await expectRelayConsent(page);
      await daemon.close();
      await expectPairingDisconnected(page);
    } finally {
      await daemon.close();
    }
  });

  test("pairs a device through the selected remote host", async ({ page }) => {
    await prepareLocalPairingHost(page, relayOffDaemon, [
      {
        serverId: relayEnabledDaemon.serverId,
        label: "Remote pairing host",
        endpoint: `127.0.0.1:${relayEnabledDaemon.port}`,
      },
    ]);
    await switchPairDeviceToHost(page, relayEnabledDaemon.serverId);
    await openPairDeviceModal(page);
    await expectPairingOffer(page);
  });

  test("enables relay live and keeps the saved offer after reload", async ({ page }) => {
    const daemonPid = relayEnableDaemon.getPid();
    await prepareLocalPairingHost(page, relayEnableDaemon);
    await openPairDeviceModal(page);
    await enableRelayAndExpectOffer(page);
    expectDaemonPidUnchanged(daemonPid, relayEnableDaemon.getPid());
    await closePairDeviceModal(page);
    await reloadAndOpenPairDevice(page);
    await expectPairingOffer(page);
  });

  test("keeps consent actionable when a launch override rejects enable", async ({ page }) => {
    await prepareLocalPairingHost(page, relayOverrideDaemon);
    await openPairDeviceModal(page);
    await expectRelayConsent(page);
    await enableRelayAndExpectFailure(page);
    await retryRelayAndExpectFailure(page);
  });

  test("keeps consent actionable when relay transport startup fails", async ({ page }) => {
    await prepareLocalPairingHost(page, invalidRelayDaemon);
    await openPairDeviceModal(page);
    await expectRelayConsent(page);
    await enableRelayAndExpectFailure(page, "Invalid host:port");
    await retryRelayAndExpectFailure(page, "Invalid host:port");
  });

  test("shows an offer immediately when relay is already enabled", async ({ page }) => {
    await prepareLocalPairingHost(page, relayEnabledDaemon);
    await openPairDeviceModal(page);
    await expectPairingOffer(page);
  });

  test("refreshes the mounted offer when another client disables relay", async ({ page }) => {
    const daemon = await startIsolatedHostDaemon("pair-device-live-config-push", {
      mutableRelay: { enabled: true },
    });
    const client = await connectDaemonClient<RelayConfigDaemonClient>({
      clientIdPrefix: "pair-device-live-config-push",
      port: daemon.port,
    });
    try {
      await prepareLocalPairingHost(page, daemon);
      await openPairDeviceModal(page);
      await expectPairingOffer(page);
      await client.patchDaemonConfig({ relay: { enabled: false } });
      await expectRelayConsent(page);
    } finally {
      await client.close();
      await daemon.close();
    }
  });

  test("asks for a host update when live relay config is unsupported", async ({
    page,
    relayConfigOutdatedDaemon,
  }) => {
    const expectNoUnsupportedRequest = observePairingOfferRequests(page, relayConfigOutdatedDaemon);
    await prepareLocalPairingHost(page, relayConfigOutdatedDaemon);
    await openPairDeviceModal(page);
    await expectRelayUpdateRequired(page);
    expectNoUnsupportedRequest();
  });
});

test("initializes controlled-only relay pairing, shows save errors, and approves a persistent manager", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120000);
  const daemon = await startIsolatedHostDaemon("controlled-only-browser", {
    mutableRelay: { enabled: false },
  });
  const clients: DaemonClient[] = [];
  const configPath = join(daemon.paseoHome, "config.json");
  const originalConfig = await readFile(configPath, "utf8");
  try {
    // Supply the OS bridge only; all app RPCs use the real isolated daemon.
    await page.exposeFunction("readRemoteAccessTestBridge", async (command: string) => {
      if (command === "desktop_local_credential")
        return (await readFile(join(daemon.paseoHome, "local-credential"), "utf8")).trim();
      if (command === "desktop_daemon_status") {
        let controlledOnly = false;
        try {
          controlledOnly =
            JSON.parse(await readFile(join(daemon.paseoHome, "remote-access.json"), "utf8"))
              .controlledOnly === true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        return {
          serverId: daemon.serverId,
          status: "running",
          listen: `127.0.0.1:${daemon.port}`,
          home: daemon.paseoHome,
          desktopManaged: true,
          controlledOnly,
        };
      }
      if (command === "get_desktop_settings")
        return {
          releaseChannel: "stable",
          daemon: { manageBuiltInDaemon: false, keepRunningAfterQuit: true },
        };
      return null;
    });
    await page.addInitScript(() => {
      const bridge = window as unknown as {
        readRemoteAccessTestBridge: (command: string) => Promise<unknown>;
        paseoDesktop: unknown;
      };
      bridge.paseoDesktop = {
        platform: "darwin",
        invoke: (command: string) => bridge.readRemoteAccessTestBridge(command),
        getPendingOpenProject: async () => null,
        events: { on: async () => () => undefined },
        opener: { openUrl: async () => undefined },
      };
    });
    await preparePairingHost(page, daemon);
    await page.setViewportSize({ width: 320, height: 568 });
    await openPairDeviceModal(page);
    const section = page.getByTestId("remote-access-section");
    const initialize = section.getByRole("button", {
      name: "Enable controlled-only mode and pair a manager",
      exact: true,
    });
    await expect(initialize).toBeVisible();
    await writeFile(configPath, "{invalid json");
    await initialize.click();
    await expect(section.getByRole("alert")).toContainText("Invalid JSON");
    await expect(initialize).toBeEnabled();
    await writeFile(configPath, originalConfig);
    await initialize.click();
    await expect(section.getByRole("img", { name: "Remote access pairing QR code" })).toBeVisible();
    await expect(section.getByRole("alert")).toHaveCount(0);
    await expect(
      section.getByText(
        "This computer can operate locally and receive remote connections. Outbound control is locked by its manager.",
        { exact: true },
      ),
    ).toBeVisible();
    const link = await section.getByText(/^https?:\/\/.*\/#offer=/).textContent();
    const offer = JSON.parse(
      Buffer.from(link!.split("#offer=")[1]!, "base64url").toString(),
    ) as ConnectionOffer;
    expect(new URL(link!).origin).toBe("https://app.clawmuse.com");
    expect(new URL(link!).pathname).toBe("/");
    expect(offer?.requiresAuthorization).toBe(true);
    expect(offer?.pairing).toHaveProperty("token");
    let pendingId = "";
    const Client = await loadDaemonClientConstructor<DaemonClientConfig, DaemonClient>();
    const manager = new Client({
      url: `ws://127.0.0.1:${daemon.port}/ws`,
      webSocketFactory: createNodeWebSocketFactory(),
      clientId: "browser-approved-manager",
      controllerCredential: {
        token: randomBytes(32).toString("base64url"),
        invitation: offer!.pairing!.token,
        label: "Test phone",
      },
      onPairingPending: (pending) => {
        pendingId = pending.controllerId;
      },
      reconnect: { enabled: false },
    });
    clients.push(manager);
    const connect = manager.connect();
    await expect.poll(() => pendingId).not.toBe("");
    await expect(section.getByText("Test phone · Manager", { exact: true })).toBeVisible();
    await section.getByRole("button", { name: "Allow persistent access", exact: true }).click();
    await connect;
    expect((await manager.getRemoteAccessState()).state.canManage).toBe(true);
    await expect(
      section.getByRole("button", {
        name: "Allow this computer to control other computers",
        exact: true,
      }),
    ).toHaveCount(0);
    const qr = section.getByRole("img", { name: "Remote access pairing QR code" });
    await qr.scrollIntoViewIfNeeded();
    await expect(qr).toBeInViewport({ ratio: 0.999 });
    await page.screenshot({ path: testInfo.outputPath("controlled-only-pairing.png") });

    // A fresh browser reaches host confirmation from the published fragment format without login.
    const context = await browser.newContext();
    try {
      const guest = await context.newPage();
      await guest.goto(`http://localhost:${process.env.E2E_METRO_PORT}/${new URL(link!).hash}`);
      await expect(guest.getByTestId("host-confirmation-server-id")).toHaveText(daemon.serverId);
      await expect(guest.getByTestId("host-confirmation-relay")).toHaveText(offer.relay.endpoint);
      await guest.getByTestId("host-confirmation-cancel").click();
      await expect(guest.getByTestId("host-confirmation")).toHaveCount(0);
    } finally {
      await context.close();
    }
  } finally {
    for (const client of clients) await client.close();
    await daemon.close();
  }
});
