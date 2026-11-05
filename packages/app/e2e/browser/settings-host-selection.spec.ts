import { expect, test } from "../support/fixtures";
import { openSettings } from "../support/helpers/app";
import { getE2EDaemonPort, wsRoutePatternForPort } from "../support/helpers/daemon-port";
import { startIsolatedHostDaemon } from "../support/helpers/isolated-host-daemon";
import {
  addDirectHostFromSettings,
  clickSettingsBackToWorkspace,
  goBackInSettings,
  openCompactSettings,
  openSettingsHostSection,
  openSettingsSection,
  seedSavedSettingsHosts,
  selectSettingsHost,
} from "../support/helpers/settings";
import { getServerId } from "../support/helpers/server-id";
import { seedWorkspace } from "../support/helpers/seed-client";
import { switchWorkspaceViaSidebar } from "../support/helpers/workspace-ui";
import { buildOpenProjectRoute } from "@/utils/host-routes";
import { connectNewWorkspaceDaemonClient } from "../support/helpers/new-workspace";

test.describe("Settings host selection", () => {
  test.describe.configure({ timeout: 180_000 });

  test("keeps the chosen host across compact settings and saves its realtime assistant", async ({
    page,
  }) => {
    const remote = await startIsolatedHostDaemon("settings-voice-remote");
    const primary = await connectNewWorkspaceDaemonClient({ ownProjects: false });
    const remoteClient = await connectNewWorkspaceDaemonClient({
      port: remote.port,
      ownProjects: false,
    });
    const primaryBefore = (await primary.getDaemonConfig()).config.speech?.assistant;
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await seedSavedSettingsHosts(page, [
        {
          serverId: getServerId(),
          label: "Primary host",
          endpoint: `127.0.0.1:${getE2EDaemonPort()}`,
        },
        { serverId: remote.serverId, label: "Voice host", endpoint: `127.0.0.1:${remote.port}` },
      ]);
      await page.reload();
      await openCompactSettings(page, buildOpenProjectRoute());
      await selectSettingsHost(page, remote.serverId);
      await expect(
        page.getByTestId("settings-host-picker").getByRole("img", { name: "Online" }),
      ).toBeVisible({ timeout: 30_000 });
      await openSettingsHostSection(page, remote.serverId, "voice");
      await expect(page.getByTestId("assistant-settings")).toBeVisible();
      await page.getByTestId("assistant-minutes").fill("90");
      await page.getByTestId("assistant-save").click();
      await expect
        .poll(
          async () =>
            (await remoteClient.getDaemonConfig()).config.speech?.assistant?.maxSessionMinutes,
        )
        .toBe(90);
      expect((await primary.getDaemonConfig()).config.speech?.assistant).toEqual(primaryBefore);
      await goBackInSettings(page);
      await openSettingsSection(page, "appearance");
      await goBackInSettings(page);
      await openSettingsHostSection(page, remote.serverId, "voice");
      await expect(page.getByTestId("assistant-minutes")).toHaveValue("90");
    } finally {
      await remoteClient.close();
      await primary.close();
      await remote.close();
    }
  });

  test("entering Settings from a remote workspace selects that remote host", async ({ page }) => {
    const remoteDaemon = await startIsolatedHostDaemon("settings-host-selection-remote");
    const remoteWorkspace = await seedWorkspace({
      port: remoteDaemon.port,
      repoPrefix: "settings-host-selection-remote-workspace-",
      title: "Remote workspace",
    });

    try {
      // The default local profile remains in the registry, but its daemon is offline.
      await page.routeWebSocket(wsRoutePatternForPort(getE2EDaemonPort()), async (ws) => {
        await ws.close({ code: 1008, reason: "The local daemon is disconnected." });
      });

      await page.goto("/");
      await openSettings(page);
      await addDirectHostFromSettings(page, {
        host: "127.0.0.1",
        port: remoteDaemon.port,
      });

      await clickSettingsBackToWorkspace(page);
      await switchWorkspaceViaSidebar({
        page,
        serverId: remoteDaemon.serverId,
        workspaceId: remoteWorkspace.workspaceId,
      });

      await openSettings(page);

      await openSettingsHostSection(page, remoteDaemon.serverId, "connections");

      await selectSettingsHost(page, getServerId());
      await openSettingsSection(page, "appearance");
      await openSettingsHostSection(page, getServerId(), "connections");

      await clickSettingsBackToWorkspace(page);
      await openSettings(page);
      await openSettingsHostSection(page, remoteDaemon.serverId, "connections");
    } finally {
      await remoteWorkspace.cleanup().catch(() => undefined);
      await remoteDaemon.close().catch(() => undefined);
    }
  });
});
