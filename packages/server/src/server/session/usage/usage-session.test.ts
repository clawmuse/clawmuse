import pino from "pino";
import { expect, test } from "vitest";
import type { SessionOutboundMessage } from "../../messages.js";
import { UsageSession } from "./usage-session.js";

test("lists reports from usage sources", async () => {
  const emitted: SessionOutboundMessage[] = [];
  const requested: Array<{ forceRefresh?: boolean; reportIds?: string[] }> = [];
  const entry = {
    id: "fixture:one",
    account: {},
    fetchedAt: "2026-01-01T00:00:00.000Z",
    sourceId: "fixture",
    sourceLabel: "Fixture",
    report: { status: "available" as const, windows: [] },
  };
  const usage = new UsageSession({
    isEnabled: () => true,
    emit: (message) => emitted.push(message),
    runtime: {
      listUsageMonitoringSources: () => [],
      async listUsageReports(options) {
        requested.push({ forceRefresh: options.forceRefresh, reportIds: options.reportIds });
        options.onReport?.(entry);
        return [entry];
      },
      async listLegacyUsage() {
        return { fetchedAt: "2026-01-01T00:00:00.000Z", providers: [] };
      },
    },
    logger: pino({ level: "silent" }),
  });

  await usage.handleListReports({ type: "usage.list_reports.request", requestId: "list" });
  expect(requested).toEqual([{ forceRefresh: undefined, reportIds: undefined }]);
  expect(emitted).toEqual([
    { type: "usage.list_reports.update", payload: { requestId: "list", report: entry } },
    { type: "usage.list_reports.response", payload: { requestId: "list", error: null } },
  ]);
});

test("surfaces a legacy usage-list failure as an rpc_error envelope", async () => {
  const emitted: SessionOutboundMessage[] = [];
  const usage = new UsageSession({
    isEnabled: () => true,
    emit: (message) => emitted.push(message),
    runtime: {
      listUsageMonitoringSources: () => [],
      async listUsageReports() {
        return [];
      },
      async listLegacyUsage(): Promise<never> {
        throw new Error("quota service down");
      },
    },
    logger: pino({ level: "silent" }),
  });
  await usage.handleLegacyList({ type: "provider.usage.list.request", requestId: "u1" });
  expect(emitted[0]).toMatchObject({
    type: "rpc_error",
    payload: { requestId: "u1", code: "provider_usage_list_failed" },
  });
});

test("request failures terminate with an error response and no updates", async () => {
  const emitted: SessionOutboundMessage[] = [];
  const usage = new UsageSession({
    isEnabled: () => true,
    emit: (message) => emitted.push(message),
    logger: pino({ level: "silent" }),
  });
  await usage.handleListReports({ type: "usage.list_reports.request", requestId: "failed" });
  expect(emitted).toEqual([
    {
      type: "usage.list_reports.response",
      payload: { requestId: "failed", error: "Plugin runtime is unavailable" },
    },
  ]);
});

test("monitor settings list sources without discovering or querying accounts", async () => {
  const emitted: SessionOutboundMessage[] = [];
  const usage = new UsageSession({
    emit: (message) => emitted.push(message),
    runtime: {
      listUsageMonitoringSources: () => [{ id: "copilot", label: "GitHub Copilot", mode: "off" }],
      listUsageReports: async () => {
        throw new Error("must not discover accounts");
      },
      listLegacyUsage: async () => {
        throw new Error("must not fetch quota");
      },
    },
    logger: pino({ level: "silent" }),
  });
  await usage.handleGetMonitoring({ type: "usage.monitoring.get.request", requestId: "settings" });
  expect(emitted).toEqual([
    {
      type: "usage.monitoring.get.response",
      payload: {
        requestId: "settings",
        error: null,
        sources: [{ id: "copilot", label: "GitHub Copilot", mode: "off" }],
      },
    },
  ]);
});

test("off rejects both protocols before runtime discovery and turning on restores reports", async () => {
  let enabled = false;
  let calls = 0;
  const emitted: SessionOutboundMessage[] = [];
  const usage = new UsageSession({
    isEnabled: () => enabled,
    emit: (message) => emitted.push(message),
    logger: pino({ level: "silent" }),
    runtime: {
      async listUsageReports() {
        calls++;
        return [];
      },
      async listLegacyUsage() {
        calls++;
        return { fetchedAt: "now", providers: [] };
      },
    },
  });
  await usage.handleListReports({ type: "usage.list_reports.request", requestId: "off" });
  await usage.handleLegacyList({ type: "provider.usage.list.request", requestId: "old" });
  expect(calls).toBe(0);
  expect(emitted[0]).toMatchObject({ payload: { error: "Usage is off on this host." } });
  expect(emitted[1]).toMatchObject({
    type: "rpc_error",
    payload: { error: "Usage is off on this host." },
  });
  enabled = true;
  await usage.handleListReports({ type: "usage.list_reports.request", requestId: "on" });
  expect(calls).toBe(1);
  expect(emitted[2]).toMatchObject({ payload: { error: null } });
});

test("returns history for host requests only and keeps quota usable when history fails", async () => {
  const emitted: SessionOutboundMessage[] = [];
  const refreshes: (boolean | undefined)[] = [];
  let fail = false;
  const dailyUsage = {
    days: ["2026-11-09"],
    daily: [{ money: [0, 0, 0], paid: 0, tokens: [20, 30, 0], costAvailable: false }],
  };
  const session = new UsageSession({
    isEnabled: () => true,
    emit: (message) => emitted.push(message),
    runtime: {
      listUsageReports: async () => [],
      listUsageMonitoringSources: () => [],
      listLegacyUsage: async () => ({ fetchedAt: "now", providers: [] }),
    },
    collectDailyUsage: async (force) => {
      refreshes.push(force);
      if (fail) throw new Error("history unreadable");
      return dailyUsage;
    },
    logger: pino({ level: "silent" }),
  });
  await session.handleListReports({
    type: "usage.list_reports.request",
    requestId: "host",
    forceRefresh: true,
  });
  expect(emitted.pop()).toEqual({
    type: "usage.list_reports.response",
    payload: { requestId: "host", error: null, dailyUsage },
  });
  await session.handleListReports({
    type: "usage.list_reports.request",
    requestId: "agent",
    agentId: "a",
  });
  await session.handleListReports({
    type: "usage.list_reports.request",
    requestId: "report",
    reportIds: ["claude"],
  });
  expect(refreshes).toEqual([true]);
  fail = true;
  await session.handleListReports({ type: "usage.list_reports.request", requestId: "failure" });
  expect(emitted.pop()).toEqual({
    type: "usage.list_reports.response",
    payload: { requestId: "failure", error: null },
  });
});
