import { expect, test, type Page } from "../support/fixtures";
import { gotoAppShell, openSettings } from "../support/helpers/app";
import { getServerId } from "../support/helpers/server-id";
import { connectNewWorkspaceDaemonClient } from "../support/helpers/new-workspace";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";
import { composerLocator, expectComposerVisible, submitMessage } from "../support/helpers/composer";
import {
  expectSettingsHeader,
  openHostSection,
  openSettingsHost,
} from "../support/helpers/settings";

async function openMetadataGenerationSettings(page: Page) {
  const serverId = getServerId();
  await gotoAppShell(page);
  await openSettings(page);
  await openSettingsHost(page, serverId);
  await openHostSection(page, serverId, "metadata");
  await expectSettingsHeader(page, "Auxiliary models");
}

async function openManualMetadataModelPicker(page: Page) {
  await page.getByRole("button", { name: "Manual", exact: true }).click();
  await page
    .getByRole("button", { name: /Select model/ })
    .first()
    .click();
}

test("chooses a metadata model and can return to automatic selection", async ({
  page,
}, testInfo) => {
  await openMetadataGenerationSettings(page);

  // The section explains itself through the header's info tooltip, not a paragraph.
  await expect(page.getByTestId("metadata-generation-settings-info")).toHaveAccessibleName(
    "About Auxiliary models",
  );
  await expect(page.getByRole("button", { name: "Automatic", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.screenshot({
    path: testInfo.outputPath("metadata-automatic.png"),
    fullPage: true,
  });

  await openManualMetadataModelPicker(page);
  await page.getByText("Mock Load Test", { exact: true }).click();
  await expect(page.getByText("Ten second stream", { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("metadata-model-picker.png"),
    fullPage: true,
  });
  await page.getByText("Ten second stream", { exact: true }).click();

  await expect(page.getByRole("button", { name: /Ten second stream/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Manual", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("button", { name: /Ten second stream/ })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("metadata-manual-persisted.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Automatic", exact: true }).click();
  await page.reload();

  await expect(page.getByRole("button", { name: "Automatic", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("button", { name: /Ten second stream/ })).toHaveCount(0);
});

test("synchronizes prediction preferences without clearing the auxiliary model chain", async ({
  page,
}, testInfo) => {
  const client = await connectNewWorkspaceDaemonClient({ ownProjects: false });
  const previousConfig = (await client.getDaemonConfig()).config.metadataGeneration;
  const providers = [{ provider: "mock", model: "ten-second-stream" }];
  try {
    await client.patchDaemonConfig({ metadataGeneration: { providers, promptPredictions: true } });
    await openMetadataGenerationSettings(page);
    const toggle = page.getByRole("switch", { name: "Next-message predictions" });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect
      .poll(async () => (await client.getDaemonConfig()).config.metadataGeneration)
      .toEqual({ providers, promptPredictions: false });
    await client.patchDaemonConfig({ metadataGeneration: { promptPredictions: true } });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await page.screenshot({
      path: testInfo.outputPath("auxiliary-models-predictions.png"),
      fullPage: true,
    });
  } finally {
    await client.patchDaemonConfig({ metadataGeneration: previousConfig });
    await client.close();
  }
});

test("replaces only the first configured metadata model", async ({ page }) => {
  const client = await connectNewWorkspaceDaemonClient({ ownProjects: false });
  const previousConfig = await client.getDaemonConfig();

  try {
    await client.patchDaemonConfig({
      metadataGeneration: {
        providers: [
          { provider: "mock", model: "five-minute-stream" },
          { provider: "mock", model: "thirty-minute-stream" },
        ],
      },
    });
    await openMetadataGenerationSettings(page);

    await expect(page.getByRole("button", { name: "Manual", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await openManualMetadataModelPicker(page);
    await page.getByText("Ten second stream", { exact: true }).click();

    await expect
      .poll(async () => (await client.getDaemonConfig()).config.metadataGeneration.providers)
      .toEqual([
        { provider: "mock", model: "ten-second-stream" },
        { provider: "mock", model: "thirty-minute-stream" },
      ]);
  } finally {
    try {
      await client.patchDaemonConfig({
        metadataGeneration: {
          providers: previousConfig.config.metadataGeneration.providers,
        },
      });
    } finally {
      await client.close().catch(() => undefined);
    }
  }
});

for (const width of [1280, 390]) {
  test(`accepts a prompt prediction as an editable draft at width ${width}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 960 });
    const frames: Array<{ direction: string; message: unknown }> = [];
    page.on("websocket", (socket) => {
      const record = (direction: string, payload: string | Buffer) => {
        try {
          const envelope = JSON.parse(String(payload));
          const message = envelope.message ?? envelope;
          if (
            [
              "agent.prompt.predict.request",
              "agent.prompt.predict.response",
              "agent_stream",
              "status",
            ].includes(message.type)
          )
            frames.push({ direction, message });
        } catch {
          /* Only retain decoded session messages. */
        }
      };
      socket.on("framesent", ({ payload }) => record("request", payload));
      socket.on("framereceived", ({ payload }) => record("response", payload));
    });
    const source = await seedMockAgentWorkspace({
      repoPrefix: "prompt-prediction-",
      title: "Predict next message",
      featureValues: {
        mockAssistantResponse: "Fixed the login page. Regression tests can follow.",
      },
    });
    const client = await connectNewWorkspaceDaemonClient({ ownProjects: false });
    const previous = (await client.getDaemonConfig()).config.metadataGeneration;
    try {
      await client.patchDaemonConfig({
        metadataGeneration: {
          providers: [{ provider: "mock", model: "e2e-fast-stream" }],
          promptPredictions: true,
        },
      });
      await openAgentRoute(page, { agentId: source.agentId, workspaceId: source.workspaceId });
      await expectComposerVisible(page);
      await submitMessage(page, "Fix the login page");
      const suggestion = page.getByTestId("accept-prompt-prediction");
      await expect(suggestion).toBeVisible({ timeout: 20_000 });
      await expect(suggestion).toContainText("Add regression tests for this change");
      await page.screenshot({
        path: testInfo.outputPath(`prompt-prediction-${width}.png`),
        fullPage: true,
      });
      const input = composerLocator(page);
      const messages = await page.getByTestId("user-message").count();
      if (width === 1280) {
        await input.fill("Keep my draft");
        await expect(suggestion).toBeHidden();
        await input.press("Tab");
        await expect(input).toHaveValue("Keep my draft");
        await input.fill("");
        await expect(suggestion).toBeVisible();
        await input.press("Shift+Tab");
        await expect(input).toHaveValue("");
        await input.focus();
        await input.press("Tab");
      } else {
        await suggestion.click();
      }
      await expect(input).toHaveValue("Add regression tests for this change");
      await expect(input).toBeFocused();
      await expect(suggestion).toBeHidden();
      await expect(page.getByTestId("user-message")).toHaveCount(messages);
    } finally {
      await testInfo.attach("prediction-rpc", {
        body: JSON.stringify(frames, null, 2),
        contentType: "application/json",
      });
      await page.screenshot({
        path: testInfo.outputPath("prediction-final-state.png"),
        fullPage: true,
      });
      await client.patchDaemonConfig({ metadataGeneration: previous });
      await client.close();
      await source.cleanup();
    }
  });
}
