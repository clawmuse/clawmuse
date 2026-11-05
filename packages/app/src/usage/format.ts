import type { TFunction } from "i18next";
import { i18n } from "@/i18n/i18next";
import { formatTimeOfDay } from "@/utils/time";
import type { UsageDisplayAs } from "./preferences";
import type { UsageBalanceUnit } from "./types";

const providerUsageLabels = {
  session: { label: "Session", key: "providerUsage.labels.session" },
  weekly: { label: "Weekly", key: "providerUsage.labels.weekly" },
  monthly: { label: "Monthly", key: "providerUsage.labels.monthly" },
  code_review: { label: "Code review", key: "providerUsage.labels.codeReview" },
  credits: { label: "Credits", key: "providerUsage.labels.credits" },
  monthly_credits: { label: "Monthly credits", key: "providerUsage.labels.monthlyCredits" },
  copilot_chat: { label: "Chat requests", key: "usageMonitoring.chat" },
  copilot_completions: { label: "Code completions", key: "usageMonitoring.completions" },
  copilot_premium_interactions: { label: "Premium requests", key: "usageMonitoring.premium" },
  copilot_source: { label: "Account source", key: "usageMonitoring.source" },
  reset: { label: "Quota reset", key: "usageMonitoring.reset" },
} as const;

export function formatProviderUsageLabel(id: string, label: string, t: TFunction = i18n.t): string {
  const reviewPrefix = "Code review · ";
  if (id.startsWith("code_review:") && label.startsWith(reviewPrefix)) {
    const periodId = id.slice("code_review:".length);
    const periodLabel = label.slice(reviewPrefix.length);
    return `${t(providerUsageLabels.code_review.key)} · ${formatProviderUsageLabel(periodId, periodLabel, t)}`;
  }
  const standard =
    providerUsageLabels[id as keyof typeof providerUsageLabels] ??
    (id === "five_hour" ? providerUsageLabels.session : undefined);
  return standard?.label === label ? t(standard.key) : label;
}

export function clampPct(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function formatPct(value: number, locale?: string): string {
  const resolvedLocale = locale ?? i18n.resolvedLanguage;
  return new Intl.NumberFormat(resolvedLocale, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(clampPct(value) / 100);
}

/** A localized percentage that says whether it is used or remaining. */
export function formatDisplayPct(
  value: number,
  displayAs: UsageDisplayAs,
  locale?: string,
  t: TFunction = i18n.t,
): string {
  const percentage = formatPct(value, locale);
  return displayAs === "used"
    ? t("providerUsage.values.used", { percentage })
    : t("providerUsage.values.remaining", { amount: percentage });
}

type DurationUnit = "minutes" | "hours" | "days";
interface DurationPart {
  unit: DurationUnit;
  count: number;
}
/** Countdown values retain minute precision, including zero-valued lower units. */
type RelativeDuration = { kind: "now" } | { kind: "remaining"; parts: DurationPart[] };

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function formatCount(value: number): string {
  return new Intl.NumberFormat(i18n.resolvedLanguage).format(value);
}

function relativeDuration(iso: string, now: number): RelativeDuration | null {
  const diffMs = new Date(iso).getTime() - now;
  if (!Number.isFinite(diffMs)) return null;
  if (diffMs <= 0) return { kind: "now" };
  const days = Math.floor(diffMs / DAY_MS);
  const hours = Math.floor((diffMs % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((diffMs % HOUR_MS) / MINUTE_MS);
  const parts: DurationPart[] = [];
  if (days > 0) parts.push({ unit: "days", count: days });
  if (diffMs >= HOUR_MS) parts.push({ unit: "hours", count: hours });
  parts.push({ unit: "minutes", count: minutes });
  return { kind: "remaining", parts };
}

function formatDurationPart(part: DurationPart, t: TFunction): string {
  return t(`providerUsage.duration.${part.unit}`, {
    count: part.count,
    value: formatCount(part.count),
  });
}

function formatRelativeDuration(
  duration: Extract<RelativeDuration, { kind: "remaining" }>,
  t: TFunction,
): string {
  return duration.parts.map((part) => formatDurationPart(part, t)).join(" ");
}

export function formatResetLabel(
  iso: string | null | undefined,
  retained = false,
  now = Date.now(),
  t: TFunction = i18n.t,
): string | null {
  if (!iso) return null;
  const rel = relativeDuration(iso, now);
  if (!rel) return null;
  if (rel.kind === "now" && retained) return t("providerUsage.timing.resetTimePassed");
  if (rel.kind === "now") return t("providerUsage.timing.resettingNow");
  return t("providerUsage.timing.resetsIn", { duration: formatRelativeDuration(rel, t) });
}

/**
 * When a window resets on the clock: "3:00 PM" within a day, "Fri 3:00 PM" within a week,
 * "Oct 31, 3:00 PM" after that. Names follow the app language; 12/24h follows the device.
 * Nothing for a time that has passed, where the countdown already says so.
 */
export function formatResetTime(
  iso: string | null | undefined,
  now = Date.now(),
  t: TFunction = i18n.t,
): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  const diffMs = at.getTime() - now;
  if (!Number.isFinite(diffMs) || diffMs <= 0) return null;
  const time = formatTimeOfDay(at);
  const locale = i18n.resolvedLanguage;
  if (diffMs < DAY_MS) return time;
  if (diffMs < 7 * DAY_MS) {
    const weekday = at.toLocaleDateString(locale, { weekday: "short" });
    return t("providerUsage.timing.resetsAtWeekday", { weekday, time });
  }
  const date = at.toLocaleDateString(locale, { month: "short", day: "numeric" });
  return t("providerUsage.timing.resetsAtDate", { date, time });
}

/**
 * Time until `iso` to the minute in compact units every language reads, rounded up so it never
 * reads as already due, with zero units left out: "6d 2h 5m", "3h", "45m". Null once the time has
 * passed.
 */
export function formatCompactCountdown(
  iso: string | null | undefined,
  now = Date.now(),
): string | null {
  if (!iso) return null;
  const diffMs = new Date(iso).getTime() - now;
  if (!Number.isFinite(diffMs) || diffMs <= 0) return null;
  const total = Math.ceil(diffMs / 60_000);
  const units = [
    ["d", Math.floor(total / 1440)],
    ["h", Math.floor(total / 60) % 24],
    ["m", total % 60],
  ] as const;
  return units
    .filter(([, count]) => count > 0)
    .map(([unit, count]) => `${count}${unit}`)
    .join(" ");
}

export function formatRunsOutLabel(
  iso: string | null | undefined,
  now = Date.now(),
  t: TFunction = i18n.t,
): string | null {
  if (!iso) return null;
  const rel = relativeDuration(iso, now);
  if (!rel) return null;
  if (rel.kind === "now") return t("providerUsage.timing.runsOutNow");
  return t("providerUsage.timing.runsOutIn", { duration: formatRelativeDuration(rel, t) });
}

export function formatAgo(
  iso: string | null | undefined,
  now = Date.now(),
  t: TFunction = i18n.t,
): string | null {
  if (!iso) return null;
  const diffMs = now - new Date(iso).getTime();
  if (!Number.isFinite(diffMs)) return null;
  if (diffMs < 60_000) return t("providerUsage.timing.justNow");
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays > 0) {
    return t("providerUsage.timing.daysAgo", {
      count: diffDays,
      value: formatCount(diffDays),
    });
  }
  if (diffHours > 0) {
    return t("providerUsage.timing.hoursAgo", {
      count: diffHours,
      value: formatCount(diffHours),
    });
  }
  return t("providerUsage.timing.minutesAgo", {
    count: diffMinutes,
    value: formatCount(diffMinutes),
  });
}

/** What an agent's session has cost so far, or null before it has cost anything. */
export function formatSessionCost(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`;
}

/** A balance amount as the app's language writes it: "$1,234.50", "12,345". */
export function formatAmount(value: number, unit: UsageBalanceUnit, locale?: string): string {
  switch (unit) {
    case "usd":
      return new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(value);
    case "tokens":
      return new Intl.NumberFormat(locale, {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(value);
    default:
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  }
}

export function formatUsageDetailValue(id: string, value: string, t: TFunction = i18n.t): string {
  if (!id.startsWith("copilot_")) return value;
  switch (value) {
    case "Unlimited":
      return t("usageMonitoring.unlimited");
    case "Not included":
      return t("usageMonitoring.notIncluded");
    case "Not reported":
      return t("usageMonitoring.notReported");
    case "GitHub CLI":
      return t("usageMonitoring.githubCli");
    case "GitHub token":
      return t("usageMonitoring.githubToken");
    case "Copilot token":
      return t("usageMonitoring.copilotToken");
    default:
      return value;
  }
}

export function formatUsageSourceLabel(sourceId: string, label: string, t: TFunction): string {
  return sourceId === "copilot" ? t("usageMonitoring.copilotAccount") : label;
}

export function formatUsagePlanLabel(sourceId: string, plan: string, t: TFunction): string {
  return sourceId === "copilot" && plan === "individual" ? t("usageMonitoring.individual") : plan;
}
