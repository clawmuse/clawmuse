import { existsSync } from "node:fs";
import { expect, test } from "../support/fixtures";
import { gotoAppShell } from "../support/helpers/app";
import { seedWorkspace } from "../support/helpers/seed-client";
import {
  expectWorkspaceAbsentFromSidebar,
  selectWorkspaceInSidebar,
  expectMobileAgentSidebarHidden,
  expectMobileAgentSidebarVisible,
} from "../support/helpers/sidebar";
import { waitForSidebarHydration } from "../support/helpers/workspace-ui";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";

test.describe("Workspace archive shortcut", () => {
  test("archives the selected workspace without removing its local checkout", async ({ page }) => {
    const workspace = await seedWorkspace({ repoPrefix: "archive-shortcut-" });

    try {
      await gotoAppShell(page);
      await waitForSidebarHydration(page);
      await selectWorkspaceInSidebar(page, workspace.workspaceId);

      const modifier = process.platform === "darwin" ? "Meta" : "Control";
      await page.keyboard.press(`${modifier}+Shift+Backspace`);

      await expectWorkspaceAbsentFromSidebar(page, workspace.workspaceId);
      expect(existsSync(workspace.repoPath)).toBe(true);
    } finally {
      await workspace.cleanup();
    }
  });
});

test("archiving from compact chat opens the workspace list", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const workspace = await seedMockAgentWorkspace({
    repoPrefix: "archive-chat-list-",
    title: "Archive from chat",
  });

  try {
    await openAgentRoute(page, workspace);
    await expectMobileAgentSidebarHidden(page);
    await page.getByRole("button", { name: "Archive workspace", exact: true }).click();

    await expectMobileAgentSidebarVisible(page);
    await expectWorkspaceAbsentFromSidebar(page, workspace.workspaceId);
    expect(existsSync(workspace.cwd)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("archived-workspace-list.png") });
  } finally {
    await workspace.cleanup();
  }
});

for (const width of [1280, 390]) {
  test(`AI archive preserves unverified agents through the real daemon at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const workspace = await seedMockAgentWorkspace({
      repoPrefix: "ai-archive-",
      title: "Unverified task",
    });
    try {
      await gotoAppShell(page);
      await waitForSidebarHydration(page);
      const entry = width < 600 ? "mobile-home-ai-archive" : "sidebar-ai-archive";
      await page.locator(`[data-testid="${entry}"]:visible`).first().click();
      await page.getByTestId("ai-archive-auto").click();
      const row = page.getByTestId(`ai-archive-row-${workspace.agentId}`);
      await expect(row).toContainText("Keep open");
      await expect(row).toContainText("Not enough conversation history to verify completion.");
      await expect(page.getByTestId("ai-archive-scan")).toBeEnabled();
      expect(
        (await workspace.client.fetchAgent({ agentId: workspace.agentId }))?.agent.archivedAt,
      ).toBeNull();
      expect(existsSync(workspace.cwd)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`ai-archive-${width}.png`) });
    } finally {
      await workspace.cleanup();
    }
  });
}
