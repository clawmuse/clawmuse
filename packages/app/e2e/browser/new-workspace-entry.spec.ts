import { expect, test } from "../support/fixtures";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";
import type { AgentTokenSpeed } from "@getpaseo/protocol/agent-types";
import { gotoAppShell } from "../support/helpers/app";
import { createMockIdleAgent, fetchAgentArchivedAt } from "../support/helpers/archive-tab";
import { buildHostAgentDetailRoute } from "../../src/utils/host-routes";
import {
  connectNewWorkspaceDaemonClient,
  expectNewWorkspaceControlsEnabled,
  expectNewWorkspaceProjectSelected,
  expectNewWorkspaceTriggerLabelsAligned,
  openGlobalNewWorkspaceComposer,
  openMissingProjectNewWorkspaceComposer,
  openNewWorkspaceComposer,
  openNewWorkspaceProjectPickerWithShortcut,
} from "../support/helpers/new-workspace";
import { daemonWsRoutePattern, getE2EDaemonPort } from "../support/helpers/daemon-port";
import { seedWorkspace, type SeededWorkspace } from "../support/helpers/seed-client";
import { openSettingsSection, seedSavedSettingsHosts } from "../support/helpers/settings";
import { getServerId } from "../support/helpers/server-id";
import { projectEquivalenceViewKey } from "../support/helpers/project-view-key";
import {
  clickArchiveWorkspaceMenuItem,
  expectWorkspaceAbsentFromSidebar,
  selectSidebarStatusGrouping,
  openSidebarDisplayPage,
} from "../support/helpers/sidebar";
import {
  switchWorkspaceViaSidebar,
  waitForSidebarHydration,
} from "../support/helpers/workspace-ui";

// Model B entry points into the New Workspace screen. The surviving entries are
// the global button (universal) and each project's per-row New workspace icon
// (preselects that project) — shown for git projects and for non-git projects on
// a multiplicity-capable host. These specs prove the global entry opens the
// screen, the project icon preselects the right project across the reused 'new'
// screen, and non-git projects never offer the worktree Isolation control.

function projectRow(page: import("@playwright/test").Page, projectKey: string) {
  return page.getByTestId(`sidebar-project-row-${projectEquivalenceViewKey(projectKey)}`);
}

async function expectSidebarIconCentered(page: Page, workspaceId: string, textHeight: number) {
  const key = `${getServerId()}:${workspaceId}`;
  const icon = page
    .getByTestId(`sidebar-row-project-icon-${key}`)
    .filter({ visible: true })
    .first();
  const text = page.getByTestId(`sidebar-workspace-text-${key}`).filter({ visible: true }).first();
  await expect(icon).toBeVisible();
  const iconBox = await icon.boundingBox();
  const textBox = await text.boundingBox();
  expect(iconBox!.height).toBe(49);
  expect(textBox!.height).toBe(textHeight);
  expect(iconBox!.width).toBe(42);
  expect(
    Math.abs(iconBox!.y + iconBox!.height / 2 - textBox!.y - textBox!.height / 2),
  ).toBeLessThan(1);
}

async function expectComposerControlsInOneRow(page: Page) {
  const boxes = await Promise.all(
    [
      "composer-diff-stat-pill",
      "composer-output-token-rate",
      "chat-new-agent",
      "chat-close-current-tab",
    ].map(async (id) => {
      const control = page.getByTestId(id).filter({ visible: true });
      await expect(control).toBeInViewport();
      return (await control.boundingBox())!;
    }),
  );
  const centerY = boxes[0].y + boxes[0].height / 2;
  for (const [index, box] of boxes.entries()) {
    expect(Math.abs(box.y + box.height / 2 - centerY)).toBeLessThan(1);
    if (index > 0) {
      const previous = boxes[index - 1];
      expect(box.x).toBeGreaterThanOrEqual(previous.x + previous.width);
    }
  }
}

// The mock provider omits speed measurements. Supply a protocol snapshot to test
// placement and the details sheet independently of provider token estimation.
async function installTokenSpeedSnapshot(page: Page, agentId: string) {
  const tokenSpeed = {
    rate: 46.6,
    average: 42.5,
    tokens: 850,
    elapsedMs: 20_000,
    streaming: false,
  } satisfies AgentTokenSpeed;
  await page.routeWebSocket(daemonWsRoutePattern(), (ws) => {
    const server = ws.connectToServer();
    server.onMessage((message) => {
      const envelope: unknown = JSON.parse(message.toString());
      ws.send(
        JSON.stringify(envelope, (_key, value: unknown) => {
          if (
            value &&
            typeof value === "object" &&
            "id" in value &&
            value.id === agentId &&
            "provider" in value &&
            value.provider === "mock"
          ) {
            const usage =
              "lastUsage" in value && value.lastUsage && typeof value.lastUsage === "object"
                ? value.lastUsage
                : {};
            return { ...value, lastUsage: { ...usage, tokenSpeed } };
          }
          return value;
        }),
      );
    });
  });
}

for (const viewport of [
  { width: 320, colorScheme: "light" },
  { width: 390, colorScheme: "dark" },
] as const) {
  test(`mobile home opens a new task in one tap at ${viewport.width}px`, async ({ page }, info) => {
    const seeded = await seedWorkspace({
      repoPrefix: "mobile-home-entry-",
      title: "整理手机客户端的交互与排版",
    });
    try {
      await page.setViewportSize({ width: viewport.width, height: 844 });
      await page.emulateMedia({ colorScheme: viewport.colorScheme });
      await page.goto("/open-project");
      const home = page.getByTestId("mobile-home");
      await expect(home).toBeVisible();
      await expect(home.getByTestId("open-project-setup-providers")).toBeAttached();
      await expect(home.getByTestId("clawmuse-open-account")).toBeAttached();
      const task = home.getByTestId(`sidebar-workspace-row-${getServerId()}:${seeded.workspaceId}`);
      await expect(task).toBeVisible({ timeout: 30_000 });
      const title = task.getByText("整理手机客户端的交互与排版", { exact: true });
      await expect(title).toHaveCSS("font-size", "17px");
      await expect(title).toHaveCSS("font-weight", "500");
      await expect(title).toHaveCSS("line-height", "27px");
      const create = page.getByTestId("mobile-home-new-workspace");
      const bounds = await create.boundingBox();
      expect(bounds?.width).toBe(56);
      expect(bounds?.height).toBe(56);
      expect(bounds!.x + bounds!.width).toBe(viewport.width - 16);
      await page.screenshot({ path: info.outputPath(`mobile-home-${viewport.colorScheme}.png`) });
      await create.click();
      await expect(page).toHaveURL(/\/new/);
      await expect(page.getByRole("textbox", { name: "Message agent..." })).toBeEditable();
      await expect(page.getByRole("textbox", { name: "Message agent..." })).toHaveCSS(
        "font-size",
        "17px",
      );

      await page.goto("/open-project");
      await expect(task).toBeVisible();
      await task.click();
      await expect(page).toHaveURL(/\/workspace\//);
      await page.getByTestId("menu-button").filter({ visible: true }).click();
      await page.getByTestId("sidebar-new-agent").click();
      await expect(page).toHaveURL(/\/new/);
      await expectNewWorkspaceProjectSelected(page, seeded.projectDisplayName);
      await expect(page.getByTestId("sidebar-new-agent")).not.toBeVisible();
      await page.screenshot({
        path: info.outputPath(`mobile-new-task-${viewport.colorScheme}.png`),
      });
      await page.goto("/settings");
      await openSettingsSection(page, "appearance");
      await expect(page.getByRole("textbox", { name: "Interface font family" })).toHaveCSS(
        "font-size",
        "16px",
      );
      await page.screenshot({
        path: info.outputPath(`mobile-settings-${viewport.colorScheme}.png`),
      });
    } finally {
      await seeded.cleanup();
    }
  });
}

test.describe("New workspace entry points", () => {
  let client: Awaited<ReturnType<typeof connectNewWorkspaceDaemonClient>>;

  test.describe.configure({ timeout: 240_000 });

  test.beforeEach(async () => {
    client = await connectNewWorkspaceDaemonClient();
  });

  test.afterEach(async () => {
    await client?.close().catch(() => undefined);
  });

  test("mobile header targets and both New agent entrances stay reachable", async ({ page }) => {
    const seeded = await seedWorkspace({
      repoPrefix: "entry-mobile-actions-",
      repo: { withRemote: true },
    });
    const agent = await createMockIdleAgent(seeded.client, {
      cwd: seeded.workspaceDirectory,
      workspaceId: seeded.workspaceId,
      title: "Mobile agent actions",
    });
    const route = buildHostAgentDetailRoute(getServerId(), agent.id, seeded.workspaceId);

    try {
      await rm(path.join(seeded.repoPath, "remote.git"), { recursive: true });
      await writeFile(path.join(seeded.repoPath, "README.md"), "Changed line for speed layout\n");
      await seeded.client.checkoutRefresh(seeded.repoPath);
      await installTokenSpeedSnapshot(page, agent.id);
      await page.setViewportSize({ width: 393, height: 852 });
      await page.goto(route);
      // Runtime checkout data is observed by the composer, rather than the directory listing.
      const changes = page.getByTestId("composer-diff-stat-pill").filter({ visible: true });
      await expect(changes.getByText("+1", { exact: true })).toBeVisible({ timeout: 30_000 });

      const chatAction = page.getByTestId("chat-new-agent").filter({ visible: true });
      await expect(chatAction).toBeVisible({ timeout: 30_000 });
      const composer = page
        .getByRole("textbox", { name: "Message agent..." })
        .filter({ visible: true });
      const actionBox = await chatAction.boundingBox();
      const composerBox = await composer.boundingBox();
      expect(actionBox!.y + actionBox!.height).toBeLessThan(composerBox!.y);
      const closeAction = page.getByTestId("chat-close-current-tab").filter({ visible: true });
      await expect(closeAction).toBeVisible();
      await expect(chatAction).toHaveText("");
      await expect(closeAction).toHaveText("");
      const closeBox = await closeAction.boundingBox();
      expect(closeBox!.x).toBeGreaterThanOrEqual(actionBox!.x + actionBox!.width);
      await composer.fill("Compare action button heights");
      const send = page
        .getByRole("button", { name: "Send message", exact: true })
        .filter({ visible: true });
      await expect(send).toBeVisible();
      const sendBox = await send.boundingBox();
      expect(actionBox!.height).toBe(28);
      expect(closeBox!.height).toBe(28);
      expect(actionBox!.width).toBeLessThan(sendBox!.width);
      expect(closeBox!.width).toBeLessThan(sendBox!.width);
      const attachment = page.getByTestId("message-input-attach-button").filter({ visible: true });
      const attachmentBox = await attachment.boundingBox();
      expect(attachmentBox!.width).toBe(sendBox!.width);
      expect(attachmentBox!.height).toBe(sendBox!.height);
      await attachment.click();
      await expect(page.getByTestId("message-input-attachment-menu-item-image")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("message-input-attachment-menu")).toBeHidden();
      await composer.fill("");

      const diff = page.getByTestId("composer-diff-stat-pill").filter({ visible: true });
      const rate = page.getByTestId("composer-output-token-rate").filter({ visible: true });
      await expect(diff).toBeVisible();
      await expect(rate).toHaveCount(1);
      await expect(rate).toContainText("tok/s");
      await expectComposerControlsInOneRow(page);
      const diffBox = await diff.boundingBox();
      const rateBox = await rate.boundingBox();
      expect(rateBox!.x).toBeGreaterThanOrEqual(diffBox!.x + diffBox!.width);
      expect(
        Math.abs(rateBox!.y + rateBox!.height / 2 - diffBox!.y - diffBox!.height / 2),
      ).toBeLessThan(2);
      expect(rateBox!.y + rateBox!.height).toBeLessThan(composerBox!.y);
      await rate.click();
      await expect(page.getByTestId("token-speed-details")).toBeVisible();
      await page
        .getByRole("button", { name: "Bottom sheet backdrop" })
        .first()
        .click({ position: { x: 12, y: 12 } });
      await expect(page.getByTestId("token-speed-details")).not.toBeVisible();

      for (const id of [
        "menu-button",
        "workspace-tab-switcher-trigger",
        "workspace-header-menu-trigger",
      ]) {
        const target = page.getByTestId(id).filter({ visible: true }).first();
        await expect(target).toBeVisible();
        const box = await target.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(48);
        expect(box?.height).toBeGreaterThanOrEqual(48);
      }

      await page.screenshot({ path: "test-results/mobile-agent-actions-chat.png" });
      await page.getByTestId("workspace-tab-switcher-trigger").filter({ visible: true }).click();
      await expect(
        page.getByText(agent.title, { exact: true }).filter({ visible: true }).last(),
      ).toBeVisible();
      await page.getByText(agent.title, { exact: true }).filter({ visible: true }).last().click();
      await chatAction.click();
      await expect(page).toHaveURL(/\/new(?:\?.*)?$/);
      await expectNewWorkspaceProjectSelected(page, seeded.projectDisplayName);

      await page.goto(route);
      await page.getByTestId("menu-button").filter({ visible: true }).first().click();
      const listAction = page.getByTestId("sidebar-new-agent").filter({ visible: true });
      await expect(listAction).toBeVisible();
      await expect(listAction).toHaveText("");
      expect((await listAction.boundingBox())!.height).toBe(40);
      await expect(
        page
          .getByTestId(`sidebar-workspace-archive-${getServerId()}:${seeded.workspaceId}`)
          .filter({ visible: true }),
      ).toBeVisible();
      await seeded.client.setWorkspacePinned(seeded.workspaceId, true);
      await expectSidebarIconCentered(page, seeded.workspaceId, 27);
      await openSidebarDisplayPage(page, "sidebar-display-show");
      await page.getByRole("menuitem", { name: "Branch", exact: true }).click();
      await page
        .getByRole("button", { name: "Bottom sheet backdrop" })
        .first()
        .click({ position: { x: 5, y: 5 } });
      await expectSidebarIconCentered(page, seeded.workspaceId, 47);
      await seeded.client.setWorkspacePinned(seeded.workspaceId, false);
      await selectSidebarStatusGrouping(page);
      await expectSidebarIconCentered(page, seeded.workspaceId, 47);
      await listAction.click({ trial: true });
      await page.screenshot({ path: "test-results/mobile-agent-actions-list.png" });
      await listAction.click();
      await expect(page).toHaveURL(/\/new(?:\?.*)?$/);
      await expectNewWorkspaceProjectSelected(page, seeded.projectDisplayName);
      await expect(page.getByTestId("sidebar-close")).not.toBeVisible();

      await page.setViewportSize({ width: 320, height: 700 });
      await page.goto(route);
      await expect(chatAction).toBeInViewport();
      await expect(closeAction).toBeInViewport();
      await expectComposerControlsInOneRow(page);
      await expect(
        page.getByTestId("workspace-header-title").filter({ visible: true }),
      ).toBeVisible();
      await page.screenshot({ path: "test-results/mobile-agent-actions-narrow.png" });

      await page.setViewportSize({ width: 1400, height: 900 });
      await page.goto(route);
      await expect(
        page.getByTestId("workspace-tabs-row").filter({ visible: true }).first(),
      ).toBeVisible();
      await expect(page.getByTestId("chat-new-agent").filter({ visible: true })).toBeVisible();
      await expect(
        page.getByTestId("chat-close-current-tab").filter({ visible: true }),
      ).toBeVisible();
      await expect(rate).toBeVisible();
      const desktopDiffBox = await diff.boundingBox();
      const desktopRateBox = await rate.boundingBox();
      expect(desktopRateBox!.x).toBeGreaterThanOrEqual(desktopDiffBox!.x + desktopDiffBox!.width);
    } finally {
      await seeded.cleanup();
    }
  });

  test("mobile close action closes only the selected agent tab", async ({ page }) => {
    const seeded = await seedWorkspace({ repoPrefix: "entry-mobile-close-" });
    try {
      const survivor = await createMockIdleAgent(seeded.client, {
        cwd: seeded.workspaceDirectory,
        workspaceId: seeded.workspaceId,
        title: "Keep this tab",
      });
      const selected = await createMockIdleAgent(seeded.client, {
        cwd: seeded.workspaceDirectory,
        workspaceId: seeded.workspaceId,
        title: "Close this tab",
      });
      await page.setViewportSize({ width: 393, height: 852 });
      for (const agent of [survivor, selected]) {
        await page.goto(buildHostAgentDetailRoute(getServerId(), agent.id, seeded.workspaceId));
        await expect(
          page.getByTestId("chat-close-current-tab").filter({ visible: true }),
        ).toBeVisible({ timeout: 30_000 });
      }
      await page.getByTestId("chat-close-current-tab").filter({ visible: true }).click();
      await expect.poll(() => fetchAgentArchivedAt(seeded.client, selected.id)).not.toBeNull();
      expect(await fetchAgentArchivedAt(seeded.client, survivor.id)).toBeNull();
      await page.getByTestId("workspace-tab-switcher-trigger").filter({ visible: true }).click();
      await expect(
        page.getByText(survivor.title, { exact: true }).filter({ visible: true }),
      ).toBeVisible();
      await expect(
        page.getByText(selected.title, { exact: true }).filter({ visible: true }),
      ).toHaveCount(0);
    } finally {
      await seeded.cleanup();
    }
  });

  test("the global new-workspace button opens the New Workspace screen", async ({ page }) => {
    const seeded: SeededWorkspace = await seedWorkspace({ repoPrefix: "entry-global-button-" });

    try {
      await seedSavedSettingsHosts(page, [
        {
          serverId: getServerId(),
          label: "localhost",
          endpoint: `127.0.0.1:${getE2EDaemonPort()}`,
        },
        {
          serverId: "secondary-new-workspace-host",
          label: "Secondary host",
          endpoint: "127.0.0.1:9",
        },
      ]);

      await gotoAppShell(page);
      await waitForSidebarHydration(page);
      await expect(
        page.getByTestId(`sidebar-workspace-row-${getServerId()}:${seeded.workspaceId}`),
      ).toBeVisible({ timeout: 30_000 });
      await switchWorkspaceViaSidebar({
        page,
        serverId: getServerId(),
        workspaceId: seeded.workspaceId,
      });

      const globalButton = page.getByTestId("sidebar-global-new-workspace");
      await expect(globalButton).toBeVisible({ timeout: 30_000 });

      await openGlobalNewWorkspaceComposer(page);
      await expect(page.getByTestId("host-chooser")).toHaveCount(0);

      await expect(page.getByTestId("new-workspace-project-picker-trigger")).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByTestId("host-picker-trigger")).toBeVisible({ timeout: 30_000 });
      await expectNewWorkspaceTriggerLabelsAligned(page, {
        projectLabel: seeded.projectDisplayName,
        hostLabel: "localhost",
      });
    } finally {
      await seeded.cleanup();
    }
  });

  test("the New Workspace screen shows the host selector with Add host when there is only one host", async ({
    page,
  }) => {
    const seeded: SeededWorkspace = await seedWorkspace({ repoPrefix: "entry-single-host-" });

    try {
      await seedSavedSettingsHosts(page, [
        {
          serverId: getServerId(),
          label: "localhost",
          endpoint: `127.0.0.1:${getE2EDaemonPort()}`,
        },
      ]);

      await gotoAppShell(page);
      await waitForSidebarHydration(page);
      await expect(
        page.getByTestId(`sidebar-workspace-row-${getServerId()}:${seeded.workspaceId}`),
      ).toBeVisible({ timeout: 30_000 });

      await openGlobalNewWorkspaceComposer(page);

      await expect(page.getByTestId("new-workspace-project-picker-trigger")).toBeVisible({
        timeout: 30_000,
      });
      const hostTrigger = page.getByTestId("host-picker-trigger");
      await expect(hostTrigger).toContainText("localhost", { timeout: 30_000 });
      await hostTrigger.click();
      await expect(page.getByTestId("new-workspace-host-picker-add-host")).toBeVisible();
      await page.getByTestId("new-workspace-host-picker-add-host").click();
      await expect(page).toHaveURL(/\/settings\/general\?addHost=/);
    } finally {
      await seeded.cleanup();
    }
  });

  test("a stale project route keeps the New Workspace controls enabled", async ({ page }) => {
    await gotoAppShell(page);
    await openMissingProjectNewWorkspaceComposer(page, {
      serverId: getServerId(),
      projectId: "missing-project",
      sourceDirectory: "/tmp/missing-project",
    });

    await expectNewWorkspaceControlsEnabled(page);
  });

  test("Ctrl+P opens the project picker with search focused", async ({ page }) => {
    const seeded: SeededWorkspace = await seedWorkspace({ repoPrefix: "entry-shortcut-" });

    try {
      await gotoAppShell(page);
      await waitForSidebarHydration(page);
      await openGlobalNewWorkspaceComposer(page);

      await openNewWorkspaceProjectPickerWithShortcut(page);
    } finally {
      await seeded.cleanup();
    }
  });

  test("keeps the in-progress form when the remembered workspace is archived elsewhere", async ({
    page,
  }) => {
    const otherProject: SeededWorkspace = await seedWorkspace({
      repoPrefix: "aa-new-workspace-archive-other-",
    });
    const rememberedProject: SeededWorkspace = await seedWorkspace({
      repoPrefix: "zz-new-workspace-archive-remembered-",
    });
    const serverId = getServerId();
    const draftText = "keep this new workspace draft";

    try {
      await seedSavedSettingsHosts(page, [
        {
          serverId,
          label: "localhost",
          endpoint: `127.0.0.1:${getE2EDaemonPort()}`,
        },
      ]);

      await gotoAppShell(page);
      await waitForSidebarHydration(page);
      await page
        .getByTestId(`sidebar-workspace-row-${serverId}:${rememberedProject.workspaceId}`)
        .click();
      await expect(page).toHaveURL(/\/workspace\//, { timeout: 30_000 });

      await page.goto(`/new?serverId=${encodeURIComponent(serverId)}`);
      await expectNewWorkspaceProjectSelected(page, rememberedProject.projectDisplayName);

      const composer = page.getByRole("textbox", { name: "Message agent..." });
      await expect(composer).toBeEditable({ timeout: 30_000 });
      await composer.fill(draftText);
      await expect(composer).toHaveValue(draftText);

      await clickArchiveWorkspaceMenuItem(page, rememberedProject.workspaceId);
      await expectWorkspaceAbsentFromSidebar(page, rememberedProject.workspaceId);

      await expect(page).toHaveURL(/\/new(?:\?.*)?$/, { timeout: 30_000 });
      await expect(composer).toHaveValue(draftText);
      await expectNewWorkspaceProjectSelected(page, rememberedProject.projectDisplayName);
    } finally {
      await otherProject.cleanup();
      await rememberedProject.cleanup();
    }
  });

  test("each project's row icon preselects that project, and the reused screen resets a stale manual choice across projects", async ({
    page,
  }) => {
    const projectA: SeededWorkspace = await seedWorkspace({ repoPrefix: "entry-preselect-a-" });
    const projectB: SeededWorkspace = await seedWorkspace({ repoPrefix: "entry-preselect-b-" });
    const projectC: SeededWorkspace = await seedWorkspace({ repoPrefix: "entry-preselect-c-" });

    try {
      await gotoAppShell(page);
      await waitForSidebarHydration(page);
      await expect(projectRow(page, projectA.projectKey)).toBeVisible({ timeout: 30_000 });
      await expect(projectRow(page, projectB.projectKey)).toBeVisible({ timeout: 30_000 });
      await expect(projectRow(page, projectC.projectKey)).toBeVisible({ timeout: 30_000 });

      // Project A's row icon opens New Workspace with A preselected.
      await openNewWorkspaceComposer(page, {
        projectKey: projectA.projectKey,
        projectDisplayName: projectA.projectDisplayName,
      });
      await expectNewWorkspaceProjectSelected(page, projectA.projectDisplayName);

      // Manually override the selection to C from inside A's screen. This stale
      // manualProjectKey is what the reused 'new' screen must reset when the next
      // route-driven navigation targets a different project.
      await page.getByTestId("new-workspace-project-picker-trigger").click();
      const optionC = page.getByTestId(
        `new-workspace-project-picker-option-${projectEquivalenceViewKey(projectC.projectKey)}`,
      );
      await expect(optionC).toBeVisible({ timeout: 30_000 });
      await optionC.click();
      await expectNewWorkspaceProjectSelected(page, projectC.projectDisplayName);

      // Navigate via B's row icon. B must be preselected — the route project wins
      // because the stale manual choice (C) was reset on the route change. If the
      // reset were missing, the trigger would still read C.
      await openNewWorkspaceComposer(page, {
        projectKey: projectB.projectKey,
        projectDisplayName: projectB.projectDisplayName,
      });
      await expectNewWorkspaceProjectSelected(page, projectB.projectDisplayName);
    } finally {
      await projectA.cleanup();
      await projectB.cleanup();
      await projectC.cleanup();
    }
  });

  test("the Isolation control is hidden for a non-git project and shown for a git project", async ({
    page,
  }) => {
    const gitProject: SeededWorkspace = await seedWorkspace({ repoPrefix: "entry-iso-git-" });
    const nonGitProject: SeededWorkspace = await seedWorkspace({
      repoPrefix: "entry-iso-nongit-",
      git: false,
    });

    try {
      await gotoAppShell(page);
      await waitForSidebarHydration(page);
      await expect(projectRow(page, gitProject.projectKey)).toBeVisible({ timeout: 30_000 });
      await expect(projectRow(page, nonGitProject.projectKey)).toBeVisible({ timeout: 30_000 });

      // Open New Workspace for the non-git project via the global button, then
      // select it in the picker (the per-row icon would preselect it too).
      await openGlobalNewWorkspaceComposer(page);
      const trigger = page.getByTestId("new-workspace-project-picker-trigger");
      await expect(trigger).toBeVisible({ timeout: 30_000 });
      await trigger.click();
      const nonGitOption = page.getByTestId(
        `new-workspace-project-picker-option-${projectEquivalenceViewKey(nonGitProject.projectKey)}`,
      );
      await expect(nonGitOption).toBeVisible({ timeout: 30_000 });
      await nonGitOption.click();
      await expectNewWorkspaceProjectSelected(page, nonGitProject.projectDisplayName);

      // No git checkout means no worktree isolation choice: the Isolation row is
      // absent entirely.
      await expect(page.getByTestId("workspace-create-isolation-trigger")).toHaveCount(0);

      // Switching to the git project on the same screen reveals the Isolation row.
      await trigger.click();
      const gitOption = page.getByTestId(
        `new-workspace-project-picker-option-${projectEquivalenceViewKey(gitProject.projectKey)}`,
      );
      await expect(gitOption).toBeVisible({ timeout: 30_000 });
      await gitOption.click();
      await expectNewWorkspaceProjectSelected(page, gitProject.projectDisplayName);

      await expect(page.getByTestId("workspace-create-isolation-trigger")).toBeVisible({
        timeout: 30_000,
      });
    } finally {
      await gitProject.cleanup();
      await nonGitProject.cleanup();
    }
  });
});
