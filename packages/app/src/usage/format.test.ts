import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { i18n } from "@/i18n/i18next";
import {
  formatDisplayPct,
  formatUsageDetailValue,
  formatAgo,
  formatAmount,
  formatCompactCountdown,
  formatPct,
  formatProviderUsageLabel,
  formatResetLabel,
  formatResetTime,
  formatRunsOutLabel,
} from "./format";

const NOW = Date.parse("2026-07-19T00:00:00.000Z");

describe("formatResetLabel", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it.each([
    [1563, "resets 1d 2h 3m"],
    [1440, "resets 1d 0h 0m"],
    [62, "resets 1h 2m"],
    [60, "resets 1h 0m"],
    [7, "resets 7m"],
    [0, "resetting now"],
  ])("keeps minute precision with %i minutes remaining", (minutes, expected) => {
    expect(formatResetLabel(new Date(NOW + minutes * 60_000).toISOString(), false, NOW)).toBe(
      expected,
    );
  });

  it("localizes every countdown unit while retaining minute precision", async () => {
    await i18n.changeLanguage("zh-CN");
    const resetAt = new Date(NOW + 1563 * 60_000).toISOString();
    expect(formatResetLabel(resetAt, false, NOW)).toBe("将在 1天 2小时 3分钟后重置");
    expect(formatRunsOutLabel(resetAt, NOW)).toBe("将在 1天 2小时 3分钟后用尽");
  });
});

describe("formatAmount", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(async () => {
    await i18n.changeLanguage("en");
  });
  it("groups thousands in the app's language", () => {
    expect(formatAmount(12345, "credits", "en")).toBe("12,345");
    expect(formatAmount(12345, "requests", "en")).toBe("12,345");
    expect(formatAmount(12345, "credits", "fr").replace(/\s/g, " ")).toBe("12 345");
  });

  it("formats dollars as the language writes currency", () => {
    expect(formatAmount(1234.5, "usd", "en")).toBe("$1,234.50");
    expect(formatAmount(1234.5, "usd", "fr").replace(/\s/g, " ")).toBe("1 234,50 $US");
  });

  it("localizes usage timing without patching the global clock", async () => {
    const twoHoursFromNow = new Date(NOW + 2 * 60 * 60 * 1000).toISOString();
    const threeDaysAgo = new Date(NOW - 3 * 24 * 60 * 60 * 1000).toISOString();

    expect(formatPct(7, "en")).toBe("7%");
    expect(formatResetLabel(twoHoursFromNow, false, NOW)).toBe("resets 2h 0m");
    expect(formatRunsOutLabel(twoHoursFromNow, NOW)).toBe("runs out 2h 0m");

    await i18n.changeLanguage("ja");
    expect(formatResetLabel(twoHoursFromNow, false, NOW)).toBe("2時間 0分後にリセット");
    expect(formatRunsOutLabel(twoHoursFromNow, NOW)).toBe("2時間 0分後に上限に到達");
    expect(formatAgo(threeDaysAgo, NOW)).toBe("3日前");
  });

  it("formats percentages with locale-specific spacing", () => {
    expect(formatPct(42, "fr")).toBe("42\u00a0%");
  });

  it("formats relative-time counts with the active locale", async () => {
    await i18n.changeLanguage("fr");
    const days = 1_234;
    const daysFromNow = new Date(NOW + days * 24 * 60 * 60 * 1000).toISOString();
    const daysAgo = new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();

    expect(formatResetLabel(daysFromNow, false, NOW)).toBe(
      "se réinitialise dans 1\u202f234 j 0 h 0 min",
    );
    expect(formatRunsOutLabel(daysFromNow, NOW)).toBe("s’épuise dans 1\u202f234 j 0 h 0 min");
    expect(formatAgo(daysAgo, NOW)).toBe("il y a 1\u202f234 j");
  });

  it("selects Arabic plural forms for relative durations", async () => {
    await i18n.changeLanguage("ar");
    const twoHoursFromNow = new Date(NOW + 2 * 60 * 60 * 1000).toISOString();
    const threeHoursFromNow = new Date(NOW + 3 * 60 * 60 * 1000).toISOString();
    const twoDaysAgo = new Date(NOW - 2 * 24 * 60 * 60 * 1000).toISOString();

    expect(formatResetLabel(twoHoursFromNow, false, NOW)).toBe(
      "تتم إعادة التعيين خلال ساعتين 0 دقيقة",
    );
    expect(formatRunsOutLabel(threeHoursFromNow, NOW)).toBe("ينفد خلال 3 ساعات 0 دقيقة");
    expect(formatAgo(twoDaysAgo, NOW)).toBe("قبل يومين");
  });

  it("uses locale-aware compact notation for token balances", () => {
    expect(formatAmount(1_234, "tokens", "en")).toBe("1.2K");
    expect(formatAmount(1_234, "tokens", "ar")).toBe("1.2\u00a0ألف");
  });

  it("localizes known provider-usage labels and preserves provider-specific labels", async () => {
    await i18n.changeLanguage("ko");

    expect(formatProviderUsageLabel("session", "Session")).toBe("세션");
    expect(formatProviderUsageLabel("five_hour", "Session")).toBe("세션");
    expect(formatProviderUsageLabel("five_hour", "5-hour limit")).toBe("5-hour limit");
    expect(formatProviderUsageLabel("monthly", "Monthly")).toBe("월간");
    expect(formatProviderUsageLabel("code_review:weekly", "Code review · Weekly")).toBe(
      "코드 검토 · 주간",
    );
    expect(formatProviderUsageLabel("code_review:five_hour", "Code review · 5-hour")).toBe(
      "코드 검토 · 5-hour",
    );
    expect(formatProviderUsageLabel("credits", "Credits")).toBe("크레딧");
    expect(formatProviderUsageLabel("custom_limit", "Custom limit")).toBe("Custom limit");
  });
});

describe("reset countdown", () => {
  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  const countdown = (ms: number) => formatResetLabel(new Date(NOW + ms).toISOString(), false, NOW);

  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("keeps counting down inside a day instead of sitting on the rounded-down day", () => {
    expect(countdown(2 * DAY + 23 * HOUR + 10 * MINUTE)).toBe("resets 2d 23h 10m");
    expect(countdown(2 * DAY + 22 * HOUR + 10 * MINUTE)).toBe("resets 2d 22h 10m");
  });

  it("retains all countdown units through minutes", () => {
    expect(countdown(DAY + 30 * MINUTE)).toBe("resets 1d 0h 30m");
    expect(countdown(4 * HOUR + 59 * MINUTE)).toBe("resets 4h 59m");
    expect(countdown(HOUR)).toBe("resets 1h 0m");
    expect(countdown(37 * MINUTE)).toBe("resets 37m");
    expect(countdown(59 * 1000)).toBe("resets 0m");
  });

  it("joins the at-risk countdown the same way", () => {
    const iso = new Date(NOW + 3 * HOUR + 5 * MINUTE).toISOString();
    expect(formatRunsOutLabel(iso, NOW)).toBe("runs out 3h 5m");
  });
});

describe("exact reset time", () => {
  // Local-time dates, so the thresholds hold in any timezone the tests run in.
  const now = new Date(2026, 9, 29, 12, 0).getTime();
  const at = (...args: [number, number, number, number, number]) =>
    formatResetTime(new Date(...args).toISOString(), now)?.replace(/\s/g, " ");

  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("shows only the time within 24 hours", () => {
    expect(at(2026, 9, 29, 15, 0)).toMatch(/^(3:00 PM|15:00)$/);
    expect(at(2026, 9, 30, 11, 59)).toMatch(/^(11:59 AM|11:59)$/);
  });

  it("adds the weekday within 7 days", () => {
    expect(at(2026, 9, 30, 12, 0)).toMatch(/^Fri (12:00 PM|12:00)$/);
    expect(at(2026, 10, 5, 11, 59)).toMatch(/^Thu (11:59 AM|11:59)$/);
  });

  it("adds the date after 7 days", () => {
    expect(at(2026, 10, 5, 12, 0)).toMatch(/^Nov 5, (12:00 PM|12:00)$/);
  });

  it("names the weekday in the app language", async () => {
    await i18n.changeLanguage("fr");
    expect(at(2026, 9, 31, 15, 0)).toMatch(/^sam\.? /);
  });

  it("says nothing for a time that has passed", () => {
    expect(formatResetTime(new Date(now - 1).toISOString(), now)).toBeNull();
    expect(formatResetTime(null, now)).toBeNull();
  });
});

it("retained reset times that have passed do not claim the quota is resetting", () => {
  const past = "2000-01-01T00:00:00.000Z";
  expect(formatResetLabel(past, true, NOW)).toBe("Reset time passed");
  expect(formatResetLabel(past, false, NOW)).toBe("resetting now");
  expect(formatResetLabel(null, true, NOW)).toBeNull();
});

it("says that a usage window percentage is consumed", () => {
  expect(formatDisplayPct(70, "used")).toBe("70% used");
  expect(formatDisplayPct(30, "remaining")).toBe("30% left");
});
it("translates the usage refresh control into Japanese", async () => {
  try {
    await i18n.changeLanguage("ja");
    expect(i18n.t("providerUsage.refresh")).toBe("更新");
  } finally {
    await i18n.changeLanguage("en");
  }
});

it("translates the neighboring usage percentage settings", async () => {
  try {
    await i18n.changeLanguage("ja");
    expect(i18n.t("providerUsage.displayUsed")).toBe("使用済み");
    expect(i18n.t("providerUsage.displayRemaining")).toBe("残り");
  } finally {
    await i18n.changeLanguage("en");
  }
});

it("preserves provider-defined labels even when their IDs match a standard period", () => {
  expect(formatProviderUsageLabel("monthly", "Extra allotment")).toBe("Extra allotment");
  expect(formatProviderUsageLabel("code_review:weekly", "Custom review allowance")).toBe(
    "Custom review allowance",
  );
});

it("translates Copilot account metadata without assigning a paid plan", async () => {
  await i18n.changeLanguage("zh-CN");
  try {
    expect(formatProviderUsageLabel("copilot_chat", "Chat requests")).toBe("聊天请求");
    expect(formatProviderUsageLabel("reset", "Quota reset")).toBe("额度重置");
    expect(formatUsageDetailValue("copilot_source", "GitHub CLI")).toBe("GitHub CLI 登录账户");
    expect(formatUsageDetailValue("copilot_premium_interactions", "Not included")).toBe(
      "未包含此额度",
    );
    expect(formatUsageDetailValue("plugin_detail", "Not included")).toBe("Not included");
  } finally {
    await i18n.changeLanguage("en");
  }
});

describe("formatCompactCountdown", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it.each([
    [6 * 1440 + 600, "6d 10h"],
    [1440, "1d"],
    [1563, "1d 2h 3m"],
    [1439, "23h 59m"],
    [61, "1h 1m"],
    [60, "1h"],
    [45, "45m"],
    [0.5, "1m"],
  ])("shows %f minutes to the minute, leaving out zero units", (minutes, expected) => {
    expect(formatCompactCountdown(new Date(NOW + minutes * 60_000).toISOString(), NOW)).toBe(
      expected,
    );
  });

  it("returns null once the time has passed or is missing", () => {
    expect(formatCompactCountdown(new Date(NOW).toISOString(), NOW)).toBeNull();
    expect(formatCompactCountdown(null, NOW)).toBeNull();
    expect(formatCompactCountdown("not a date", NOW)).toBeNull();
  });

  it("keeps the compact units in every language", async () => {
    await i18n.changeLanguage("zh-CN");
    expect(formatCompactCountdown(new Date(NOW + 133 * 60_000).toISOString(), NOW)).toBe("2h 13m");
  });
});
