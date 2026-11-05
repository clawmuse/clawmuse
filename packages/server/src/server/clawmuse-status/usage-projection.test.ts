import { describe, expect, it } from "vitest";

import type { ProviderUsageWindow, UsageReportEntry } from "@getpaseo/protocol/messages";
import { projectClawMuseStatusUsages } from "./usage-projection.js";

const FETCHED_AT = "2026-09-11T12:00:00.000Z";

function usage(
  input: {
    providerId?: string;
    planLabel?: string | null;
    windows?: ProviderUsageWindow[];
    fetchedAt?: string;
  } = {},
): UsageReportEntry {
  const sourceId = input.providerId ?? "claude";
  const planLabel = input.planLabel === undefined ? "Max 20x" : input.planLabel;
  return {
    id: `${sourceId}:default`,
    account: {},
    fetchedAt: input.fetchedAt ?? FETCHED_AT,
    sourceId,
    sourceLabel: sourceId,
    report: {
      status: "available",
      ...(planLabel ? { planLabel } : {}),
      windows: input.windows ?? [],
    },
  };
}

function result(reports: UsageReportEntry[]): UsageReportEntry[] {
  return reports;
}

describe("projectClawMuseStatusUsages", () => {
  it("maps the five-hour and weekly windows and keeps only numbers", () => {
    const usages = projectClawMuseStatusUsages(
      result([
        usage({
          windows: [
            {
              id: "five_hour",
              label: "Session",
              usedPct: 37.4,
              remainingPct: 62.6,
              resetsAt: "2026-09-11T15:00:00.000Z",
            },
            { id: "weekly", label: "Weekly", usedPct: null, remainingPct: 88, resetsAt: null },
            { id: "code_review", label: "Code review", usedPct: 5, resetsAt: null },
          ],
        }),
      ]),
    );

    expect(usages).toEqual([
      {
        provider: "claude",
        label: "Max 20x",
        session: {
          usedPercent: 37,
          windowMinutes: 300,
          resetsAt: "2026-09-11T15:00:00.000Z",
        },
        weekly: { usedPercent: 12, windowMinutes: 10_080, resetsAt: null },
        updatedAt: FETCHED_AT,
      },
    ]);
  });

  it("recognises the codex and cursor spellings of the same two windows", () => {
    const usages = projectClawMuseStatusUsages(
      result([
        usage({
          providerId: "codex",
          planLabel: null,
          windows: [
            { id: "primary_window", label: "Primary", usedPct: 10, resetsAt: null },
            { id: "secondary_window", label: "Secondary", usedPct: 20, resetsAt: null },
          ],
        }),
      ]),
    );

    expect(usages).toEqual([
      {
        provider: "codex",
        session: { usedPercent: 10, windowMinutes: 300, resetsAt: null },
        weekly: { usedPercent: 20, windowMinutes: 10_080, resetsAt: null },
        updatedAt: FETCHED_AT,
      },
    ]);
  });

  it("marks a window the provider reports without a cap as unlimited", () => {
    const usages = projectClawMuseStatusUsages(
      result([
        usage({
          providerId: "zai",
          planLabel: null,
          windows: [{ id: "session", label: "Session", usedPct: null, resetsAt: null }],
        }),
      ]),
    );

    expect(usages[0]?.session).toEqual({
      usedPercent: 0,
      windowMinutes: 300,
      resetsAt: null,
      unlimited: true,
    });
  });

  it("omits providers without a session or weekly window", () => {
    const usages = projectClawMuseStatusUsages(
      result([
        usage({ providerId: "copilot", windows: [] }),
        usage({
          providerId: "grok",
          windows: [{ id: "monthly_credits", label: "Monthly credits", usedPct: 3 }],
        }),
      ]),
    );

    expect(usages).toEqual([]);
  });

  it("reads the account-wide summary windows before scoped ones", () => {
    const usages = projectClawMuseStatusUsages(
      result([
        usage({
          providerId: "codex",
          planLabel: null,
          windows: [
            { id: "code_review:five_hour", label: "Code review · 5 hours", usedPct: 90 },
            { id: "five_hour", label: "5 hours", usedPct: 15, summary: true },
            { id: "weekly", label: "Weekly", usedPct: 30, summary: true },
          ],
        }),
      ]),
    );

    expect(usages[0]?.session?.usedPercent).toBe(15);
    expect(usages[0]?.weekly?.usedPercent).toBe(30);
  });

  it("skips a source whose report is unavailable and keeps its next login", () => {
    const usages = projectClawMuseStatusUsages([
      {
        ...usage(),
        id: "claude:expired",
        report: { status: "unavailable", problem: { kind: "rejected", status: 401 } },
      },
      usage({ windows: [{ id: "five_hour", label: "Session", usedPct: 12, summary: true }] }),
    ]);

    expect(usages).toHaveLength(1);
    expect(usages[0]?.session?.usedPercent).toBe(12);
  });

  it("returns the previous projection when only the fetch timestamp moved", () => {
    const windows = [{ id: "five_hour", label: "Session", usedPct: 40, resetsAt: null }];
    const first = projectClawMuseStatusUsages(result([usage({ windows })]));
    const refreshed = projectClawMuseStatusUsages(
      [usage({ windows, fetchedAt: "2026-09-11T12:05:00.000Z" })],
      first,
    );
    const changed = projectClawMuseStatusUsages(
      [
        usage({
          windows: [{ id: "five_hour", label: "Session", usedPct: 41, resetsAt: null }],
          fetchedAt: "2026-09-11T12:10:00.000Z",
        }),
      ],
      first,
    );

    expect(refreshed).toBe(first);
    expect(changed[0]?.session?.usedPercent).toBe(41);
    expect(changed[0]?.updatedAt).toBe("2026-09-11T12:10:00.000Z");
  });
});
