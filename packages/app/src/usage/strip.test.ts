import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { i18n } from "@/i18n/i18next";
import { resolveAgentUsageStrip } from "./strip";
import type { UsageReportEntry, UsageWindow } from "./types";

const NOW = Date.parse("2026-07-19T00:00:00.000Z");
const inHours = (hours: number) => new Date(NOW + hours * 3_600_000).toISOString();

function report(input: {
  sourceId: string;
  sourceLabel: string;
  windows: UsageWindow[];
}): UsageReportEntry {
  return {
    id: `${input.sourceId}:default`,
    account: {},
    fetchedAt: "2026-07-18T23:57:00.000Z",
    sourceId: input.sourceId,
    sourceLabel: input.sourceLabel,
    report: { status: "available", windows: input.windows },
  };
}

const claude = report({
  sourceId: "claude",
  sourceLabel: "Claude",
  windows: [
    {
      id: "five_hour",
      label: "Session",
      shortLabel: "5h",
      summary: true,
      usedPct: 28,
      resetsAt: inHours(2.5),
    },
    {
      id: "weekly",
      label: "Weekly",
      shortLabel: "wk",
      summary: true,
      usedPct: 95,
      resetsAt: inHours(140),
    },
    { id: "weekly_opus", label: "Opus · Weekly", shortLabel: "Opus wk", usedPct: 10 },
  ],
});

describe("resolveAgentUsageStrip", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("zh-CN");
  });

  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("shows the summary windows with what is left and when each resets", () => {
    expect(resolveAgentUsageStrip({ reports: [claude], displayAs: "remaining", now: NOW })).toEqual(
      [
        {
          key: "claude:default",
          sourceLabel: null,
          windows: [
            {
              key: "five_hour",
              name: "5小时",
              percentText: "剩余 72%",
              resetText: "2h 30m 后重置",
              tone: "default",
            },
            {
              key: "weekly",
              name: "周",
              percentText: "剩余 5%",
              resetText: "5d 20h 后重置",
              tone: "danger",
            },
          ],
        },
      ],
    );
  });

  it("shows every measured window when the source marks no summary", () => {
    const codex = report({
      sourceId: "codex",
      sourceLabel: "Codex",
      windows: [
        { id: "unknown_primary", label: "Primary limit", shortLabel: "", usedPct: 40 },
        { id: "credits", label: "Credits" },
      ],
    });
    const [account] = resolveAgentUsageStrip({ reports: [codex], displayAs: "used", now: NOW });
    expect(account?.windows.map((window) => [window.name, window.percentText])).toEqual([
      ["Primary limit", "已用 40%"],
    ]);
  });

  it("keeps a failed poll's last successful numbers", () => {
    const failed: UsageReportEntry = {
      ...claude,
      fetchedAt: "2026-07-19T00:00:00.000Z",
      report: { status: "error", error: "HTTP 500" },
      lastSuccessful: { fetchedAt: "2026-07-18T22:00:00.000Z", report: claude.report as never },
    };
    const [account] = resolveAgentUsageStrip({
      reports: [failed],
      displayAs: "remaining",
      now: NOW,
    });
    const [lastSuccessful] = resolveAgentUsageStrip({
      reports: [claude],
      displayAs: "remaining",
      now: NOW,
    });
    expect(account?.windows).toEqual(lastSuccessful?.windows);
  });

  it("names the source only when the agent reports more than one account", () => {
    const other = report({
      sourceId: "zai",
      sourceLabel: "Z.AI",
      windows: [{ id: "five_hour", label: "Session", summary: true, usedPct: 1 }],
    });
    const accounts = resolveAgentUsageStrip({
      reports: [claude, other],
      displayAs: "remaining",
      now: NOW,
    });
    expect(accounts.map((account) => account.sourceLabel)).toEqual(["Claude", "Z.AI"]);
  });

  it("leaves out an account with nothing measured", () => {
    const empty: UsageReportEntry = { ...claude, report: { status: "error", error: "down" } };
    expect(resolveAgentUsageStrip({ reports: [empty], displayAs: "remaining", now: NOW })).toEqual(
      [],
    );
  });
});
