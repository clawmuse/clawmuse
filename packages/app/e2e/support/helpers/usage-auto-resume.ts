import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { gotoAppShell } from "./app";
import { buildAgentRoute, seedMockAgentWorkspace } from "./mock-agent";
import { connectNewWorkspaceDaemonClient } from "./new-workspace";

const PLUGIN_ID = "usage-auto-resume";
const FIRST_MESSAGE = "先检查错误恢复，再补充回归测试。";
const RETRY_MESSAGE = "随后检查保存失败时输入是否保留。";

async function openQueue(page: Page) {
  await page.getByRole("button", { name: "Follow-up queue", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Follow-up text", exact: true })).toBeVisible();
}

async function verifyComposerIconButtons(page: Page, info: TestInfo) {
  const queue = page.getByRole("button", { name: "Follow-up queue", exact: true });
  const archive = page.getByTestId("chat-archive-workspace");
  await expect(queue).toBeVisible();
  await expect(queue).toHaveText("");
  await expect(archive).toHaveText("");
  await queue.hover();
  await expect(page.getByRole("tooltip")).toContainText("Follow-up queue");
  await archive.hover();
  await expect(page.getByRole("tooltip")).toContainText("Archive workspace");
  await page.mouse.move(0, 0);
  await capture(page, info, "composer-icon-buttons");
}

async function saveMessage(page: Page, text: string) {
  const input = page.getByRole("textbox", { name: "Follow-up text", exact: true });
  await input.fill(text);
  await page.getByRole("button", { name: "Queue", exact: true }).click();
  await expect(input).toHaveValue("");
  await expect(page.getByText(text, { exact: true })).toBeVisible();
  await expect(page.getByText("Paused · 1 items", { exact: true })).toBeVisible();
}

async function capture(page: Page, info: TestInfo, name: string) {
  await info.attach(name, {
    body: await page.screenshot({ path: info.outputPath(`${name}.png`) }),
    contentType: "image/png",
  });
}

async function verifyFailedSave(page: Page, info: TestInfo, queuePath: string) {
  const input = page.getByRole("textbox", { name: "Follow-up text", exact: true });
  const stored = await readFile(queuePath, "utf8");
  await input.fill(RETRY_MESSAGE);
  // Corrupt only this worker's queue store. The real plugin must fail without replacing it.
  await writeFile(queuePath, "{invalid-json", "utf8");
  try {
    await page.getByRole("button", { name: "Queue", exact: true }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Could not read the saved follow-up queue" }),
    ).toHaveText("Could not read the saved follow-up queue; existing messages were kept.");
    await expect(input).toHaveValue(RETRY_MESSAGE);
    await expect(page.getByRole("button", { name: "Retry save", exact: true })).toBeEnabled();
    expect(await readFile(queuePath, "utf8")).toBe("{invalid-json");
    await capture(page, info, "queue-failed-save-preserves-input");
  } finally {
    await writeFile(queuePath, stored, "utf8");
  }
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(input).toHaveValue("");
  await expect(page.getByText(RETRY_MESSAGE, { exact: true })).toHaveCount(1);
  await expect(page.getByText("Paused · 1 items", { exact: true })).toBeVisible();
}

async function verifyCompactQueue(page: Page, info: TestInfo, queuePath: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const queue = page.getByRole("button", { name: "Follow-up queue", exact: true });
  const archive = page.getByTestId("chat-archive-workspace");
  await expect(queue).toBeInViewport();
  await expect(queue).toHaveText("");
  await expect(archive).toBeInViewport();
  const queueFrame = await queue.boundingBox();
  const archiveFrame = await archive.boundingBox();
  expect(queueFrame).toMatchObject({ width: 40, height: 40 });
  // Archive moved to the compact chat action rail; the plugin keeps its composer target.
  expect(archiveFrame).toMatchObject({ width: 28, height: 28 });
  await capture(page, info, "queue-compact-icon-only");
  await openQueue(page);
  const message = page.getByText(RETRY_MESSAGE, { exact: true });
  await message.scrollIntoViewIfNeeded();
  await expect(message).toBeInViewport();
  await capture(page, info, "queue-compact-saved");

  const input = page.getByRole("textbox", { name: "Follow-up text", exact: true });
  await input.scrollIntoViewIfNeeded();
  await expect(input).toBeInViewport();
  await input.fill("手机宽度下也能继续补充");
  await expect(input).toHaveValue("手机宽度下也能继续补充");
  const save = page.getByRole("button", { name: "Queue", exact: true });
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport();
  await expect(save).toBeEnabled();
  await capture(page, info, "queue-compact-input");
  await input.fill("");

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(message).not.toBeVisible();
  await expect(page.getByText("No follow-ups yet.", { exact: true })).toBeVisible();
  const saved = JSON.parse(await readFile(queuePath, "utf8"));
  expect(saved.queues[0].messages).toHaveLength(0);
  await capture(page, info, "queue-compact-deleted");
}

/** Runs the shipping client and server plugin against an isolated daemon, without sending turns. */
export async function verifyUsageAutoResumeQueue(page: Page, info: TestInfo) {
  const home = process.env.E2E_PASEO_HOME;
  if (!home) throw new Error("The queue integration test requires the isolated E2E worker home.");
  const queuePath = path.join(home, "plugin-data", PLUGIN_ID, "queues.json");
  const agent = await seedMockAgentWorkspace({
    repoPrefix: "plugin-usage-queue-",
    title: "补充队列集成验证",
  });
  const client = await connectNewWorkspaceDaemonClient({ ownProjects: false });
  const previous = await client.getDaemonConfig();
  try {
    await client.patchDaemonConfig({ pluginsEnabled: true });
    const plugin = await client.installDirectoryPlugin(
      path.resolve(__dirname, "../../../../../plugins/usage-auto-resume"),
    );
    expect(plugin.status).toBe("running");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await gotoAppShell(page);
    await page.goto(buildAgentRoute(agent.workspaceId, agent.agentId));
    await verifyComposerIconButtons(page, info);
    await openQueue(page);

    await test.step("the composer pill persists a text follow-up without running the agent", async () => {
      await saveMessage(page, FIRST_MESSAGE);
      const saved = JSON.parse(await readFile(queuePath, "utf8"));
      expect(saved.queues).toMatchObject([
        { agentId: agent.agentId, status: "paused", messages: [{ text: FIRST_MESSAGE }] },
      ]);
      await capture(page, info, "queue-saved");
    });

    await test.step("a plugin reload retains the queue and the UI can remove it", async () => {
      await client.reloadPlugin(PLUGIN_ID);
      await page.reload();
      await openQueue(page);
      await expect(page.getByText(FIRST_MESSAGE, { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Delete", exact: true }).click();
      await expect(page.getByText(FIRST_MESSAGE, { exact: true })).not.toBeVisible();
      await expect(page.getByText("No follow-ups yet.", { exact: true })).toBeVisible();
    });

    await test.step("a failed save preserves input and a retry adds exactly one message", async () => {
      await verifyFailedSave(page, info, queuePath);
      const saved = JSON.parse(await readFile(queuePath, "utf8"));
      expect(saved.queues[0].messages).toHaveLength(1);
      expect(saved.queues[0].messages[0].text).toBe(RETRY_MESSAGE);
      const agents = await agent.client.fetchAgents();
      expect(
        agents.entries.find(({ agent: entry }) => entry.id === agent.agentId)?.agent.status,
      ).toBe("idle");
      await capture(page, info, "queue-retry-saved-once");
    });

    await test.step("the compact composer pill opens a reachable queue sheet and can delete the last message", async () => {
      await verifyCompactQueue(page, info, queuePath);
    });
  } finally {
    await client.removePlugin(PLUGIN_ID).catch(() => undefined);
    await client
      .patchDaemonConfig({ pluginsEnabled: previous.config.pluginsEnabled ?? false })
      .catch(() => undefined);
    await client.close();
    await agent.cleanup();
  }
}
