import type { UsageReportEntry, UsageWindow } from "@/usage/types";

/**
 * The phone renders two windows; providers name theirs differently. These are
 * the same spellings and fixed lengths the daemon publisher uses in
 * `packages/server/src/server/clawmuse-status/usage-projection.ts`, so a host
 * that reports through the service and a host the app reads directly produce
 * the same row.
 */
const SESSION_KEYWORDS = ["5h", "session", "five_hour", "primary"] as const;
const WEEKLY_KEYWORDS = ["7d", "week", "seven_day", "secondary"] as const;

export const CLAWMUSE_SESSION_WINDOW_MINUTES = 300;
export const CLAWMUSE_WEEKLY_WINDOW_MINUTES = 10_080;

export type ClawMuseUsageWindowKind = "session" | "weekly";

export interface ClawMuseProviderPlanWindow {
  usedPercent: number;
  windowMinutes: number;
  /** Epoch ms, or null when the provider does not say. */
  resetsAt: number | null;
  /** The provider reports the window but no cap against it. */
  unlimited: boolean;
}

export interface ClawMuseProviderPlan {
  provider: string;
  /** The provider's own name, e.g. "Claude". */
  name: string;
  /** The subscription tier, e.g. "Max 5x". Null when the provider has no tiers. */
  planLabel: string | null;
  session: ClawMuseProviderPlanWindow | null;
  weekly: ClawMuseProviderPlanWindow | null;
}

function keywordsFor(kind: ClawMuseUsageWindowKind): readonly string[] {
  return kind === "session" ? SESSION_KEYWORDS : WEEKLY_KEYWORDS;
}

export function windowMinutesFor(kind: ClawMuseUsageWindowKind): number {
  return kind === "session" ? CLAWMUSE_SESSION_WINDOW_MINUTES : CLAWMUSE_WEEKLY_WINDOW_MINUTES;
}

export function matchProviderUsageWindow(
  windows: readonly UsageWindow[],
  kind: ClawMuseUsageWindowKind,
): UsageWindow | undefined {
  const keywords = keywordsFor(kind);
  // Sources mark their account-wide windows `summary`; model- and feature-scoped ones
  // such as `code_review:five_hour` would otherwise match the same keywords.
  const summary = windows.filter((window) => window.summary);
  return (summary.length > 0 ? summary : windows).find((window) => {
    const haystack = `${window.id} ${window.label}`.toLowerCase();
    return keywords.some((keyword) => haystack.includes(keyword));
  });
}

export function providerUsageUsedPercent(window: UsageWindow): number | null {
  if (typeof window.usedPct === "number" && Number.isFinite(window.usedPct)) {
    return window.usedPct;
  }
  if (typeof window.remainingPct === "number" && Number.isFinite(window.remainingPct)) {
    return 100 - window.remainingPct;
  }
  return null;
}

function resetsAtMs(window: UsageWindow): number | null {
  if (!window.resetsAt) {
    return null;
  }
  const parsed = Date.parse(window.resetsAt);
  return Number.isFinite(parsed) ? parsed : null;
}

export function projectProviderUsageWindow(
  window: UsageWindow | undefined,
  kind: ClawMuseUsageWindowKind,
): ClawMuseProviderPlanWindow | null {
  if (!window) {
    return null;
  }
  const windowMinutes = windowMinutesFor(kind);
  const usedPercent = providerUsageUsedPercent(window);
  const resetsAt = resetsAtMs(window);
  if (usedPercent === null) {
    return { usedPercent: 0, windowMinutes, resetsAt, unlimited: true };
  }
  return {
    usedPercent: Math.max(0, Math.min(100, Math.round(usedPercent))),
    windowMinutes,
    resetsAt,
    unlimited: false,
  };
}

/**
 * A report that is unavailable, or reports neither window, has nothing this
 * surface can draw.
 */
export function projectProviderUsagePlan(entry: UsageReportEntry): ClawMuseProviderPlan | null {
  const { report } = entry;
  if (report.status !== "available") {
    return null;
  }
  const session = projectProviderUsageWindow(
    matchProviderUsageWindow(report.windows, "session"),
    "session",
  );
  const weekly = projectProviderUsageWindow(
    matchProviderUsageWindow(report.windows, "weekly"),
    "weekly",
  );
  if (!session && !weekly) {
    return null;
  }
  return {
    provider: entry.sourceId,
    // Same naming the daemon uses for a source with several logins.
    name: entry.account.label ? `${entry.sourceLabel} (${entry.account.label})` : entry.sourceLabel,
    planLabel: report.planLabel?.trim() || null,
    session,
    weekly,
  };
}

export function projectProviderUsagePlans(
  reports: readonly UsageReportEntry[],
): ClawMuseProviderPlan[] {
  return reports.flatMap((entry) => {
    const plan = projectProviderUsagePlan(entry);
    return plan ? [plan] : [];
  });
}
