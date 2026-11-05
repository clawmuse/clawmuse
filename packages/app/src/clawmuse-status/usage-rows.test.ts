import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import type { ClawMuseStatusUsage } from "./summary";
import type { ClawMuseProviderPlan } from "./usage-windows";
import {
  buildClawMuseUsageGroups,
  buildClawMuseUsageRows,
  localizedResetDuration,
  remainingPercentLabel,
  resetCountdownLabel,
  type ClawMuseUsageGroup,
} from "./usage-rows";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// A stand-in for i18next that renders the key plus its interpolations, so the
// assertions read the shape of the call rather than the English catalog.
const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key}(${JSON.stringify(options)})` : key) as unknown as TFunction;

function plan(overrides: Partial<ClawMuseProviderPlan>): ClawMuseProviderPlan {
  return {
    provider: "claude",
    name: "Claude",
    planLabel: null,
    session: null,
    weekly: null,
    ...overrides,
  };
}

describe("buildClawMuseUsageRows", () => {
  it("derives elapsed time from the reset timestamp and the fixed window length", () => {
    const rows = buildClawMuseUsageRows({
      hosts: [
        {
          serverId: "host-1",
          hostName: "Studio",
          plans: [
            plan({
              session: {
                usedPercent: 37,
                windowMinutes: 300,
                resetsAt: 2 * HOUR,
                unlimited: false,
              },
            }),
          ],
        },
      ],
      serviceUsages: [],
      now: 0,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.session).toEqual({
      usedPercent: 37,
      timePercent: 60,
      unlimited: false,
      resetsAt: 2 * HOUR,
    });
  });

  it("adds service plans only for providers no host reports", () => {
    const serviceUsages: ClawMuseStatusUsage[] = [
      {
        provider: "claude",
        label: "Claude (external)",
        session: { usedPercent: 90, windowMinutes: 300, resetsAt: null, unlimited: false },
        weekly: null,
        updatedAt: null,
      },
      {
        provider: "minimax",
        label: "MiniMax",
        session: { usedPercent: 20, windowMinutes: 300, resetsAt: null, unlimited: false },
        weekly: null,
        updatedAt: null,
      },
      { provider: "empty", label: null, session: null, weekly: null, updatedAt: null },
    ];
    const rows = buildClawMuseUsageRows({
      hosts: [{ serverId: "a", hostName: "Studio", plans: [plan({ session: uncapped() })] }],
      serviceUsages,
      now: 0,
    });
    expect(rows.map((row) => row.key)).toEqual(["a:claude", "service:minimax:MiniMax"]);
  });

  it("groups rows by provider in reading order, keeping each provider's hosts in host order", () => {
    const rows = buildClawMuseUsageRows({
      hosts: [
        {
          serverId: "a",
          hostName: "Studio",
          plans: [
            plan({ provider: "codex", name: "Codex", planLabel: "pro", session: uncapped() }),
            plan({ provider: "claude", name: "Claude", planLabel: "Max 5x", session: uncapped() }),
          ],
        },
        {
          serverId: "b",
          hostName: "Laptop",
          plans: [
            plan({ provider: "codex", name: "Codex", planLabel: "pro", session: uncapped() }),
          ],
        },
      ],
      serviceUsages: [
        {
          provider: "minimax",
          label: "MiniMax",
          session: { usedPercent: 20, windowMinutes: 300, resetsAt: null, unlimited: false },
          weekly: null,
          updatedAt: null,
        },
        {
          provider: "zai",
          label: "Z.AI",
          session: { usedPercent: 10, windowMinutes: 300, resetsAt: null, unlimited: false },
          weekly: null,
          updatedAt: null,
        },
      ],
      now: 0,
    });
    expect(rows.map((row) => row.key)).toEqual([
      "a:claude",
      "a:codex",
      "b:codex",
      "service:zai:Z.AI",
      "service:minimax:MiniMax",
    ]);
    // The provider name and the tier stay apart so the card can badge the tier;
    // a service plan arrives as one composed label with no tier to split off.
    expect(rows[0]).toMatchObject({ name: "Claude", planLabel: "Max 5x" });
    expect(rows[3]).toMatchObject({ name: "Z.AI", planLabel: null });
  });

  it("ranks every GLM spelling ahead of MiniMax and keeps two accounts of one provider apart", () => {
    const external = (provider: string, label: string): ClawMuseStatusUsage => ({
      provider,
      label,
      session: { usedPercent: 20, windowMinutes: 300, resetsAt: null, unlimited: false },
      weekly: null,
      updatedAt: null,
    });
    const rows = buildClawMuseUsageRows({
      hosts: [],
      serviceUsages: [
        external("minimax", "MiniMax"),
        external("minimax", "MiniMax182"),
        external("zhipu", "智谱 GLM PRO"),
      ],
      now: 0,
    });
    expect(rows.map((row) => row.name)).toEqual(["智谱 GLM PRO", "MiniMax", "MiniMax182"]);
    expect(new Set(rows.map((row) => row.key)).size).toBe(3);
  });

  it("sorts a provider it does not rank to the end", () => {
    const rows = buildClawMuseUsageRows({
      hosts: [
        {
          serverId: "a",
          hostName: "Studio",
          plans: [
            plan({ provider: "somethingnew", name: "New", session: uncapped() }),
            plan({ provider: "claude", name: "Claude Max", session: uncapped() }),
          ],
        },
      ],
      serviceUsages: [],
      now: 0,
    });
    expect(rows.map((row) => row.key)).toEqual(["a:claude", "a:somethingnew"]);
  });

  it("reports an uncapped window as unlimited rather than zero used", () => {
    const rows = buildClawMuseUsageRows({
      hosts: [{ serverId: "a", hostName: "Studio", plans: [plan({ weekly: uncapped() })] }],
      serviceUsages: [],
      now: 0,
    });
    expect(rows[0]?.weekly).toMatchObject({ unlimited: true, usedPercent: null });
  });
});

function groupKeys(group: ClawMuseUsageGroup) {
  return { hostName: group.hostName, keys: group.rows.map((row) => row.key) };
}

describe("buildClawMuseUsageGroups", () => {
  const minimax: ClawMuseStatusUsage = {
    provider: "minimax",
    label: "MiniMax",
    session: { usedPercent: 20, windowMinutes: 300, resetsAt: null, unlimited: false },
    weekly: null,
    updatedAt: null,
  };

  it("gives each host its own section and puts the service's plans last", () => {
    const groups = buildClawMuseUsageGroups({
      hosts: [
        {
          serverId: "a",
          hostName: "Studio",
          plans: [
            plan({ provider: "grok", name: "Grok", session: uncapped() }),
            plan({ provider: "codex", name: "Codex", session: uncapped() }),
          ],
        },
        { serverId: "b", hostName: "Laptop", plans: [plan({ session: uncapped() })] },
      ],
      serviceUsages: [minimax],
      now: 0,
    });
    expect(groups.map(groupKeys)).toEqual([
      { hostName: "Studio", keys: ["a:codex", "a:grok"] },
      { hostName: "Laptop", keys: ["b:claude"] },
      { hostName: null, keys: ["service:minimax:MiniMax"] },
    ]);
  });

  it("leaves out a host with no plans and an empty service section", () => {
    const groups = buildClawMuseUsageGroups({
      hosts: [
        { serverId: "a", hostName: "Studio", plans: [] },
        { serverId: "b", hostName: "Laptop", plans: [plan({ session: uncapped() })] },
      ],
      serviceUsages: [],
      now: 0,
    });
    expect(groups.map((group) => group.key)).toEqual(["b"]);
  });
});

function uncapped() {
  return { usedPercent: 0, windowMinutes: 300, resetsAt: null, unlimited: true };
}

describe("remainingPercentLabel", () => {
  it("shows the remaining share, the uncapped text, or a dash", () => {
    expect(
      remainingPercentLabel(
        { usedPercent: 37, timePercent: null, unlimited: false, resetsAt: null },
        "No cap",
      ),
    ).toBe("63%");
    expect(
      remainingPercentLabel(
        { usedPercent: null, timePercent: null, unlimited: true, resetsAt: null },
        "No cap",
      ),
    ).toBe("No cap");
    expect(remainingPercentLabel(null, "No cap")).toBe("—");
  });
});

describe("localizedResetDuration", () => {
  it("picks the unit boundaries of the desktop formatter", () => {
    expect(localizedResetDuration(47 * MINUTE, t)).toContain("duration.minutes");
    expect(localizedResetDuration(HOUR, t)).toContain("duration.hours");
    expect(localizedResetDuration(3 * HOUR + 54 * MINUTE, t)).toContain("duration.hoursMinutes");
    expect(localizedResetDuration(6 * DAY, t)).toContain("duration.days");
    expect(localizedResetDuration(6 * DAY + 7 * HOUR, t)).toContain("duration.daysHours");
  });
});

describe("resetCountdownLabel", () => {
  it("returns null without a reset time or a cap to reset", () => {
    expect(resetCountdownLabel(null, 0, t)).toBeNull();
    expect(
      resetCountdownLabel(
        { usedPercent: 10, timePercent: null, unlimited: false, resetsAt: null },
        0,
        t,
      ),
    ).toBeNull();
    expect(
      resetCountdownLabel(
        { usedPercent: null, timePercent: null, unlimited: true, resetsAt: HOUR },
        0,
        t,
      ),
    ).toBeNull();
  });

  it("reports an elapsed window as already reset", () => {
    expect(
      resetCountdownLabel(
        { usedPercent: 10, timePercent: 100, unlimited: false, resetsAt: 500 },
        1_000,
        t,
      ),
    ).toBe("clawmuseStatus.usage.resetsNow");
  });
});
