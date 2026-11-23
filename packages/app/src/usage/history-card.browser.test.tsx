import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { within } from "@testing-library/dom";
import type { UsageDailyHistory } from "@getpaseo/protocol/messages";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n } from "@/i18n/i18next";
import { UsageHistoryCard } from "./history-card";

// Day 8 of the window (2026-10-20) is the spike under test: 180M tokens, a reported cost, and a
// model mix (67% sol / 33% opus) that differs from the 30-day aggregate (39% / 61%) so the day
// panel's rows cannot be mistaken for the month rows below the chart.
const SPIKE_DAY = "2026-10-20";
const DAY_AFTER_SPIKE = "2026-10-21";

function buildHistory(): UsageDailyHistory {
  const days: string[] = [];
  const daily: UsageDailyHistory["daily"] = [];
  const start = Date.parse("2026-10-13T00:00:00Z");
  for (let i = 0; i < 30; i += 1) {
    const key = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    const spike = key === SPIKE_DAY;
    const solTokens = spike ? 120_000_000 : 10_000_000;
    const opusTokens = spike ? 60_000_000 : 20_000_000;
    days.push(key);
    daily.push({
      money: spike ? [0, 1.25] : [0, 0],
      paid: 0,
      tokens: [opusTokens, solTokens, 0, 0],
      modelTokens: [solTokens, opusTokens, 0],
    });
  }
  return {
    days,
    daily,
    models: [
      { name: "GPT-6.1-SOL", harness: "codex" },
      { name: "Opus 5.5", harness: "claude-code" },
    ],
  };
}

let root: Root;
let container: HTMLDivElement;
beforeEach(async () => {
  vi.stubGlobal("React", React);
  await i18n.changeLanguage("en");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  act(() => root.unmount());
  container.remove();
  await i18n.changeLanguage("en");
  vi.unstubAllGlobals();
});

function mountCard() {
  act(() => root.render(<UsageHistoryCard histories={[buildHistory()]} scope="local" />));
  const view = within(container);
  const bar = (date: string) => view.getByRole("button", { name: new RegExp(date) });
  const detail = () => view.getByTestId("usage-history-day-detail");
  const noDetail = () => expect(view.queryByTestId("usage-history-day-detail")).toBeNull();
  const click = async (element: HTMLElement) => {
    await act(async () => {
      element.click();
    });
  };
  return { view, bar, detail, noDetail, click };
}

it("opens a tapped day's tokens, cost, and model mix, then closes", async () => {
  const { view, bar, detail, noDetail, click } = mountCard();
  noDetail();
  await click(bar(SPIKE_DAY));
  expect(detail().textContent).toContain(SPIKE_DAY);
  expect(view.getByTestId("usage-history-day-tokens").textContent).toContain("180M");
  expect(view.getByTestId("usage-history-day-cost").textContent).toContain("Reported cost $1.25");
  expect(detail().textContent).toContain("GPT-6.1-SOL");
  expect(detail().textContent).toContain("(67%)");
  await click(view.getByRole("button", { name: "Close" }));
  noDetail();
});

it("switches to another tapped bar and collapses when that bar is tapped again", async () => {
  const { bar, detail, noDetail, click } = mountCard();
  await click(bar(SPIKE_DAY));
  expect(detail().textContent).toContain(SPIKE_DAY);
  await click(bar(DAY_AFTER_SPIKE));
  expect(detail().textContent).toContain(DAY_AFTER_SPIKE);
  await click(bar(DAY_AFTER_SPIKE));
  noDetail();
});

it("labels the today bar's detail like the summary column does", async () => {
  const { view, bar, detail, click } = mountCard();
  await click(bar("2026-11-11"));
  expect(detail().textContent).toContain("Today · 2026-11-11");
  expect(view.getByTestId("usage-history-day-tokens").textContent).toBeTruthy();
});

it("lists every model in the 30-day breakdown instead of folding the tail into Other", () => {
  const names = ["M7", "M6", "M5", "M4", "M3", "M2", "M1"];
  act(() =>
    root.render(
      <UsageHistoryCard
        histories={[
          {
            days: ["2026-11-11"],
            daily: [
              {
                money: [0, 0, 0, 0],
                paid: 0,
                tokens: [28_000, 0, 0, 0],
                modelTokens: [7000, 6000, 5000, 4000, 3000, 2000, 1000, 0],
              },
            ],
            models: names.map((name) => ({ name, harness: "claude-code" as const })),
          },
        ]}
        scope="local"
      />,
    ),
  );
  const breakdown = within(container).getByTestId("usage-history-models").textContent;
  for (const name of names) {
    expect(breakdown).toContain(name);
  }
  expect(breakdown).not.toContain("Other");
});

it("switches time ranges, filters by computer/model/tool, and displays token composition", async () => {
  const days: string[] = [];
  const start = Date.parse("2026-10-23T00:00:00Z");
  for (let i = 0; i < 30; i += 1) {
    days.push(new Date(start + i * 86_400_000).toISOString().slice(0, 10));
  }
  const lastDay = days[days.length - 1]!;
  const macHistory: UsageDailyHistory = {
    days,
    daily: days.map((d) =>
      d === lastDay
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
    ),
    models: [
      { name: "Gemini 4 Neon (XHigh)", harness: "antigravity" },
      { name: "Opus 5.5", harness: "claude-code" },
    ],
  };
  const winHistory: UsageDailyHistory = {
    days,
    daily: days.map((d) =>
      d === lastDay
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
    ),
    models: [{ name: "GPT-6.2-ASTRA", harness: "codex" }],
  };

  act(() =>
    root.render(
      <UsageHistoryCard
        hostHistories={[
          { serverId: "mac", label: "MacBook Pro", color: "blue", dailyUsage: macHistory },
          { serverId: "win", label: "Windows PC", color: "emerald", dailyUsage: winHistory },
        ]}
        scope="all"
      />,
    ),
  );
  const view = within(container);
  const click = async (element: HTMLElement) => {
    await act(async () => {
      element.click();
    });
  };

  // Initial 30d combined view shows composition strip and host sub-filter chips
  expect(view.getByTestId("usage-history-composition").textContent).toContain("Cache read");
  expect(view.getByTestId("usage-history-host-chips").textContent).toContain("MacBook Pro");
  expect(view.getByTestId("usage-history-host-chips").textContent).toContain("Windows PC");
  expect(view.getByTestId("usage-history-today-tokens").textContent).toBe("80M");

  // Switch to 7d range
  await click(view.getByTestId("usage-history-range-7"));
  expect(view.getByTestId("usage-history-month-tokens").textContent).toBe("86M");

  // Solo Windows PC via computer chip
  await click(view.getByTestId("usage-history-host-chip-win"));
  expect(view.getByTestId("usage-history-month-tokens").textContent).toBe("50M");
  expect(view.getByTestId("usage-history-models").textContent).toContain("GPT-6.2-ASTRA");
  expect(view.getByTestId("usage-history-models").textContent).not.toContain("Opus 5.5");

  // Return to All computers
  await click(view.getByTestId("usage-history-host-chip-all"));
  expect(view.getByTestId("usage-history-month-tokens").textContent).toBe("86M");

  // Switch to Computers tab
  await click(view.getByTestId("usage-history-tab-hosts"));
  expect(view.getByTestId("usage-history-hosts").textContent).toContain("MacBook Pro");
  expect(view.getByTestId("usage-history-hosts").textContent).toContain("Windows PC");

  // Switch to Tools tab and filter to Antigravity
  await click(view.getByTestId("usage-history-tab-harnesses"));
  await click(view.getByTestId("usage-history-harness-row-antigravity"));
  expect(view.getByTestId("usage-history-filter-badge").textContent).toContain("Antigravity");
  expect(view.getByTestId("usage-history-month-tokens").textContent).toBe("20M");

  // Clear filter restores full total
  await click(view.getByTestId("usage-history-clear-filter"));
  expect(view.getByTestId("usage-history-month-tokens").textContent).toBe("86M");
});
