import type { ProviderUsageWindow, UsageReportEntry } from "@getpaseo/protocol/messages";
import type { ClawMuseStatusUsage, ClawMuseStatusUsageWindow } from "./client.js";

// The service accepts any provider id in this shape, not a fixed allow-list.
const USAGE_PROVIDER_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;
const MAX_LABEL_LENGTH = 64;

// The snapshot reports the two windows the phone renders. Providers name them
// differently; these are the spellings seen across the usage sources.
const SESSION_KEYWORDS = ["5h", "session", "five_hour", "primary"] as const;
const WEEKLY_KEYWORDS = ["7d", "week", "seven_day", "secondary"] as const;

// The window shape carries no duration, and the service needs one. Both windows
// have a fixed length across every provider that reports them.
const SESSION_WINDOW_MINUTES = 300;
const WEEKLY_WINDOW_MINUTES = 10_080;

function findWindow(
  windows: readonly ProviderUsageWindow[],
  keywords: readonly string[],
): ProviderUsageWindow | undefined {
  // Sources mark their account-wide windows `summary`; model- and feature-scoped ones
  // such as `code_review:five_hour` would otherwise match the same keywords.
  const summary = windows.filter((window) => window.summary);
  return (summary.length > 0 ? summary : windows).find((window) => {
    const haystack = `${window.id} ${window.label}`.toLowerCase();
    return keywords.some((keyword) => haystack.includes(keyword));
  });
}

function usedPercentOf(window: ProviderUsageWindow): number | null {
  if (typeof window.usedPct === "number" && Number.isFinite(window.usedPct)) {
    return window.usedPct;
  }
  if (typeof window.remainingPct === "number" && Number.isFinite(window.remainingPct)) {
    return 100 - window.remainingPct;
  }
  return null;
}

function resetsAtOf(window: ProviderUsageWindow): string | null {
  if (!window.resetsAt) {
    return null;
  }
  const resetsAt = new Date(window.resetsAt);
  return Number.isFinite(resetsAt.getTime()) ? resetsAt.toISOString() : null;
}

function projectWindow(
  window: ProviderUsageWindow | undefined,
  windowMinutes: number,
): ClawMuseStatusUsageWindow | null {
  if (!window) {
    return null;
  }
  const usedPercent = usedPercentOf(window);
  const resetsAt = resetsAtOf(window);
  if (usedPercent === null) {
    // The provider reports the window but no consumption against it: a plan with
    // no cap here, which the phone renders differently from "0% used".
    return { usedPercent: 0, windowMinutes, resetsAt, unlimited: true };
  }
  return {
    // Whole percents keep a five-minute refresh from churning the snapshot.
    usedPercent: Math.max(0, Math.min(100, Math.round(usedPercent))),
    windowMinutes,
    resetsAt,
  };
}

function projectReport(entry: UsageReportEntry): ClawMuseStatusUsage | null {
  if (!USAGE_PROVIDER_PATTERN.test(entry.sourceId) || entry.report.status !== "available") {
    return null;
  }
  const { report } = entry;
  const session = projectWindow(
    findWindow(report.windows, SESSION_KEYWORDS),
    SESSION_WINDOW_MINUTES,
  );
  const weekly = projectWindow(findWindow(report.windows, WEEKLY_KEYWORDS), WEEKLY_WINDOW_MINUTES);
  if (!session && !weekly) {
    return null;
  }
  const label = report.planLabel?.trim().slice(0, MAX_LABEL_LENGTH);
  const updatedAt = new Date(entry.fetchedAt);
  return {
    provider: entry.sourceId,
    ...(label ? { label } : {}),
    session,
    weekly,
    updatedAt: (Number.isFinite(updatedAt.getTime()) ? updatedAt : new Date()).toISOString(),
  };
}

function sameWindows(left: readonly ClawMuseStatusUsage[], right: readonly ClawMuseStatusUsage[]) {
  const strip = (usages: readonly ClawMuseStatusUsage[]) =>
    JSON.stringify(usages.map(({ updatedAt: _updatedAt, ...rest }) => rest));
  return strip(left) === strip(right);
}

/**
 * Usage reports to the snapshot's usage array, one per source: the first
 * available report wins when a source has several logins. Only numbers leave
 * the daemon: no account, organization, or credential.
 *
 * `previous` is returned unchanged when nothing but `updatedAt` moved, so a
 * routine quota refresh does not publish a new revision.
 */
export function projectClawMuseStatusUsages(
  reports: readonly UsageReportEntry[],
  previous: readonly ClawMuseStatusUsage[] = [],
): readonly ClawMuseStatusUsage[] {
  const byProvider = new Map<string, ClawMuseStatusUsage>();
  for (const entry of reports) {
    const projected = projectReport(entry);
    if (projected && !byProvider.has(projected.provider)) {
      byProvider.set(projected.provider, projected);
    }
  }
  const usages = [...byProvider.values()].sort((left, right) =>
    left.provider.localeCompare(right.provider),
  );
  // Identity, not just equality: the publisher uses it to skip a redundant revision.
  return sameWindows(previous, usages) ? previous : usages;
}
