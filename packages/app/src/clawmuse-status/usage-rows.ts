import type { TFunction } from "i18next";
import type { ClawMuseStatusUsage, ClawMuseStatusUsageWindow } from "./summary";
import type { ClawMuseProviderPlan, ClawMuseProviderPlanWindow } from "./usage-windows";

/**
 * Ported from agent/mobile/src/home/home-usage-rows.ts.
 *
 * One row per plan: every online host's own providers, plus the external plans
 * the status service polls for providers no host reports. The card shows them
 * grouped by host; the collapsed summary reads them flat.
 */
export interface ClawMuseUsageWindowRow {
  usedPercent: number | null;
  /** How far the window has run, so the meter can mark pace. */
  timePercent: number | null;
  unlimited: boolean;
  /** Epoch ms, or null when the source does not say. */
  resetsAt: number | null;
}

export interface ClawMuseUsageRow {
  key: string;
  name: string;
  /** The subscription tier, shown as a badge beside the name. */
  planLabel: string | null;
  session: ClawMuseUsageWindowRow | null;
  weekly: ClawMuseUsageWindowRow | null;
}

export interface ClawMuseUsageHostPlans {
  serverId: string;
  hostName: string;
  plans: readonly ClawMuseProviderPlan[];
}

function elapsedPercent(
  windowMinutes: number,
  resetsAt: number | null,
  now: number,
): number | null {
  if (resetsAt === null) {
    return null;
  }
  const windowMs = windowMinutes * 60_000;
  const remaining = Math.max(0, Math.min(windowMs, resetsAt - now));
  return Math.round((1 - remaining / windowMs) * 100);
}

function toWindowRow(
  window: ClawMuseProviderPlanWindow | ClawMuseStatusUsageWindow | null,
  now: number,
): ClawMuseUsageWindowRow | null {
  if (!window) {
    return null;
  }
  return {
    usedPercent: window.unlimited ? null : window.usedPercent,
    timePercent: elapsedPercent(window.windowMinutes, window.resetsAt, now),
    unlimited: window.unlimited,
    resetsAt: window.resetsAt,
  };
}

export interface BuildClawMuseUsageRowsInput {
  hosts: readonly ClawMuseUsageHostPlans[];
  serviceUsages: readonly ClawMuseStatusUsage[];
  now: number;
}

/**
 * Reading order for the card. Without it rows fall out in host `serverId` order
 * crossed with whatever order each daemon lists its providers, which shuffles
 * as hosts come and go — the plan you check first should not move.
 * Providers missing here sort last, in arrival order.
 *
 * The status service takes any id its sources send, and the GLM plans arrive
 * spelled three different ways depending on the source, so all three are ranked
 * together — see USAGE_PROVIDER_DISPLAY_NAMES in the service's status-types.
 */
const PROVIDER_DISPLAY_ORDER = [
  "claude",
  "codex",
  "copilot",
  "cursor",
  "zai",
  "glm",
  "zhipu",
  "grok",
  "kimi",
  "minimax",
];

function providerRank(provider: string): number {
  const rank = PROVIDER_DISPLAY_ORDER.indexOf(provider);
  return rank === -1 ? PROVIDER_DISPLAY_ORDER.length : rank;
}

interface RankedRow {
  rank: number;
  row: ClawMuseUsageRow;
}

// Stable, so two hosts on the same provider stay in host order.
function sortByProvider(ranked: RankedRow[]): ClawMuseUsageRow[] {
  return ranked.sort((left, right) => left.rank - right.rank).map((entry) => entry.row);
}

function hostRows(host: ClawMuseUsageHostPlans, now: number): RankedRow[] {
  return host.plans.map((plan) => ({
    rank: providerRank(plan.provider),
    row: {
      key: `${host.serverId}:${plan.provider}`,
      name: plan.name,
      planLabel: plan.planLabel,
      session: toWindowRow(plan.session, now),
      weekly: toWindowRow(plan.weekly, now),
    },
  }));
}

function serviceRows(input: BuildClawMuseUsageRowsInput): RankedRow[] {
  const hostProviders = new Set(
    input.hosts.flatMap((host) => host.plans.map((plan) => plan.provider)),
  );
  return input.serviceUsages
    .filter((usage) => !hostProviders.has(usage.provider) && (usage.session || usage.weekly))
    .map((usage) => ({
      rank: providerRank(usage.provider),
      row: {
        // The label is part of the key because one provider can arrive more than
        // once — two MiniMax accounts are two plans, both spelled `minimax`.
        key: `service:${usage.provider}:${usage.label ?? ""}`,
        // The service sends one already-composed label, with no tier to split off.
        name: usage.label ?? usage.provider,
        planLabel: null,
        session: toWindowRow(usage.session, input.now),
        weekly: toWindowRow(usage.weekly, input.now),
      },
    }));
}

/** Every plan in provider reading order, across hosts. */
export function buildClawMuseUsageRows(input: BuildClawMuseUsageRowsInput): ClawMuseUsageRow[] {
  return sortByProvider([
    ...input.hosts.flatMap((host) => hostRows(host, input.now)),
    ...serviceRows(input),
  ]);
}

/** One host's plans, or the status service's (`hostName: null`) plans that belong to no host. */
export interface ClawMuseUsageGroup {
  key: string;
  hostName: string | null;
  rows: ClawMuseUsageRow[];
}

/**
 * The card's sections: each host with plans, in host order, then the service's
 * plans last. Within a section plans keep provider reading order.
 */
export function buildClawMuseUsageGroups(input: BuildClawMuseUsageRowsInput): ClawMuseUsageGroup[] {
  const groups: ClawMuseUsageGroup[] = input.hosts
    .map((host) => ({
      key: host.serverId,
      hostName: host.hostName,
      rows: sortByProvider(hostRows(host, input.now)),
    }))
    .filter((group) => group.rows.length > 0);
  const service = sortByProvider(serviceRows(input));
  if (service.length > 0) {
    groups.push({ key: "service", hostName: null, rows: service });
  }
  return groups;
}

export function remainingPercentLabel(
  window: ClawMuseUsageWindowRow | null,
  unlimitedText: string,
): string {
  if (!window) {
    return "—";
  }
  if (window.unlimited) {
    return unlimitedText;
  }
  if (window.usedPercent === null) {
    return "—";
  }
  return `${100 - Math.max(0, Math.min(100, Math.round(window.usedPercent)))}%`;
}

// Mirrors the unit boundaries of the desktop reset formatter, routed through i18n.
export function localizedResetDuration(ms: number, t: TFunction): string {
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 60) {
    return t("clawmuseStatus.usage.duration.minutes", { minutes: totalMinutes });
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return remainingHours > 0
      ? t("clawmuseStatus.usage.duration.daysHours", { days, hours: remainingHours })
      : t("clawmuseStatus.usage.duration.days", { days });
  }
  return minutes > 0
    ? t("clawmuseStatus.usage.duration.hoursMinutes", { hours, minutes })
    : t("clawmuseStatus.usage.duration.hours", { hours });
}

/** Null when the window has no reset time, or no cap to reset. */
export function resetCountdownLabel(
  window: ClawMuseUsageWindowRow | null,
  now: number,
  t: TFunction,
): string | null {
  if (!window || window.unlimited || window.resetsAt === null) {
    return null;
  }
  const remainingMs = window.resetsAt - now;
  if (remainingMs <= 0) {
    return t("clawmuseStatus.usage.resetsNow");
  }
  return t("clawmuseStatus.usage.resetsIn", { duration: localizedResetDuration(remainingMs, t) });
}
