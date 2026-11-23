import type { UsageDailyHistory } from "@getpaseo/protocol/messages";
import { describe, expect, it } from "vitest";
import {
  buildUsageHistoryViewModel,
  formatHistoryTokens,
  formatSharePercent,
  type HostDailyHistoryEntry,
} from "./history-model";

function makeHostHistory(
  days: string[],
  points: UsageDailyHistory["daily"],
  models: UsageDailyHistory["models"],
): UsageDailyHistory {
  return { days, daily: points, models };
}

describe("history-model", () => {
  it("formats token numbers with smart precision without 1000K/1000M artifacts", () => {
    expect(formatHistoryTokens(0)).toBe("0");
    expect(formatHistoryTokens(950)).toBe("950");
    expect(formatHistoryTokens(1_450)).toBe("1.5K");
    expect(formatHistoryTokens(999_600)).toBe("1M");
    expect(formatHistoryTokens(1_450_000)).toBe("1.5M");
    expect(formatHistoryTokens(180_000_000)).toBe("180M");
    expect(formatHistoryTokens(296_000_000)).toBe("296M");
    expect(formatHistoryTokens(999_600_000)).toBe("1B");
    expect(formatHistoryTokens(1_250_000_000)).toBe("1.3B");
  });

  it("formats tiny non-zero shares honestly as <1% instead of inflating to 1%", () => {
    expect(formatSharePercent(100, 1_000_000)).toEqual({ percent: 0, label: "<1%" });
    expect(formatSharePercent(500, 1000)).toEqual({ percent: 50, label: "50%" });
    expect(formatSharePercent(0, 1000)).toEqual({ percent: 0, label: "0%" });
  });

  it("slices multi-host histories by computer, range, harness, and model with token breakdown and day detail", () => {
    const days = [
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
    ];
    const macPoints: UsageDailyHistory["daily"] = days.map((d) =>
      d === "2026-11-21"
        ? {
            money: [0, 0, 0, 0],
            paid: 0,
            costAvailable: false,
            tokens: [10_000_000, 0, 0, 20_000_000],
            modelTokens: [20_000_000, 10_000_000, 0],
            inputTokens: 1_000_000,
            cacheReadTokens: 27_000_000,
            cacheWriteTokens: 1_000_000,
            outputTokens: 1_000_000,
            modelInputTokens: [500_000, 500_000, 0],
            modelCacheReadTokens: [19_000_000, 8_000_000, 0],
            modelCacheWriteTokens: [0, 1_000_000, 0],
            modelOutputTokens: [500_000, 500_000, 0],
          }
        : {
            money: [0, 0, 0, 0],
            paid: 0,
            costAvailable: false,
            tokens: [1_000_000, 0, 0, 0],
            modelTokens: [0, 1_000_000, 0],
            inputTokens: 100_000,
            cacheReadTokens: 800_000,
            cacheWriteTokens: 50_000,
            outputTokens: 50_000,
            modelInputTokens: [0, 100_000, 0],
            modelCacheReadTokens: [0, 800_000, 0],
            modelCacheWriteTokens: [0, 50_000, 0],
            modelOutputTokens: [0, 50_000, 0],
          },
    );

    const winPoints: UsageDailyHistory["daily"] = days.map((d) =>
      d === "2026-11-21"
        ? {
            money: [0, 0, 0, 0],
            paid: 0,
            costAvailable: false,
            tokens: [0, 50_000_000, 0, 0],
            modelTokens: [50_000_000, 0],
            inputTokens: 2_000_000,
            cacheReadTokens: 47_000_000,
            cacheWriteTokens: 0,
            outputTokens: 1_000_000,
            modelInputTokens: [2_000_000, 0],
            modelCacheReadTokens: [47_000_000, 0],
            modelCacheWriteTokens: [0, 0],
            modelOutputTokens: [1_000_000, 0],
          }
        : {
            money: [0, 0, 0, 0],
            paid: 0,
            costAvailable: false,
            tokens: [0, 0, 0, 0],
            modelTokens: [0, 0],
          },
    );

    const hosts: HostDailyHistoryEntry[] = [
      {
        serverId: "mac",
        label: "MacBook Pro",
        color: "blue",
        dailyUsage: makeHostHistory(days, macPoints, [
          { name: "Gemini 4 Neon (XHigh)", harness: "antigravity" },
          { name: "Opus 5.5", harness: "claude-code" },
        ]),
      },
      {
        serverId: "win",
        label: "Windows PC",
        color: "emerald",
        dailyUsage: makeHostHistory(days, winPoints, [{ name: "GPT-6.2-ASTRA", harness: "codex" }]),
      },
    ];

    const nowMs = new Date(2026, 10, 21, 15, 0).getTime();

    // 7-day all-hosts view with day detail on today
    const all7 = buildUsageHistoryViewModel({
      hosts,
      scope: "all",
      rangeDays: 7,
      selectedHostIds: [],
      selectedHarness: "all",
      selectedModelKey: null,
      activeTab: "hosts",
      selectedDay: "2026-11-21",
      locale: "zh-CN",
      nowMs,
    });

    expect(all7.windowDaysCount).toBe(7);
    expect(all7.lastDateIsActualToday).toBe(true);
    expect(all7.todayTokens).toBe(80_000_000);
    // 6 previous days * 1M (Mac) + 80M today = 86M
    expect(all7.rangeTotalTokens).toBe(86_000_000);
    expect(all7.hosts.map((h) => [h.label, h.tokens])).toEqual([
      ["Windows PC", 50_000_000],
      ["MacBook Pro", 36_000_000],
    ]);
    expect(all7.rangeComposition.available).toBe(true);
    expect(all7.rangeComposition.outputTokens).toBe(2_300_000);
    expect(all7.selectedDayDetail?.hosts.map((h) => [h.label, h.tokens])).toEqual([
      ["Windows PC", 50_000_000],
      ["MacBook Pro", 30_000_000],
    ]);

    // Filter to a single computer (Mac) + harness (antigravity)
    const macAgy = buildUsageHistoryViewModel({
      hosts,
      scope: "all",
      rangeDays: 7,
      selectedHostIds: ["mac"],
      selectedHarness: "antigravity",
      selectedModelKey: null,
      activeTab: "models",
      selectedDay: null,
      locale: "zh-CN",
      nowMs,
    });
    expect(macAgy.rangeTotalTokens).toBe(20_000_000);
    expect(macAgy.models.map((m) => m.name)).toEqual(["Gemini 4 Neon (XHigh)"]);
    expect(macAgy.activeFilterLabel).toBe("Antigravity");

    // Filter to a specific model keeps sibling models visible in the list for one-tap switching
    const modelFiltered = buildUsageHistoryViewModel({
      hosts,
      scope: "all",
      rangeDays: 7,
      selectedHostIds: [],
      selectedHarness: "all",
      selectedModelKey: "model:codex:GPT-6.2-ASTRA",
      activeTab: "models",
      selectedDay: null,
      locale: "en",
      nowMs,
    });
    expect(modelFiltered.rangeTotalTokens).toBe(50_000_000);
    expect(modelFiltered.models).toHaveLength(3);
    expect(modelFiltered.activeFilterLabel).toBe("GPT-6.2-ASTRA");
  });
});
