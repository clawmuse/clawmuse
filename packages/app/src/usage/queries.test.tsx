/** @vitest-environment jsdom */
import React, { act, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import type { UsageDailyHistory } from "@getpaseo/protocol/messages";
import {
  formatChineseTokenHint,
  formatHistoryModelTokens,
  formatHistoryTokenUnit,
} from "./history-card";
import { useHostsUsage } from "./queries";

const { listUsageReports } = vi.hoisted(() => ({ listUsageReports: vi.fn() }));
// Only host transport/settings are adapters; React and Query cache/observers run unchanged.
vi.mock("@/runtime/host-runtime", () => ({
  getHostRuntimeStore: () => ({ getClient: () => ({ listUsageReports }) }),
}));
vi.mock("@/stores/session-store", () => ({}));
vi.mock("./setting", () => ({ useUsageSettings: () => [true] }));
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
vi.stubGlobal("React", React);

it("refreshes history with unchanged quota, clears unsupported history, and scopes hosts", async () => {
  vi.useFakeTimers();
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = document.createElement("div");
  const root = createRoot(container);
  const history = (tokens: number): UsageDailyHistory => ({
    days: ["2026-11-09"],
    daily: [{ money: [0, 0, 0], paid: 0, tokens: [0, tokens, 0] }],
  });
  let resolveRequest: (value: { reports: []; dailyUsage?: UsageDailyHistory }) => void = () => {};
  listUsageReports.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
  );
  function Reading({ serverId }: { serverId: string }) {
    const { views, refreshHost } = useHostsUsage([
      { serverId, label: serverId, isConnected: true, supportsUsage: true },
    ]);
    const refresh = useCallback(() => refreshHost(serverId), [refreshHost, serverId]);
    return (
      <button type="button" onClick={refresh}>
        {views[0]?.dailyUsage?.daily[0]?.tokens[1] ?? "unavailable"}
      </button>
    );
  }
  const render = async (serverId: string) => {
    await act(async () =>
      root.render(
        <QueryClientProvider client={queries}>
          <Reading serverId={serverId} />
        </QueryClientProvider>,
      ),
    );
  };
  const finish = async (dailyUsage?: UsageDailyHistory) => {
    await act(async () => {
      resolveRequest({ reports: [], dailyUsage });
      await vi.advanceTimersByTimeAsync(1);
    });
  };
  const refresh = async () => {
    await act(async () => container.querySelector("button")!.click());
  };
  try {
    await render("host-a");
    await finish(history(100));
    expect(container.textContent).toBe("100");
    await refresh();
    await finish(history(250));
    expect(container.textContent).toBe("250");
    await render("host-b");
    expect(container.textContent).toBe("unavailable");
    await finish(history(900));
    expect(container.textContent).toBe("900");
    await refresh();
    await finish();
    expect(container.textContent).toBe("unavailable");
    expect(queries.getQueryData(["usage", "host-a", "dailyHistory"])).toEqual(history(250));
  } finally {
    await act(async () => root.unmount());
    queries.clear();
    vi.useRealTimers();
  }
});

it("formats Chinese token hints in 万 and 亿 for zh locale", () => {
  expect(formatChineseTokenHint(9500)).toBeNull();
  expect(formatChineseTokenHint(8_194_961)).toBe("819万");
  expect(formatChineseTokenHint(32_590_243)).toBe("3259万");
  expect(formatChineseTokenHint(977_707_294)).toBe("9.8亿");
  expect(formatChineseTokenHint(1_575_224_227)).toBe("15.8亿");

  expect(formatHistoryTokenUnit(8_194_961, "总 token", true)).toBe("总 token（819万）");
  expect(formatHistoryTokenUnit(977_707_294, "总 token", true)).toBe("总 token（9.8亿）");
  expect(formatHistoryTokenUnit(977_707_294, "tokens", false)).toBe("tokens");

  expect(formatHistoryModelTokens(296_000_000, true)).toBe("296M（3亿）");
  expect(formatHistoryModelTokens(296_000_000, false)).toBe("296M");
});
