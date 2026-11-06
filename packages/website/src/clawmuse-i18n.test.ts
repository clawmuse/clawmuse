import { officialPluginIds, pluginsCopy } from "../clawmuse/plugins-content";
import { describe, expect, it } from "vitest";
import { coreRoutes, descriptionFor, href, routeInfo, titleFor } from "../clawmuse/content";
import { articleRoutes } from "../clawmuse/editorial-content";
import { agentFor, agentRoutes, isAgentPage } from "../clawmuse/agents-content";
import { getTranslator, resources } from "../clawmuse/i18n/i18n";
import { faqItems } from "../clawmuse/i18n/faq";
import { languages, locales } from "../clawmuse/i18n/locales";
import { LANGUAGE_OPTIONS } from "../../app/src/i18n/locales";
import { AGENT_PAGES } from "./data/agent-pages";

const englishKeys = Object.keys(resources.en.translation).sort();

describe("ClawMuse website languages", () => {
  it("covers every app language and preserves Traditional Chinese", () => {
    const appLanguages = LANGUAGE_OPTIONS.map((option) => option.value).filter(
      (language) => language !== "system",
    );
    expect(languages).toEqual(expect.arrayContaining(appLanguages));
    expect(languages.slice(0, 3)).toEqual(["en", "zh-CN", "zh-TW"]);
    expect(new Set(languages).size).toBe(languages.length);
  });

  it("defaults to English and recognizes explicit Chinese locales and old English links", () => {
    expect(routeInfo("/")).toEqual({ language: "en", page: "/", found: true });
    expect(routeInfo("/docs/linux/")).toEqual({ language: "en", page: "/docs/linux", found: true });
    expect(routeInfo("/zh")).toEqual({ language: "zh-CN", page: "/", found: true });
    expect(routeInfo("/zh-TW")).toEqual({ language: "zh-TW", page: "/", found: true });
    expect(routeInfo("/en/docs/linux/")).toEqual({
      language: "en",
      page: "/docs/linux",
      found: true,
    });
  });

  it.each(languages)("keeps core pages reachable when switching to %s", (language) => {
    for (const page of coreRoutes) {
      expect(routeInfo(href(page, language))).toEqual({ language, page, found: true });
    }
  });

  it.each(languages)("links to published editorial translations from %s", (language) => {
    for (const page of [
      "/learn",
      "/blog",
      "/agents",
      "/plugins",
      ...articleRoutes,
      ...agentRoutes,
    ] as const) {
      const publishedLanguage = language === "zh-CN" ? "zh-CN" : "en";
      expect(routeInfo(href(page, language))).toEqual({
        language: publishedLanguage,
        page,
        found: true,
      });
      if (language !== "en" && language !== "zh-CN") {
        expect(routeInfo(`${locales[language].prefix}${page}/`)).toEqual({
          language,
          page: "/",
          found: false,
        });
      }
    }
  });

  it("publishes the official plugin stories with their defaults and setup requirements", () => {
    expect(officialPluginIds).toEqual([
      "device-preview",
      "conversation-translation",
      "capacity-retry",
      "usage-display",
      "prompt-prediction",
    ]);
    for (const language of ["en", "zh-CN"] as const) {
      const copy = pluginsCopy(language);
      expect(titleFor("/plugins", language)).toBe(copy.title);
      expect(descriptionFor(language, "/plugins")).toBe(copy.description);
      expect(Object.keys(copy.plugins)).toEqual([...officialPluginIds]);
      expect(officialPluginIds.filter((id) => copy.plugins[id].enabledByDefault)).toEqual([
        "usage-display",
        "prompt-prediction",
      ]);
      for (const story of Object.values(copy.plugins)) {
        expect(story.requirement.length).toBeGreaterThan(20);
        expect(story.benefits.every((benefit) => benefit.trim().length > 0)).toBe(true);
      }
    }
  });

  it("publishes distinct bilingual agent pages with setup and source information", () => {
    expect(agentRoutes.length).toBe(47);
    expect(new Set(agentRoutes).size).toBe(agentRoutes.length);
    expect(isAgentPage("/agents/not-a-provider")).toBe(false);
    expect(agentRoutes).toContain("/agents/codewhale");
    expect(isAgentPage("/agents/deepseek-tui")).toBe(false);
    for (const agent of AGENT_PAGES) {
      const slug = agent.slug === "deepseek-tui" ? "codewhale" : agent.slug;
      expect(agentRoutes).toContain(`/agents/${slug}`);
    }
    for (const language of ["en", "zh-CN"] as const) {
      const entries = agentRoutes.map((page) => agentFor(page, language));
      expect(new Set(entries.map((entry) => entry.title)).size).toBe(entries.length);
      expect(new Set(entries.map((entry) => entry.description)).size).toBe(entries.length);
      for (const entry of entries) {
        expect(entry.officialUrl).toMatch(/^https:\/\//);
        expect(entry.faq.length).toBeGreaterThan(0);
        expect(entry.intro.length).toBeGreaterThan(10);
        expect(entry.connect.length).toBeGreaterThan(1);
        if (entry.slug !== "corust") expect(entry.install.length).toBeGreaterThan(0);
      }
      for (const field of ["intro", "about", "setup", "useCase"] as const) {
        expect(new Set(entries.map((entry) => entry[field])).size, field).toBe(entries.length);
      }
    }
  });

  it.each(languages)("has complete nonempty %s translations", (language) => {
    const translation = resources[language].translation;
    expect(Object.keys(translation).sort()).toEqual(englishKeys);
    for (const value of Object.values(translation)) expect(value.trim().length).toBeGreaterThan(0);
  });

  it.each(languages)("does not fall back to English prose in %s", (language) => {
    if (language === "en") return;
    const translation: Record<string, string> = resources[language].translation;
    const prose = Object.entries(resources.en.translation).filter(([, value]) => value.length > 80);
    for (const [key, value] of prose) expect(translation[key], key).not.toBe(value);
  });

  it.each(languages)("preserves the product name in %s", (language) => {
    const translation: Record<string, string> = resources[language].translation;
    for (const [key, value] of Object.entries(resources.en.translation)) {
      if (/clawmuse/i.test(value)) expect(translation[key], key).toMatch(/clawmuse/i);
    }
    expect(translation["demo.taskSub"]).toBe(resources.en.translation["demo.taskSub"]);
  });

  it.each(languages)("keeps missing pages and prefix boundaries in %s", (language) => {
    const prefix = locales[language].prefix;
    expect(routeInfo(`${prefix}/missing`)).toEqual({ language, page: "/", found: false });
    if (prefix) expect(routeInfo(`${prefix}-other`).found).toBe(false);
    expect(locales[language].dir).toBe(language === "ar" ? "rtl" : "ltr");
  });

  it("renders independent locale copy without leaking the last rendered language", () => {
    const english = getTranslator("en");
    const simplified = getTranslator("zh-CN");
    const traditional = getTranslator("zh-TW");
    expect(english("header.signIn")).toBe("Sign in");
    expect(simplified("header.signIn")).toBe("账号登录");
    expect(traditional("header.signIn")).toBe("帳號登入");
    expect(english("header.signIn")).toBe("Sign in");
    expect(simplified("header.signIn")).toBe("账号登录");
    expect(traditional("demo.projects")).toBe("專案");
    expect(traditional("demo.task")).toContain("切換");
  });

  it("localizes traditional Chinese metadata, FAQ and not-found pages", () => {
    expect(titleFor("/docs", "zh-TW")).toBe("開始使用");
    expect(descriptionFor("zh-TW")).toContain("語音助理");
    expect(faqItems("zh-TW")[0][0]).toBe("Linux 一定要裝桌面用戶端嗎？");
    expect(routeInfo("/zh-TW/missing")).toEqual({ language: "zh-TW", page: "/", found: false });
    expect(routeInfo("/zh/missing")).toEqual({ language: "zh-CN", page: "/", found: false });
    expect(routeInfo("/zh-TW-other")).toEqual({ language: "en", page: "/", found: false });
  });
});
