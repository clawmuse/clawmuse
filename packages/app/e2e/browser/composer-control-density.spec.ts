import { test, expect } from "../support/fixtures";
import { openWorkspaceWithAgents } from "../support/helpers/archive-tab";
import {
  expectNoCollapsedComposerToolbarFrame,
  recordComposerToolbarFrames,
} from "../support/helpers/composer-control-density";
import { clickNewChat, gotoWorkspace } from "../support/helpers/launcher";
import { seedWorkspace, type SeededWorkspace } from "../support/helpers/seed-client";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";
import { fillComposerDraft } from "../support/helpers/composer";

const SETTLE_MS = 1_000;

async function seedSettledMockAgent(workspace: SeededWorkspace, title: string) {
  const agent = await workspace.client.createAgent({
    provider: "mock",
    model: "ten-second-stream",
    modeId: "load-test",
    cwd: workspace.repoPath,
    workspaceId: workspace.workspaceId,
    title,
  });
  await workspace.client.waitForAgentUpsert(
    agent.id,
    (snapshot) => snapshot.status === "idle",
    30_000,
  );
  return { id: agent.id, title, cwd: workspace.repoPath, workspaceId: workspace.workspaceId };
}

function visibleAgentTab(page: import("@playwright/test").Page, agentId: string) {
  return page.getByTestId(`workspace-tab-agent_${agentId}`).filter({ visible: true }).first();
}

test.describe("Composer control density across tab switches", () => {
  test.describe.configure({ timeout: 180_000 });

  test("mobile primary actions visually balance the microphone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const session = await seedMockAgentWorkspace({
      repoPrefix: "composer-voice-control-size-",
      title: "Voice control sizes",
      model: "ten-second-stream",
    });
    try {
      await openAgentRoute(page, session);
      const waveform = page.getByRole("button", { name: "Enable Voice mode", exact: true });
      const dictation = page.getByRole("button", { name: "Start dictation", exact: true });
      await expect(waveform).toBeVisible();
      await expect(dictation).toBeVisible();
      await expect(waveform).toHaveCSS("width", "32px");
      await expect(waveform).toHaveCSS("height", "32px");
      await expect(dictation).toHaveCSS("width", "32px");
      await expect(dictation).toHaveCSS("height", "32px");

      await fillComposerDraft(page, "检查发送按钮尺寸");
      await expect(waveform).toHaveCount(0);
      const send = page.getByRole("button", { name: "Send message", exact: true });
      await expect(send).toBeVisible();
      await expect(send).toHaveCSS("width", "32px");
      await expect(send).toHaveCSS("height", "32px");
      await expect(dictation).toHaveCSS("width", "32px");
      await expect(dictation).toHaveCSS("height", "32px");
      const attach = page.getByTestId("message-input-attach-button");
      await expect(attach).toHaveCSS("width", "32px");
      await expect(attach.locator("svg")).toHaveAttribute("width", "22");
      await expect(send.locator("svg")).toHaveAttribute("width", "20");
      await expect(dictation.locator("svg")).toHaveAttribute("width", "24");
      await expect(send).toHaveCSS("background-color", "rgb(26, 26, 30)");
      await expect(send.locator("svg")).toHaveAttribute("stroke", "#ffffff");
      await page.screenshot({ path: "/tmp/clawmuse-chat-mobile.png" });
      await attach.click();
      const menu = page.getByTestId("message-input-attachment-menu");
      await expect(menu).toBeVisible();
      const firstItem = menu.getByRole("menuitem").first();
      await expect(firstItem).toHaveCSS("min-height", "64px");
      await expect(firstItem.locator("svg").first()).toHaveAttribute("width", "24");
      const menuBounds = await menu.boundingBox();
      const attachBounds = await attach.boundingBox();
      expect(menuBounds!.y + menuBounds!.height).toBeLessThanOrEqual(attachBounds!.y);
      await page.screenshot({ path: "/tmp/clawmuse-chat-mobile-menu.png" });
      await page.keyboard.press("Escape");
      await expect(menu).not.toBeVisible();
      await page.setViewportSize({ width: 1280, height: 900 });
      await expect(send).toHaveCSS("width", "32px");
      await expect(send.locator("svg")).toHaveAttribute("width", "20");
      await page.screenshot({ path: "/tmp/clawmuse-chat-desktop.png" });
    } finally {
      await session.cleanup();
    }
  });

  test("desktop and mobile share the chat actions above the composer on the right", async ({
    page,
  }) => {
    const session = await seedMockAgentWorkspace({
      repoPrefix: "composer-chat-actions-",
      title: "Shared chat actions",
    });
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await openAgentRoute(page, session);
      await fillComposerDraft(page, "Compare the chat actions with Send");
      const actionIds = ["chat-new-agent", "chat-close-current-tab", "chat-archive-workspace"];
      const mobileIcons: string[] = [];
      for (const viewport of [
        { width: 390, height: 844, name: "mobile" },
        { width: 1280, height: 900, name: "desktop" },
      ]) {
        await page.setViewportSize(viewport);
        const composer = page.getByTestId("message-input-root").filter({ visible: true });
        await expect(composer).toBeVisible();
        const send = page.getByRole("button", { name: "Send message", exact: true });
        await expect(send).toBeVisible();
        const sendBox = (await send.boundingBox())!;
        const composerBox = (await composer.boundingBox())!;
        let previousRight = composerBox.x + composerBox.width / 2;
        let rowY: number | undefined;
        for (const [index, id] of actionIds.entries()) {
          const action = page.getByTestId(id).filter({ visible: true });
          await expect(action).toBeVisible();
          await expect(action).toHaveCSS("width", "28px");
          await expect(action).toHaveCSS("height", "28px");
          await expect(action.locator("svg")).toHaveAttribute("width", "16");
          const box = (await action.boundingBox())!;
          expect(box.width).toBeLessThan(sendBox.width);
          expect(box.height).toBeLessThan(sendBox.height);
          expect(box.y + box.height).toBeLessThanOrEqual(composerBox.y);
          expect(box.x).toBeGreaterThanOrEqual(previousRight);
          expect(box.x + box.width).toBeLessThanOrEqual(composerBox.x + composerBox.width + 1);
          if (rowY !== undefined) expect(box.y).toBeCloseTo(rowY, 1);
          rowY = box.y;
          previousRight = box.x + box.width;
          const icon = await action.locator("svg").evaluate((svg) => svg.innerHTML);
          if (viewport.name === "mobile") mobileIcons.push(icon);
          else expect(icon).toBe(mobileIcons[index]);
        }
        await expect(page.getByTestId("composer-archive-workspace")).toHaveCount(0);
        await page.screenshot({ path: `/tmp/clawmuse-chat-actions-${viewport.name}.png` });
      }
      await page.getByTestId("chat-archive-workspace").hover();
      await expect(page.getByRole("tooltip")).toContainText("Archive workspace");
    } finally {
      await session.cleanup();
    }
  });

  // Crossing the compact breakpoint remounts the composer and closes its menu.
  // Exercise an open menu's positioning within each retained layout separately.
  for (const scenario of [
    {
      name: "compact",
      initial: { width: 390, height: 844 },
      viewports: [
        { width: 390, height: 600 },
        { width: 480, height: 390 },
        { width: 390, height: 844 },
      ],
    },
    {
      name: "wide",
      initial: { width: 1280, height: 900 },
      viewports: [
        { width: 1024, height: 600 },
        { width: 844, height: 390 },
        { width: 1280, height: 900 },
      ],
    },
  ]) {
    test(`attachment menu follows its trigger when the ${scenario.name} viewport changes`, async ({
      page,
    }) => {
      await page.setViewportSize(scenario.initial);
      const session = await seedMockAgentWorkspace({
        repoPrefix: "composer-attachment-anchor-",
        title: "Attachment anchor",
      });
      try {
        await openAgentRoute(page, session);
        const attach = page.getByTestId("message-input-attach-button");
        const menu = page.getByTestId("message-input-attachment-menu");
        await attach.click();
        await expect(menu).toBeVisible();

        for (const viewport of scenario.viewports) {
          await page.setViewportSize(viewport);
          await expect(async () => {
            const trigger = await attach.boundingBox();
            const surface = await menu.boundingBox();
            expect(trigger).not.toBeNull();
            expect(surface).not.toBeNull();
            expect(
              Math.abs(surface!.x - trigger!.x),
              JSON.stringify({ viewport, trigger, surface }),
            ).toBeLessThanOrEqual(1);
            const expectedTop = Math.max(8, trigger!.y - surface!.height - 8);
            expect(
              Math.abs(surface!.y - expectedTop),
              JSON.stringify({ viewport, trigger, surface, expectedTop }),
            ).toBeLessThanOrEqual(1);
          }).toPass({ timeout: 10_000 });
          // Reanimated must not restore the position captured by the entering animation.
          await page.waitForTimeout(850);
          const trigger = (await attach.boundingBox())!;
          const surface = (await menu.boundingBox())!;
          const expectedTop = Math.max(8, trigger.y - surface.height - 8);
          expect(
            Math.abs(surface.y - expectedTop),
            JSON.stringify({ viewport, trigger, surface, expectedTop }),
          ).toBeLessThanOrEqual(1);
        }
        await page.screenshot({ path: "/tmp/clawmuse-attachment-menu-anchored.png" });
        await page.keyboard.press("Escape");
        await expect(menu).not.toBeVisible();
      } finally {
        await session.cleanup();
      }
    });
  }

  test("stop uses the neutral send-button surface and still interrupts the agent", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const session = await seedMockAgentWorkspace({
      repoPrefix: "composer-neutral-stop-",
      title: "Neutral stop button",
      model: "ten-second-stream",
    });
    try {
      await openAgentRoute(page, session);
      await fillComposerDraft(page, "Keep streaming until interrupted");
      const send = page.getByRole("button", { name: "Send message", exact: true });
      await expect(send).toBeVisible();
      const background = await send.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      );
      const stroke = await send.locator("svg").getAttribute("stroke");
      await send.click();
      const stop = page.getByRole("button", { name: "Stop agent", exact: true });
      await expect(stop).toBeVisible();
      await expect(stop).toHaveCSS("width", "32px");
      await expect(stop).toHaveCSS("height", "32px");
      await expect(stop.locator("svg")).toHaveAttribute("width", "12");
      await expect(stop).toHaveCSS("background-color", background);
      await expect(stop.locator("svg")).toHaveAttribute("stroke", stroke!);
      await expect(stop.locator("svg")).toHaveAttribute("fill", stroke!);
      await page.screenshot({ path: "/tmp/clawmuse-neutral-stop.png" });
      await stop.click();
      await expect(stop).not.toBeVisible();
      await session.client.waitForAgentUpsert(
        session.agentId,
        (snapshot) => snapshot.status === "idle",
        15_000,
      );
    } finally {
      await session.cleanup();
    }
  });

  test("switching between agent tabs never paints a collapsed composer toolbar", async ({
    page,
  }) => {
    const workspace = await seedWorkspace({ repoPrefix: "composer-density-agents-" });
    try {
      const first = await seedSettledMockAgent(workspace, "First chat");
      const second = await seedSettledMockAgent(workspace, "Second chat");
      await openWorkspaceWithAgents(page, [first, second]);

      await recordComposerToolbarFrames(page);
      await visibleAgentTab(page, first.id).click();
      await page.waitForTimeout(SETTLE_MS);
      await visibleAgentTab(page, second.id).click();
      await page.waitForTimeout(SETTLE_MS);

      await expectNoCollapsedComposerToolbarFrame(page);
    } finally {
      await workspace.cleanup();
    }
  });

  test("switching between draft tabs never paints a collapsed composer toolbar", async ({
    page,
  }) => {
    const workspace = await seedWorkspace({ repoPrefix: "composer-density-drafts-" });
    try {
      await page.addInitScript(() => {
        localStorage.setItem(
          "@paseo:create-agent-preferences",
          JSON.stringify({
            provider: "mock",
            providerPreferences: { mock: { mode: "load-test", model: "ten-second-stream" } },
          }),
        );
      });
      await gotoWorkspace(page, workspace.workspaceId);
      await clickNewChat(page);
      await clickNewChat(page);

      const draftTabs = page
        .locator('[data-testid^="workspace-tab-draft"]')
        .filter({ visible: true });
      await expect(draftTabs).toHaveCount(2, { timeout: 30_000 });
      await expect(
        page.locator('[data-testid="agent-thinking-selector"]').filter({ visible: true }).first(),
      ).toBeVisible({ timeout: 30_000 });

      await recordComposerToolbarFrames(page);
      await draftTabs.nth(0).click();
      await page.waitForTimeout(SETTLE_MS);
      await draftTabs.nth(1).click();
      await page.waitForTimeout(SETTLE_MS);

      await expectNoCollapsedComposerToolbarFrame(page);
    } finally {
      await workspace.cleanup();
    }
  });
});
