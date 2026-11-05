import { test, expect } from "../support/fixtures";
import { parseConnectionOfferFromUrl } from "@getpaseo/protocol/connection-offer";
import { startLocalWorkerRelay } from "../support/helpers/local-elixir-relay";
import { saveLinkedHostBeforeLoad } from "../support/helpers/host-confirmation";
import { openSettings } from "../support/helpers/app";
import { openSettingsHost, selectSettingsHost } from "../support/helpers/settings";
import { startIsolatedHostDaemon } from "../support/helpers/isolated-host-daemon";
import {
  expectPairingOffer,
  expectCompletePairingQr,
  expectRelayConsent,
  openPairDeviceModal,
  preparePairingHost,
} from "../support/helpers/pair-device";

test("opens relay consent in browser web", async ({ page }) => {
  const daemon = await startIsolatedHostDaemon("pair-device-browser-relay-off", {
    mutableRelay: { enabled: false },
  });
  try {
    await preparePairingHost(page, daemon);
    await openPairDeviceModal(page);
    await expectRelayConsent(page);
  } finally {
    await daemon.close();
  }
});

test("a paired relay host recovers after an outage and can be removed while offline", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const relay = await startLocalWorkerRelay();
  const daemon = await startIsolatedHostDaemon("srv_relay_recovery", {
    mutableRelay: { enabled: true, endpoint: relay.endpoint },
  });
  try {
    await preparePairingHost(page, daemon);
    await openPairDeviceModal(page);
    await expectPairingOffer(page);
    const offer = parseConnectionOfferFromUrl(
      await page.getByRole("textbox", { name: "Pairing link" }).inputValue(),
    );
    if (!offer) throw new Error("Invalid real daemon pairing offer");
    await saveLinkedHostBeforeLoad(page, {
      serverId: offer.serverId,
      relayEndpoint: offer.relay.endpoint,
      daemonPublicKeyB64: offer.daemonPublicKeyB64,
    });
    await page.reload();
    await openSettings(page);
    await selectSettingsHost(page, daemon.serverId);
    await openSettingsHost(page, daemon.serverId);
    const identity = page.getByTestId("host-page-identity");
    await expect(identity).toContainText("Online", { timeout: 30_000 });

    const connectionRoute = identity.getByTestId("host-connection-route-code");
    // This local relay has no fresh private-carrier route observation.
    await expect(connectionRoute).toHaveText("--");
    await expect(page.getByTestId("host-connection-route")).toHaveCount(0);
    await relay.stop();
    await expect(page.getByTestId("host-page-reconnect")).toBeVisible();
    await expect(connectionRoute).toHaveCount(0);
    await relay.start();
    await expect(identity).toContainText("Online", { timeout: 45_000 });
    await expect(page.getByTestId("host-connection-error")).toHaveCount(0);

    await relay.stop();
    await expect(page.getByTestId("host-page-reconnect")).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId("host-page-reconnect").click();
    await relay.start();
    await expect(identity).toContainText("Online", { timeout: 45_000 });

    await relay.stop();
    await page.goto("/open-project");
    await page.getByTestId(`manage-host-${daemon.serverId}`).click({ timeout: 30_000 });
    const card = page.getByTestId("host-page-connections-card");
    await expect(card).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("relay-offline-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(card.getByRole("button", { name: "Remove", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("relay-offline-mobile.png") });
    await card.getByRole("button", { name: "Remove", exact: true }).click();
    await page.getByTestId("remove-connection-confirm").click();
    await expect
      .poll(() =>
        page.evaluate((serverId) => {
          const hosts = JSON.parse(
            localStorage.getItem("@paseo:daemon-registry") ?? "[]",
          ) as Array<{ serverId: string }>;
          for (const host of hosts) if (host.serverId === serverId) return true;
          return false;
        }, daemon.serverId),
      )
      .toBe(false);
  } finally {
    await daemon.close();
    await relay.close();
  }
});

test("keeps the pairing QR code inside its compact tile", async ({ page }, testInfo) => {
  const daemon = await startIsolatedHostDaemon("pair-device-browser-compact", {
    mutableRelay: { enabled: true },
  });
  try {
    await preparePairingHost(page, daemon);
    await page.setViewportSize({ width: 320, height: 568 });
    await openPairDeviceModal(page);
    await expectPairingOffer(page);

    await expectCompletePairingQr(page);
    await page.screenshot({ path: testInfo.outputPath("pairing-compact.png") });
  } finally {
    await daemon.close();
  }
});
