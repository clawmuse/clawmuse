import { expect, test, type Page } from "../support/fixtures";
import { seedWorkspace, type SeededWorkspace } from "../support/helpers/seed-client";
import { openSettings } from "../support/helpers/app";
import { openSettingsSection } from "../support/helpers/settings";
import { buildSchedulesRoute } from "../../src/utils/host-routes";

interface ScheduleSeedClient {
  scheduleCreate(input: {
    prompt: string;
    name?: string;
    cadence: { type: "cron"; expression: string };
    target: {
      type: "new-agent";
      config: {
        provider: "mock";
        cwd: string;
        model: string;
        modeId: string;
        title: string;
      };
    };
    runOnCreate: boolean;
  }): Promise<{ schedule: { id: string; createdAt: string } | null; error: string | null }>;
  schedulePause(input: { id: string }): Promise<{ error: string | null }>;
  scheduleDelete(input: { id: string }): Promise<{ error: string | null }>;
}

interface SeededSchedule {
  id: string;
  createdAt: number;
}

async function seedPausedSchedule(
  workspace: SeededWorkspace,
  name: string,
): Promise<SeededSchedule> {
  const client = workspace.client as unknown as ScheduleSeedClient;
  const result = await client.scheduleCreate({
    prompt: "Say hello from the scheduled agent.",
    name,
    cadence: { type: "cron", expression: "0 9 * * *" },
    target: {
      type: "new-agent",
      config: {
        provider: "mock",
        cwd: workspace.repoPath,
        model: "ten-second-stream",
        modeId: "load-test",
        title: name,
      },
    },
    runOnCreate: false,
  });
  if (!result.schedule) {
    throw new Error(result.error ?? "Failed to seed schedule");
  }
  const { id, createdAt } = result.schedule;
  const paused = await client.schedulePause({ id });
  if (paused.error) {
    throw new Error(paused.error);
  }
  return { id, createdAt: Date.parse(createdAt) };
}

async function deleteSeededSchedule(workspace: SeededWorkspace, id: string): Promise<void> {
  const client = workspace.client as unknown as ScheduleSeedClient;
  const result = await client.scheduleDelete({ id });
  if (result.error) {
    throw new Error(result.error);
  }
}

/** Opens Schedules with the browser clock frozen at `time`, so the page cannot age it. */
async function openSchedulesAt(page: Page, time: number): Promise<void> {
  await page.clock.install({ time });
  await page.goto(buildSchedulesRoute());
}

async function letTimePass(page: Page, duration: string): Promise<void> {
  await page.clock.fastForward(duration);
}

async function expectScheduleRowText(page: Page, scheduleId: string, text: string): Promise<void> {
  await expect(page.getByTestId(`schedule-row-${scheduleId}`)).toContainText(text, {
    timeout: 30_000,
  });
}

test.describe("Schedule relative timestamps", () => {
  const cleanupTasks: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    const failures: unknown[] = [];
    for (const cleanup of cleanupTasks.toReversed()) {
      try {
        await cleanup();
      } catch (error) {
        failures.push(error);
      }
    }
    cleanupTasks.length = 0;
    if (failures.length > 0) {
      throw new AggregateError(failures, "Test cleanup failed");
    }
  });

  test("an idle schedule row keeps its created age current", async ({ page }, testInfo) => {
    const workspace = await seedWorkspace({ repoPrefix: "schedule-relative-time-", git: false });
    cleanupTasks.push(() => workspace.cleanup());
    const schedule = await seedPausedSchedule(workspace, `Relative time ${Date.now()}`);
    cleanupTasks.push(() => deleteSeededSchedule(workspace, schedule.id));

    await openSchedulesAt(page, schedule.createdAt);
    await expectScheduleRowText(page, schedule.id, "Created just now");

    await letTimePass(page, "03:00");

    await expectScheduleRowText(page, schedule.id, "Created 3m ago");

    await openSettings(page);
    await openSettingsSection(page, "general");
    await page.getByRole("button", { name: "System", exact: true }).click();
    await page
      .getByRole("menuitem", { name: "简体中文 - Simplified Chinese", exact: true })
      .click();
    await page
      .getByTestId("settings-sidebar")
      .getByRole("button", { name: "返回", exact: true })
      .click();
    await page.getByTestId("sidebar-schedules").filter({ visible: true }).click();
    await expectScheduleRowText(page, schedule.id, "创建于3 分钟前");
    await expectScheduleRowText(page, schedule.id, "已暂停");
    await expectScheduleRowText(page, schedule.id, "尚未运行");
    await expectScheduleRowText(page, schedule.id, "每天 09:00");
    await page.getByTestId(`schedule-row-${schedule.id}`).hover();
    await page.getByTestId(`schedule-kebab-${schedule.id}`).click();
    await expect(page.getByTestId(`schedule-menu-resume-${schedule.id}`)).toContainText(
      "恢复定时任务",
    );
    await expect(page.getByTestId(`schedule-menu-run-${schedule.id}`)).toContainText("立即运行");
    await expect(page.getByTestId(`schedule-menu-delete-${schedule.id}`)).toContainText(
      "删除定时任务",
    );
    await page.screenshot({ path: testInfo.outputPath("schedules-row-menu-zh.png") });
    await page.getByTestId(`schedule-menu-edit-${schedule.id}`).click();
    const form = page.getByTestId("schedule-form-sheet");
    await expect(form).toContainText("编辑定时任务");
    await expect(page.getByTestId("schedule-form-submit")).toHaveText("保存更改");
    await form.getByRole("button", { name: "取消", exact: true }).click();
    await expect(form).not.toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expectScheduleRowText(page, schedule.id, "已暂停");
    await page.screenshot({ path: testInfo.outputPath("schedules-row-zh-compact.png") });
  });
});
