import { expect, test, type Page } from "../support/fixtures";
import { gotoAppShell, openSettings } from "../support/helpers/app";
import { openSettingsSection } from "../support/helpers/settings";

// The name and the version are separate cells of a key/value row, so they meet with no space
// between them in the row's text content.
const APP_VERSION = /^ClawMuse\s*v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

async function openHelpMenu(page: Page): Promise<void> {
  await page.getByTestId("sidebar-help").click();
  await expect(page.getByTestId("sidebar-help-menu")).toBeVisible();
}

async function expectDiagnosticReport(page: Page): Promise<void> {
  const sheet = page.getByTestId("app-diagnostic-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Copy diagnostic" })).toBeEnabled();
  await expect(page.getByText(/App version:/).first()).toBeVisible();
}

async function closeSheet(page: Page, testID: string): Promise<void> {
  const sheet = page.getByTestId(testID);
  await sheet.getByLabel("Close").click();
  await expect(sheet).not.toBeVisible();
}

test("keeps every footer action reachable at the minimum sidebar width", async ({ page }) => {
  await page.setViewportSize({ width: 840, height: 700 });
  await gotoAppShell(page);
  const handle = page.getByTestId("left-sidebar-resize-handle");
  const handleBounds = await handle.boundingBox();
  expect(handleBounds).not.toBeNull();
  const dragX = handleBounds!.x + handleBounds!.width / 2;
  const dragY = handleBounds!.y + handleBounds!.height / 2;
  await page.mouse.move(dragX, dragY);
  await page.mouse.down();
  await page.mouse.move(dragX - 500, dragY, { steps: 20 });
  await page.mouse.up();

  const footer = page.getByTestId("sidebar-footer-bottom-line");
  await expect.poll(async () => (await footer.boundingBox())!.width).toBeLessThanOrEqual(140);
  const footerBounds = await footer.boundingBox();
  expect(footerBounds!.width).toBeGreaterThanOrEqual(138);
  const buttons = footer.getByRole("button");
  await expect(buttons).toHaveCount(6);
  for (const button of await buttons.all()) {
    const bounds = await button.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(28);
    expect(bounds!.x).toBeGreaterThanOrEqual(footerBounds!.x);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(footerBounds!.x + footerBounds!.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(footerBounds!.y + footerBounds!.height);
    await button.click({ trial: true });
  }
  await footer.screenshot({ path: test.info().outputPath("minimum-width-footer.png") });
  await openHelpMenu(page);
  await page.keyboard.press("Escape");
  await page.getByTestId("sidebar-settings").click();
  await expect(page).toHaveURL(/\/settings(?:\/|$)/);
  await expect(page.getByTestId("settings-sidebar")).toBeVisible();
});

test("account icon sits beside help and settings without a text label", async ({ page }) => {
  await gotoAppShell(page);
  const account = page
    .getByTestId("sidebar-footer-bottom-line")
    .getByTestId("clawmuse-open-account");
  const help = page.getByTestId("sidebar-help");
  const settings = page.getByTestId("sidebar-settings");
  await expect(account).toBeVisible();
  await expect(account).toHaveText("");
  const accountBounds = await account.boundingBox();
  const helpBounds = await help.boundingBox();
  expect(accountBounds).not.toBeNull();
  expect(helpBounds).not.toBeNull();
  expect(accountBounds!.x + accountBounds!.width).toBeLessThanOrEqual(helpBounds!.x);
  expect(accountBounds!.y).toBe(helpBounds!.y);
  const settingsIconSize = await settings.locator("svg").getAttribute("width");
  await expect(account.locator("svg")).toHaveAttribute("width", settingsIconSize!);
  await page.getByTestId("sidebar-footer").screenshot({
    path: test.info().outputPath("account-footer.png"),
  });
  await account.hover();
  await expect(page.getByTestId("clawmuse-open-account-tooltip")).toBeVisible();
  await account.click();
  await expect(page.getByTestId("clawmuse-account-dialog")).toBeVisible();
});

test("keeps diagnostics and shortcuts without upstream promotional entries", async ({ page }) => {
  await gotoAppShell(page);
  await openHelpMenu(page);
  await expect(page.getByTestId("sidebar-help-version")).toHaveText(APP_VERSION);
  await expect(page.getByTestId("sidebar-help-changelog")).toHaveCount(0);
  await expect(page.getByTestId("sidebar-help-github")).toHaveCount(0);
  await expect(page.getByTestId("sidebar-help-discord")).toHaveCount(0);
  await page.getByTestId("sidebar-help-diagnostics").click();
  await expectDiagnosticReport(page);
  await closeSheet(page, "app-diagnostic-sheet");
  await openHelpMenu(page);
  await page.getByTestId("sidebar-help-shortcuts").click();
  await expect(page.getByTestId("keyboard-shortcuts-dialog")).toBeVisible();
});

for (const width of [1280, 390]) {
  test(`About keeps attribution without upstream release or support links at width ${width}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const upstreamRequests: string[] = [];
    page.on("request", (request) => {
      if (
        /https?:\/\/(?:[^/]*paseo\.sh|(?:raw\.githubusercontent|github)\.com\/getpaseo\/paseo)(?:[/?#]|$)/.test(
          request.url(),
        )
      ) {
        upstreamRequests.push(request.url());
      }
    });
    await gotoAppShell(page);
    if (width === 390) {
      await expect(page.getByRole("button", { name: "Open menu", exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("home-compact.png") });
      await openCompactSidebar(page);
      await page.getByTestId("sidebar-settings").click();
      await expect(page).toHaveURL(/\/settings$/);
    } else {
      await openSettings(page);
    }
    await openSettingsSection(page, "about");
    await expect(page.getByText("App version", { exact: true })).toBeVisible();
    await expect(page.getByTestId("settings-whats-new")).toHaveCount(0);
    const attribution = page.getByTestId("settings-open-source");
    await expect(attribution.getByRole("link", { name: /^Paseo / })).toContainText(
      "© Mohamed Boudra · Apache-2.0",
    );
    const outsideAttribution = page.locator(':not([data-testid="settings-open-source"] *)');
    await expect(page.getByText(/\bPaseo\b/).and(outsideAttribution)).toHaveCount(0);
    await expect(
      page.locator('a[href*="paseo.sh"], a[href*="getpaseo/paseo"]').and(outsideAttribution),
    ).toHaveCount(0);
    expect(upstreamRequests).toEqual([]);
    const manifestResponse = await page.request.get("/manifest.json");
    expect(await manifestResponse.json()).toMatchObject({
      name: "ClawMuse",
      short_name: "ClawMuse",
    });
    await page.screenshot({ path: testInfo.outputPath(`about-${width}.png`) });
  });
}

test("searches keyboard shortcuts from the sidebar help menu", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "platform", { get: () => "MacIntel" });
  });
  await gotoAppShell(page);
  await openHelpMenu(page);
  await page.getByTestId("sidebar-help-shortcuts").click();

  const dialog = page.getByTestId("keyboard-shortcuts-dialog");
  const search = page.getByPlaceholder("Search shortcuts");

  await search.fill("command+n");
  await expect(dialog.getByText("New workspace", { exact: true })).toBeVisible();

  await search.fill("interrupt");

  await expect(dialog.getByText("Interrupt agent", { exact: true })).toBeVisible();
  await expect(dialog.getByText("New workspace", { exact: true })).toHaveCount(0);

  await search.fill("no matching shortcut");
  await expect(dialog.getByText("No results found", { exact: true })).toBeVisible();

  await search.fill("");
  await expect(dialog.getByText("New workspace", { exact: true })).toBeVisible();
});

test("keeps diagnostics available from Settings after globalizing the sheet", async ({ page }) => {
  await gotoAppShell(page);
  await openSettings(page);
  await openSettingsSection(page, "diagnostics");

  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expectDiagnosticReport(page);
});

test.describe("compact sidebar help", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("footer buttons provide finger-sized targets and accept taps beyond the glyph", async ({
    page,
  }) => {
    await gotoAppShell(page);
    await openCompactSidebar(page);
    await expectFingerSizedFooterTargets(page);
    await tapHelpNearTargetEdge(page);
    await expect(page.getByTestId("sidebar-help-menu")).toBeVisible();
    await page.getByTestId("sidebar-help-diagnostics").click();
    await expectDiagnosticReport(page);
  });

  test("offers diagnostics without advertising disabled keyboard shortcuts", async ({ page }) => {
    await gotoAppShell(page);
    await page.getByRole("button", { name: "Open menu", exact: true }).click();

    await openHelpMenu(page);
    await expect(page.getByTestId("sidebar-help-shortcuts")).toHaveCount(0);
    await page.getByTestId("sidebar-help-diagnostics").click();
    await expectDiagnosticReport(page);
  });
});

async function openCompactSidebar(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  await expect(page.getByTestId("sidebar-footer-bottom-line")).toBeVisible();
}

const MIN_TARGET_SIZE = 44;

async function expectFingerSizedFooterTargets(page: Page): Promise<void> {
  const buttons = page.getByTestId("sidebar-footer-bottom-line").getByRole("button");
  await expect(buttons).toHaveCount(6);
  for (const button of await buttons.all()) {
    const bounds = await button.boundingBox();
    // Layout can report a 44pt box as 43.99999, so compare at a hundredth of a point.
    expect(bounds?.width).toBeGreaterThanOrEqual(MIN_TARGET_SIZE - 0.01);
    expect(bounds?.height).toBeGreaterThanOrEqual(MIN_TARGET_SIZE - 0.01);
    // Glyphs stay at the composer toolbar size (some optically smaller); only the target grows.
    const glyphWidth = await button.locator("svg").first().getAttribute("width");
    expect(Number(glyphWidth)).toBeLessThanOrEqual(20);
  }
}

async function tapHelpNearTargetEdge(page: Page): Promise<void> {
  const button = page.getByRole("button", { name: "Help and support", exact: true });
  await button.tap({ position: { x: 40, y: 40 } });
}
