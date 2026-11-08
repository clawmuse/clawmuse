import { describe, expect, it } from "vitest";
import type { UsageReportEntry } from "@/usage/types";
import {
  buildHostUsageWidgetSnapshot,
  createEmptyHostUsageLedger,
  EMPTY_USAGE_WIDGET_STORE,
  formatLocalIsoDay,
  mergeUsageWidgetState,
  reconcileUsageWidgetComputers,
  selectAutoUsageWidgetDeviceId,
  parseUsageWidgetLedgers,
  parseUsageWidgetStore,
  recordAgentsIntoUsageLedger,
} from "./usage-widget-sync";

describe("usage-widget-sync", () => {
  it("discards malformed persisted ledgers", () => {
    expect(parseUsageWidgetLedgers('{"mac":{"days":null}}')).toEqual({});
    expect(parseUsageWidgetLedgers("not json")).toEqual({});
  });
  it("rejects invalid cached snapshots and counts only monotonic completed output", () => {
    expect(
      parseUsageWidgetStore('{"version":2,"computers":[],"states":{"bad":null}}').states,
    ).toEqual({});
    const now = Date.parse("2026-11-08T12:00:00Z");
    const sample = {
      id: "agent",
      provider: "codex" as const,
      model: "gpt",
      updatedAt: new Date(now),
      lastActivityAt: new Date(now),
      lastUsage: {
        inputTokens: 5000,
        cachedInputTokens: 2000,
        outputTokens: 300,
        tokenSpeed: {
          rate: 10,
          average: 10,
          tokens: 300,
          elapsedMs: 1000,
          streaming: false,
          sessionTokens: 300,
        },
      },
    };
    const first = recordAgentsIntoUsageLedger(createEmptyHostUsageLedger(), [sample], now);
    const repeated = recordAgentsIntoUsageLedger(first, [sample], now);
    expect(repeated).toEqual(first);
    const lower = recordAgentsIntoUsageLedger(
      repeated,
      [
        {
          ...sample,
          lastUsage: {
            ...sample.lastUsage,
            tokenSpeed: { ...sample.lastUsage.tokenSpeed, sessionTokens: 200 },
          },
        },
      ],
      now,
    );
    expect(lower.days).toEqual(first.days);
    expect(first.days[formatLocalIsoDay(now)]?.tokens).toEqual([0, 300, 0]);
    expect(first.days[formatLocalIsoDay(now)]?.money).toEqual([0, 0, 0]);
  });

  it("projects subscription windows, single-source ring details, balances, and active provider emphasis", () => {
    const nowMs = Date.parse("2026-11-08T12:00:00Z");
    const reports: UsageReportEntry[] = [
      {
        id: "claude-main",
        sourceId: "claude",
        sourceLabel: "Claude",
        account: { label: "Work Claude" },
        fetchedAt: new Date(nowMs - 30_000).toISOString(),
        successfulAt: new Date(nowMs - 30_000).toISOString(),
        report: {
          status: "available",
          planLabel: "Max",
          windows: [
            {
              id: "session",
              label: "5h session",
              usedPct: 38,
              remainingPct: 62,
              resetsAt: new Date(nowMs + 2 * 3600_000).toISOString(),
            },
            {
              id: "weekly",
              label: "7d weekly",
              usedPct: 22,
              remainingPct: 78,
              resetsAt: new Date(nowMs + 5 * 86_400_000).toISOString(),
            },
          ],
          balances: [
            {
              id: "extra",
              label: "Extra Credits",
              remaining: 42.5,
              used: 7.5,
              unit: "usd",
            },
          ],
        },
      },
    ];

    const { snapshot } = buildHostUsageWidgetSnapshot({
      reports,
      agents: [
        {
          id: "agent-1",
          provider: "claude",
          model: "claude-sonnet-4-5-20250929",
          turnOpen: true,
          lastActivityAt: new Date(nowMs),
          updatedAt: new Date(nowMs),
          lastUsage: {
            inputTokens: 1_200_000,
            cachedInputTokens: 800_000,
            outputTokens: 300_000,
            totalCostUsd: 12.4,
          },
        },
      ],
      ledger: createEmptyHostUsageLedger(),
      locale: "zh-Hans",
      nowMs,
    });

    expect(snapshot.sources).toHaveLength(2);
    const sub = snapshot.sources[0]!;
    expect(sub.kind).toBe("subscription");
    expect(sub.logo).toBe("claude");
    expect(sub.name).toBe("Work Claude");
    expect(sub.value).toBe("62");
    expect(sub.unit).toBe("%");
    expect(sub.emphasized).toBe(true);
    expect(sub.detail?.title).toBe("Work Claude");
    expect(sub.detail?.plan).toBe("Max");
    expect(sub.detail?.rings).toHaveLength(2);
    expect(sub.detail?.legend.map((l) => l.label.split(" ")[0])).toEqual(["5h", "7d"]);

    const bal = snapshot.sources[1]!;
    expect(bal.kind).toBe("balance");
    expect(bal.value).toBe("42.5");
    expect(bal.unit).toBe("$");
  });

  it("accumulates 30-day daily token and value series by harness and top models across updates", () => {
    const day1Ms = Date.parse("2026-11-07T12:00:00Z");
    const day2Ms = Date.parse("2026-11-08T12:00:00Z");
    const day1Key = formatLocalIsoDay(day1Ms);
    const day2Key = formatLocalIsoDay(day2Ms);

    const first = buildHostUsageWidgetSnapshot({
      reports: [],
      agents: [
        {
          id: "a1",
          provider: "claude",
          model: "claude-opus-4-6",
          lastActivityAt: new Date(day1Ms),
          updatedAt: new Date(day1Ms),
          lastUsage: {
            inputTokens: 2_000_000,
            cachedInputTokens: 500_000,
            outputTokens: 500_000,
            totalCostUsd: 18.5,
            tokenSpeed: {
              rate: 10,
              average: 10,
              tokens: 500000,
              elapsedMs: 50000,
              streaming: false,
              sessionTokens: 500000,
            },
          },
        },
      ],
      ledger: createEmptyHostUsageLedger(),
      locale: "en",
      nowMs: day1Ms,
    });

    // Next day: same agent adds 1M more tokens, plus a new Codex agent runs
    const second = buildHostUsageWidgetSnapshot({
      reports: [],
      agents: [
        {
          id: "a1",
          provider: "claude",
          model: "claude-opus-4-6",
          lastActivityAt: new Date(day2Ms),
          updatedAt: new Date(day2Ms),
          lastUsage: {
            inputTokens: 2_800_000,
            cachedInputTokens: 500_000,
            outputTokens: 700_000,
            totalCostUsd: 24.5,
            tokenSpeed: {
              rate: 10,
              average: 10,
              tokens: 700000,
              elapsedMs: 70000,
              streaming: false,
              sessionTokens: 700000,
            },
          },
        },
        {
          id: "a2",
          provider: "codex",
          model: "gpt-5-codex",
          lastActivityAt: new Date(day2Ms),
          updatedAt: new Date(day2Ms),
          lastUsage: {
            inputTokens: 1_500_000,
            cachedInputTokens: 500_000,
            outputTokens: 400_000,
            tokenSpeed: {
              rate: 10,
              average: 10,
              tokens: 400000,
              elapsedMs: 40000,
              streaming: false,
              sessionTokens: 400000,
            },
          },
        },
      ],
      ledger: first.ledger,
      locale: "en",
      nowMs: day2Ms,
    });

    expect(second.snapshot.usage.days).toHaveLength(30);
    const idx1 = second.snapshot.usage.days.indexOf(day1Key);
    const idx2 = second.snapshot.usage.days.indexOf(day2Key);
    expect(idx1).toBe(28);
    expect(idx2).toBe(29);

    expect(second.snapshot.usage.daily[idx1]?.tokens).toEqual([500_000, 0, 0]);
    expect(second.snapshot.usage.daily[idx1]?.money[0]).toBe(18.5);
    expect(second.snapshot.usage.daily[idx2]?.tokens).toEqual([200_000, 400_000, 0]);
    expect(second.snapshot.usage.daily[idx2]?.money[0]).toBe(6);
    expect(second.snapshot.usage.daily[idx2]?.money[1]).toBe(0);
    expect(second.snapshot.usage.models?.map((m) => m.label)).toEqual([
      "claude-opus-4-6",
      "gpt-5-codex",
    ]);
  });

  it("merges and reconciles computer states and selects the automatic device", () => {
    const nowMs = Date.parse("2026-11-08T12:00:00Z");
    const { snapshot } = buildHostUsageWidgetSnapshot({
      reports: [],
      agents: [],
      ledger: createEmptyHostUsageLedger(),
      locale: "en",
      nowMs,
    });

    let store = mergeUsageWidgetState(EMPTY_USAGE_WIDGET_STORE, {
      deviceId: "mac-1",
      deviceName: "Mac Studio",
      nowMs,
      state: {
        kind: "snapshot",
        receivedAtMs: nowMs,
        deviceName: "Mac Studio",
        snapshot,
      },
    });
    store = mergeUsageWidgetState(store, {
      deviceId: "mac-2",
      deviceName: "MacBook Pro",
      nowMs: nowMs + 1000,
      state: {
        kind: "snapshot",
        receivedAtMs: nowMs + 1000,
        deviceName: "MacBook Pro",
        snapshot,
      },
    });

    expect(store.computers).toHaveLength(2);
    expect(selectAutoUsageWidgetDeviceId({ states: store.states })).toBe("mac-2");

    const reconciled = reconcileUsageWidgetComputers(store, {
      computers: [{ id: "mac-1", name: "Mac Studio" }],
    });
    expect(reconciled.computers).toEqual([{ id: "mac-1", name: "Mac Studio" }]);
    expect(reconciled.autoDeviceId).toBe("mac-1");
  });
});
