import { type Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";

async function openProjectHome(page: Page) {
  await page.goto("/open-project");
  await expect(page.getByTestId("open-project-setup-providers")).toBeVisible();
}

async function scrollToHomeFooter(page: Page) {
  await page.mouse.move(160, 350);
  await page.mouse.wheel(0, 1500);
}

async function expectHomeActionsReachable(page: Page) {
  const providers = page.getByTestId("open-project-setup-providers");
  const account = page.getByTestId("clawmuse-open-account").filter({ visible: true }).last();
  await expect(providers).toBeInViewport({ ratio: 1 });
  await expect(account).toBeInViewport({ ratio: 1 });
  const providerBounds = await providers.boundingBox();
  const accountBounds = await account.boundingBox();
  expect(providerBounds).not.toBeNull();
  expect(accountBounds).not.toBeNull();
  expect(accountBounds!.y).toBeGreaterThanOrEqual(providerBounds!.y + providerBounds!.height);
}

test("home actions remain reachable on a short phone screen", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openProjectHome(page);
  // The loading skeleton also has support actions. Wait for the real list so
  // hydration cannot replace those elements between scrolling and measuring.
  await expect(
    page.getByTestId("mobile-home").getByTestId("sidebar-project-workspace-list-scroll"),
  ).toBeVisible();
  await scrollToHomeFooter(page);
  await expectHomeActionsReachable(page);
  await page.screenshot({ path: testInfo.outputPath("home-scrolled.png") });
});

test("home actions fit on a desktop screen without overlap", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openProjectHome(page);
  await expectHomeActionsReachable(page);
  await expect(page.getByTestId("open-project-setup-providers")).toHaveCSS(
    "-webkit-app-region",
    "none",
  );
});
