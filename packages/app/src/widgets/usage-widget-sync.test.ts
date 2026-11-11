import { describe, expect, it } from "vitest";
import type { UsageReportEntry } from "@/usage/types";
import {
  AUTO_USAGE_WIDGET_DEVICE_ID,
  buildHostUsageWidgetSnapshot,
  EMPTY_USAGE_WIDGET_STORE,
  mergeWidgetUsageHistories,
  mergeUsageWidgetState,
  reconcileUsageWidgetComputers,
  selectAutoUsageWidgetDeviceId,
  parseUsageWidgetStore,
} from "./usage-widget-sync";

describe("usage-widget-sync", () => {
  it("keeps every model series when merging host histories", () => {
    const names = ["m7", "m6", "m5", "m4", "m3", "m2", "m1"];
    const merged = mergeWidgetUsageHistories([
      {
        scope: "local",
        days: ["2026-11-08"],
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
    ]);
    expect(merged.models?.map((m) => m.name)).toEqual(names);
    expect(merged.daily[0]?.modelTokens).toEqual([7000, 6000, 5000, 4000, 3000, 2000, 1000, 0]);
  });

  it("rejects invalid cached snapshots", () => {
    expect(
      parseUsageWidgetStore('{"version":2,"computers":[],"states":{"bad":null}}').states,
    ).toEqual({});
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

  it("uses host history without opening agents and preserves a real zero day", () => {
    const nowMs = Date.parse("2026-11-09T12:00:00Z");
    const dailyUsage = {
      days: ["2026-11-08", "2026-11-09"],
      daily: [
        { money: [0, 0, 0], paid: 0, tokens: [1200, 4500, 0] },
        { money: [0, 0, 0], paid: 0, tokens: [0, 0, 0], costAvailable: true },
      ],
      models: [{ name: "GPT", harness: "codex" as const }],
    };
    const { snapshot } = buildHostUsageWidgetSnapshot({
      reports: [],
      agents: [],
      dailyUsage,
      locale: "zh-CN",
      nowMs,
    });
    expect(snapshot.usage.days).toEqual(dailyUsage.days);
    expect(snapshot.usage.daily[0]?.tokens).toEqual([1200, 4500, 0]);
    expect(snapshot.usage.daily[0]?.costAvailable).toBe(false);
    expect(snapshot.usage.daily[1]?.costAvailable).toBe(true);
    expect(snapshot.usage.daily[1]?.tokens).toEqual([0, 0, 0]);
    expect(snapshot.usage.scope).toBe("local");
    expect(snapshot.strings.tokenUnit).toBe("总 token");
  });

  it("shows unavailable history instead of inventing thirty zero days", () => {
    const { snapshot } = buildHostUsageWidgetSnapshot({
      reports: [],
      agents: [],
      locale: "en",
      nowMs: Date.parse("2026-11-09T12:00:00Z"),
    });
    expect(snapshot.usage.days).toEqual([]);
    expect(snapshot.usage.daily).toEqual([]);
  });

  it("merges quota sources and 30-day usage history across all computers for automatic mode", () => {
    const nowMs = Date.parse("2026-11-08T12:00:00Z");
    const { snapshot: ubuntuSnapshot } = buildHostUsageWidgetSnapshot({
      reports: [
        {
          id: "claude",
          sourceId: "claude",
          sourceLabel: "Claude",
          account: { label: "toqo@yksg.com" },
          fetchedAt: new Date(nowMs - 20_000).toISOString(),
          successfulAt: new Date(nowMs - 20_000).toISOString(),
          report: {
            status: "available",
            windows: [{ id: "session", label: "5h", usedPct: 55, remainingPct: 45 }],
          },
        },
        {
          id: "codex",
          sourceId: "codex",
          sourceLabel: "Codex",
          account: { label: "endtonet@gmail.com" },
          fetchedAt: new Date(nowMs - 20_000).toISOString(),
          successfulAt: new Date(nowMs - 20_000).toISOString(),
          report: {
            status: "available",
            windows: [{ id: "session", label: "5h", usedPct: 37, remainingPct: 63 }],
            balances: [{ id: "credits", label: "Credits", remaining: 0, unit: "credits" }],
          },
        },
      ],
      agents: [],
      locale: "zh-CN",
      nowMs,
    });

    const { snapshot: macSnapshot } = buildHostUsageWidgetSnapshot({
      reports: [
        {
          id: "codex",
          sourceId: "codex",
          sourceLabel: "Codex",
          account: { label: "qpbgcom@gmail.com" },
          fetchedAt: new Date(nowMs - 5_000).toISOString(),
          successfulAt: new Date(nowMs - 5_000).toISOString(),
          report: {
            status: "available",
            windows: [{ id: "session", label: "5h", usedPct: 16, remainingPct: 84 }],
            balances: [{ id: "credits", label: "Credits", remaining: 0, unit: "credits" }],
          },
        },
      ],
      agents: [],
      dailyUsage: {
        days: ["2026-11-08", "2026-11-09"],
        daily: [
          {
            money: [0, 0, 0],
            paid: 0,
            tokens: [1_000_000, 4_000_000, 0],
            modelTokens: [3_500_000, 1_000_000, 500_000],
          },
          {
            money: [0, 0, 0],
            paid: 0,
            tokens: [2_000_000, 18_000_000, 0],
            modelTokens: [15_000_000, 2_000_000, 3_000_000],
          },
        ],
        models: [
          { name: "swe-2", harness: "codex" },
          { name: "Claude Sonnet", harness: "claude-code" },
        ],
      },
      locale: "zh-CN",
      nowMs: nowMs + 1000,
    });

    let store = mergeUsageWidgetState(EMPTY_USAGE_WIDGET_STORE, {
      deviceId: "ubuntu-1",
      deviceName: "VM-0-13-ubuntu",
      nowMs,
      state: {
        kind: "snapshot",
        receivedAtMs: nowMs,
        deviceName: "VM-0-13-ubuntu",
        snapshot: ubuntuSnapshot,
      },
    });
    store = mergeUsageWidgetState(store, {
      deviceId: "mac-2",
      deviceName: "MacBook Pro",
      preferredDeviceId: "ubuntu-1",
      nowMs: nowMs + 1000,
      state: {
        kind: "snapshot",
        receivedAtMs: nowMs + 1000,
        deviceName: "MacBook Pro",
        snapshot: macSnapshot,
      },
    });

    expect(store.computers).toHaveLength(2);
    expect(selectAutoUsageWidgetDeviceId({ states: store.states })).toBe(
      AUTO_USAGE_WIDGET_DEVICE_ID,
    );
    expect(store.autoDeviceId).toBe(AUTO_USAGE_WIDGET_DEVICE_ID);

    const autoState = store.states[AUTO_USAGE_WIDGET_DEVICE_ID];
    expect(autoState?.kind).toBe("snapshot");
    if (autoState?.kind === "snapshot") {
      // Keeps distinct accounts across computers even when per-host report ids ("codex") collide,
      // orders subscriptions before balances, and deduplicates identical zero-credit balance tubes.
      expect(autoState.snapshot.sources.map((s) => `${s.kind}:${s.name}`)).toEqual([
        "subscription:toqo@yksg.com",
        "subscription:endtonet@gmail.com",
        "subscription:qpbgcom@gmail.com",
        "balance:Credits",
      ]);
      expect(new Set(autoState.snapshot.sources.map((s) => s.id)).size).toBe(4);
      expect(autoState.snapshot.usage.scope).toBe("all");
      expect(autoState.snapshot.usage.days).toEqual(["2026-11-08", "2026-11-09"]);
      expect(autoState.snapshot.usage.daily[1]?.tokens).toEqual([2_000_000, 18_000_000, 0]);
      expect(autoState.snapshot.usage.models?.map((m) => m.name)).toEqual([
        "swe-2",
        "Claude Sonnet",
      ]);
    }

    const reconciled = reconcileUsageWidgetComputers(store, {
      computers: [{ id: "ubuntu-1", name: "VM-0-13-ubuntu" }],
    });
    expect(reconciled.computers).toEqual([{ id: "ubuntu-1", name: "VM-0-13-ubuntu" }]);
    expect(reconciled.autoDeviceId).toBe(AUTO_USAGE_WIDGET_DEVICE_ID);
    const reconciledAuto = reconciled.states[AUTO_USAGE_WIDGET_DEVICE_ID];
    expect(reconciledAuto?.kind).toBe("snapshot");
    if (reconciledAuto?.kind === "snapshot") {
      expect(reconciledAuto.snapshot.sources.map((s) => s.name)).toEqual([
        "toqo@yksg.com",
        "endtonet@gmail.com",
        "Credits",
      ]);
      expect(reconciledAuto.snapshot.usage.days).toEqual([]);
    }
  });
});
