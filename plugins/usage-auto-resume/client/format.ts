import type { useTranslation } from "@getpaseo/plugin/client";
import type {
  DiscoveredProvider,
  QueueReason,
  RescheduleResult,
  ScheduledJob,
} from "../shared/rpc";
import { QueueReasonSchema } from "../shared/rpc";
import { rescheduleWindow } from "../shared/schedule";
import { messages } from "./messages";

export type T = ReturnType<typeof useTranslation<(typeof messages)["resources"]["en"]>>["t"];

const PROVIDER_LABELS: Record<string, string> = {
  codex: "Codex",
  claude: "Claude",
  "claude-main": "Claude Main",
  antigravity: "Antigravity",
  "antigravity-main": "Antigravity Main",
};

export function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

/** The CLI's own provider first, then the ones built on it by name. */
export function sortProviders(providers: readonly DiscoveredProvider[]): DiscoveredProvider[] {
  const rank = (provider: DiscoveredProvider) => (provider.id === provider.cli ? 0 : 1);
  return [...providers].sort(
    (left, right) => rank(left) - rank(right) || left.label.localeCompare(right.label),
  );
}

/** ID, the account it signs in as, and what is waiting on it, for a provider's switch. */
export function providerHint(t: T, provider: DiscoveredProvider, pending: number): string {
  return [
    provider.id,
    provider.account,
    pending ? t("providersAccountPending", { count: pending }) : null,
    provider.paseoEnabled ? null : t("providersOffInPaseo"),
  ]
    .filter(Boolean)
    .join(" · ");
}

const pad = (value: number) => String(value).padStart(2, "0");

/** 24-hour wall clock in the device's time zone, like an alarm list. */
export function clockLabel(iso: string): string {
  const date = new Date(iso);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function relativeLabel(t: T, iso: string, now: number): string {
  const minutes = Math.ceil((Date.parse(iso) - now) / 60_000);
  if (minutes <= 0) return t("timeNow");
  if (minutes < 60) return t("timeInMinutes", { minutes });
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? t("timeInHoursMinutes", { hours, minutes: rest }) : t("timeInHours", { hours });
}

function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Calendar days from today to `iso`; 0 is today. */
export function dayOffset(iso: string, now: number): number {
  return Math.round((startOfDay(Date.parse(iso)) - startOfDay(now)) / 86_400_000);
}

export function dayLabel(t: T, iso: string, now: number): string {
  const days = dayOffset(iso, now);
  if (days <= 0) return t("dayToday");
  if (days === 1) return t("dayTomorrow");
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export interface DayGroup {
  label: string;
  jobs: ScheduledJob[];
}

/** Jobs are already sorted by due time; consecutive days become sections. */
export function groupByDay(t: T, jobs: readonly ScheduledJob[], now: number): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const job of jobs) {
    const label = dayLabel(t, job.dueAt, now);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.jobs.push(job);
    else groups.push({ label, jobs: [job] });
  }
  return groups;
}

/** Headline and detail for the list, e.g. "2 agents will continue" / "Next at 18:53 · 1 skipped". */
export function summaryLabels(
  t: T,
  jobs: readonly ScheduledJob[],
): {
  title: string;
  detail: string | null;
} {
  const on = jobs.filter((job) => job.enabled);
  const skipped = jobs.length - on.length;
  const skippedLabel = skipped > 0 ? t("summarySkipped", { count: skipped }) : null;
  if (on.length === 0) return { title: t("summaryAllOff"), detail: null };
  const scheduled = on.filter((job) => !job.waiting);
  const waiting = on.length - scheduled.length;
  const title = scheduled.length
    ? t("summaryContinue", { count: scheduled.length })
    : t("summaryWaiting", { count: waiting });
  const next = scheduled.length
    ? t("summaryNextAt", { time: clockLabel(scheduled[0]!.dueAt) })
    : t("summaryNextCheckAt", { time: clockLabel(on[0]!.dueAt) });
  return {
    title,
    detail: [
      next,
      scheduled.length && waiting ? t("summaryWaitingCount", { count: waiting }) : null,
      skippedLabel,
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

export function waitingLabel(t: T, job: ScheduledJob): string | null {
  switch (job.waiting) {
    case "auth":
      return t("statusWaitingAuth");
    case "usage":
      return t("statusWaitingUsage");
    default:
      return null;
  }
}

/** Where the agent lives: "Project · workspace", without repeating a name. */
export function placeLabel(job: ScheduledJob): string | null {
  const parts = [job.projectName, job.workspaceName].filter((part): part is string => !!part);
  return [...new Set(parts)].join(" · ") || null;
}

export interface DayChoice {
  offset: number;
  label: string;
}

/** Today and Tomorrow, plus the job's own day when a weekly reset put it further out. */
export function dayChoices(t: T, dueAt: string, now: number): DayChoice[] {
  const choices = [
    { offset: 0, label: t("dayToday") },
    { offset: 1, label: t("dayTomorrow") },
  ];
  const own = dayOffset(dueAt, now);
  return own > 1 ? [...choices, { offset: own, label: dayLabel(t, dueAt, now) }] : choices;
}

/** "07:30", "7:30" or "0730" on the day `offset` days from today, local time; null if unreadable. */
export function timeOnDay(text: string, offset: number, now: number): string | null {
  const match = /^\s*(\d{1,2}):?(\d{2})\s*$/.exec(text);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  const date = new Date(now);
  date.setDate(date.getDate() + offset);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

const ceilMinute = (time: number) => Math.ceil(time / 60_000) * 60_000;

function tooEarlyLabel(t: T, job: ScheduledJob, earliest: number): string {
  const at = clockLabel(new Date(ceilMinute(earliest)).toISOString());
  return job.resetAt
    ? t("editTooEarlyReset", { reset: clockLabel(job.resetAt), earliest: at })
    : t("editTooEarly", { earliest: at });
}

/** Why the server would refuse `dueAt`, checked before sending; null when it is allowed. */
export function rescheduleProblem(
  t: T,
  job: ScheduledJob,
  dueAt: string,
  now: number,
): string | null {
  const { earliest, latest } = rescheduleWindow(job.resetAt, now);
  const target = Date.parse(dueAt);
  if (target < earliest) return tooEarlyLabel(t, job, earliest);
  if (target > latest) return t("editTooLate");
  return null;
}

export function refusalLabel(
  t: T,
  job: ScheduledJob,
  result: Extract<RescheduleResult, { changed: false }>,
): string {
  switch (result.reason) {
    case "too-early":
      return tooEarlyLabel(t, job, result.earliest ? Date.parse(result.earliest) : Date.now());
    case "too-late":
      return t("editTooLate");
    case "sending":
      return t("editSending");
    case "changed":
      return t("editChanged");
  }
}

/** The one bulk button: turns everything off while anything not already sending is on. */
export function bulkAction(
  t: T,
  jobs: readonly ScheduledJob[],
): {
  enabled: boolean;
  label: string;
  shortLabel: string;
} {
  const anyOn = jobs.some((job) => job.enabled && !job.sending);
  return anyOn
    ? { enabled: false, label: t("bulkAllOff"), shortLabel: t("bulkAllOffShort") }
    : { enabled: true, label: t("bulkAllOn"), shortLabel: t("bulkAllOnShort") };
}

const REASON_KEYS = {
  saved: "reasonSaved",
  "paused-by-user": "reasonPausedByUser",
  "schedule-failed": "reasonScheduleFailed",
  "provider-model-changed": "reasonProviderModelChanged",
  "manual-activity": "reasonManualActivity",
  "conversation-changed": "reasonConversationChanged",
  "turn-changed": "reasonTurnChanged",
  "auto-resume-stopped": "reasonAutoResumeStopped",
  "other-turn-ended": "reasonOtherTurnEnded",
  "turn-not-ours": "reasonTurnNotOurs",
  canceled: "reasonCanceled",
  failed: "reasonFailed",
  "context-changed": "reasonContextChanged",
  "auto-resume-off": "reasonAutoResumeOff",
  "account-changed": "reasonAccountChanged",
  "agent-changed": "reasonAgentChanged",
  "delivery-unknown": "reasonDeliveryUnknown",
  "plugin-restarted": "reasonPluginRestarted",
  "agent-gone": "reasonAgentGone",
  "provider-unsupported": "reasonProviderUnsupported",
  "provider-off": "reasonProviderOff",
  "continue-delivery-unknown": "reasonContinueDeliveryUnknown",
  "resume-delivery-unknown": "reasonResumeDeliveryUnknown",
  "agent-unavailable": "reasonAgentUnavailable",
  "agent-archived": "reasonAgentArchived",
  "agent-busy": "reasonAgentBusy",
  "agent-pending": "reasonAgentPending",
} as const satisfies Record<QueueReason, Parameters<T>[0]>;

export function reasonLabel(t: T, reason: string): string {
  const parsed = QueueReasonSchema.safeParse(reason);
  return parsed.success ? t(REASON_KEYS[parsed.data]) : reason;
}
