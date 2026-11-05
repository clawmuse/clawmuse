import { test, expect } from "../support/fixtures";
import { gotoAppShell, openSettings } from "../support/helpers/app";
import { openSettingsSection, openSettingsHostSection } from "../support/helpers/settings";
import { getServerId } from "../support/helpers/server-id";
import { buildSchedulesRoute } from "../../src/utils/host-routes";

test("Chinese host settings translate long descriptions", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem("@paseo:app-settings", JSON.stringify({ language: "zh-CN" }));
  });
  await gotoAppShell(page);
  await openSettings(page);
  await openSettingsHostSection(page, getServerId(), "agents");
  const browserTools = page.getByTestId("host-page-browser-tools-card");
  await expect(browserTools).toContainText(
    "允许代理访问和控制 ClawMuse 的浏览器标签页，包括已登录的账号状态。",
  );
  await expect(browserTools).not.toContainText("Allow agents");
  await page.screenshot({ path: testInfo.outputPath("host-agents-descriptions-zh.png") });

  await openSettingsHostSection(page, getServerId(), "workspaces");
  await expect(page.getByTestId("host-page-auto-archive-merged-workspaces-card")).toContainText(
    "拉取请求合并后，自动归档没有未提交更改的 ClawMuse 工作区。",
  );

  await openSettingsHostSection(page, getServerId(), "terminals");
  await expect(page.getByTestId("host-page-terminal-agent-hooks-card")).toContainText(
    "接收终端代理的通知和运行状态。启用后，会在代理配置文件中安装通知钩子。",
  );
  await expect(page.getByTestId("host-page-terminal-agent-hooks-switch")).toHaveAccessibleName(
    "启用终端代理通知",
  );
  await page.screenshot({ path: testInfo.outputPath("host-terminal-descriptions-zh.png") });
});

test("Chinese schedules translate the compact empty state and creation form", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await gotoAppShell(page);
  await openSettings(page);
  await openSettingsSection(page, "general");
  await page.getByRole("button", { name: "System", exact: true }).click();
  await page.getByRole("menuitem", { name: "简体中文 - Simplified Chinese", exact: true }).click();
  await expect(page.getByText("默认发送", { exact: true }).first()).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(buildSchedulesRoute());
  await expect(page.getByText("定时任务", { exact: true }).last()).toBeVisible();
  await expect(page.getByTestId("schedules-empty")).toContainText("暂无进行中的定时任务");
  await expect(page.getByTestId("schedules-empty")).toContainText("按设定的时间自动运行 AI 代理。");
  await expect(page.getByTestId("schedules-empty-new")).toHaveText("新建定时任务");
  await page.screenshot({ path: testInfo.outputPath("schedules-empty-zh.png") });

  await page.getByTestId("schedules-empty-new").click();
  const form = page.getByTestId("schedule-form-sheet");
  await expect(form).toBeVisible();
  await expect(page.getByTestId("schedule-name-input")).toHaveAttribute("placeholder", "选填");
  await expect(page.getByTestId("schedule-prompt-input")).toHaveAttribute(
    "placeholder",
    "每次运行时需要代理做什么？",
  );
  await expect(page.getByTestId("schedule-max-runs-input")).toHaveAttribute(
    "placeholder",
    "不限次数",
  );
  await expect(page.getByTestId("schedule-form-submit")).toHaveText("创建定时任务");
  await page.getByTestId("cadence-cron-expression").fill("60 * * * *");
  await expect(page.getByText("分钟值无效", { exact: true })).toBeVisible();
  await page.getByTestId("schedule-cadence-preset-trigger").click();
  await expect(page.getByTestId("schedule-cadence-preset-mondays-9")).toHaveText("每周一 9:00");
  await page.getByTestId("schedule-cadence-preset-mondays-9").click();
  await expect(page.getByTestId("cadence-cron-expression")).toHaveValue("0 9 * * 1");
  await expect(page.getByText("分钟值无效", { exact: true })).not.toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("schedule-form-zh.png") });
});

test("Settings language selector switches General labels", async ({ page }, testInfo) => {
  test.setTimeout(120_000);

  await gotoAppShell(page);
  const accountButtons = page.getByTestId("clawmuse-open-account").filter({ hasText: /./ });
  await expect(accountButtons).toHaveText(["Sign in to ClawMuse"]);
  await page.screenshot({ path: testInfo.outputPath("home-account-en.png") });
  await page.getByTestId("clawmuse-open-account").first().click();
  await expect(page.getByTestId("clawmuse-account-dialog")).toContainText("ClawMuse account");
  await expect(page.getByTestId("clawmuse-account")).toContainText("Email");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("clawmuse-account-dialog")).not.toBeVisible();
  await openSettings(page);
  await openSettingsSection(page, "general");

  await expect(page.getByText("Default send", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "System", exact: true }).click();
  await page.getByRole("menuitem", { name: "简体中文 - Simplified Chinese", exact: true }).click();

  await expect(page.getByText("默认发送", { exact: true }).first()).toBeVisible();
  await expect(accountButtons).toHaveText(["登录 ClawMuse"]);
  await expect(page.getByTestId("clawmuse-account")).toContainText("ClawMuse 账号");
  await expect(page.getByTestId("clawmuse-account")).toContainText("邮箱");
  await page.screenshot({ path: testInfo.outputPath("account-zh.png") });

  await page.getByRole("button", { name: "简体中文", exact: true }).click();
  await page.getByRole("menuitem", { name: "English - 英语", exact: true }).click();

  await expect(page.getByText("Default send", { exact: true }).first()).toBeVisible();
  await expect(accountButtons).toHaveText(["Sign in to ClawMuse"]);
  await expect(page.getByTestId("clawmuse-account")).toContainText("ClawMuse account");
});

test("Settings language selector switches to Korean", async ({ page }) => {
  test.setTimeout(120_000);

  await gotoAppShell(page);
  await openSettings(page);
  await openSettingsSection(page, "general");

  await page.getByRole("button", { name: "System", exact: true }).click();
  await page.getByRole("menuitem", { name: "한국어 - Korean", exact: true }).click();

  await expect(page.getByText("기본 전송", { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId("clawmuse-open-account").filter({ hasText: /./ })).toHaveText([
    "ClawMuse 로그인",
  ]);
  await expect(page.getByTestId("clawmuse-account")).toContainText("ClawMuse 계정");

  await page.getByRole("button", { name: "한국어", exact: true }).click();
  await page.getByRole("menuitem", { name: "English - 영어", exact: true }).click();

  await expect(page.getByText("Default send", { exact: true }).first()).toBeVisible();
});

test("Compact home account entry uses the app language", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoAppShell(page);

  const accountButton = page.getByTestId("clawmuse-open-account").filter({ visible: true });
  await expect(accountButton).toBeVisible();
  await expect(accountButton).toHaveText("Sign in to ClawMuse");
  await page.screenshot({ path: testInfo.outputPath("home-account-compact.png") });
  await accountButton.click();
  await expect(page.getByTestId("clawmuse-account")).toBeVisible();
});

test("Schedules empty state and editor use Chinese on desktop and compact layouts", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await gotoAppShell(page);
  await openSettings(page);
  await openSettingsSection(page, "general");
  await page.getByRole("button", { name: "System", exact: true }).click();
  await page.getByRole("menuitem", { name: "简体中文 - Simplified Chinese", exact: true }).click();
  await page
    .getByTestId("settings-sidebar")
    .getByRole("button", { name: "返回", exact: true })
    .click();
  await page.getByTestId("sidebar-schedules").filter({ visible: true }).click();

  for (const layout of ["desktop", "compact"]) {
    if (layout === "compact") await page.setViewportSize({ width: 390, height: 844 });
    const empty = page.getByTestId("schedules-empty");
    await expect(empty).toContainText("暂无进行中的定时任务");
    await expect(empty).toContainText("按设定的时间自动运行 AI 代理。");
    await expect(page.getByTestId("schedules-empty-new")).toHaveText("新建定时任务");
    await page.screenshot({ path: testInfo.outputPath(`schedules-empty-zh-${layout}.png`) });

    await page.getByTestId("schedules-empty-new").click();
    const form = page.getByTestId("schedule-form-sheet");
    await expect(form).toBeVisible();
    await expect(page.getByTestId("schedule-name-input")).toHaveAttribute(
      "aria-label",
      "定时任务名称",
    );
    await expect(page.getByTestId("schedule-prompt-input")).toHaveAttribute(
      "placeholder",
      "每次运行时需要代理做什么？",
    );
    await expect(page.getByTestId("schedule-form-submit")).toHaveText("创建定时任务");
    await page.getByTestId("schedule-cadence-preset-trigger").click();
    await page.getByTestId("schedule-cadence-preset-weekdays-9").click();
    await expect(page.getByTestId("cadence-cron-expression")).toHaveValue("0 9 * * 1-5");
    await expect(page.getByTestId("schedule-cadence-preset-trigger")).toContainText("工作日 9:00");
    await page.getByTestId("cadence-cron-expression").fill("60 * * * *");
    await expect(page.getByText("分钟值无效", { exact: true })).toBeVisible();
    await expect(page.getByTestId("schedule-form-submit")).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath(`schedules-form-zh-${layout}.png`) });
    await page.getByRole("button", { name: "取消", exact: true }).filter({ visible: true }).click();
    await expect(form).not.toBeVisible();
  }
});
