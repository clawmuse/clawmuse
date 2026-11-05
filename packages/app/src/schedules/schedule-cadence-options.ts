import type { TFunction } from "i18next";
import { i18n } from "@/i18n/i18next";
import type { ScheduleCadence } from "@getpaseo/protocol/schedule/types";
import { everyMsToParts } from "@/utils/schedule-format";

type CronCadence = Extract<ScheduleCadence, { type: "cron" }>;

export interface CadencePresetOption {
  id: string;
  labelKey: string;
  expression: string;
}

export const CUSTOM_CRON_PRESET_ID = "custom";

export const CADENCE_PRESET_OPTIONS: CadencePresetOption[] = [
  {
    id: "every-minute",
    labelKey: "schedules.cadence.presets.every-minute",
    expression: "* * * * *",
  },
  { id: "every-hour", labelKey: "schedules.cadence.presets.every-hour", expression: "0 * * * *" },
  { id: "daily-9", labelKey: "schedules.cadence.presets.daily-9", expression: "0 9 * * *" },
  { id: "weekdays-9", labelKey: "schedules.cadence.presets.weekdays-9", expression: "0 9 * * 1-5" },
  { id: "mondays-9", labelKey: "schedules.cadence.presets.mondays-9", expression: "0 9 * * 1" },
];

export function resolveCronPresetId(cadence: CronCadence): string {
  const expression = cadence.expression.trim();
  return (
    CADENCE_PRESET_OPTIONS.find((option) => option.expression === expression)?.id ??
    CUSTOM_CRON_PRESET_ID
  );
}

export function resolveCronPresetDisplay(
  cadence: CronCadence,
  t: TFunction = i18n.t,
): { label: string } {
  const preset = CADENCE_PRESET_OPTIONS.find(
    (option) => option.id === resolveCronPresetId(cadence),
  );
  return { label: t(preset?.labelKey ?? "schedules.cadence.presets.custom") };
}

export function normalizeScheduleFormCadence(
  cadence: ScheduleCadence,
  timezone: string,
): CronCadence {
  if (cadence.type === "cron") {
    return { ...cadence, timezone: cadence.timezone ?? timezone };
  }

  return {
    type: "cron",
    expression: everyMsToCronExpression(cadence.everyMs),
    timezone,
  };
}

function everyMsToCronExpression(everyMs: number): string {
  const { value, unit } = everyMsToParts(everyMs);
  if (unit === "minutes") {
    return value === 1 ? "* * * * *" : `*/${Math.min(value, 59)} * * * *`;
  }
  if (unit === "hours") {
    return value === 1 ? "0 * * * *" : `0 */${Math.min(value, 23)} * * *`;
  }
  return value === 1 ? "0 9 * * *" : `0 9 */${Math.min(value, 31)} * *`;
}
