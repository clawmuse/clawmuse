import { expect, test } from "../support/fixtures";
import { gotoAppShell } from "../support/helpers/app";
import { waitForSidebarHydration } from "../support/helpers/workspace-ui";
import {
  expectNewWorkspaceDraft,
  fillNewWorkspaceDraft,
  openNewWorkspaceComposer,
} from "../support/helpers/new-workspace";
import { seedWorkspace, type SeededWorkspace } from "../support/helpers/seed-client";
import {
  attachImageFromMenu,
  composerLocator,
  removeAttachmentPill,
} from "../support/helpers/composer";
import {
  attachButton,
  expectChatComposerActive,
  expectTerminalComposerActive,
  fillTerminalPrompt,
  seedTerminalProfiles,
  selectChatLaunch,
  selectLaunchOption,
  terminalPromptInput,
  type TerminalProfile,
  type TerminalProfileSeed,
} from "../support/helpers/new-workspace-launch";

const PROFILE: TerminalProfile = {
  id: "e2e-composer-profile",
  name: "Composer Profile",
  command: "/bin/echo",
  args: ["{{{prompt}}}"],
};

test.use({
  e2eDaemonConfig: {
    features: { voiceMode: { assistant: { service: "custom", enabled: false } } },
  },
});

test.describe("New workspace: the composer is one control in two modes", () => {
  let workspace: SeededWorkspace;
  let profileSeed: TerminalProfileSeed;

  test.beforeEach(async () => {
    workspace = await seedWorkspace({ repoPrefix: "launch-composer-" });
    profileSeed = await seedTerminalProfiles([PROFILE]);
  });

  test.afterEach(async () => {
    await profileSeed.restore();
    await workspace?.cleanup();
  });

  test("chat uses voice when empty and an upward send arrow for text or an image", async ({
    page,
  }, testInfo) => {
    await gotoAppShell(page);
    await waitForSidebarHydration(page);
    await openNewWorkspaceComposer(page, workspace);
    await page.setViewportSize({ width: 390, height: 844 });

    const send = page.getByTestId("workspace-create-submit");
    const voice = page.getByRole("button", { name: "Enable Voice mode", exact: true });
    const createRoute = page.url();

    await expect(send).toHaveCount(0);
    await expect(voice).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("empty-voice.png") });

    await composerLocator(page).press("Enter");
    await expect(page).toHaveURL(createRoute);

    await fillNewWorkspaceDraft(page, "Start this conversation");
    await expect(send).toBeEnabled();
    await expect(send.locator('svg path[d="m5 12 7-7 7 7"]')).toBeVisible();
    await expect(voice).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("text-send.png") });

    await fillNewWorkspaceDraft(page, " \n\t ");
    await expect(send).toHaveCount(0);
    await expect(voice).toBeVisible();
    await composerLocator(page).press("Enter");
    await expect(page).toHaveURL(createRoute);

    await attachImageFromMenu(page, {
      name: "prompt.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
      ),
    });
    await expect(send).toBeEnabled();
    await expect(voice).toHaveCount(0);
    await removeAttachmentPill(page, "composer-image-attachment-pill", "Remove image attachment");
    await expect(send).toHaveCount(0);
    await expect(voice).toBeVisible();
    await expect(page).toHaveURL(createRoute);
  });

  test("voice creates one idle conversation and reports unavailable speech without sending an empty message", async ({
    page,
  }) => {
    await gotoAppShell(page);
    await waitForSidebarHydration(page);
    await openNewWorkspaceComposer(page, workspace);

    const voice = page.getByRole("button", { name: "Enable Voice mode", exact: true });
    await voice.click();
    await expect(page).toHaveURL(/\/workspace\//);
    await expect(
      page.getByText("Voice mode is off. Turn it on in Settings > Voice.", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByTestId("user-message")).toHaveCount(0);
    const { entries } = await workspace.client.fetchAgents();
    const agents = entries.filter(({ agent }) => agent.cwd === workspace.repoPath);
    expect(agents).toHaveLength(1);
    expect(agents[0].agent).toMatchObject({
      provider: "mock",
      model: "ten-second-stream",
      currentModeId: "load-test",
      status: "idle",
    });

    await voice.click();
    const retried = await workspace.client.fetchAgents();
    expect(retried.entries.filter(({ agent }) => agent.cwd === workspace.repoPath)).toEqual(agents);
    await expect(composerLocator(page)).toBeEditable();
  });

  test("switching launch target does not leak draft text between chat and terminal, and drops the chat-only controls", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await gotoAppShell(page);
    await waitForSidebarHydration(page);

    await openNewWorkspaceComposer(page, {
      projectKey: workspace.projectKey,
      projectDisplayName: workspace.projectDisplayName,
    });

    await test.step("a chat draft does not leak into the terminal prompt", async () => {
      await fillNewWorkspaceDraft(page, "a chat-only draft");
      await selectLaunchOption(page, PROFILE.id);
      await expectTerminalComposerActive(page);
      await expect(terminalPromptInput(page)).toHaveValue("");
    });

    await test.step("the attachment button and mic are absent in terminal mode, and the submit button is inside the same surface", async () => {
      await expect(attachButton(page)).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Start dictation" })).toHaveCount(0);
      await expect(
        page.locator('[data-testid="message-input-root"]:visible').getByRole("button", {
          name: "Launch",
        }),
      ).toBeVisible();
    });

    await test.step("a terminal draft does not leak back into chat, which keeps its own draft", async () => {
      await fillTerminalPrompt(page, "a terminal-only draft");
      await selectChatLaunch(page);
      await expectChatComposerActive(page);
      await expectNewWorkspaceDraft(page, "a chat-only draft");
    });

    await test.step("each side keeps its own draft across toggles, without either leaking into the other", async () => {
      await selectLaunchOption(page, PROFILE.id);
      await expectTerminalComposerActive(page);
      await expect(terminalPromptInput(page)).toHaveValue("a terminal-only draft");
    });
  });
});
