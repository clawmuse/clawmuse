import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import { gotoAppShell } from "../support/helpers/app";
import { seedWorkspace, type SeededWorkspace } from "../support/helpers/seed-client";
import {
  closeSidebarDisplayPreferences,
  openMobileAgentSidebar,
  openSidebarDisplayPage,
  selectSidebarStatusGrouping,
  notOnMobileHome,
} from "../support/helpers/sidebar";

const TITLE = "Linux desktop sandbox launch support";

test("scales navigation icons and workspace rows together as the sidebar narrows", async ({
  page,
}) => {
  const seeded = await seedWorkspace({ repoPrefix: "sidebar-scale-", title: TITLE });
  try {
    await gotoAppShell(page);
    const row = page.getByRole("button", { name: new RegExp(TITLE) }).filter({ visible: true });
    await expect(row).toBeVisible();
    const nav = page.getByTestId("sidebar-global-new-workspace");
    const glyph = nav.locator("svg");
    const menu = page.getByTestId("menu-button");
    const rowBefore = await row.boundingBox();
    const navBefore = await nav.boundingBox();
    const glyphBefore = await glyph.boundingBox();
    const menuBefore = await menu.boundingBox();
    const handle = page.getByTestId("left-sidebar-resize-handle");
    const dragBy = async (delta: number) => {
      const grip = await handle.boundingBox();
      const x = grip!.x + grip!.width / 2;
      const y = grip!.y + grip!.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + delta, y, { steps: 30 });
      await page.mouse.up();
    };
    await dragBy(-500);
    await expect
      .poll(async () => (await nav.boundingBox())!.width)
      .toBeCloseTo(navBefore!.width * 0.7, 0);
    expect((await glyph.boundingBox())!.width).toBeCloseTo(glyphBefore!.width * 0.7, 0);
    for (const id of [
      "sidebar-global-new-workspace",
      "sidebar-sessions",
      "sidebar-search",
      "sidebar-schedules",
      "sidebar-goals",
      "sidebar-voice-assistant",
    ]) {
      const icon = page.getByTestId(id).locator("svg");
      await expect(icon).toHaveCount(1);
      expect((await icon.boundingBox())!.width).toBeCloseTo(glyphBefore!.width * 0.7, 0);
      await expect(icon).toHaveAttribute("viewBox", "0 0 24 24");
    }
    expect((await row.boundingBox())!.height).toBeCloseTo(rowBefore!.height * 0.7, 0);
    expect((await menu.boundingBox())!.width).toBeCloseTo(menuBefore!.width * 0.7, 0);
    await dragBy(90);
    await expect
      .poll(async () => (await page.getByTestId("sidebar-footer").boundingBox())!.width)
      .toBeGreaterThan(215);
    expect((await nav.boundingBox())!.width / navBefore!.width).toBeCloseTo(0.85, 1);
    await dragBy(120);
    await expect
      .poll(async () => (await nav.boundingBox())!.width)
      .toBeCloseTo(navBefore!.width, 0);
    expect((await row.boundingBox())!.height).toBeCloseTo(rowBefore!.height, 0);
    await dragBy(-500);
    await row.click();
    await expect(page.getByTestId("workspace-header-title")).toContainText(TITLE);
    await page.screenshot({ path: test.info().outputPath("scaled-sidebar-140.png") });
    await page.evaluate(() => {
      document.documentElement.style.zoom = "2";
    });
    await expect
      .poll(async () => (await glyph.boundingBox())!.width)
      .toBeCloseTo(glyphBefore!.width * 0.7 * 2, 0);
    await page.screenshot({ path: test.info().outputPath("scaled-sidebar-140-zoom-200.png") });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.screenshot({ path: test.info().outputPath("scaled-sidebar-140-zoom-200-dark.png") });
  } finally {
    await seeded.cleanup();
  }
});

async function seedChangedWorkspace() {
  const workspace = await seedWorkspace({
    repoPrefix: "sidebar-title-",
    title: TITLE,
    repo: { withRemote: true },
  });
  try {
    await rm(path.join(workspace.repoPath, "remote.git"), { recursive: true });
    await workspace.client.renameProject(workspace.projectId, "Paseo");
    await writeFile(path.join(workspace.repoPath, "README.md"), "Changed line\n".repeat(12345));
    await workspace.client.checkoutRefresh(workspace.repoPath);
    return workspace;
  } catch (error) {
    await workspace.cleanup();
    throw error;
  }
}

function workspaceRow(page: Page) {
  return page
    .getByRole("button", { name: new RegExp(TITLE) })
    .filter({ visible: true })
    .and(notOnMobileHome(page));
}

async function titleWidth(row: Locator) {
  return row
    .getByText(TITLE, { exact: true })
    .evaluate((element) => element.getBoundingClientRect().width);
}

async function toggleTrailing(page: Page, label: "Diff stats" | "Last activity", touch = false) {
  await openSidebarDisplayPage(page, "sidebar-display-show");
  await page.getByRole("menuitem", { name: label, exact: true }).click();
  if (touch) {
    await page
      .getByRole("button", { name: "Bottom sheet backdrop", exact: true })
      .click({ position: { x: 5, y: 5 } });
    await expect(
      page.getByRole("button", { name: "Bottom sheet backdrop", exact: true }),
    ).toHaveCount(0);
  } else {
    await closeSidebarDisplayPreferences(page);
  }
  await page.mouse.move(0, 0);
}

async function expectTouchTitleWidth(page: Page) {
  const row = workspaceRow(page);
  const archive = row.getByRole("button", { name: "Archive", exact: true });
  const menu = row.getByLabel("Workspace actions", { exact: true });
  await expect(archive).toBeVisible();
  await expect(archive).toHaveCSS("opacity", "1");
  await expect(archive).toBeEnabled();
  const archiveBox = await archive.boundingBox();
  const menuBox = await menu.boundingBox();
  expect(archiveBox!.width).toBe(32);
  expect(menuBox!.width).toBe(32);
  expect(archiveBox!.height).toBe(32);
  expect(menuBox!.height).toBe(32);
  expect(archiveBox!.x + archiveBox!.width).toBeLessThanOrEqual(menuBox!.x);
  const withDiff = await titleWidth(row);
  await toggleTrailing(page, "Diff stats", true);
  const withoutStats = await titleWidth(row);
  expect(withDiff).toBeCloseTo(withoutStats, 0);
  await toggleTrailing(page, "Last activity", true);
  expect(await titleWidth(row)).toBeCloseTo(withoutStats, 0);
  await toggleTrailing(page, "Diff stats", true);
}

let workspace: SeededWorkspace;

async function openTouchWorkspaceList(page: Page, testInfo: TestInfo) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await gotoAppShell(page);
  await expect
    .poll(async () => {
      const { entries } = await workspace.client.fetchWorkspaces();
      return entries.find((entry) => entry.id === workspace.workspaceId)?.diffStat?.additions;
    })
    .toBe(12345);

  await openMobileAgentSidebar(page);
  await expect(workspaceRow(page)).toBeVisible();
  await toggleTrailing(page, "Diff stats", true);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: testInfo.outputPath("sidebar.png") });
}

async function pinWorkspaceForLayout(page: Page) {
  await workspace.client.setWorkspacePinned(workspace.workspaceId, true);
  await expect(page.getByTestId("sidebar-pinned-section").and(notOnMobileHome(page))).toBeVisible();
}

async function moveWorkspaceToStatusGrouping(page: Page) {
  await workspace.client.setWorkspacePinned(workspace.workspaceId, false);
  await selectSidebarStatusGrouping(page);
}

async function openDesktopWorkspaceList(page: Page) {
  await gotoAppShell(page);
  await expect
    .poll(async () => {
      const { entries } = await workspace.client.fetchWorkspaces();
      return entries.find((entry) => entry.id === workspace.workspaceId)?.diffStat?.additions;
    })
    .toBe(12345);

  const row = workspaceRow(page);
  await expect(row).toBeVisible();
  await toggleTrailing(page, "Diff stats");
  await page.mouse.move(0, 0);
  await expect(row.getByTestId("sidebar-workspace-trailing-actions")).toHaveCSS("opacity", "0");
  await expect(row.getByText("+12.3k", { exact: true })).toBeVisible();
  return titleWidth(row);
}

async function expectHoverSharesTrailingSpace(page: Page, testInfo: TestInfo) {
  const row = workspaceRow(page);
  const rowBefore = await row.boundingBox();
  await row.hover();
  await expect(row.getByLabel("Workspace actions", { exact: true })).toBeVisible();
  await expect(row.getByTestId("sidebar-workspace-trailing-actions")).toHaveCSS("opacity", "1");
  await expect(row.getByTestId("sidebar-workspace-trailing-metadata")).toHaveCSS("opacity", "0");
  expect(await row.boundingBox()).toEqual(rowBefore);
  const title = await row.getByText(TITLE, { exact: true }).boundingBox();
  const archive = await row.getByRole("button", { name: "Archive", exact: true }).boundingBox();
  expect(title!.x + title!.width).toBeLessThanOrEqual(archive!.x);
  await page.screenshot({ path: testInfo.outputPath("desktop-hover.png") });
}

async function expectShortcutHintsKeepRowSize(page: Page, testInfo: TestInfo) {
  const row = workspaceRow(page);
  const before = await row.boundingBox();
  await page.keyboard.down("Alt");
  await expect(row.getByText("1", { exact: true })).toBeVisible();
  expect(await row.boundingBox()).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath("desktop-shortcuts.png") });
  await page.keyboard.up("Alt");
  await expect(row.getByText("1", { exact: true })).toHaveCount(0);
}

async function expectDisablingStatsExpandsTitle(page: Page, width: number) {
  await toggleTrailing(page, "Diff stats");
  expect(await titleWidth(workspaceRow(page))).toBeGreaterThan(width);
}

test.describe("with diff stats", () => {
  test.beforeEach(async () => {
    workspace = await seedChangedWorkspace();
  });
  test.afterEach(async () => {
    await workspace?.cleanup();
  });
  test("touch titles use the space occupied by hidden stats in every grouping", async ({
    page,
  }, testInfo) => {
    await openTouchWorkspaceList(page, testInfo);
    await expectTouchTitleWidth(page);
    await pinWorkspaceForLayout(page);
    await expectTouchTitleWidth(page);
    await moveWorkspaceToStatusGrouping(page);
    await expectTouchTitleWidth(page);
  });

  test("desktop actions share metadata space and leave no idle archive gap", async ({
    page,
  }, testInfo) => {
    const width = await openDesktopWorkspaceList(page);
    await page.screenshot({ path: testInfo.outputPath("desktop-idle.png") });
    const menu = page.getByTestId("window-application-menu");
    await expect(menu).toHaveCSS("width", "28px");
    const menuBox = await menu.boundingBox();
    expect(menuBox!.x).toBeLessThan(100);
    await menu.click();
    await expect(page.getByRole("menuitem", { name: "New workspace", exact: true })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Search", exact: true })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Settings", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expectHoverSharesTrailingSpace(page, testInfo);
    await expectShortcutHintsKeepRowSize(page, testInfo);
    await expectDisablingStatsExpandsTitle(page, width);
  });
});

async function expectArchiveUncovered(page: Page, screenshotPath: string) {
  const row = workspaceRow(page);
  const rowBefore = await row.boundingBox();
  const hiddenArchive = row.getByTestId(/^sidebar-workspace-archive-/);
  await page.mouse.move(0, 0);
  const actions = row.getByTestId("sidebar-workspace-trailing-actions");
  await expect(actions).toHaveCSS("opacity", "0");
  await expect(hiddenArchive).toBeDisabled();
  await row.hover();
  const archive = row.getByRole("button", { name: "Archive", exact: true });
  const menu = row.getByLabel("Workspace actions", { exact: true });
  await expect(menu).toBeVisible();
  await expect(archive).toHaveCSS("opacity", "1");
  await expect(archive).toBeEnabled();
  await archive.hover();
  await expect(menu).toBeVisible();
  const archiveBox = await archive.boundingBox();
  const menuBox = await menu.boundingBox();
  await row.screenshot({ path: screenshotPath });
  expect(archiveBox!.x + archiveBox!.width).toBeLessThanOrEqual(menuBox!.x);
  expect(await row.boundingBox()).toEqual(rowBefore);
  await expect(actions).toHaveCSS("transition-duration", "0.12s");
  await menu.click();
  await page.mouse.move(0, 0);
  await expect(page.getByRole("menuitem", { name: "Archive", exact: true })).toBeVisible();
  await expect(actions).toHaveCSS("opacity", "1");
  await page.keyboard.press("Escape");
  await page.mouse.move(0, 0);
  await expect(actions).toHaveCSS("opacity", "0");
}

test("time defaults on, can be disabled, and crossfades with actions in every grouping", async ({
  page,
}, testInfo) => {
  workspace = await seedWorkspace({ repoPrefix: "sidebar-archive-", title: TITLE });
  try {
    await gotoAppShell(page);
    await expect(workspaceRow(page)).toBeVisible();
    for (const grouping of ["project", "pinned", "status"] as const) {
      if (grouping === "pinned") await pinWorkspaceForLayout(page);
      if (grouping === "status") await moveWorkspaceToStatusGrouping(page);
      const row = workspaceRow(page);
      await page.mouse.move(0, 0);
      const time = row.getByTestId("sidebar-workspace-timestamp");
      await expect(time).toBeVisible();
      const titleBefore = await titleWidth(row);
      const titleBox = await row.getByText(TITLE, { exact: true }).boundingBox();
      const timeBox = await time.boundingBox();
      // Only the normal text gap separates title and time; no archive-width spacer.
      expect(timeBox!.x - titleBox!.x - titleBox!.width).toBeLessThanOrEqual(9);
      await row.screenshot({ path: testInfo.outputPath(`${grouping}-idle-time.png`) });
      await expectArchiveUncovered(page, testInfo.outputPath(`${grouping}-activity.png`));
      await toggleTrailing(page, "Last activity");
      await expect(time).toHaveCount(0);
      await expect(row.getByTestId("sidebar-workspace-trailing-actions")).toHaveCSS("opacity", "0");
      await expect.poll(() => titleWidth(row)).toBeGreaterThan(titleBefore);
      const fullTitle = await row.getByText(TITLE, { exact: true }).boundingBox();
      const column = await row.getByTestId(/^sidebar-workspace-text-/).boundingBox();
      expect(column!.x + column!.width - fullTitle!.x - fullTitle!.width).toBeLessThanOrEqual(1);
      await row.screenshot({ path: testInfo.outputPath(`${grouping}-idle-no-time.png`) });
      await expectArchiveUncovered(page, testInfo.outputPath(`${grouping}-no-trailing.png`));
      await toggleTrailing(page, "Last activity");
      await expect(time).toBeVisible();
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    // Reanimated reads the initial system preference when the component mounts.
    await page.reload();
    await expect(workspaceRow(page)).toBeVisible();
    await workspaceRow(page).hover();
    await expect(workspaceRow(page).getByTestId("sidebar-workspace-trailing-actions")).toHaveCSS(
      "transition-duration",
      "0s",
    );
  } finally {
    await workspace.cleanup();
  }
});
