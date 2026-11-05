import { i18n } from "@/i18n/i18next";
import type { TFunction } from "i18next";
import type { RelativeTimeLabel } from "@/utils/time";
import type { ScheduleCadence, ScheduleSummary } from "@getpaseo/protocol/schedule/types";
import { validateCronExpression } from "@getpaseo/protocol/schedule/cron-expression";

export type IntervalUnit = "minutes" | "hours" | "days";
type CronCadence = Extract<ScheduleCadence, { type: "cron" }>;

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = MS_PER_MINUTE * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;

const UNIT_MS: Record<IntervalUnit, number> = {
  minutes: MS_PER_MINUTE,
  hours: MS_PER_HOUR,
  days: MS_PER_DAY,
};

export function isNewAgentSchedule(schedule: ScheduleSummary): boolean {
  return schedule.target.type === "new-agent";
}

export function scheduleProductName(schedule: ScheduleSummary, t: TFunction = i18n.t): string {
  return t(
    schedule.target.type === "agent" ? "schedules.product.heartbeat" : "schedules.product.schedule",
  );
}

export function resolveScheduleTitle(schedule: ScheduleSummary, t: TFunction = i18n.t): string {
  const name = schedule.name?.trim();
  if (name) {
    return name;
  }
  if (schedule.target.type === "new-agent") {
    const configTitle = schedule.target.config.title?.trim();
    if (configTitle) {
      return configTitle;
    }
  }
  const firstPromptLine = schedule.prompt
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return (
    firstPromptLine ||
    t(
      schedule.target.type === "agent"
        ? "schedules.untitled.heartbeat"
        : "schedules.untitled.schedule",
    )
  );
}

export function everyMsToParts(ms: number): { value: number; unit: IntervalUnit } {
  if (!Number.isFinite(ms) || ms <= 0) {
    return { value: 1, unit: "hours" };
  }
  if (ms % MS_PER_DAY === 0) {
    return { value: ms / MS_PER_DAY, unit: "days" };
  }
  if (ms % MS_PER_HOUR === 0) {
    return { value: ms / MS_PER_HOUR, unit: "hours" };
  }
  return { value: Math.max(1, Math.round(ms / MS_PER_MINUTE)), unit: "minutes" };
}

export function partsToEveryMs(value: number, unit: IntervalUnit): number {
  const normalized = Number.isFinite(value) ? Math.max(1, Math.round(value)) : 1;
  return normalized * UNIT_MS[unit];
}

const INTERVAL_LABEL_KEYS: Record<IntervalUnit, string> = {
  minutes: "schedules.cadence.everyMinutes",
  hours: "schedules.cadence.everyHours",
  days: "schedules.cadence.everyDays",
};
function formatEvery(everyMs: number, t: TFunction): string {
  const { value, unit } = everyMsToParts(everyMs);
  return t(INTERVAL_LABEL_KEYS[unit], { count: value });
}

export function formatCadence(cadence: ScheduleCadence, t: TFunction = i18n.t): string {
  if (cadence.type === "every") {
    return formatEvery(cadence.everyMs, t);
  }
  return describeCron(cadence, t) ?? cadence.expression;
}

/**
 * Humanize a handful of common 5-field cron shapes. Returns null when the
 * expression is valid but not one of the recognized patterns (callers fall
 * back to showing the raw expression).
 */
export function describeCron(cadence: CronCadence, t: TFunction = i18n.t): string | null {
  const trimmed = cadence.expression.trim();
  if (validateCron(trimmed, t) !== null) {
    return null;
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = trimmed.split(/\s+/);

  // Only humanize the simple "fixed time" family: literal minute/hour with the
  // date fields either wildcarded or a recognized day-of-week constraint.
  const minuteNum = Number.parseInt(minute, 10);
  const isLiteralMinute = /^\d+$/.test(minute);
  const isWildcardMonth = month === "*";
  const isWildcardDom = dayOfMonth === "*";

  if (minute === "*" && hour === "*" && isWildcardMonth && isWildcardDom && dayOfWeek === "*") {
    return t("schedules.cadence.everyMinute");
  }

  if (!isLiteralMinute || !isWildcardMonth || !isWildcardDom) {
    return null;
  }

  // "Every hour" / "Every hour at :MM"
  if (hour === "*") {
    if (dayOfWeek !== "*") {
      return null;
    }
    return minuteNum === 0
      ? t("schedules.cadence.everyHour")
      : t("schedules.cadence.hourlyAt", { minute: pad2(minuteNum) });
  }

  if (!/^\d+$/.test(hour)) {
    return null;
  }
  const time = `${pad2(Number.parseInt(hour, 10))}:${pad2(minuteNum)}`;
  const timezone = cadence.timezone ?? "UTC";
  const dayLabel = describeCronDay(dayOfWeek, t);
  return dayLabel ? t("schedules.cadence.at", { day: dayLabel, time, timezone }) : null;
}

function describeCronDay(dayOfWeek: string, t: TFunction): string | null {
  if (dayOfWeek === "*") {
    return t("schedules.cadence.days.daily");
  }
  if (dayOfWeek === "1-5") {
    return t("schedules.cadence.days.weekdays");
  }
  if (dayOfWeek === "0,6" || dayOfWeek === "6,0") {
    return t("schedules.cadence.days.weekends");
  }
  if (/^\d$/.test(dayOfWeek)) {
    return t(`schedules.cadence.days.${dayOfWeek}`);
  }
  return null;
}

export function validateCron(expr: string, t: TFunction = i18n.t): string | null {
  const trimmed = expr.trim();
  if (!trimmed) {
    return t("schedules.cadence.errors.required");
  }

  const error = validateCronExpression(trimmed);
  if (!error) return null;
  if (error === "Cron expressions must have 5 fields") {
    return t("schedules.cadence.errors.fields");
  }
  const match =
    /^Invalid cron (minute|hour|day-of-month|month|day-of-week) (field|step|range|value)$/.exec(
      error,
    );
  if (match) {
    return t(`schedules.cadence.errors.${match[2]}`, {
      field: t(`schedules.cadence.fields.${match[1]}`),
    });
  }
  return t("schedules.cadence.errors.invalid");
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * Forward-relative description of the next run, e.g. "in 3h", "in 2d", "soon".
 * Returns "" when there is no scheduled next run.
 */
export function formatNextRun(iso: string | null, t: TFunction = i18n.t): string {
  if (!iso) {
    return "";
  }
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) {
    return "";
  }

  const diffMs = target - Date.now();
  if (diffMs <= 0) {
    return t("schedules.time.soon");
  }
  if (diffMs < MS_PER_MINUTE) {
    return t("schedules.time.soon");
  }
  if (diffMs < MS_PER_HOUR) {
    return t("schedules.time.inMinutes", { count: Math.round(diffMs / MS_PER_MINUTE) });
  }
  if (diffMs < MS_PER_DAY) {
    return t("schedules.time.inHours", { count: Math.round(diffMs / MS_PER_HOUR) });
  }
  return t("schedules.time.inDays", { count: Math.round(diffMs / MS_PER_DAY) });
}

export function describeScheduleTimeAgo(
  date: Date,
  t: TFunction,
  now: Date = new Date(),
): RelativeTimeLabel {
  const elapsedMs = now.getTime() - date.getTime();
  if (elapsedMs < MS_PER_MINUTE)
    return { label: t("schedules.time.justNow"), resolution: "minute" };
  if (elapsedMs < MS_PER_HOUR)
    return {
      label: t("schedules.time.minutesAgo", { count: Math.floor(elapsedMs / MS_PER_MINUTE) }),
      resolution: "minute",
    };
  if (elapsedMs < MS_PER_DAY)
    return {
      label: t("schedules.time.hoursAgo", { count: Math.floor(elapsedMs / MS_PER_HOUR) }),
      resolution: "hour",
    };
  if (elapsedMs < 7 * MS_PER_DAY)
    return {
      label: t("schedules.time.daysAgo", { count: Math.floor(elapsedMs / MS_PER_DAY) }),
      resolution: "day",
    };
  return {
    label: date.toLocaleDateString(i18n.resolvedLanguage, { month: "short", day: "numeric" }),
    resolution: "static",
  };
}
