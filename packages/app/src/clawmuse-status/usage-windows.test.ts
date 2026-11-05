import { describe, expect, it } from "vitest";
import type { UsageReportEntry, UsageWindow } from "@/usage/types";
import {
  matchProviderUsageWindow,
  projectProviderUsagePlan,
  projectProviderUsageWindow,
  providerUsageUsedPercent,
} from "./usage-windows";

function window(overrides: Partial<UsageWindow>): UsageWindow {
  return { id: "w", label: "Window", ...overrides };
}

function usage(input: {
  planLabel?: string;
  windows?: UsageWindow[];
  accountLabel?: string;
}): UsageReportEntry {
  return {
    id: "claude:default",
    account: input.accountLabel ? { label: input.accountLabel } : {},
    fetchedAt: "2026-08-30T12:00:00.000Z",
    sourceId: "claude",
    sourceLabel: "Claude",
    report: {
      status: "available",
      ...(input.planLabel ? { planLabel: input.planLabel } : {}),
      windows: input.windows ?? [],
    },
  };
}

// The daemon publisher uses the same keywords; a host that reports through the
// service and one the app reads directly must land on the same window.
describe("matchProviderUsageWindow", () => {
  it.each([
    ["5h", "session"],
    ["session", "session"],
    ["five_hour", "session"],
    ["primary", "session"],
  ] as const)("maps %s to the session window", (id, kind) => {
    expect(matchProviderUsageWindow([window({ id })], kind)?.id).toBe(id);
  });

  it.each([
    ["7d", "weekly"],
    ["week", "weekly"],
    ["seven_day", "weekly"],
    ["secondary", "weekly"],
  ] as const)("maps %s to the weekly window", (id, kind) => {
    expect(matchProviderUsageWindow([window({ id })], kind)?.id).toBe(id);
  });

  it("matches on the label when the id says nothing", () => {
    expect(
      matchProviderUsageWindow([window({ id: "opaque", label: "Weekly limit" })], "weekly")?.id,
    ).toBe("opaque");
  });

  it("returns nothing for an unrelated window", () => {
    expect(
      matchProviderUsageWindow([window({ id: "monthly", label: "Monthly" })], "session"),
    ).toBeUndefined();
  });
});

it("prefers the account-wide summary window over a scoped one", () => {
  const windows = [
    window({ id: "code_review:five_hour", usedPct: 90 }),
    window({ id: "five_hour", usedPct: 15, summary: true }),
  ];
  expect(matchProviderUsageWindow(windows, "session")?.id).toBe("five_hour");
});

describe("providerUsageUsedPercent", () => {
  it("prefers usedPct and derives it from remainingPct", () => {
    expect(providerUsageUsedPercent(window({ usedPct: 37 }))).toBe(37);
    expect(providerUsageUsedPercent(window({ remainingPct: 40 }))).toBe(60);
    expect(providerUsageUsedPercent(window({}))).toBeNull();
  });
});

describe("projectProviderUsageWindow", () => {
  it("carries the fixed window length and rounds whole percents", () => {
    expect(projectProviderUsageWindow(window({ usedPct: 37.4 }), "session")).toEqual({
      usedPercent: 37,
      windowMinutes: 300,
      resetsAt: null,
      unlimited: false,
    });
    expect(projectProviderUsageWindow(window({ usedPct: 1 }), "weekly")?.windowMinutes).toBe(
      10_080,
    );
  });

  it("treats a window with no consumption figure as uncapped", () => {
    expect(projectProviderUsageWindow(window({}), "session")).toEqual({
      usedPercent: 0,
      windowMinutes: 300,
      resetsAt: null,
      unlimited: true,
    });
  });

  it("parses the reset timestamp into epoch ms", () => {
    expect(
      projectProviderUsageWindow(
        window({ usedPct: 10, resetsAt: "2026-08-30T15:00:00.000Z" }),
        "session",
      )?.resetsAt,
    ).toBe(Date.parse("2026-08-30T15:00:00.000Z"));
  });
});

describe("projectProviderUsagePlan", () => {
  it("drops a provider that reports neither window", () => {
    expect(projectProviderUsagePlan(usage({ windows: [window({ id: "monthly" })] }))).toBeNull();
  });

  it("keeps the provider name and the plan tier apart, trimming the tier", () => {
    const plan = projectProviderUsagePlan(
      usage({ planLabel: "  Max 20x  ", windows: [window({ id: "5h", usedPct: 20 })] }),
    );
    expect(plan?.name).toBe("Claude");
    expect(plan?.planLabel).toBe("Max 20x");
    expect(plan?.weekly).toBeNull();
  });

  it("names a login after its account so two logins of one source stay apart", () => {
    const plan = projectProviderUsagePlan(
      usage({ accountLabel: "work", windows: [window({ id: "five_hour", usedPct: 3 })] }),
    );
    expect(plan?.name).toBe("Claude (work)");
  });

  it("drops a report that is unavailable", () => {
    expect(
      projectProviderUsagePlan({
        ...usage({}),
        report: { status: "unavailable", problem: { kind: "rejected", status: 401 } },
      }),
    ).toBeNull();
  });

  it("reports no tier for a provider that does not have one", () => {
    const plan = projectProviderUsagePlan(usage({ windows: [window({ id: "7d", usedPct: 5 })] }));
    expect(plan?.name).toBe("Claude");
    expect(plan?.planLabel).toBeNull();
  });
});
