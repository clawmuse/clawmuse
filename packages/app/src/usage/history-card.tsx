import type { UsageDailyHistory } from "@getpaseo/protocol/messages";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { settingsStyles } from "@/styles/settings";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";
import {
  buildWidgetLocalizedStrings,
  mergeWidgetUsageHistories,
  toWidgetUsageHistory,
  type MobileUsageWidgetDay,
  type MobileUsageWidgetSnapshot,
} from "@/widgets/usage-widget-sync";

function sumDayTokens(day: MobileUsageWidgetDay): number {
  return (day.tokens[0] ?? 0) + (day.tokens[1] ?? 0) + (day.tokens[2] ?? 0);
}

function sumDayMoney(day: MobileUsageWidgetDay): number {
  return (day.money[0] ?? 0) + (day.money[1] ?? 0) + (day.money[2] ?? 0);
}

function hasDayCost(day: MobileUsageWidgetDay): boolean {
  return day.costAvailable ?? sumDayMoney(day) > 0;
}

export function formatHistoryTokens(value: number): string {
  const millions = value / 1_000_000;
  if (millions >= 1000) return `${(millions / 1000).toFixed(1)}B`;
  if (millions >= 1) return `${Math.round(millions)}M`;
  if (value >= 1000) return `${Math.round(value / 1000)}K`;
  return `${Math.round(Math.max(0, value))}`;
}

export function formatChineseTokenHint(value: number): string | null {
  if (!Number.isFinite(value) || value < 10_000) return null;
  if (value >= 100_000_000) {
    const yi = value / 100_000_000;
    if (yi >= 100) return `${Math.round(yi)}亿`;
    return `${yi.toFixed(1).replace(/\.0$/u, "")}亿`;
  }
  const wan = value / 10_000;
  if (wan >= 10) return `${Math.round(wan)}万`;
  return `${wan.toFixed(1).replace(/\.0$/u, "")}万`;
}

export function formatHistoryTokenUnit(value: number, tokenUnit: string, isZh: boolean): string {
  if (!isZh) return tokenUnit;
  const hint = formatChineseTokenHint(value);
  return hint ? `${tokenUnit}（${hint}）` : tokenUnit;
}

export function formatHistoryModelTokens(value: number, isZh: boolean): string {
  const base = formatHistoryTokens(value);
  if (!isZh) return base;
  const hint = formatChineseTokenHint(value);
  return hint ? `${base}（${hint}）` : base;
}

function formatHistoryMoney(value: number, symbol = "$"): string {
  if (value >= 10_000) return `${symbol}${(value / 1000).toFixed(1)}k`;
  if (value >= 100) return `${symbol}${Math.round(value).toLocaleString("en-US")}`;
  return `${symbol}${value.toFixed(2)}`;
}

export function formatHistoryReportedCost(
  days: readonly MobileUsageWidgetDay[],
  strings: Readonly<Record<string, string>>,
): string {
  const usedDays = days.filter((day) => sumDayTokens(day) > 0 || hasDayCost(day));
  if (usedDays.length === 0 || !usedDays.every((day) => hasDayCost(day))) {
    return strings.noCostData ?? "Cost unavailable";
  }
  let total = 0;
  for (const day of usedDays) {
    total += sumDayMoney(day);
  }
  return `${strings.reportedCost ?? "Reported cost"} ${formatHistoryMoney(total)}`;
}

interface RankedModelRow {
  key: string;
  label: string;
  tokens: number;
  sharePercent: number;
  slotIndex: number;
}

interface RawBreakdownRow {
  key: string;
  label: string;
  tokens: number;
  slotIndex: number;
}

function sumModelIndexTokens(daily: readonly MobileUsageWidgetDay[], index: number): number {
  let sum = 0;
  for (const day of daily) {
    sum += day.modelTokens?.[index] ?? 0;
  }
  return sum;
}

function collectRawBreakdownRows(
  usage: MobileUsageWidgetSnapshot["usage"],
  strings: Readonly<Record<string, string>>,
  otherLabel: string,
): RawBreakdownRow[] {
  const models = usage.models;
  const hasModelTokens =
    Boolean(models && models.length > 0) &&
    usage.daily.every((day) => day.modelTokens?.length === (models?.length ?? 0) + 1);

  const rawRows: RawBreakdownRow[] = [];
  if (hasModelTokens && models) {
    for (let m = 0; m < models.length; m += 1) {
      const sum = sumModelIndexTokens(usage.daily, m);
      if (sum > 0) {
        rawRows.push({
          key: `model:${models[m]?.harness}:${models[m]?.name}`,
          label: models[m]?.name ?? "",
          tokens: sum,
          slotIndex: m,
        });
      }
    }
    const otherSum = sumModelIndexTokens(usage.daily, models.length);
    if (otherSum > 0) {
      rawRows.push({
        key: "model:other",
        label: otherLabel,
        tokens: otherSum,
        slotIndex: 5,
      });
    }
    return rawRows;
  }

  const harnessKeys = ["claude-code", "codex", "pi"] as const;
  for (let h = 0; h < 3; h += 1) {
    let sum = 0;
    for (const day of usage.daily) {
      sum += day.tokens[h] ?? 0;
    }
    if (sum > 0) {
      const harnessId = harnessKeys[h]!;
      rawRows.push({
        key: `harness:${harnessId}`,
        label: strings[`harness.${harnessId}`] ?? harnessId,
        tokens: sum,
        slotIndex: h,
      });
    }
  }
  return rawRows;
}

function computeRankedModelRows(
  usage: MobileUsageWidgetSnapshot["usage"],
  totalTokens: number,
  strings: Readonly<Record<string, string>>,
  otherLabel: string,
): RankedModelRow[] {
  if (totalTokens <= 0) return [];
  const rawRows = collectRawBreakdownRows(usage, strings, otherLabel);
  rawRows.sort((a, b) => b.tokens - a.tokens);
  const limit = 4;
  const finalRows =
    rawRows.length <= limit
      ? rawRows
      : [
          ...rawRows.slice(0, limit - 1),
          {
            key: "merged:other",
            label: otherLabel,
            tokens: rawRows.slice(limit - 1).reduce((acc, item) => acc + item.tokens, 0),
            slotIndex: 5,
          },
        ];

  return finalRows.map((row) => ({
    key: row.key,
    label: row.label,
    tokens: row.tokens,
    sharePercent: Math.max(1, Math.round((row.tokens / totalTokens) * 100)),
    slotIndex: row.slotIndex,
  }));
}

export function UsageHistoryCard({
  histories,
  scope,
  testID = "usage-history-card",
}: {
  histories: readonly (UsageDailyHistory | undefined)[];
  scope: "all" | "local";
  testID?: string;
}) {
  const { i18n } = useTranslation();
  const locale = i18n.language || "en";
  const isZh = locale.toLowerCase().startsWith("zh");
  const strings = useMemo(() => buildWidgetLocalizedStrings(locale), [locale]);
  const otherLabel = isZh ? "其他" : "Other";

  const mergedUsage = useMemo(
    () =>
      mergeWidgetUsageHistories(
        histories.map((item) => toWidgetUsageHistory(item, scope)),
        scope,
      ),
    [histories, scope],
  );

  const scopeLabel =
    scope === "local"
      ? (strings.monthScopeLocal ?? "Last 30 days · This computer")
      : (strings.monthScopeAll ?? "Last 30 days · All devices");

  if (mergedUsage.days.length === 0 || mergedUsage.daily.length === 0) {
    return (
      <View style={[settingsStyles.card, styles.card]} testID={testID}>
        <View style={styles.headerRow}>
          <Text style={styles.scopeText}>{scopeLabel}</Text>
        </View>
        <Text style={styles.emptyTitle} testID="usage-history-empty-title">
          {strings.noHistoryTitle}
        </Text>
        <Text style={styles.emptyBody}>{strings.noHistoryBody}</Text>
      </View>
    );
  }

  const daily = mergedUsage.daily;
  const days = mergedUsage.days;
  const todayEntry = daily[daily.length - 1]!;
  const todayDate = days[days.length - 1] ?? "";
  const firstDate = days[0] ?? "";
  const todayTokens = sumDayTokens(todayEntry);
  let totalTokens = 0;
  let peakTokens = 1;
  for (const day of daily) {
    const t = sumDayTokens(day);
    totalTokens += t;
    if (t > peakTokens) peakTokens = t;
  }
  const averageTokens = totalTokens / daily.length;
  const todayCostLabel = formatHistoryReportedCost([todayEntry], strings);
  const monthCostLabel = formatHistoryReportedCost(daily, strings);
  const modelRows = computeRankedModelRows(mergedUsage, totalTokens, strings, otherLabel);
  const baseTokenUnit = strings.tokenUnit ?? "tokens";

  return (
    <View style={[settingsStyles.card, styles.card]} testID={testID}>
      <View style={styles.headerRow}>
        <Text style={styles.scopeText} testID="usage-history-scope">
          {scopeLabel}
        </Text>
        <Text style={styles.metaText} testID="usage-history-average">
          {`${strings.dailyAverage} ${formatHistoryTokens(averageTokens)} ${formatHistoryTokenUnit(averageTokens, baseTokenUnit, isZh)}`}
        </Text>
      </View>

      <View style={styles.summaryGrid}>
        <View style={styles.summaryColumn}>
          <Text style={styles.summaryCaption}>{`${strings.today} · ${todayDate}`}</Text>
          <View style={styles.figureRow}>
            <Text style={styles.figureValue} testID="usage-history-today-tokens">
              {formatHistoryTokens(todayTokens)}
            </Text>
            <Text style={styles.figureUnit}>
              {formatHistoryTokenUnit(todayTokens, baseTokenUnit, isZh)}
            </Text>
          </View>
          <Text style={styles.costText} testID="usage-history-today-cost">
            {todayCostLabel}
          </Text>
        </View>

        <View style={styles.summaryColumn}>
          <Text style={styles.summaryCaption}>{scopeLabel.split(" · ")[0] ?? scopeLabel}</Text>
          <View style={styles.figureRow}>
            <Text style={styles.figureValue} testID="usage-history-month-tokens">
              {formatHistoryTokens(totalTokens)}
            </Text>
            <Text style={styles.figureUnit}>
              {formatHistoryTokenUnit(totalTokens, baseTokenUnit, isZh)}
            </Text>
          </View>
          <Text style={styles.costText} testID="usage-history-month-cost">
            {monthCostLabel}
          </Text>
        </View>
      </View>

      <View style={styles.chartContainer} testID="usage-history-bars">
        {daily.map((day, idx) => {
          const dayTokens = sumDayTokens(day);
          const ratio = dayTokens > 0 ? Math.max(0.06, dayTokens / peakTokens) : 0.03;
          const barHeight = Math.round(ratio * 56);
          const isLast = idx === daily.length - 1;
          return (
            <View key={days[idx] ?? idx} style={styles.barSlot}>
              <View
                style={[
                  styles.barFill,
                  isLast ? styles.barFillToday : styles.barFillPast,
                  inlineUnistylesStyle({ height: barHeight }),
                ]}
              />
            </View>
          );
        })}
      </View>

      <View style={styles.axisRow}>
        <Text style={styles.axisText}>{firstDate}</Text>
        <Text style={styles.axisText}>{strings.today}</Text>
      </View>

      {modelRows.length > 0 ? (
        <View style={styles.modelsContainer} testID="usage-history-models">
          {modelRows.map((row) => (
            <View key={row.key} style={styles.modelRow}>
              <Text style={styles.modelName} numberOfLines={1}>
                {row.label}
              </Text>
              <Text style={styles.modelValue}>
                {`${formatHistoryModelTokens(row.tokens, isZh)} (${row.sharePercent}%)`}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  scopeText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
  metaText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  summaryGrid: {
    flexDirection: "row",
    gap: theme.spacing[4],
  },
  summaryColumn: {
    flex: 1,
    gap: theme.spacing[0.5],
  },
  summaryCaption: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  figureRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: theme.spacing[1.5],
  },
  figureValue: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.semibold,
    fontVariant: ["tabular-nums"],
  },
  figureUnit: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  costText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  chartContainer: {
    height: 60,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
    paddingTop: theme.spacing[1],
  },
  barSlot: {
    flex: 1,
    height: 56,
    justifyContent: "flex-end",
  },
  barFill: {
    width: "100%",
    borderRadius: 2,
  },
  barFillToday: {
    backgroundColor: theme.colors.statusSuccess,
  },
  barFillPast: {
    backgroundColor: theme.colors.foregroundMuted,
    opacity: 0.45,
  },
  axisRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  axisText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  modelsContainer: {
    paddingTop: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: theme.spacing[1.5],
  },
  modelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  modelName: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  modelValue: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  emptyTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  emptyBody: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
