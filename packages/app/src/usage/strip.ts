import type { TFunction } from "i18next";
import { i18n } from "@/i18n/i18next";
import { formatCompactCountdown, formatDisplayPct, formatProviderUsageLabel } from "./format";
import { displayPercent, resolveUsageReport } from "./model";
import type { UsageDisplayAs } from "./preferences";
import { windowTone } from "./tone";
import type { UsageReportEntry, UsageTone, UsageWindow } from "./types";

/** One limit window as the composer's usage strip shows it: "5h 72% left · resets in 2h 13m". */
export interface AgentUsageStripWindow {
  key: string;
  name: string;
  percentText: string;
  /** Time until the window resets, null when unknown or already passed. */
  resetText: string | null;
  tone: UsageTone;
}

/** One account the agent runs under. */
export interface AgentUsageStripAccount {
  key: string;
  /** The source's name, only when the agent reports more than one account. */
  sourceLabel: string | null;
  windows: AgentUsageStripWindow[];
}

function windowName(window: UsageWindow, t: TFunction): string {
  if (window.id === "five_hour") return t("agentUsageStrip.fiveHour");
  if (window.id === "weekly") return t("agentUsageStrip.weekly");
  return window.shortLabel || formatProviderUsageLabel(window.id, window.label, t);
}

/**
 * The windows the strip shows for each account: the source's summary windows (session and
 * weekly), or every window when the source marks none. A failed poll keeps its last successful
 * numbers.
 */
export function resolveAgentUsageStrip(input: {
  reports: readonly UsageReportEntry[];
  displayAs: UsageDisplayAs;
  now: number;
  t?: TFunction;
}): AgentUsageStripAccount[] {
  const { reports, displayAs, now, t = i18n.t } = input;
  return reports.flatMap((entry) => {
    const { windows } = resolveUsageReport(entry, t);
    const measured = windows.filter((window) => displayPercent(window, displayAs) !== null);
    const summary = measured.filter((window) => window.summary);
    const shown = (summary.length > 0 ? summary : measured).map((window) => {
      const reset = formatCompactCountdown(window.resetsAt, now);
      return {
        key: window.id,
        name: windowName(window, t),
        percentText: formatDisplayPct(
          displayPercent(window, displayAs) ?? 0,
          displayAs,
          undefined,
          t,
        ),
        resetText: reset ? t("agentUsageStrip.resetsIn", { duration: reset }) : null,
        tone: windowTone(window),
      };
    });
    if (shown.length === 0) return [];
    return [
      {
        key: entry.id,
        sourceLabel: reports.length > 1 ? entry.sourceLabel : null,
        windows: shown,
      },
    ];
  });
}
