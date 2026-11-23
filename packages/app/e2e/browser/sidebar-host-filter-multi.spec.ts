import { expect, type Locator } from "@playwright/test";
import { test } from "../support/fixtures";
import { gotoAppShell } from "../support/helpers/app";
import {
  addOfflineHostAndReload,
  expectHostFilterRow,
  openSidebarHostFilter,
  selectAllHostsFilter,
  toggleHostFilter,
} from "../support/helpers/hosts";
import { seedWorkspace } from "../support/helpers/seed-client";
import { getServerId } from "../support/helpers/server-id";

const SECONDARY_HOST_ID = "host-filter-secondary";

function selectionHeight(chip: Locator) {
  return chip.evaluate(
    (button) =>
      [button, ...Array.from(button.children)]
        .find((element) => getComputedStyle(element).backgroundColor !== "rgba(0, 0, 0, 0)")
        ?.getBoundingClientRect().height,
  );
}

test.describe("Sidebar host filter (multi-select)", () => {
  test.describe.configure({ timeout: 120_000 });

  test("uses the desktop selection background height in the compact sidebar", async ({ page }) => {
    await gotoAppShell(page);
    await addOfflineHostAndReload(page, { serverId: SECONDARY_HOST_ID, label: "Secondary Host" });
    const chip = page.getByTestId(`sidebar-host-strip-chip-${getServerId()}`);
    const all = page.getByTestId("sidebar-host-strip-all");

    await chip.click();
    await page.mouse.move(2, 2);
    await expect.poll(() => selectionHeight(chip)).toBe(26);
    await all.click();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Open menu", exact: true }).click();
    // The top of the touch target is above the centered selection background.
    await chip.click({ position: { x: 12, y: 2 } });
    await page.mouse.move(2, 2);
    await expect.poll(() => selectionHeight(chip)).toBe(26);
    expect(await chip.evaluate((button) => button.getBoundingClientRect().height)).toBe(44);

    await all.click();
    await page.mouse.move(2, 2);
    await expect.poll(() => selectionHeight(all)).toBe(26);
  });

  test("pins the sidebar to multiple selected hosts at once", async ({ page }) => {
    const seeded = await seedWorkspace({ repoPrefix: "host-filter-" });
    const serverId = getServerId();
    const workspaceRow = page.getByTestId(
      `sidebar-workspace-row-${serverId}:${seeded.workspaceId}`,
    );

    try {
      // A second (offline) host is enough to surface the host filter without a second daemon.
      await gotoAppShell(page);
      await addOfflineHostAndReload(page, { serverId: SECONDARY_HOST_ID, label: "Secondary Host" });
      await expect(workspaceRow).toBeVisible({ timeout: 30_000 });

      await openSidebarHostFilter(page);
      await expectHostFilterRow(page, serverId);
      await expectHostFilterRow(page, SECONDARY_HOST_ID);

      // Pin the primary host — its workspace stays visible.
      await toggleHostFilter(page, serverId);
      await expect(workspaceRow).toBeVisible();

      // Add the secondary host without clearing the primary. Under single-select this would replace
      // the primary and hide the workspace; multi-select keeps both pinned, so it stays visible.
      await toggleHostFilter(page, SECONDARY_HOST_ID);
      await expect(workspaceRow).toBeVisible();

      // Drop the primary host — only the (empty) secondary host remains pinned, so the workspace hides.
      await toggleHostFilter(page, serverId);
      await expect(workspaceRow).toHaveCount(0, { timeout: 10_000 });

      // Back to all hosts — the workspace returns.
      await selectAllHostsFilter(page);
      await expect(workspaceRow).toBeVisible({ timeout: 10_000 });
    } finally {
      await seeded.cleanup();
    }
  });
});
