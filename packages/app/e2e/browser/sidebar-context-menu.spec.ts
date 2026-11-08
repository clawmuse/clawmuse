import { expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { daemonWsRoutePattern } from "../support/helpers/daemon-port";
import { getServerId } from "../support/helpers/server-id";
import {
  createMockIdleAgent,
  openWorkspaceWithAgents,
  expectWorkspaceTabHidden,
  expectWorkspaceTabVisible,
} from "../support/helpers/archive-tab";
import { test } from "../support/fixtures";
import { gotoAppShell } from "../support/helpers/app";
import { seedWorkspace, type SeedDaemonClient } from "../support/helpers/seed-client";
import {
  expectWorkspaceAbsentFromSidebar,
  selectWorkspaceInSidebar,
  closeProjectContextMenu,
  closeWorkspaceContextMenu,
  expectProjectContextMenuActions,
  expectWorkspaceContextMenuActions,
  expectWorkspaceContextMenuOwnsAttention,
  expectWorkspaceRowHoverCleared,
  openProjectContextMenu,
  openWorkspaceContextMenu,
  showWorkspaceHoverCard,
} from "../support/helpers/sidebar";

async function agentIds(client: SeedDaemonClient): Promise<string[]> {
  return (await client.fetchAgents()).entries.map(({ agent }) => agent.id);
}

async function workspaceIds(client: SeedDaemonClient): Promise<string[]> {
  return (await client.fetchWorkspaces()).entries.map((entry) => entry.id);
}

// Reproduce the existing daemon's delete acknowledgement without durable removal.
// All discovery, verification, and the subsequent retry use the real daemon.
async function acknowledgeNextDeleteWithoutRemoving(page: Page) {
  let failNext = true;
  await page.routeWebSocket(daemonWsRoutePattern(), (browser) => {
    const server = browser.connectToServer();
    browser.onMessage((message) => {
      if (typeof message === "string") {
        const envelope = JSON.parse(message) as {
          type?: string;
          message?: { type?: string; agentId?: string; requestId?: string };
        };
        const request = envelope.message;
        if (failNext && envelope.type === "session" && request?.type === "delete_agent_request") {
          failNext = false;
          browser.send(
            JSON.stringify({
              type: "session",
              message: {
                type: "agent_deleted",
                payload: { agentId: request.agentId, requestId: request.requestId },
              },
            }),
          );
          return;
        }
      }
      server.send(message);
    });
    server.onMessage((message) => browser.send(message));
  });
}

async function rejectNextWorkspaceDelete(page: Page) {
  let rejectNext = true;
  await page.routeWebSocket(daemonWsRoutePattern(), (browser) => {
    const server = browser.connectToServer();
    browser.onMessage((message) => {
      if (typeof message === "string") {
        const envelope = JSON.parse(message) as {
          type?: string;
          message?: { type?: string; workspaceId?: string; requestId?: string };
        };
        const request = envelope.message;
        if (rejectNext && request?.type === "workspace.delete.request") {
          rejectNext = false;
          browser.send(
            JSON.stringify({
              type: "session",
              message: {
                type: "workspace.delete.response",
                payload: {
                  workspaceId: request.workspaceId,
                  requestId: request.requestId,
                  error: "Could not stop terminal",
                },
              },
            }),
          );
          return;
        }
      }
      server.send(message);
    });
    server.onMessage((message) => browser.send(message));
  });
}

test.describe("Sidebar context menus", () => {
  test("right-clicking workspace and project rows opens their actions at the pointer", async ({
    page,
  }) => {
    const workspace = await seedWorkspace({ repoPrefix: "sidebar-context-menu-" });

    try {
      await gotoAppShell(page);

      await showWorkspaceHoverCard(page, workspace.workspaceId);
      await openWorkspaceContextMenu(page, workspace.workspaceId);
      await expectWorkspaceContextMenuActions(page, workspace.workspaceId);
      await expectWorkspaceContextMenuOwnsAttention(page);

      await closeWorkspaceContextMenu(page, workspace.workspaceId);
      await expectWorkspaceRowHoverCleared(page, workspace.workspaceId);
      await openProjectContextMenu(page, workspace.projectKey);
      await expectProjectContextMenuActions(page, workspace.projectKey);

      await closeProjectContextMenu(page, workspace.projectKey);
    } finally {
      await workspace.cleanup();
    }
  });
  test("deletes only the current conversation after confirmation", async ({ page }) => {
    test.setTimeout(180_000);
    await acknowledgeNextDeleteWithoutRemoving(page);
    const workspace = await seedWorkspace({ repoPrefix: "sidebar-delete-conversation-" });
    try {
      const survivor = await createMockIdleAgent(workspace.client, {
        cwd: workspace.repoPath,
        workspaceId: workspace.workspaceId,
        title: "Keep this conversation",
      });
      const target = await createMockIdleAgent(workspace.client, {
        cwd: workspace.repoPath,
        workspaceId: workspace.workspaceId,
        title: "Delete this conversation",
      });
      const originalFile = await readFile(path.join(workspace.repoPath, "README.md"), "utf8");
      await gotoAppShell(page);
      await openWorkspaceWithAgents(page, [survivor, target]);
      const deleteItem = page.getByTestId(
        `sidebar-workspace-menu-delete-${getServerId()}:${workspace.workspaceId}`,
      );
      await openWorkspaceContextMenu(page, workspace.workspaceId);
      await expect(deleteItem).toHaveText("Delete current conversation");
      page.once("dialog", async (dialog) => {
        expect(dialog.message()).toContain(target.title);
        expect(dialog.message()).toContain("cannot be undone");
        await dialog.dismiss();
      });
      await deleteItem.click();
      await expectWorkspaceTabVisible(page, target.id);
      expect((await workspace.client.fetchAgents()).entries.map(({ agent }) => agent.id)).toContain(
        target.id,
      );

      await openWorkspaceContextMenu(page, workspace.workspaceId);
      page.once("dialog", (dialog) => dialog.accept());
      await deleteItem.click();
      await expect(page.getByTestId("app-toast-message")).toHaveText(
        "Failed to delete conversation. Please try again.",
      );
      await expectWorkspaceTabVisible(page, target.id);
      expect(await agentIds(workspace.client)).toContain(target.id);
      await openWorkspaceContextMenu(page, workspace.workspaceId);
      page.once("dialog", (dialog) => dialog.accept());
      await deleteItem.click();
      await expectWorkspaceTabHidden(page, target.id);
      await expectWorkspaceTabVisible(page, survivor.id);
      await expect.poll(() => agentIds(workspace.client)).not.toContain(target.id);
      expect((await workspace.client.fetchAgents()).entries.map(({ agent }) => agent.id)).toContain(
        survivor.id,
      );
      expect(await readFile(path.join(workspace.repoPath, "README.md"), "utf8")).toBe(originalFile);
      await page.reload();
      await expectWorkspaceTabVisible(page, survivor.id);
      await expectWorkspaceTabHidden(page, target.id);
    } finally {
      await workspace.cleanup();
    }
  });
  test("permanently deletes a workspace and keeps its sibling and project files after reload", async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    await rejectNextWorkspaceDelete(page);
    const workspace = await seedWorkspace({
      repoPrefix: "workspace-delete-",
      title: "Delete this space",
    });
    try {
      const sibling = await workspace.client.createWorkspace({
        source: { kind: "directory", path: workspace.repoPath },
        title: "Keep this space",
      });
      expect(sibling.workspace).not.toBeNull();
      const siblingId = sibling.workspace!.id;
      const target = await createMockIdleAgent(workspace.client, {
        cwd: workspace.repoPath,
        workspaceId: workspace.workspaceId,
        title: "Delete active conversation",
      });
      const archived = await createMockIdleAgent(workspace.client, {
        cwd: workspace.repoPath,
        workspaceId: workspace.workspaceId,
        title: "Delete archived conversation",
      });
      await workspace.client.archiveAgent(archived.id);
      const survivor = await createMockIdleAgent(workspace.client, {
        cwd: workspace.repoPath,
        workspaceId: siblingId,
        title: "Keep sibling conversation",
      });
      const terminal = await workspace.client.createTerminal(
        workspace.repoPath,
        "Delete terminal",
        undefined,
        { workspaceId: workspace.workspaceId },
      );
      expect(terminal.error).toBeNull();
      const originalFile = await readFile(path.join(workspace.repoPath, "README.md"), "utf8");
      await gotoAppShell(page);
      await selectWorkspaceInSidebar(page, workspace.workspaceId);
      const otherPage = await context.newPage();
      await gotoAppShell(otherPage);
      const rowId = `sidebar-workspace-row-${getServerId()}:${workspace.workspaceId}`;
      await expect(otherPage.getByTestId(rowId)).toBeVisible();
      const deleteItem = page.getByTestId(
        `sidebar-workspace-menu-delete-workspace-${getServerId()}:${workspace.workspaceId}`,
      );
      await openWorkspaceContextMenu(page, workspace.workspaceId);
      page.once("dialog", async (dialog) => {
        expect(dialog.message()).toContain("Delete this space");
        expect(dialog.message()).toContain("files will be kept");
        await dialog.dismiss();
      });
      await deleteItem.click();
      await expect(page.getByTestId(rowId)).toBeVisible();
      await openWorkspaceContextMenu(page, workspace.workspaceId);
      page.once("dialog", (dialog) => dialog.accept());
      await deleteItem.click();
      await expect(page.getByTestId("app-toast-message")).toHaveText(
        "Failed to delete workspace: Could not stop terminal",
      );
      await expect(page.getByTestId(rowId)).toBeVisible();
      expect(await agentIds(workspace.client)).toContain(target.id);
      await openWorkspaceContextMenu(page, workspace.workspaceId);
      page.once("dialog", (dialog) => dialog.accept());
      await deleteItem.click();
      await expectWorkspaceAbsentFromSidebar(page, workspace.workspaceId);
      await expectWorkspaceAbsentFromSidebar(otherPage, workspace.workspaceId);
      await expect(
        page.getByTestId(`sidebar-workspace-row-${getServerId()}:${siblingId}`),
      ).toBeVisible();
      await expect.poll(() => agentIds(workspace.client)).not.toContain(target.id);
      expect(await agentIds(workspace.client)).toContain(survivor.id);
      expect(
        (
          await workspace.client.listTerminals(workspace.repoPath, undefined, {
            workspaceId: workspace.workspaceId,
          })
        ).terminals,
      ).toEqual([]);
      expect(await readFile(path.join(workspace.repoPath, "README.md"), "utf8")).toBe(originalFile);
      await page.reload();
      await expect(
        page.getByTestId(`sidebar-workspace-row-${getServerId()}:${siblingId}`),
      ).toBeVisible();
      await expectWorkspaceAbsentFromSidebar(page, workspace.workspaceId);
      await otherPage.close();
    } finally {
      await workspace.cleanup();
    }
  });

  test("deletes an empty workspace from the compact menu", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const workspace = await seedWorkspace({ repoPrefix: "empty-workspace-delete-" });
    try {
      await gotoAppShell(page);
      // The compact home list has its own workspace menu before any conversation exists.
      await page
        .getByTestId(`sidebar-workspace-kebab-${getServerId()}:${workspace.workspaceId}`)
        .first()
        .click();
      page.once("dialog", (dialog) => dialog.accept());
      await page
        .getByTestId(
          `sidebar-workspace-menu-delete-workspace-${getServerId()}:${workspace.workspaceId}`,
        )
        .click();
      await expect.poll(() => workspaceIds(workspace.client)).not.toContain(workspace.workspaceId);
      await expect(
        page.getByTestId(`sidebar-workspace-row-${getServerId()}:${workspace.workspaceId}`),
      ).toHaveCount(0);
      await page.reload();
      await expect(
        page.getByTestId(`sidebar-workspace-row-${getServerId()}:${workspace.workspaceId}`),
      ).toHaveCount(0);
    } finally {
      await workspace.cleanup();
    }
  });
});
