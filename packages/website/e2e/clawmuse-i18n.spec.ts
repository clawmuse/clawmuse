import { officialPluginIds, pluginsCopy } from "../clawmuse/plugins-content";
import { expect } from "playwright/test";
import { test } from "./fixtures";
import { readFileSync } from "node:fs";
import appLabels from "../clawmuse/demo-app-labels.json" with { type: "json" };
import {
  accountUrl,
  appUrl,
  descriptionFor,
  documentTitleFor,
  href,
  pageLanguages,
  routeInfo,
  routes,
  sourceUrl,
  titleFor,
} from "../clawmuse/content";
import {
  articleFor,
  articleRoutes,
  blogArticleRoutes,
  editorialDate,
  learnArticleRoutes,
} from "../clawmuse/editorial-content";
import { getTranslator } from "../clawmuse/i18n/i18n";
import { languages, locales } from "../clawmuse/i18n/locales";
import { agentFor, agentRoutes } from "../clawmuse/agents-content";

for (const language of languages) {
  test(`${language} iOS download opens the public App Store listing`, async ({ page }) => {
    const t = getTranslator(language);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(href("/download", language));
    const webCard = page.locator(".download-card").filter({
      has: page.getByRole("heading", { name: t("webWorkspace.downloadTitle"), exact: true }),
    });
    await expect(webCard.getByRole("link")).toHaveAttribute("href", appUrl);
    await expect(webCard).toContainText(t("webWorkspace.downloadBody"));
    const link = page.getByRole("link", { name: t("downloads.downloadOnAppStore") });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "https://apps.apple.com/app/clawmuse/id6810076165");
    await expect(page.getByText(t("downloads.iosAvailableOnAppStore"))).toBeVisible();
    await expect(page.locator("main")).not.toContainText("TestFlight");
    await page.route("https://apps.apple.com/**", (route) =>
      route.fulfill({ contentType: "text/html", body: "<h1>App Store</h1>" }),
    );
    await link.click();
    await expect(page).toHaveURL("https://apps.apple.com/app/clawmuse/id6810076165");
  });

  test(`${language} Web workspace is localized on home and product pages`, async ({ page }) => {
    const t = getTranslator(language);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const route of ["/", "/product"] as const) {
      await page.goto(href(route, language));
      const section = page.locator(".web-workspace-section");
      await expect(section.getByRole("heading")).toHaveText(t("webWorkspace.title"));
      await expect(section.getByRole("link", { name: t("webWorkspace.cta") })).toHaveAttribute(
        "href",
        appUrl,
      );
      await expect(section).toContainText(t("webWorkspace.body"));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  });
}

for (const language of ["en", "zh-CN"] as const) {
  for (const width of [320, 1440]) {
    test(`${language} agent discovery and keyboard filters at ${width}px`, async ({
      page,
    }, testInfo) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewportSize({ width, height: 900 });
      await page.goto(href("/agents", language));
      await expect(page.locator(".agent-directory-card")).toHaveCount(agentRoutes.length);
      const search = page.locator("#agent-search");
      await search.fill("Codex");
      await expect(page.locator(".agent-directory-card")).toHaveCount(1);
      await page.locator(".agent-directory-card a").first().click();
      await expect(page).toHaveURL((url) => url.pathname === href("/agents/codex", language));
      await expect(page.locator("h1")).toHaveText(agentFor("/agents/codex", language).title);
      await expect(page.locator("main .agent-icon").first()).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("agent-detail.png"), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.goto(href("/agents", language));
      await page.locator('[data-category="plugin"]').focus();
      await page.keyboard.press("Enter");
      await expect(page.locator(".agent-directory-card")).toHaveCount(3);
      await search.fill("no-such-agent-12345");
      await expect(page.getByTestId("agent-empty-state")).toBeVisible();
      await page.getByTestId("agent-clear-filters").click();
      await expect(page.locator(".agent-directory-card")).toHaveCount(agentRoutes.length);
      await expect(search).toHaveValue("");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: testInfo.outputPath("agent-directory.png"), fullPage: true });
      expect(errors).toEqual([]);
    });
  }
  test(`${language} agent landing pages are complete without JavaScript`, async ({ request }) => {
    for (const route of agentRoutes) {
      const response = await request.get(href(route, language));
      expect(response.status(), route).toBe(200);
      const html = await response.text();
      const agent = agentFor(route, language);
      expect(html, route).toContain(
        `<link rel="canonical" href="https://clawmuse.com${href(route, language)}"`,
      );
      expect(html, route).toContain("<h1");
      expect(html, route).toContain(agent.name);
      const schema = [
        ...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs),
      ].map((match) => JSON.parse(match[1]));
      const webPage = schema.find((item) => item["@type"] === "WebPage");
      expect(webPage?.name, route).toBe(agent.title);
      expect(webPage?.description, route).toBe(agent.description);
      expect(webPage?.citation, route).toBe(agent.officialUrl);
      expect(
        schema.find((item) => item["@type"] === "BreadcrumbList")?.itemListElement,
      ).toHaveLength(3);
      const faq = schema.find((item) => item["@type"] === "FAQPage");
      expect(faq?.mainEntity).toHaveLength(agent.faq.length);
      expect(html, route).not.toContain('hreflang="fr"');
    }
    const index = await (await request.get(href("/agents", language))).text();
    for (const route of agentRoutes) expect(index).toContain(`href="${href(route, language)}"`);
    const icons = new Set(
      [...index.matchAll(/src="(\/agent-icons\/[^"]+\.svg)"/g)].map((match) => match[1]),
    );
    expect(icons.size).toBeGreaterThan(30);
    for (const icon of icons) {
      const response = await request.get(icon);
      expect(response.status(), icon).toBe(200);
      expect(await response.text(), icon).toContain("<svg");
    }
  });
}

for (const language of ["en", "zh-CN"] as const) {
  for (const width of [320, 390, 1440]) {
    test(`${language} personal brand, plans and guide journey at ${width}px`, async ({
      page,
    }, testInfo) => {
      // This journey navigates eight pages and captures full-page screenshots.
      test.slow();
      const t = getTranslator(language);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewportSize({ width, height: 900 });
      await page.goto(href("/", language));
      await expect(page.locator("h1")).toHaveText(t("footer.giveInspirationTheAbilityToAct"));
      await expect(page.locator(".hero-badge")).toHaveText(t("home.yourPersonalAiWorkspaceInBeta"));
      await expect(page.locator(".hero-footnote")).toContainText(t("plans.promise"));
      await expect(
        page.locator(".hero-footnote").getByRole("link", { name: "GitHub" }),
      ).toHaveAttribute("href", sourceUrl);
      await page.screenshot({ path: testInfo.outputPath("personal-home.png") });
      await page
        .locator(".footer-group")
        .getByRole("link", { name: t("navLabel.about"), exact: true })
        .click();
      await expect(page).toHaveURL((url) => url.pathname === href("/about", language));
      await page.goto(href("/brand", language));
      await expect(page.locator('.brand-promise p[lang="en"]')).toHaveText(
        "Put your ideas into action.",
      );
      await expect(page.locator('.brand-promise p[lang="zh-CN"]')).toHaveText("让灵感拥有行动力。");
      await page.screenshot({ path: testInfo.outputPath("brand.png"), fullPage: true });
      await page.goto(href("/pricing", language));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("pricing.coreOpenSource"));
      await expect(page.locator(".personal-plans .pricing-card")).toHaveCount(1);
      await expect(page.locator(".price-status")).toHaveText(t("plans.openSource"));
      await expect(page.locator(".pricing-comparison")).toHaveCount(0);
      await expect(page.locator('a[href*="lody.ai"]')).toHaveCount(0);
      await expect(page.locator(".pricing-details")).toContainText(
        t("pricing.aiToolAccountsSubscriptionsAndApiCreditsComeFrom"),
      );
      await page.locator(".personal-plans .button").click();
      await expect(page).toHaveURL((url) => url.pathname === href("/download", language));
      const installers = page.locator(".installer-list > .installer");
      await expect(installers.first().locator("a.button")).toHaveAttribute(
        "href",
        /^https:\/\/agent-relay\.clawmuse\.com\/updates\/installers\/v/,
      );
      await expect(page.locator(".download-footer a[target]")).toHaveAttribute(
        "href",
        /^https:\/\/github\.com\/endvin\/clawmuse-releases\/releases\/tag\/v/,
      );
      const windows = page
        .locator(".download-card")
        .filter({ has: page.getByRole("heading", { name: "Windows", exact: true }) });
      await expect(windows.locator(".installer-list > .installer .button")).toContainText("x64");
      await expect(windows.locator(".arm-download-trigger")).toHaveAttribute(
        "href",
        /-arm64\.exe$/,
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.goBack();
      await expect(page.locator(".personal-plans input, .personal-plans form")).toHaveCount(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("personal-plans.png"), fullPage: true });
      await page.goto(href("/blog", language));
      await expect(page.locator(".learn-card")).toHaveCount(blogArticleRoutes.length);
      await page.locator(".learn-card").first().click();
      await expect(page.locator(".editorial-breadcrumb a")).toHaveAttribute(
        "href",
        href("/blog", language),
      );
      await page.goto(href("/docs", language));
      await page
        .locator(`.guide-directory a[href="${href("/docs/first-task", language)}"]`)
        .click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        titleFor("/docs/first-task", language),
      );
      await expect(page.locator(".editorial-breadcrumb a")).toHaveAttribute(
        "href",
        href("/docs", language),
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("first-task.png"), fullPage: true });
      await page.goto(href("/account-deletion", language));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("accountData.title"));
      await expect(page.getByText(t("accountData.privateRequest"), { exact: true })).toBeVisible();
      await expect(page.locator("main form")).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
}

test("phone scaling and voice waveform work under the production content security policy", async ({
  page,
}) => {
  const nginx = readFileSync(new URL("../clawmuse/deploy/nginx.conf", import.meta.url), "utf8");
  const policy = nginx.match(/add_header Content-Security-Policy "([^"]+)"/)?.[1];
  expect(policy).toBeTruthy();
  const violations: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /Content Security Policy|style-src|script-src/i.test(message.text())
    )
      violations.push(message.text());
  });
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() !== "document") return route.continue();
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), "content-security-policy": policy ?? "" },
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/zh/");
  const demo = page.getByTestId("product-demo");
  const phone = page.locator(".mobile-device").first();
  await expect
    .poll(() => phone.evaluate((element) => element.getBoundingClientRect().width))
    .toBeLessThan(390);
  await demo.getByRole("button", { name: "语音输入", exact: true }).click();
  await demo.getByRole("button", { name: "播放转写示例", exact: true }).click();
  await demo.getByRole("button", { name: "暂停转写", exact: true }).click();
  await expect(demo.locator(".demo-waveform i").first()).toHaveCSS("height", "7px");
  await expect(demo.locator(".demo-waveform i").nth(5)).toHaveCSS("height", "28px");
  expect(violations).toEqual([]);
});

for (const route of ["/zh/"]) {
  test(`whole phone fits laptop and mobile viewports on ${route}`, async ({ page }, testInfo) => {
    // This case resizes and captures six layouts in the same mounted WebKit page.
    test.slow();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(route);
    const demo = page.getByTestId("product-demo");
    const frame = demo.locator(".viewport-phone");
    const phone = frame.locator(".mobile-device");
    await expect(frame).not.toHaveCSS("border-bottom-left-radius", "0px");
    await expect(frame).not.toHaveCSS("box-shadow", "none");
    await expect(phone).toHaveCSS("box-shadow", "none");
    // Resize the same mounted demo: height-only changes and rotation must both
    // update the scaled canvas, not just its surrounding layout box.
    for (const size of [
      { width: 1366, height: 768 },
      { width: 1366, height: 600 },
      { width: 390, height: 844 },
      { width: 320, height: 568 },
      { width: 844, height: 390 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(size);
      await expect
        .poll(async () => {
          const box = await phone.boundingBox();
          const outer = await frame.boundingBox();
          return (
            !!box &&
            !!outer &&
            box.height <= size.height - 111 &&
            Math.abs(box.width - outer.width) < 1 &&
            Math.abs(box.height - outer.height) < 1
          );
        })
        .toBe(true);
      await frame.evaluate((element) =>
        element.scrollIntoView({ block: "start", behavior: "instant" }),
      );
      await expect
        .poll(() =>
          phone.evaluate((element) => {
            const box = element.getBoundingClientRect();
            const header = document.querySelector(".site-header")?.getBoundingClientRect();
            return (
              box.top >= (header?.bottom ?? 64) &&
              box.bottom <= window.innerHeight &&
              box.left >= 0 &&
              box.right <= window.innerWidth &&
              document.documentElement.scrollWidth <= window.innerWidth
            );
          }),
        )
        .toBe(true);
      // Bottom controls and the model sheet remain usable after scaling.
      await demo.locator(".demo-model-control").click();
      await expect(demo.getByRole("dialog")).toBeVisible();
      await demo.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).click();
      await frame.evaluate((element) =>
        element.scrollIntoView({ block: "start", behavior: "instant" }),
      );
      await page.screenshot({
        path: testInfo.outputPath(`phone-${size.width}x${size.height}.png`),
      });
    }
  });
}

test("mobile workspace demo preserves edited dictation across devices", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  await page.goto("/zh/");
  const demo = page.getByTestId("product-demo");
  await demo.getByRole("button", { name: "语音输入", exact: true }).click();
  const input = demo.getByRole("textbox", { name: "消息" });
  await input.fill("请先检查：");
  await demo.getByRole("button", { name: "播放转写示例", exact: true }).click();
  await expect(input).toHaveValue(/^请先检查：\n请/);
  await demo.getByRole("button", { name: "暂停转写", exact: true }).press("Enter");
  const paused = await input.inputValue();
  await expect(demo.getByRole("button", { name: "继续转写", exact: true })).toBeVisible();
  await demo.getByRole("button", { name: "继续转写", exact: true }).press("Enter");
  await expect(input).toHaveValue(/请保留现有的登录流程/);
  await expect(input).toHaveValue(/^请先检查：\n/);
  expect((await input.inputValue()).startsWith(paused)).toBe(true);
  await expect(demo.getByRole("button", { name: "播放转写示例", exact: true })).toBeVisible();
  await input.fill("请保留现有的登录流程，并检查手机布局。");
  await demo.getByRole("button", { name: "发送消息", exact: true }).click();
  await expect(demo.locator(".demo-user-message")).toHaveText(
    "请保留现有的登录流程，并检查手机布局。",
  );
  await page.clock.runFor(3000);
  await expect(demo.getByTestId("demo-reply")).toBeVisible();
  await demo.getByRole("tab", { name: "电脑工作台", exact: true }).click();
  await expect(
    demo.getByText("请保留现有的登录流程，并检查手机布局。", { exact: true }),
  ).toBeVisible();
  await demo.getByRole("button", { name: "重置演示", exact: true }).click();
  await expect(demo.getByTestId("demo-reply")).toHaveCount(0);
});

for (const width of [320, 390, 820]) {
  test(`compact demo workflows fit at ${width}px`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/zh/");
    const demo = page.getByTestId("product-demo");
    const scenes = demo.locator(".tour-scenes");
    // The controls stay compact so the actual workspace is visible immediately.
    expect(
      await demo
        .locator(".tour-toolbar")
        .evaluate((element) => element.getBoundingClientRect().height),
    ).toBeLessThanOrEqual(64);
    expect(
      await demo.evaluate((element) => {
        const device = element.querySelector(".device-viewport")!;
        return device.getBoundingClientRect().top - element.getBoundingClientRect().top;
      }),
    ).toBeLessThanOrEqual(150);
    await scenes.getByRole("button", { name: "文件改动", exact: true }).click();
    await demo.getByRole("button", { name: "src/styles.css" }).click();
    await expect(demo.locator(".diff-added")).toHaveText(
      "+ .navigation { gap: clamp(12px, 3vw, 24px); }",
    );
    await scenes.getByRole("button", { name: "主机", exact: true }).click();
    await demo.getByRole("button", { name: "Linux Server" }).click();
    await expect(demo.getByRole("meter", { name: "Codex · 会话额度用量" })).toHaveAttribute(
      "value",
      "46",
    );
    await expect(demo.locator(".demo-route")).toContainText("加密中继");
    await scenes.getByRole("button", { name: "目标", exact: true }).click();
    await expect(demo.locator(".demo-goal-card")).toContainText("Linux Server");
    await demo.getByRole("button", { name: "批准示例目标" }).click();
    await expect(demo.locator(".demo-goal-status")).toHaveText("等待审查");
    await demo.locator(".demo-goal-result").getByRole("button", { name: "文件改动" }).click();
    await expect(demo.locator(".demo-diff")).toBeVisible();
    await demo.getByRole("button", { name: "重置演示" }).click();
    await expect(scenes.getByRole("button", { name: "继续对话", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const phone = demo.locator(".workspace-device");
    await phone.scrollIntoViewIfNeeded();
    expect(
      await phone.evaluate((element) => ({
        width: element.clientWidth,
        height: element.clientHeight,
      })),
    ).toEqual({ width: 440, height: 956 });
    await expect(demo.locator(".demo-composer textarea")).toHaveCSS("font-size", "17px");
    await expect(demo.locator(".demo-navigation-island")).toHaveCSS("width", "44px");
    expect(
      await phone.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return (
          box.left >= 0 &&
          box.right <= window.innerWidth &&
          element.scrollWidth <= element.clientWidth
        );
      }),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`workspace-${width}.png`) });
    await page.getByRole("button", { name: "切换亮色主题" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await phone.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`workspace-${width}-light.png`) });
    expect(errors).toEqual([]);
  });
}

for (const size of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 820, height: 900 },
]) {
  test(`desktop demo stays readable at ${size.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(size);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/zh/");
    const demo = page.getByTestId("product-demo");
    await demo.getByRole("tab", { name: "电脑工作台", exact: true }).click();
    await demo.evaluate((element) =>
      element.scrollIntoView({ block: "start", behavior: "instant" }),
    );
    const desktop = demo.locator(".wide-device");
    await expect
      .poll(() =>
        desktop.evaluate((element) => element.getBoundingClientRect().bottom <= innerHeight),
      )
      .toBe(true);

    await demo
      .locator(".tour-scenes")
      .getByRole("button", { name: "文件改动", exact: true })
      .click();
    await demo.getByRole("button", { name: "src/styles.css" }).click();
    await expect(demo.locator(".diff-added")).toHaveText(
      "+ .navigation { gap: clamp(12px, 3vw, 24px); }",
    );
    expect(
      await demo
        .locator(".demo-diff pre")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await expect(demo.locator(".demo-diff pre")).toHaveCSS("font-size", "13px");
    await page.screenshot({ path: testInfo.outputPath("desktop-files.png") });

    // Long content scrolls inside the window; bottom actions stay reachable.
    await demo
      .locator(".demo-file-panel")
      .getByRole("button", { name: "继续对话", exact: true })
      .click();
    const input = demo.getByRole("textbox", { name: "消息", exact: true });
    await input.fill("检查手机端的电脑工作台");
    await expect(input).toHaveCSS("font-size", "17px");
    await expect(demo.getByRole("button", { name: "发送消息", exact: true })).toBeInViewport();
    await demo.locator(".demo-model-control").click();
    await expect(demo.getByRole("dialog")).toBeVisible();
    await demo.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).click();
    await expect(input).toHaveValue("检查手机端的电脑工作台");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test("device tabs work with a keyboard and reset cancels an in-flight demo", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const demo = page.getByTestId("product-demo");
  const phone = demo.getByRole("tab", { name: "Phone companion" });
  await phone.focus();
  await page.keyboard.press("ArrowRight");
  await expect(demo.getByRole("tab", { name: "Desktop workspace" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(demo.getByRole("tab", { name: "Linux host" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(demo.locator("pre")).toContainText("clawmuse account login --name my-linux");
  await page.keyboard.press("Home");
  await expect(phone).toBeFocused();
  const input = demo.getByRole("textbox", { name: "Message", exact: true });
  await expect(demo.getByRole("button", { name: "Send message" })).toHaveCount(0);
  await expect(demo.getByRole("button", { name: "Voice conversation", exact: true })).toBeVisible();
  await input.fill("Check the compact layout");
  await input.press("Shift+Enter");
  await expect(input).toHaveValue("Check the compact layout\n");
  await input.press("Enter");
  await expect(demo.getByTestId("demo-stream")).toHaveAttribute("aria-busy", "true");
  await demo.getByRole("button", { name: "Reset demo" }).click();
  await expect(input).toHaveValue("");
  await expect(demo.getByTestId("demo-reply")).toHaveCount(0);
  await demo.getByRole("button", { name: "My workspace", exact: true }).click();
  await demo
    .locator(".tour-sidebar")
    .getByRole("button", { name: "Voice input", exact: true })
    .click();
  await expect(demo.locator(".tour-sidebar")).toHaveCount(0);
  await expect(
    demo.getByRole("button", { name: getTranslator("en")("tour.play"), exact: true }),
  ).toBeVisible();
});

test("autoplay walks through the complete workflow and can pause and replay", async ({ page }) => {
  test.setTimeout(90_000);
  await page.clock.install({ time: new Date("2026-10-25T09:41:00Z") });
  await page.clock.pauseAt(new Date("2026-10-25T09:41:01Z"));
  await page.goto("/zh/");
  const demo = page.getByTestId("product-demo");
  await demo.locator(".device-viewport").scrollIntoViewIfNeeded();
  await expect(demo).toHaveAttribute("data-visible", "true");
  await expect(demo).toHaveAttribute("data-playback", "playing");
  await page.clock.runFor(3000);
  await expect(demo.getByRole("dialog", { name: appLabels["zh-CN"].selectModel })).toBeVisible();
  await demo.getByRole("button", { name: "暂停自动演示", exact: true }).click();
  const progress = await demo.locator("progress").getAttribute("value");
  await page.clock.runFor(5000);
  await expect(demo).toHaveAttribute("data-playback", "paused");
  await expect(demo.locator("progress")).toHaveAttribute("value", progress ?? "0");
  await demo.getByRole("button", { name: "继续自动演示", exact: true }).click();
  await demo.locator(".device-viewport").scrollIntoViewIfNeeded();
  await page.clock.runFor(12_000);
  await expect(demo.getByRole("button", { name: "允许一次", exact: true })).toBeVisible();
  await expect(demo.locator(".demo-user-message")).toHaveText("为官网加入中英文切换");
  await page.clock.runFor(7000);
  await expect(demo.locator(".demo-diff")).toBeVisible();
  await page.clock.runFor(6000);
  await expect(demo.locator(".demo-terminal-panel pre")).toContainText("12 passed");
  await page.clock.runFor(8000);
  await expect(demo.getByRole("tab", { name: "电脑工作台" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(demo.locator(".demo-preview-site")).toHaveAttribute("lang", "zh-CN");
  await page.clock.runFor(10_000);
  await expect(demo.getByRole("tab", { name: "手机随行" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(demo.locator(".demo-voice-controls")).toBeVisible();
  await expect(demo.locator(".demo-user-message").last()).toHaveText(
    getTranslator("zh-CN")("tour.voicePrompt"),
  );
  await page.clock.runFor(7000);
  await expect(demo.locator(".demo-route")).toContainText("加密中继");
  await page.clock.runFor(7000);
  await expect(demo.locator(".demo-goal-status")).toHaveText("等待审查");
  await page.clock.runFor(8000);
  await expect(demo.locator(".demo-quota-widget")).toBeVisible();
  await page.clock.runFor(6000);
  await expect(demo).toHaveAttribute("data-playback", "complete");
  await expect(demo.getByTestId("demo-reply")).toHaveCount(2);
  await demo.getByRole("button", { name: "重新播放演示", exact: true }).click();
  await expect(demo).toHaveAttribute("data-playback", "playing");
  await expect(demo.getByTestId("demo-reply")).toHaveCount(0);
});

test("feature tabs and simulated controls keep the homepage tour playing", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-25T09:41:00Z") });
  await page.clock.pauseAt(new Date("2026-10-25T09:41:01Z"));
  await page.goto("/zh/");
  const demo = page.getByTestId("product-demo");
  await demo.locator(".device-viewport").scrollIntoViewIfNeeded();
  await expect(demo).toHaveAttribute("data-visible", "true");
  const scenes = demo.locator(".tour-scenes");
  await scenes.getByRole("button", { name: "文件改动", exact: true }).click();
  await expect(demo).toHaveAttribute("data-playback", "playing");
  await expect(demo.locator(".demo-diff")).toBeVisible();
  await demo.getByRole("button", { name: "src/LanguageSwitch.tsx" }).click();
  await expect(demo.locator(".diff-added")).toContainText("LanguageSwitch locale");
  await expect(demo).toHaveAttribute("data-playback", "playing");
  await demo.locator(".device-viewport").scrollIntoViewIfNeeded();
  await page.clock.runFor(10_000);
  await expect(demo.locator(".demo-terminal-panel pre")).toContainText("12 passed");
  await scenes.getByRole("button", { name: "目标", exact: true }).click();
  await demo.getByRole("button", { name: "批准示例目标", exact: true }).click();
  await page.clock.runFor(2000);
  await expect(demo.locator(".demo-goal-status")).toHaveText("等待审查");
  await expect(demo).toHaveAttribute("data-playback", "playing");
  await scenes.getByRole("button", { name: "语音输入", exact: true }).click();
  await demo.locator(".device-viewport").scrollIntoViewIfNeeded();
  await page.clock.runFor(1000);
  await expect(demo.getByRole("textbox", { name: "消息", exact: true })).not.toHaveValue("");
  await expect(demo).toHaveAttribute("data-playback", "playing");
});

test("editing preserves the draft and offscreen playback stays paused", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-25T09:41:00Z") });
  await page.clock.pauseAt(new Date("2026-10-25T09:41:01Z"));
  await page.goto("/zh/");
  const demo = page.getByTestId("product-demo");
  await demo.locator(".device-viewport").scrollIntoViewIfNeeded();
  await expect(demo).toHaveAttribute("data-visible", "true");
  await page.clock.runFor(6500);
  const input = demo.getByRole("textbox", { name: "消息", exact: true });
  await expect(input).not.toHaveValue("");
  await input.focus();
  await expect(demo).toHaveAttribute("data-playback", "playing");
  await input.fill("我接着自己操作");
  await page.clock.runFor(20_000);
  await expect(demo).toHaveAttribute("data-playback", "manual");
  await demo.getByRole("tab", { name: "电脑工作台", exact: true }).click();
  await demo.locator(".tour-scenes").getByRole("button", { name: "文件改动", exact: true }).click();
  await demo.locator(".tour-scenes").getByRole("button", { name: "继续对话", exact: true }).click();
  await page.clock.runFor(10_000);
  await expect(input).toHaveValue("我接着自己操作");
  await demo.getByRole("button", { name: "重新播放演示", exact: true }).click();
  await page.getByRole("contentinfo").scrollIntoViewIfNeeded();
  await expect(demo).toHaveAttribute("data-visible", "false");
  const progress = await demo.locator("progress").getAttribute("value");
  await page.clock.runFor(20_000);
  await expect(demo.locator("progress")).toHaveAttribute("value", progress ?? "0");
  await demo.locator(".device-viewport").scrollIntoViewIfNeeded();
  await expect(demo).toHaveAttribute("data-visible", "true");
  await page.clock.runFor(3000);
  await expect(demo.getByRole("dialog")).toBeVisible();
});

test("model selection and device switches resume the same automatic tour", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-25T09:41:00Z") });
  await page.clock.pauseAt(new Date("2026-10-25T09:41:01Z"));
  await page.goto("/zh/");
  const demo = page.getByTestId("product-demo");
  await demo.locator(".device-viewport").scrollIntoViewIfNeeded();
  await expect(demo).toHaveAttribute("data-visible", "true");
  await page.clock.runFor(3000);
  await demo.locator('.demo-model-setting[data-page="models"]').click();
  await demo.getByRole("button", { name: "Codex", exact: true }).click();
  await page.clock.runFor(10_000);
  await expect(demo.getByRole("dialog")).toBeVisible();
  await expect(demo).toHaveAttribute("data-playback", "playing");
  await demo.getByRole("button", { name: "GPT-5.4", exact: true }).click();
  await demo.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).click();
  await demo.getByRole("tab", { name: "电脑工作台", exact: true }).click();
  await expect(demo).toHaveAttribute("data-playback", "playing");
  await demo.locator(".device-viewport").scrollIntoViewIfNeeded();
  await expect(demo).toHaveAttribute("data-visible", "true");
  await page.clock.runFor(10_000);
  await expect(demo.locator(".demo-user-message")).toHaveText("为官网加入中英文切换");
  await expect(demo.locator(".demo-model-control .demo-provider-icon")).toHaveAttribute(
    "data-provider",
    "Codex",
  );
  await demo.getByRole("tab", { name: "Linux 主机", exact: true }).click();
  const progress = await demo.locator("progress").getAttribute("value");
  await page.clock.runFor(10_000);
  await expect(demo.locator("progress")).toHaveAttribute("value", progress ?? "0");
  await demo.getByRole("tab", { name: "电脑工作台", exact: true }).click();
  await demo.locator(".tour-scenes").getByRole("button", { name: "语音输入", exact: true }).click();
  await demo.locator(".device-viewport").scrollIntoViewIfNeeded();
  await expect(demo.getByRole("tab", { name: "电脑工作台", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(demo).toHaveAttribute("data-visible", "true");
  await page.clock.runFor(500);
  const input = demo.getByRole("textbox", { name: "消息", exact: true });
  const before = await input.inputValue();
  await demo.locator(".tour-scenes").getByRole("button", { name: "语音输入", exact: true }).click();
  await page.clock.runFor(500);
  expect((await input.inputValue()).length).toBeGreaterThan(before.length);
  await expect(demo).toHaveAttribute("data-playback", "playing");
});

test("manual demo supports models, permissions, terminal, browser, voice and status", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/zh/");
  const demo = page.getByTestId("product-demo");
  await expect(demo).toHaveAttribute("data-playback", "paused");
  await demo.locator(".demo-model-control").click();
  await demo.locator('.demo-model-setting[data-page="models"]').click();
  await demo.getByRole("button", { name: "Codex", exact: true }).click();
  await demo.getByRole("button", { name: "GPT-5.4", exact: true }).click();
  await demo.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).click();
  await expect(demo.locator(".demo-model-control .demo-provider-icon")).toHaveAttribute(
    "data-provider",
    "Codex",
  );
  await demo.locator(".demo-model-control").click();
  await page.keyboard.press("Escape");
  await expect(demo.getByRole("dialog")).toHaveCount(0);
  await expect(demo.locator(".demo-model-control")).toBeFocused();
  const input = demo.getByRole("textbox", { name: "消息", exact: true });
  await input.fill("请检查手机布局");
  await input.press("Enter");
  await expect(demo.getByTestId("demo-reply")).toBeVisible();
  await demo.locator(".demo-model-control").click();
  await demo.locator('.demo-model-setting[data-page="models"]').click();
  await expect(demo.getByRole("button", { name: "Claude Code", exact: true })).toHaveCount(0);
  await demo.getByRole("button", { name: "GPT-5.4-mini", exact: true }).click();
  await demo.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).click();
  await expect(demo.locator(".demo-model-control")).toContainText("GPT-5.4-mini");
  await demo.getByRole("button", { name: "权限确认", exact: true }).click();
  await demo.getByRole("button", { name: "拒绝", exact: true }).click();
  await expect(demo.locator(".demo-permission")).toContainText("未执行命令");
  await demo.getByRole("button", { name: "添加示例图片", exact: true }).click();
  await expect(demo.locator(".demo-attachment")).toContainText("layout.png");
  await demo.locator(".demo-attachment").click();
  await expect(demo.locator(".demo-attachment")).toHaveCount(0);
  await demo.getByRole("button", { name: "语音对话", exact: true }).click();
  await expect(demo.locator(".demo-voice-controls")).toHaveCSS("height", "75px");
  await expect(input).toBeHidden();
  await expect(demo.locator(".demo-volume-meter i")).toHaveCount(3);
  await demo.getByRole("button", { name: "静音 realtime voice", exact: true }).click();
  await expect(
    demo.getByRole("button", { name: "取消静音 realtime voice", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await demo
    .locator(".demo-voice-controls")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  const scenes = demo.locator(".tour-scenes");
  await scenes.getByRole("button", { name: "终端", exact: true }).click();
  const terminal = demo.getByRole("textbox", { name: "终端", exact: true });
  await terminal.fill("git status");
  await terminal.press("Enter");
  await expect(demo.locator(".demo-terminal-panel pre")).toContainText("modified: src/i18n.ts");
  await demo.getByRole("button", { name: "运行检查", exact: true }).click();
  await expect(demo.locator(".demo-terminal-panel pre")).toContainText("12 passed");
  await terminal.fill("clear");
  await terminal.press("Enter");
  await expect(demo.locator(".demo-terminal-panel pre")).toBeEmpty();
  await scenes.getByRole("button", { name: "浏览器预览", exact: true }).click();
  await expect(demo.locator(".demo-browser-unavailable")).toBeVisible();
  await demo.getByRole("button", { name: "进入桌面演示", exact: true }).click();
  await demo.getByRole("button", { name: "中文", exact: true }).click();
  await expect(demo.locator(".demo-browser-address")).toContainText("localhost:5173/zh/");
  await demo.getByRole("button", { name: "探索工作室", exact: true }).click();
  await expect(demo.locator(".demo-preview-page h3")).toHaveText("为专注工作而设计。");
  await demo.getByRole("button", { name: "返回上一页", exact: true }).click();
  await demo.getByRole("button", { name: "刷新预览", exact: true }).click();
  await expect(demo.locator(".demo-preview-page h3")).toHaveText("让好想法，成为现实。");
  await demo
    .locator(".workspace-device")
    .screenshot({ path: testInfo.outputPath("browser-demo.png") });
  await demo.getByRole("tab", { name: "手机随行", exact: true }).click();
  await scenes.getByRole("button", { name: "目标", exact: true }).click();
  await demo.getByRole("combobox", { name: "执行次数上限", exact: true }).selectOption("1");
  await demo.getByRole("combobox", { name: "Agent", exact: true }).selectOption("Claude Code");
  await demo.getByRole("button", { name: "批准示例目标", exact: true }).click();
  await expect(demo.getByRole("combobox", { name: "执行次数上限", exact: true })).toBeDisabled();
  await expect(demo.locator(".demo-goal-status")).toHaveText("等待审查");
  await scenes.getByRole("button", { name: "状态与小组件", exact: true }).click();
  await expect(demo.locator(".demo-live-capsule")).toBeVisible();
  await demo.getByRole("button", { name: "额度小组件", exact: true }).click();
  await expect(demo.locator(".demo-quota-widget")).toBeVisible();
  await demo
    .locator(".workspace-device")
    .screenshot({ path: testInfo.outputPath("status-demo.png") });
});

for (const language of languages) {
  test(`${language} pages, language switching and compact navigation`, async ({
    page,
    request,
  }, testInfo) => {
    const t = getTranslator(language);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    for (const route of routes.filter((candidate) => pageLanguages(candidate).includes(language))) {
      const response = await request.get(href(route, language));
      expect(response.status()).toBe(200);
      const html = await response.text();
      expect(html).toContain(`<html lang="${language}" dir="${locales[language].dir}"`);
      expect(html).toContain(`hreflang="${language}"`);
      expect(html).toContain(`https://clawmuse.com${href(route, language)}`);
      expect(html).toContain('id="main"');
      expect(html).not.toContain('href="https://github.com/endvin/clawmuse/');
    }

    await page.goto(href("/", language));
    await expect(page.locator("html")).toHaveAttribute("lang", language);
    await expect(page.locator("html")).toHaveAttribute("dir", locales[language].dir);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      t("footer.giveInspirationTheAbilityToAct"),
    );
    await expect(page.locator(".hero-badge")).toHaveText(t("home.yourPersonalAiWorkspaceInBeta"));
    await expect(page.getByRole("combobox")).toHaveValue(language);
    await page.locator(".language-select").focus();
    await expect(page.locator(".language-select")).toHaveCSS("box-shadow", "none");
    await expect(page.locator(".language-select")).toHaveCSS("outline-style", "none");
    await expect(page.locator(".language-select")).not.toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    await expect(page.locator(".demo-phone-status").first()).toHaveCSS("direction", "ltr");
    await expect(page.getByRole("combobox").locator("option")).toHaveCount(languages.length);
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(languages.length + 1);
    await page.screenshot({ path: testInfo.outputPath(`${language}-desktop.png`) });

    await page.goto(href("/docs/linux", "en") + "?from=locale-test#main");
    await page.getByRole("combobox").selectOption(language);
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === href("/docs/linux", language) &&
        url.search === "?from=locale-test" &&
        url.hash === "#main",
    );
    await expect(page).toHaveTitle(documentTitleFor("/docs/linux", language));
    await expect(page.locator("pre").first()).toHaveCSS("direction", "ltr");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(href("/", language));
    await expect(page.getByRole("combobox")).toBeVisible();
    await page.getByRole("button", { name: t("header.openMenu"), exact: true }).click();
    await expect(page.getByRole("navigation")).toBeVisible();
    await page
      .getByRole("navigation")
      .getByRole("link", { name: t("navLabel.product"), exact: true })
      .click();
    await expect(page).toHaveURL((url) => url.pathname === href("/product", language));
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      t("product.yourAiWorkAlwaysWithinReach"),
    );
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`${language}-compact.png`) });

    await page.goto(`${locales[language].prefix}/404.html`);
    await expect(page.locator("html")).toHaveAttribute("lang", language);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      t("notFound.thisPathIsStillUnwritten"),
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
    expect(errors).toEqual([]);
  });
}

for (const language of ["en", "zh-CN"] as const) {
  test(`${language} editorial pages expose complete searchable content and localized metadata`, async ({
    page,
    request,
  }, testInfo) => {
    const descriptions = new Set<string>();
    for (const route of articleRoutes) {
      const response = await request.get(href(route, language));
      expect(response.status()).toBe(200);
      const html = await response.text();
      const article = articleFor(route, language);
      expect(html).not.toContain('href="https://github.com/endvin/clawmuse/');
      expect(html).toContain(article.sections[0].paragraphs[0]);
      expect(html).toContain(`content="${descriptionFor(language, route)}"`);
      expect(html).toContain(`rel="canonical" href="https://clawmuse.com${href(route, language)}"`);
      expect(html).toContain('property="og:type" content="article"');
      expect(html.match(/hreflang=/g)).toHaveLength(3);
      const schemas = [
        ...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g),
      ].map((match) => JSON.parse(match[1]));
      const structuredArticle = schemas.find((schema) => schema["@type"] === "Article");
      expect(structuredArticle).toMatchObject({
        headline: article.title,
        inLanguage: language,
        dateModified: article.updated ?? editorialDate,
      });
      expect(schemas.find((schema) => schema["@type"] === "FAQPage").mainEntity).toHaveLength(
        article.faq.length,
      );
      descriptions.add(descriptionFor(language, route));
    }
    expect(descriptions.size).toBe(articleRoutes.length);
    await page.goto(href("/learn", language));
    await expect(page.locator(".learn-card")).toHaveCount(learnArticleRoutes.length);
    await page.locator(`.learn-card[href="${href("/compare/cloud-ai-agents", language)}"]`).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      titleFor("/compare/cloud-ai-agents", language),
    );
    await expect(page.locator(".editorial-table tbody tr")).toHaveCount(7);
    await expect(page.getByRole("combobox").locator("option")).toHaveCount(2);
    const other = language === "en" ? "zh-CN" : "en";
    await page.getByRole("combobox").selectOption(other);
    await expect(page).toHaveURL((url) => url.pathname === href("/compare/cloud-ai-agents", other));
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    await page.locator(".editorial-faq summary").first().click();
    await expect(page.locator(".editorial-faq details").first()).toHaveAttribute("open", "");
    await page.screenshot({
      path: testInfo.outputPath(`${language}-article-compact.png`),
      fullPage: true,
    });
    await page.locator('.editorial-cta a[href$="#experience"]').click();
    await expect(page).toHaveURL(
      (url) => url.pathname === href("/", other) && url.hash === "#experience",
    );
    await expect(page.getByTestId("product-demo")).toBeVisible();
  });
}

test("sitemap and feeds only advertise published language pairs", async ({ request }) => {
  expect(routeInfo("/fr/learn/")).toEqual({ language: "fr", page: "/", found: false });
  expect(routeInfo("/ja/compare/cloud-ai-agents/")).toEqual({
    language: "ja",
    page: "/",
    found: false,
  });
  const sitemap = await (await request.get("/sitemap.xml")).text();
  const publishedPageCount = routes.reduce(
    (count, route) => count + pageLanguages(route).length,
    0,
  );
  expect(sitemap.match(/<url>/g)).toHaveLength(publishedPageCount);
  expect(sitemap).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
  expect(sitemap).not.toContain("/fr/learn/");
  for (const language of ["en", "zh-CN"] as const) {
    const feed = await (await request.get(`${locales[language].prefix}/feed.xml`)).text();
    const feedRoutes = [...blogArticleRoutes, ...learnArticleRoutes];
    expect(feed.match(/<item>/g)).toHaveLength(feedRoutes.length);
    for (const route of feedRoutes) {
      expect(feed).toContain(`https://clawmuse.com${href(route, language)}`);
    }
    for (const route of articleRoutes) {
      expect(sitemap).toContain(`<loc>https://clawmuse.com${href(route, language)}</loc>`);
    }
  }
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Sitemap: https://clawmuse.com/sitemap.xml");
  expect(await (await request.get("/llms.txt")).text()).toContain(
    "Cloud models, speech providers and optional services have separate data flows.",
  );
});

test("phone composer matches the app bottom toolbar and contextual actions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto("/zh/");
  const demo = page.getByTestId("product-demo");
  const composer = demo.locator(".demo-composer");
  const input = demo.getByRole("textbox", { name: "消息", exact: true });
  const model = composer.locator(".demo-model-control");
  await composer.scrollIntoViewIfNeeded();
  await expect(model).toBeVisible();
  await expect(demo.locator(".demo-composer-rail .demo-model-control")).toHaveCount(0);
  await expect(model).toHaveCSS("height", "28px");
  await expect(model).toHaveCSS("font-size", "16px");
  await expect(model.locator("svg")).toHaveAttribute("width", "20");
  await expect(model.locator(".lucide-chevron-down")).toHaveCount(0);
  await expect(composer).toHaveCSS("border-radius", "30px");
  await expect(input).toHaveCSS("min-height", "30px");
  await expect(demo.locator(".demo-composer-rail > button").first()).toHaveCSS("width", "40px");
  const bounds = await model.boundingBox();
  const inputBounds = await input.boundingBox();
  const attach = demo.getByRole("button", { name: "添加示例图片", exact: true });
  const attachGlyph = await attach.locator("svg").boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(inputBounds!.y + inputBounds!.height + 12);
  expect(Math.abs(attachGlyph!.x - inputBounds!.x)).toBeLessThan(0.1);
  expect(bounds!.x - inputBounds!.x).toBeCloseTo(30, 1);
  await expect(demo.getByRole("button", { name: "语音对话", exact: true })).toBeVisible();
  await expect(demo.getByRole("button", { name: "发送消息", exact: true })).toHaveCount(0);
  await input.fill("检查手机上的中英文切换");
  await expect(demo.getByRole("button", { name: "语音对话", exact: true })).toHaveCount(0);
  await expect(demo.getByRole("button", { name: "发送消息", exact: true })).toBeVisible();
  await model.click();
  await demo.locator('.demo-model-setting[data-page="models"]').click();
  await demo.getByRole("button", { name: "Codex", exact: true }).click();
  await demo.getByRole("button", { name: "GPT-5.4", exact: true }).click();
  await demo.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).click();
  await expect(model.locator(".demo-provider-icon")).toHaveAttribute("data-provider", "Codex");
  await expect(model).toHaveText("GPT-5.4High");
  await model.click();
  await expect(demo.locator(".demo-model-setting").first()).toHaveCSS("min-height", "44px");
  await expect(demo.locator(".demo-model-setting").first()).toHaveCSS("border-radius", "16px");
  const search = demo.locator(".demo-model-search input");
  await search.fill("not-a-model");
  await expect(demo.locator(".demo-model-empty")).toHaveText("没有匹配的模型");
  await search.fill("");
  await demo.locator('.demo-model-setting[data-page="mode"]').click();
  await demo.getByRole("button", { name: /^Full Access/ }).click();
  await expect(demo.locator('.demo-model-setting[data-page="mode"]')).toContainText("Full Access");
  await demo.locator('.demo-model-setting[data-page="thinking"]').click();
  await demo.getByRole("button", { name: "Medium", exact: true }).click();
  await demo.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).click();
  await expect(model).toHaveText("GPT-5.4Medium");
  await expect(input).toHaveValue("检查手机上的中英文切换");
  // Compare the rendered logo path with the app asset, not a lookalike character.
  const icon = readFileSync(
    new URL("../../app/src/components/icons/codex-icon.tsx", import.meta.url),
    "utf8",
  );
  await expect(model.locator("path")).toHaveAttribute("d", icon.match(/<Path d="([^"]+)"/)![1]);
  await demo.getByRole("button", { name: "关闭当前标签页", exact: true }).click();
  await expect(demo.getByRole("status").locator("p")).toHaveText("对话标签页已关闭");
  await expect(composer).toHaveCount(0);
  await demo.getByRole("button", { name: "工作区标签页", exact: true }).click();
  await expect(
    demo.getByRole("dialog").getByRole("button", { name: "继续对话", exact: true }),
  ).toHaveCount(0);
  await demo.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).click();
  await demo.getByRole("button", { name: "新建示例任务", exact: true }).click();
  await expect(composer).toBeVisible();
  await demo.getByRole("button", { name: "归档工作区", exact: true }).click();
  await expect(demo.getByRole("status").locator("p")).toHaveText("工作区已归档");
});

for (const language of ["en", "zh-CN"] as const) {
  for (const width of [390, 1440]) {
    test(`${language} official plugin feature and discovery at ${width}px`, async ({
      page,
      request,
    }, testInfo) => {
      const copy = pluginsCopy(language);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(href("/", language));
      if (await page.locator(".menu-toggle").isVisible())
        await page.locator(".menu-toggle").click();
      await page
        .getByRole("navigation")
        .getByRole("link", { name: language === "zh-CN" ? "官方插件" : "Plugins", exact: true })
        .click();
      await expect(page).toHaveURL((url) => url.pathname === href("/plugins", language));
      await expect(page.locator("h1")).toHaveText(copy.headline);
      await expect(page.locator(".plugin-story")).toHaveCount(officialPluginIds.length);
      await page.locator('.plugin-hero-index a[href="#conversation-translation"]').click();
      await page.locator(".plugin-demo-reply summary").click();
      await expect(page.locator(".plugin-demo-reply details p")).toBeVisible();
      for (const id of officialPluginIds) {
        await expect(page.locator(`#${id} h2`)).toHaveText(copy.plugins[id].name);
      }
      await page.screenshot({
        path: testInfo.outputPath("official-plugins-dark.png"),
        fullPage: true,
      });
      await page.locator(".theme-toggle").click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: testInfo.outputPath("official-plugins-light.png"),
        fullPage: true,
      });
      await page.locator(".language-select").selectOption(language === "en" ? "zh-CN" : "en");
      await expect(page).toHaveURL(
        (url) =>
          url.pathname === href("/plugins", language === "en" ? "zh-CN" : "en") &&
          url.hash === "#conversation-translation",
      );
      expect(errors).toEqual([]);
      const response = await request.get(href("/plugins", language));
      expect(response.status()).toBe(200);
      const html = await response.text();
      expect(html).toContain(
        `<link rel="canonical" href="https://clawmuse.com${href("/plugins", language)}"`,
      );
      const schema = [
        ...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs),
      ].map((match) => JSON.parse(match[1]));
      const collection = schema.find((item) => item["@type"] === "CollectionPage");
      expect(collection.mainEntity.numberOfItems).toBe(officialPluginIds.length);
      expect(
        collection.mainEntity.itemListElement.map((item: { name: string }) => item.name),
      ).toEqual(officialPluginIds.map((id) => copy.plugins[id].name));
      expect(html).not.toContain('hreflang="fr"');
      const sitemap = await (await request.get("/sitemap.xml")).text();
      expect(sitemap).toContain(`https://clawmuse.com${href("/plugins", language)}`);
    });
  }
}

test("downloads secondary formats, checksums, product demo and showcase images", async ({
  browser,
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/zh/download/");

  const macos = page
    .locator(".download-card")
    .filter({ has: page.getByRole("heading", { name: "macOS", exact: true }) });
  await expect(macos).toContainText("Apple Silicon");
  await expect(macos.locator(".installer a.button")).toHaveAttribute(
    "href",
    "https://agent-relay.clawmuse.com/updates/installers/v1.5.8/ClawMuse-1.5.8-arm64.dmg",
  );

  const windows = page
    .locator(".download-card")
    .filter({ has: page.getByRole("heading", { name: "Windows", exact: true }) });
  await expect(windows.locator(".arm-download-trigger")).toBeVisible();
  await expect(windows.locator(".download-card-note")).toBeVisible();

  const linux = page
    .locator(".download-card")
    .filter({ has: page.getByRole("heading", { name: "Linux", exact: true }) });
  await linux.locator(".arm-download-summary").click();
  await expect(linux.locator(".arm-download-details")).toHaveAttribute("open", "");
  await expect(linux.locator(".arm-download-item")).toHaveCount(7);

  await page.locator(".checksums-jump").click();
  await expect(page.locator(".checksums-panel")).toHaveAttribute("open", "");
  await expect(page.locator(".checksum-row")).toHaveCount(12);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/zh/product/");
  await expect(page.getByTestId("product-demo")).toBeVisible();
  await expect(page.locator(".feature-card .micro-label").nth(3)).toHaveText("语音");
  await expect(page.locator(".feature-card .micro-label").nth(4)).toHaveText("目标执行");
  await expect(page.locator(".feature-card .micro-label").nth(5)).toHaveText("实时状态");

  const showcase = page.getByTestId("real-device-showcase");
  await showcase.scrollIntoViewIfNeeded();
  for (const index of [0, 1]) {
    const img = showcase.locator("img").nth(index);
    await expect
      .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
  }
  await showcase.locator('[data-showcase-scene="chat"]').click();
  await expect(showcase.locator(".real-device-wide img")).toHaveAttribute(
    "src",
    "/screenshots/zh-wide-chat.webp",
  );

  await expect(
    page.locator(".footer-brand").getByRole("link", { name: "账号管理" }),
  ).toHaveAttribute("href", accountUrl);
  await expect(page.locator(".footer-brand").getByRole("link", { name: "GitHub" })).toHaveAttribute(
    "href",
    sourceUrl,
  );

  const demo = page.getByTestId("product-demo");
  await demo.getByRole("button", { name: "发送示例指令", exact: true }).click();
  await expect(demo.locator(".demo-user-message")).toBeVisible();

  const zhContext = await browser.newContext({ locale: "zh-CN" });
  const zhPage = await zhContext.newPage();
  await zhPage.goto("/");
  await expect(zhPage.getByTestId("language-suggestion-banner")).toHaveCount(0);
  await zhContext.close();
});
