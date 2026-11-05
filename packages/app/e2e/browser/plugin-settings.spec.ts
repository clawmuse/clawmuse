import {
  test,
  openDisplaySettings,
  openCompactDisplaySettings,
  groupByWorkspace,
  hideMetadata,
  reloadSavedDisplaySettings,
  editTitle,
  replaceTitle,
  saveTitle,
  expectTitleRequired,
  expectSavedTitle,
  changeMetadataFromAnotherClient,
  expectConflictPreservesDraft,
  discardTitle,
  returnAndReopenSettings,
  returnToPluginsPage,
  expectSettingsUnavailable,
} from "../support/helpers/plugin-settings";
import { expect } from "../support/fixtures";
import { settingsRpc } from "@getpaseo/plugin";
import { getServerId } from "../support/helpers/server-id";

for (const width of [1280, 390]) {
  test(`official translation requires explicit CLI and model selection at width ${width}`, async ({
    page,
    settingsPlugin,
  }, info) => {
    await page.setViewportSize({ width, height: 844 });
    const pluginId = "conversation-translation";
    const pluginsUrl = `/settings/hosts/${encodeURIComponent(getServerId())}/plugins`;
    try {
      await page.goto(pluginsUrl);
      const row = page.getByTestId(`plugin-row-${pluginId}`);
      await expect(
        row.getByText("Official · included with ClawMuse", { exact: true }),
      ).toBeVisible();
      await expect(row.getByRole("switch")).not.toBeChecked();
      await page.screenshot({ path: info.outputPath("translation-disabled.png") });
      await row.getByRole("switch").click();
      await expect(page.getByTestId("combined-model-selector")).toBeVisible();
      await expect(page.getByRole("textbox", { name: "翻译模型", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "测试翻译", exact: true })).toBeDisabled();
      await page.getByRole("button", { name: "保存", exact: true }).click();
      await expect(page.getByText("请选择翻译工具", { exact: true }).last()).toBeVisible();
      await page.getByTestId("combined-model-selector").click();
      await page.getByTestId("model-tab-codex").click();
      const model = page.locator('[data-testid^="model-row-codex-"]').first();
      await expect(model).toBeVisible();
      const modelId = (await model.getAttribute("data-testid"))!.slice("model-row-codex-".length);
      await page.screenshot({ path: info.outputPath("translation-model-picker.png") });
      await model.click();
      const selection = await page.getByTestId("combined-model-selector").innerText();
      await page.getByRole("button", { name: "保存", exact: true }).click();
      await expect(page.getByText("翻译模型已保存", { exact: true })).toBeVisible();
      await expect(page.getByText(`codex · ${modelId}`, { exact: true })).toBeVisible();
      await page
        .getByRole("button", { name: width < 720 ? "Back" : "Back to plugins", exact: true })
        .click();
      await page
        .getByTestId(`plugin-row-${pluginId}`)
        .getByRole("button", { name: "Configure", exact: true })
        .click();
      await expect(page.getByTestId("combined-model-selector")).toHaveText(selection);
      await page
        .getByRole("button", { name: width < 720 ? "Back" : "Back to plugins", exact: true })
        .click();
      await page.getByTestId(`plugin-row-${pluginId}`).getByRole("switch").click();
      await expect(
        page.getByTestId(`plugin-row-${pluginId}`).getByRole("switch"),
      ).not.toBeChecked();
      await page.getByTestId(`plugin-row-${pluginId}`).getByRole("switch").click();
      await expect(page.getByTestId("combined-model-selector")).toHaveText(selection);
      await page.screenshot({ path: info.outputPath("translation-selected-model.png") });
    } finally {
      await settingsPlugin.disablePlugin(pluginId);
      await settingsPlugin.enablePlugin(pluginId);
      const contract = settingsRpc("translation");
      const state = contract.read.output.parse(
        await settingsPlugin.invokePluginRpc(pluginId, contract.read.name, {}),
      );
      if (state.status === "ready")
        await settingsPlugin.invokePluginRpc(pluginId, contract.reset.name, {
          revision: state.revision,
        });
      await settingsPlugin.disablePlugin(pluginId);
    }
  });
}

test("display preferences survive a reload", async ({ page }) => {
  await openDisplaySettings(page);
  await groupByWorkspace(page);
  await hideMetadata(page);
  await reloadSavedDisplaySettings(page);
});

test("invalid titles stay editable until a valid title is saved", async ({ page }) => {
  await openDisplaySettings(page);
  await editTitle(page, "");
  await saveTitle(page);
  await expectTitleRequired(page);
  await replaceTitle(page, "My monitor");
  await saveTitle(page);
  await expectSavedTitle(page, "My monitor");
});

test("another client's save preserves a conflicting draft", async ({ page }) => {
  await openDisplaySettings(page);
  await editTitle(page, "Unsaved title");
  await changeMetadataFromAnotherClient(page);
  await saveTitle(page);
  await expectConflictPreservesDraft(page, "Unsaved title");
  await discardTitle(page);
});

test("Back to plugins returns from a plugin settings screen", async ({ page }) => {
  await openDisplaySettings(page);
  await returnToPluginsPage(page);
});

test.describe("compact plugin settings", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Back and plugin re-enable restore the settings screen", async ({
    page,
    settingsPlugin,
  }) => {
    await openCompactDisplaySettings(page);
    await groupByWorkspace(page);
    await hideMetadata(page);
    await returnAndReopenSettings(page);
    await settingsPlugin.disablePlugin("settings-example");
    await expectSettingsUnavailable(page);
    await settingsPlugin.enablePlugin("settings-example");
    await reloadSavedDisplaySettings(page);
  });
});
