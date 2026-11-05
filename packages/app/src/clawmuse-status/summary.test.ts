import { describe, expect, it, vi } from "vitest";
import {
  ageClawMuseStatusSummary,
  getClawMuseStatusSummarySnapshot,
  parseClawMuseStatusSummary,
  publishClawMuseStatusSummary,
  subscribeClawMuseStatusSummary,
} from "./summary";

describe("ClawMuse Status summary", () => {
  it("keeps privacy-minimized per-host counts", () => {
    expect(
      parseClawMuseStatusSummary({
        connectivity: "unverifiable",
        runningCount: 3,
        needsActionCount: 2,
        completedUnreadCount: 4,
        failedCount: 1,
        unverifiableCount: 1,
        observedAt: "2026-08-30T12:00:00.000Z",
        hosts: [
          {
            hostId: "00000000-0000-0000-0000-000000000001",
            relayHostId: "AbCdEf0123_-xyZ9",
            displayName: "工作电脑",
            connectivity: "live",
            observedAt: "2026-08-30T12:00:00.000Z",
            leaseExpiresAt: "2026-08-30T12:02:00.000Z",
            runningCount: 3,
            needsActionCount: 2,
            completedUnreadCount: 4,
            failedCount: 1,
            unverifiableCount: 1,
          },
        ],
      }),
    ).toEqual({
      connectivity: "unverifiable",
      runningCount: 3,
      needsActionCount: 2,
      completedUnreadCount: 4,
      unverifiableCount: 1,
      observedAt: "2026-08-30T12:00:00.000Z",
      usages: [],
      goals: null,
      hosts: [
        {
          hostId: "00000000-0000-0000-0000-000000000001",
          relayHostId: "AbCdEf0123_-xyZ9",
          displayName: "工作电脑",
          connectivity: "live",
          observedAt: "2026-08-30T12:00:00.000Z",
          leaseExpiresAt: "2026-08-30T12:02:00.000Z",
          runningCount: 3,
          needsActionCount: 2,
          completedUnreadCount: 4,
          unverifiableCount: 1,
        },
      ],
    });
  });

  it("parses plan usages leniently and drops malformed entries", () => {
    const summary = parseClawMuseStatusSummary({
      connectivity: "live",
      runningCount: 0,
      needsActionCount: 0,
      completedUnreadCount: 0,
      unverifiableCount: 0,
      observedAt: "2026-09-03T06:00:00.000Z",
      usages: [
        {
          provider: "zhipu",
          label: "智谱 GLM PRO",
          session: { usedPercent: 30, windowMinutes: 300, resetsAt: "2026-09-03T09:00:00.000Z" },
          weekly: { usedPercent: 0, windowMinutes: 10080, resetsAt: null, unlimited: true },
          updatedAt: "2026-09-03T05:59:40.000Z",
        },
        { provider: "", session: null, weekly: null },
        "nope",
      ],
    });
    expect(summary.usages).toEqual([
      {
        provider: "zhipu",
        label: "智谱 GLM PRO",
        session: {
          usedPercent: 30,
          windowMinutes: 300,
          resetsAt: Date.parse("2026-09-03T09:00:00.000Z"),
          unlimited: false,
        },
        weekly: { usedPercent: 0, windowMinutes: 10080, resetsAt: null, unlimited: true },
        updatedAt: Date.parse("2026-09-03T05:59:40.000Z"),
      },
    ]);
  });

  it("rejects a summary whose counts are missing", () => {
    expect(() => parseClawMuseStatusSummary({ connectivity: "live" })).toThrow(
      "Invalid status service response: runningCount",
    );
  });

  it("notifies subscribers when a remote aggregate arrives", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeClawMuseStatusSummary(listener);
    const summary = parseClawMuseStatusSummary({
      connectivity: "live",
      runningCount: 1,
      needsActionCount: 0,
      completedUnreadCount: 2,
      unverifiableCount: 0,
      observedAt: "2026-08-30T12:00:00.000Z",
      hosts: [],
    });
    publishClawMuseStatusSummary(summary, 1_000);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getClawMuseStatusSummarySnapshot()).toEqual({ ...summary, receivedAt: 1_000 });
    unsubscribe();
    publishClawMuseStatusSummary(null);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("turns stale active counts into unverifiable while preserving completed facts", () => {
    expect(
      ageClawMuseStatusSummary(
        {
          connectivity: "live",
          runningCount: 2,
          needsActionCount: 1,
          completedUnreadCount: 3,
          unverifiableCount: 1,
          observedAt: "2026-08-30T12:00:00.000Z",
          usages: [],
          goals: null,
          hosts: [],
          receivedAt: 1_000,
        },
        62_000,
        60_000,
      ),
    ).toMatchObject({
      connectivity: "unverifiable",
      runningCount: 0,
      needsActionCount: 0,
      completedUnreadCount: 3,
      unverifiableCount: 4,
    });
  });
});
