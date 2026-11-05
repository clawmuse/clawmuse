import { verifyPluginToolTranslations } from "../support/helpers/plugin-translations";
import { test } from "../support/fixtures";
import { withButtonShowcase } from "../support/helpers/plugin-buttons";
import { verifyUsageAutoResumeQueue } from "../support/helpers/usage-auto-resume";

test("plugin header and composer buttons share actions, menus, content, and updates", async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  await withButtonShowcase(page, info, async (buttons) => {
    await buttons.verifyObservationLifetime();
    await buttons.openWideMenusAndPopovers();
    await buttons.runAndUpdateActions();
    await buttons.openCompactSheets();
    await buttons.useCompactWorkspaceMenu();
    await buttons.hideAndUnloadOpenButtons();
  });
});

test("plugin tooltips and menu labels follow app language with a panel draft open", async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  await verifyPluginToolTranslations(page, info);
});

test("usage auto resume composer queue persists text and retains failed saves", async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  await verifyUsageAutoResumeQueue(page, info);
});
