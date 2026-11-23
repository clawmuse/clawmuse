import type { UsageDailyHistory } from "@getpaseo/protocol/messages";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { X } from "@/components/icons/app-icons";
import { Button } from "@/components/ui/button";
import { PressHighlight } from "@/components/ui/press-highlight";
import { SegmentedControl, type SegmentedControlOption } from "@/components/ui/segmented-control";
import { settingsStyles } from "@/styles/settings";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";
import {
  BREAKDOWN_COLORS,
  buildUsageHistoryViewModel,
  formatChineseTokenHint,
  formatHistoryModelTokens,
  formatHistoryReportedCost,
  formatHistoryTokens,
  formatHistoryTokenUnit,
  type HistoryBreakdownTab,
  type HistoryChartDay,
  type HistoryDayDetail,
  type HistoryHarnessBreakdownRow,
  type HistoryHostBreakdownRow,
  type HistoryModelBreakdownRow,
  type HistoryRangeDays,
  type HostDailyHistoryEntry,
  type TokenComposition,
  type UsageHistoryHarness,
  type UsageHistoryViewModel,
} from "./history-model";

export {
  formatChineseTokenHint,
  formatHistoryModelTokens,
  formatHistoryReportedCost,
  formatHistoryTokens,
  formatHistoryTokenUnit,
  type HostDailyHistoryEntry,
};

const CHART_MAX_BAR_HEIGHT = 76;
const SELECTED_STATE = { selected: true } as const;
const UNSELECTED_STATE = { selected: false } as const;

function selectionState(selected: boolean) {
  return selected ? SELECTED_STATE : UNSELECTED_STATE;
}

function formatCacheReadLegendLabel(cacheHitPercent: number | null, isZh: boolean): string {
  const base = isZh ? "缓存命中" : "Cache read";
  return cacheHitPercent !== null ? `${base} (${cacheHitPercent}%)` : base;
}

function resolveDaySecondaryText(detail: HistoryDayDetail, isZh: boolean): string {
  if (detail.hasReportedCost) return detail.costLabel;
  return formatCompactCompositionLine(detail.composition, isZh) ?? detail.costLabel;
}

function resolveBreakdownHint(activeTab: HistoryBreakdownTab, isZh: boolean): string {
  if (!isZh) return "Tap to filter";
  return activeTab === "hosts" ? "点击切换电脑" : "点击筛选趋势";
}

function formatCompactCompositionLine(comp: TokenComposition, isZh: boolean): string | null {
  if (!comp.available) return null;
  const parts: string[] = [];
  if (comp.inputTokens > 0) {
    parts.push(`${isZh ? "输入" : "In"} ${formatHistoryTokens(comp.inputTokens)}`);
  }
  if (comp.cacheReadTokens > 0) {
    const hit = comp.cacheHitPercent !== null ? ` (${comp.cacheHitPercent}%)` : "";
    parts.push(`${isZh ? "缓存" : "Cache"} ${formatHistoryTokens(comp.cacheReadTokens)}${hit}`);
  }
  if (comp.cacheWriteTokens > 0) {
    parts.push(`${isZh ? "缓存写" : "Write"} ${formatHistoryTokens(comp.cacheWriteTokens)}`);
  }
  if (comp.outputTokens > 0) {
    parts.push(`${isZh ? "输出" : "Out"} ${formatHistoryTokens(comp.outputTokens)}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function TokenCompositionStrip({
  composition,
  isZh,
  testID = "usage-history-composition",
}: {
  composition: TokenComposition;
  isZh: boolean;
  testID?: string;
}) {
  if (!composition.available) return null;
  const total =
    composition.inputTokens +
    composition.cacheReadTokens +
    composition.cacheWriteTokens +
    composition.outputTokens;
  if (total <= 0) return null;

  const parts = [
    {
      key: "input",
      label: isZh ? "输入" : "Input",
      value: composition.inputTokens,
      color: BREAKDOWN_COLORS.input,
    },
    {
      key: "cacheRead",
      label: formatCacheReadLegendLabel(composition.cacheHitPercent, isZh),
      value: composition.cacheReadTokens,
      color: BREAKDOWN_COLORS.cacheRead,
    },
    {
      key: "cacheWrite",
      label: isZh ? "缓存写入" : "Cache write",
      value: composition.cacheWriteTokens,
      color: BREAKDOWN_COLORS.cacheWrite,
    },
    {
      key: "output",
      label: isZh ? "输出" : "Output",
      value: composition.outputTokens,
      color: BREAKDOWN_COLORS.output,
    },
  ].filter((part) => part.value > 0);

  if (parts.length === 0) return null;

  return (
    <View style={styles.compositionContainer} testID={testID}>
      <View style={styles.compositionTrack}>
        {parts.map((part) => (
          <View
            key={part.key}
            style={[
              styles.compositionBarSegment,
              inlineUnistylesStyle({
                flexGrow: Math.max(part.value / total, 0.015),
                backgroundColor: part.color,
              }),
            ]}
          />
        ))}
      </View>
      <View style={styles.compositionLegend}>
        {parts.map((part) => (
          <View key={part.key} style={styles.compositionLegendItem}>
            <View
              style={[styles.colorDot, inlineUnistylesStyle({ backgroundColor: part.color })]}
            />
            <Text style={styles.compositionLegendLabel}>{part.label}</Text>
            <Text style={styles.compositionLegendValue}>{formatHistoryTokens(part.value)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function StackedHistoryChartBar({
  day,
  peakTokens,
  isSelected,
  tokenUnit,
  onToggle,
}: {
  day: HistoryChartDay;
  peakTokens: number;
  isSelected: boolean;
  tokenUnit: string;
  onToggle: (date: string) => void;
}) {
  const handleToggle = useCallback(() => onToggle(day.date), [onToggle, day.date]);
  const totalHeight =
    day.tokens > 0 ? Math.max(4, Math.round((day.tokens / peakTokens) * CHART_MAX_BAR_HEIGHT)) : 2;
  const label = `${day.date} · ${formatHistoryTokens(day.tokens)} ${tokenUnit}`;

  return (
    <PressHighlight
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={handleToggle}
      style={styles.barSlot}
      testID={`usage-history-bar-${day.date}`}
    >
      {day.tokens <= 0 ? (
        <View
          style={[
            styles.barEmpty,
            isSelected && styles.barSelectedOutline,
            inlineUnistylesStyle({ height: 2 }),
          ]}
        />
      ) : (
        <View
          style={[
            styles.barColumn,
            day.isToday || isSelected ? styles.barColumnStrong : styles.barColumnPast,
            isSelected && styles.barSelectedOutline,
            inlineUnistylesStyle({ height: totalHeight }),
          ]}
        >
          {day.segments.length > 0 ? (
            day.segments.map((segment) => (
              <View
                key={segment.key}
                style={[
                  styles.barSegment,
                  segment.color === null && styles.barSegmentTail,
                  inlineUnistylesStyle({
                    flexGrow: segment.tokens,
                    ...(segment.color !== null ? { backgroundColor: segment.color } : {}),
                  }),
                ]}
              />
            ))
          ) : (
            <View
              style={[
                styles.barSegment,
                day.isToday ? styles.barFallbackToday : styles.barFallbackPast,
                inlineUnistylesStyle({ flexGrow: 1 }),
              ]}
            />
          )}
        </View>
      )}
    </PressHighlight>
  );
}

function ModelBreakdownRowItem({
  row,
  isZh,
  selected,
  showHostHint,
  onToggle,
}: {
  row: HistoryModelBreakdownRow;
  isZh: boolean;
  selected: boolean;
  showHostHint: boolean;
  onToggle?: (key: string) => void;
}) {
  const handlePress = useCallback(() => onToggle?.(row.key), [onToggle, row.key]);
  const compLine = formatCompactCompositionLine(row.composition, isZh);
  const hostSuffix = showHostHint && row.hostLabels.length > 0 ? row.hostLabels.join(", ") : null;

  const content = (
    <View style={[styles.breakdownRow, selected && styles.breakdownRowSelected]}>
      <View style={styles.breakdownTopLine}>
        <View style={styles.breakdownLabelGroup}>
          <View style={[styles.colorDot, inlineUnistylesStyle({ backgroundColor: row.color })]} />
          <Text style={styles.modelName} numberOfLines={1}>
            {row.name}
          </Text>
          {row.harnessLabel ? (
            <View style={styles.tagPill}>
              <Text style={styles.tagPillText} numberOfLines={1}>
                {row.harnessLabel}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.modelValue}>
          {`${formatHistoryModelTokens(row.tokens, isZh)} (${row.shareLabel})`}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            inlineUnistylesStyle({
              width: `${Math.round(row.barRatio * 100)}%` as `${number}%`,
              backgroundColor: row.color,
            }),
          ]}
        />
      </View>
      {compLine || hostSuffix ? (
        <View style={styles.breakdownSubRow}>
          {compLine ? (
            <Text style={styles.breakdownSubText} numberOfLines={1}>
              {compLine}
            </Text>
          ) : null}
          {hostSuffix ? (
            <Text style={styles.breakdownSubMeta} numberOfLines={1}>
              {hostSuffix}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  if (!onToggle) return content;

  return (
    <PressHighlight
      accessibilityRole="button"
      accessibilityState={selectionState(selected)}
      onPress={handlePress}
      style={styles.rowPressable}
      highlightStyle={styles.rowPressed}
      testID={`usage-history-model-row-${row.key}`}
    >
      {content}
    </PressHighlight>
  );
}

function HarnessBreakdownRowItem({
  row,
  isZh,
  selected,
  onToggle,
}: {
  row: HistoryHarnessBreakdownRow;
  isZh: boolean;
  selected: boolean;
  onToggle: (harness: UsageHistoryHarness) => void;
}) {
  const handlePress = useCallback(() => onToggle(row.harness), [onToggle, row.harness]);
  const compLine = formatCompactCompositionLine(row.composition, isZh);
  const modelsText = isZh ? `${row.modelCount} 个模型` : `${row.modelCount} models`;

  return (
    <PressHighlight
      accessibilityRole="button"
      accessibilityState={selectionState(selected)}
      onPress={handlePress}
      style={styles.rowPressable}
      highlightStyle={styles.rowPressed}
      testID={`usage-history-harness-row-${row.harness}`}
    >
      <View style={[styles.breakdownRow, selected && styles.breakdownRowSelected]}>
        <View style={styles.breakdownTopLine}>
          <View style={styles.breakdownLabelGroup}>
            <View style={[styles.colorDot, inlineUnistylesStyle({ backgroundColor: row.color })]} />
            <Text style={styles.modelName} numberOfLines={1}>
              {row.label}
            </Text>
            <View style={styles.tagPill}>
              <Text style={styles.tagPillText}>{modelsText}</Text>
            </View>
          </View>
          <Text style={styles.modelValue}>
            {`${formatHistoryModelTokens(row.tokens, isZh)} (${row.shareLabel})`}
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              inlineUnistylesStyle({
                width: `${Math.round(row.barRatio * 100)}%` as `${number}%`,
                backgroundColor: row.color,
              }),
            ]}
          />
        </View>
        {compLine ? (
          <Text style={styles.breakdownSubText} numberOfLines={1}>
            {compLine}
          </Text>
        ) : null}
      </View>
    </PressHighlight>
  );
}

function HostBreakdownRowItem({
  row,
  isZh,
  onToggle,
}: {
  row: HistoryHostBreakdownRow;
  isZh: boolean;
  onToggle?: (serverId: string) => void;
}) {
  const handlePress = useCallback(() => onToggle?.(row.serverId), [onToggle, row.serverId]);
  const subParts: string[] = [];
  if (row.todayTokens > 0) {
    subParts.push(`${isZh ? "今天" : "Today"} ${formatHistoryTokens(row.todayTokens)}`);
  }
  if (row.topModel) {
    subParts.push(`${isZh ? "主力" : "Top"} ${row.topModel}`);
  }

  const content = (
    <View style={[styles.breakdownRow, !row.selected && styles.breakdownRowDimmed]}>
      <View style={styles.breakdownTopLine}>
        <View style={styles.breakdownLabelGroup}>
          <View style={[styles.colorDot, inlineUnistylesStyle({ backgroundColor: row.color })]} />
          <Text style={styles.modelName} numberOfLines={1}>
            {row.label}
          </Text>
        </View>
        <Text style={styles.modelValue}>
          {`${formatHistoryModelTokens(row.tokens, isZh)} (${row.shareLabel})`}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            inlineUnistylesStyle({
              width: `${Math.round(row.barRatio * 100)}%` as `${number}%`,
              backgroundColor: row.color,
            }),
          ]}
        />
      </View>
      {subParts.length > 0 ? (
        <Text style={styles.breakdownSubText} numberOfLines={1}>
          {subParts.join(" · ")}
        </Text>
      ) : null}
    </View>
  );

  if (!onToggle) return content;

  return (
    <PressHighlight
      accessibilityRole="button"
      accessibilityState={selectionState(row.selected)}
      onPress={handlePress}
      style={styles.rowPressable}
      highlightStyle={styles.rowPressed}
      testID={`usage-history-host-row-${row.serverId}`}
    >
      {content}
    </PressHighlight>
  );
}

function HostSubFilterChip({
  serverId,
  label,
  color,
  tokens,
  selected,
  onToggle,
}: {
  serverId: string;
  label: string;
  color: string;
  tokens: number;
  selected: boolean;
  onToggle: (serverId: string) => void;
}) {
  const handlePress = useCallback(() => onToggle(serverId), [onToggle, serverId]);
  return (
    <PressHighlight
      accessibilityRole="button"
      accessibilityState={selectionState(selected)}
      onPress={handlePress}
      style={[styles.filterChip, selected && styles.filterChipSelected]}
      highlightStyle={styles.filterChipPressed}
      testID={`usage-history-host-chip-${serverId}`}
    >
      <View style={[styles.colorDot, inlineUnistylesStyle({ backgroundColor: color })]} />
      <Text
        style={[styles.filterChipText, selected && styles.filterChipTextSelected]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {tokens > 0 ? (
        <Text style={styles.filterChipCount}>{formatHistoryTokens(tokens)}</Text>
      ) : null}
    </PressHighlight>
  );
}

function UsageHistoryHostChips({
  hosts,
  availableHostCount,
  selectedHostIds,
  isZh,
  onSelectAll,
  onToggleHost,
}: {
  hosts: readonly HistoryHostBreakdownRow[];
  availableHostCount: number;
  selectedHostIds: readonly string[];
  isZh: boolean;
  onSelectAll: () => void;
  onToggleHost: (serverId: string) => void;
}) {
  if (availableHostCount <= 1) return null;
  const isAll = selectedHostIds.length === 0;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.hostChipsTrack}
      testID="usage-history-host-chips"
    >
      <PressHighlight
        accessibilityRole="button"
        accessibilityState={selectionState(isAll)}
        onPress={onSelectAll}
        style={[styles.filterChip, isAll && styles.filterChipSelected]}
        highlightStyle={styles.filterChipPressed}
        testID="usage-history-host-chip-all"
      >
        <Text style={[styles.filterChipText, isAll && styles.filterChipTextSelected]}>
          {isZh ? `全部 (${availableHostCount})` : `All (${availableHostCount})`}
        </Text>
      </PressHighlight>
      {hosts.map((host) => (
        <HostSubFilterChip
          key={host.serverId}
          serverId={host.serverId}
          label={host.label}
          color={host.color}
          tokens={host.tokens}
          selected={!isAll && host.selected}
          onToggle={onToggleHost}
        />
      ))}
    </ScrollView>
  );
}

function DayDetailPanel({
  detail,
  isZh,
  tokenUnit,
  closeLabel,
  onClose,
}: {
  detail: HistoryDayDetail;
  isZh: boolean;
  tokenUnit: string;
  closeLabel: string;
  onClose: () => void;
}) {
  const secondaryText = resolveDaySecondaryText(detail, isZh);

  return (
    <View style={styles.dayPanel} testID="usage-history-day-detail">
      <View style={styles.dayHeaderRow}>
        <Text style={styles.dayCaption}>{detail.caption}</Text>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={X}
          accessibilityLabel={closeLabel}
          onPress={onClose}
          testID="usage-history-day-close"
        />
      </View>
      <View style={styles.figureRow}>
        <Text style={styles.figureValue} testID="usage-history-day-tokens">
          {formatHistoryTokens(detail.tokens)}
        </Text>
        <Text style={styles.figureUnit}>
          {formatHistoryTokenUnit(detail.tokens, tokenUnit, isZh)}
        </Text>
      </View>
      <Text style={styles.costText} testID="usage-history-day-cost">
        {secondaryText}
      </Text>
      {detail.hosts.length > 1 ? (
        <View style={styles.daySubSection} testID="usage-history-day-hosts">
          <Text style={styles.daySubHeading}>{isZh ? "按电脑" : "By computer"}</Text>
          {detail.hosts.map((hostRow) => (
            <HostBreakdownRowItem key={hostRow.serverId} row={hostRow} isZh={isZh} />
          ))}
        </View>
      ) : null}
      {detail.models.length > 0 ? (
        <View style={styles.dayModels}>
          {detail.hosts.length > 1 ? (
            <Text style={styles.daySubHeading}>{isZh ? "按模型" : "By model"}</Text>
          ) : null}
          {detail.models.map((row) => (
            <ModelBreakdownRowItem
              key={row.key}
              row={row}
              isZh={isZh}
              selected={false}
              showHostHint={false}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function UsageHistoryBreakdownSection({
  model,
  activeTab,
  tabOptions,
  selectedModelKey,
  selectedHarness,
  isZh,
  onTabChange,
  onToggleModel,
  onToggleHarness,
  onToggleHost,
}: {
  model: UsageHistoryViewModel;
  activeTab: HistoryBreakdownTab;
  tabOptions: SegmentedControlOption<HistoryBreakdownTab>[];
  selectedModelKey: string | null;
  selectedHarness: UsageHistoryHarness | "all";
  isZh: boolean;
  onTabChange: (tab: HistoryBreakdownTab) => void;
  onToggleModel: (key: string) => void;
  onToggleHarness: (harness: UsageHistoryHarness) => void;
  onToggleHost: (serverId: string) => void;
}) {
  if (model.models.length === 0 && model.harnesses.length === 0 && model.hosts.length <= 1) {
    return null;
  }
  return (
    <View style={styles.breakdownContainer}>
      <View style={styles.breakdownHeader}>
        <SegmentedControl
          size="sm"
          options={tabOptions}
          value={activeTab}
          onValueChange={onTabChange}
          testID="usage-history-tabs"
        />
        <Text style={styles.breakdownHint}>{resolveBreakdownHint(activeTab, isZh)}</Text>
      </View>

      {activeTab === "models" ? (
        <View style={styles.breakdownList} testID="usage-history-models">
          {model.models.map((row) => (
            <ModelBreakdownRowItem
              key={row.key}
              row={row}
              isZh={isZh}
              selected={selectedModelKey === row.key}
              showHostHint={model.selectedHostCount > 1}
              onToggle={onToggleModel}
            />
          ))}
        </View>
      ) : null}

      {activeTab === "harnesses" ? (
        <View style={styles.breakdownList} testID="usage-history-harnesses">
          {model.harnesses.map((row) => (
            <HarnessBreakdownRowItem
              key={row.harness}
              row={row}
              isZh={isZh}
              selected={selectedHarness === row.harness}
              onToggle={onToggleHarness}
            />
          ))}
        </View>
      ) : null}

      {activeTab === "hosts" ? (
        <View style={styles.breakdownList} testID="usage-history-hosts">
          {model.hosts.map((row) => (
            <HostBreakdownRowItem
              key={row.serverId}
              row={row}
              isZh={isZh}
              onToggle={onToggleHost}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function UsageHistorySummaryAndChart({
  model,
  isZh,
  baseTokenUnit,
  onToggleDay,
}: {
  model: UsageHistoryViewModel;
  isZh: boolean;
  baseTokenUnit: string;
  onToggleDay: (date: string) => void;
}) {
  const todaySecondary = model.todayHasReportedCost
    ? model.todayCostLabel
    : (formatCompactCompositionLine(model.todayComposition, isZh) ?? model.todayCostLabel);
  const activeDaysText = isZh
    ? `活跃 ${model.activeDaysCount}/${model.windowDaysCount} 天`
    : `${model.activeDaysCount}/${model.windowDaysCount} active days`;
  const rangeSecondary = model.rangeHasReportedCost ? model.rangeCostLabel : activeDaysText;
  const averageLineOffset =
    model.dailyAverageTokens > 0
      ? Math.max(
          2,
          Math.min(
            CHART_MAX_BAR_HEIGHT - 2,
            Math.round((model.dailyAverageTokens / model.peakTokens) * CHART_MAX_BAR_HEIGHT),
          ),
        )
      : null;

  return (
    <>
      <View style={styles.summaryGrid}>
        <View style={styles.summaryColumn}>
          <Text style={styles.summaryCaption}>{model.todayCaption}</Text>
          <View style={styles.figureRow}>
            <Text style={styles.figureValue} testID="usage-history-today-tokens">
              {formatHistoryTokens(model.todayTokens)}
            </Text>
            <Text style={styles.figureUnit}>
              {formatHistoryTokenUnit(model.todayTokens, baseTokenUnit, isZh)}
            </Text>
          </View>
          <Text style={styles.costText} numberOfLines={1} testID="usage-history-today-cost">
            {todaySecondary}
          </Text>
        </View>

        <View style={styles.summaryColumn}>
          <Text style={styles.summaryCaption}>{model.rangeCaption}</Text>
          <View style={styles.figureRow}>
            <Text style={styles.figureValue} testID="usage-history-month-tokens">
              {formatHistoryTokens(model.rangeTotalTokens)}
            </Text>
            <Text style={styles.figureUnit}>
              {formatHistoryTokenUnit(model.rangeTotalTokens, baseTokenUnit, isZh)}
            </Text>
          </View>
          <Text style={styles.costText} numberOfLines={1} testID="usage-history-month-cost">
            {rangeSecondary}
          </Text>
        </View>
      </View>

      <TokenCompositionStrip composition={model.rangeComposition} isZh={isZh} />

      <View style={styles.chartMetaRow}>
        <Text style={styles.metaText} testID="usage-history-average">
          {`${model.strings.dailyAverage} ${formatHistoryTokens(model.dailyAverageTokens)} ${formatHistoryTokenUnit(model.dailyAverageTokens, baseTokenUnit, isZh)}`}
        </Text>
        {model.peakDay ? (
          <Text style={styles.metaText} testID="usage-history-peak">
            {`${isZh ? "峰值" : "Peak"} ${formatHistoryTokens(model.peakDay.tokens)}`}
          </Text>
        ) : null}
      </View>

      <View style={styles.chartFrame}>
        {averageLineOffset !== null ? (
          <View
            pointerEvents="none"
            style={[styles.averageLine, inlineUnistylesStyle({ bottom: averageLineOffset })]}
          />
        ) : null}
        <View style={styles.chartContainer} testID="usage-history-bars">
          {model.chartDays.map((day, idx) => (
            <StackedHistoryChartBar
              key={day.date}
              day={day}
              peakTokens={model.peakTokens}
              isSelected={idx === model.selectedDayIndex}
              tokenUnit={baseTokenUnit}
              onToggle={onToggleDay}
            />
          ))}
        </View>
      </View>

      <View style={styles.axisRow}>
        <Text style={styles.axisText}>{model.firstDate}</Text>
        <Text style={styles.axisText}>
          {model.lastDateIsActualToday ? model.strings.today : model.lastDate}
        </Text>
      </View>
    </>
  );
}

export function UsageHistoryCard({
  histories,
  hostHistories,
  scope,
  testID = "usage-history-card",
}: {
  histories?: readonly (UsageDailyHistory | undefined)[];
  hostHistories?: readonly HostDailyHistoryEntry[];
  scope: "all" | "local";
  testID?: string;
}) {
  const { t, i18n } = useTranslation();
  const [rangeDays, setRangeDays] = useState<HistoryRangeDays>(30);
  const [selectedHostIds, setSelectedHostIds] = useState<string[]>([]);
  const [selectedHarness, setSelectedHarness] = useState<UsageHistoryHarness | "all">("all");
  const [selectedModelKey, setSelectedModelKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<HistoryBreakdownTab>("models");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const locale = i18n.language || "en";
  const isZh = locale.toLowerCase().startsWith("zh");

  const resolvedHosts = useMemo<readonly HostDailyHistoryEntry[]>(() => {
    if (hostHistories && hostHistories.length > 0) return hostHistories;
    return (histories ?? []).map((dailyUsage, idx) => ({
      serverId: `__host_${idx}`,
      label: `__host_${idx}`,
      dailyUsage,
    }));
  }, [histories, hostHistories]);

  const effectiveTab: HistoryBreakdownTab =
    activeTab === "hosts" && resolvedHosts.length <= 1 ? "models" : activeTab;

  const model = useMemo(
    () =>
      buildUsageHistoryViewModel({
        hosts: resolvedHosts,
        scope,
        rangeDays,
        selectedHostIds,
        selectedHarness,
        selectedModelKey,
        activeTab: effectiveTab,
        selectedDay,
        locale,
      }),
    [
      effectiveTab,
      locale,
      rangeDays,
      resolvedHosts,
      scope,
      selectedDay,
      selectedHarness,
      selectedHostIds,
      selectedModelKey,
    ],
  );

  const toggleDay = useCallback((date: string) => {
    setSelectedDay((current) => (current === date ? null : date));
  }, []);
  const closeSelectedDay = useCallback(() => setSelectedDay(null), []);
  const handleRangeChange = useCallback((value: string) => {
    const parsed = Number(value);
    if (parsed === 7 || parsed === 14 || parsed === 30) setRangeDays(parsed);
  }, []);
  const handleSelectAllHosts = useCallback(() => setSelectedHostIds([]), []);
  const handleToggleHost = useCallback(
    (serverId: string) => {
      setSelectedHostIds((current) => {
        if (current.length === 0) return [serverId];
        if (current.includes(serverId)) {
          const remaining = current.filter((id) => id !== serverId);
          return remaining.length === 0 ? [] : remaining;
        }
        const next = [...current, serverId];
        return next.length >= model.availableHostCount ? [] : next;
      });
    },
    [model.availableHostCount],
  );
  const handleToggleModel = useCallback((key: string) => {
    setSelectedModelKey((current) => (current === key ? null : key));
  }, []);
  const handleToggleHarness = useCallback((harness: UsageHistoryHarness) => {
    setSelectedModelKey(null);
    setSelectedHarness((current) => (current === harness ? "all" : harness));
  }, []);
  const handleClearFilter = useCallback(() => {
    setSelectedModelKey(null);
    setSelectedHarness("all");
  }, []);

  const rangeOptions = useMemo<SegmentedControlOption<string>[]>(
    () => [
      { value: "7", label: isZh ? "7天" : "7d", testID: "usage-history-range-7" },
      { value: "14", label: isZh ? "14天" : "14d", testID: "usage-history-range-14" },
      { value: "30", label: isZh ? "30天" : "30d", testID: "usage-history-range-30" },
    ],
    [isZh],
  );

  const tabOptions = useMemo<SegmentedControlOption<HistoryBreakdownTab>[]>(() => {
    const options: SegmentedControlOption<HistoryBreakdownTab>[] = [
      { value: "models", label: isZh ? "按模型" : "Models", testID: "usage-history-tab-models" },
      {
        value: "harnesses",
        label: isZh ? "按工具" : "Tools",
        testID: "usage-history-tab-harnesses",
      },
    ];
    if (model.availableHostCount > 1) {
      options.push({
        value: "hosts",
        label: isZh ? "按电脑" : "Computers",
        testID: "usage-history-tab-hosts",
      });
    }
    return options;
  }, [isZh, model.availableHostCount]);

  if (model.isEmpty) {
    return (
      <View style={[settingsStyles.card, styles.card]} testID={testID}>
        <View style={styles.headerRow}>
          <Text style={styles.scopeText} testID="usage-history-scope">
            {model.scopeCaption}
          </Text>
        </View>
        <Text style={styles.emptyTitle} testID="usage-history-empty-title">
          {model.strings.noHistoryTitle}
        </Text>
        <Text style={styles.emptyBody}>{model.strings.noHistoryBody}</Text>
      </View>
    );
  }

  const baseTokenUnit = model.strings.tokenUnit ?? "tokens";

  return (
    <View style={[settingsStyles.card, styles.card]} testID={testID}>
      <View style={styles.headerRow}>
        <View style={styles.headerTitleGroup}>
          <Text style={styles.scopeText} testID="usage-history-scope" numberOfLines={1}>
            {model.scopeCaption}
          </Text>
        </View>
        <SegmentedControl
          size="sm"
          options={rangeOptions}
          value={String(rangeDays)}
          onValueChange={handleRangeChange}
          testID="usage-history-range"
        />
      </View>

      <UsageHistoryHostChips
        hosts={model.hosts}
        availableHostCount={model.availableHostCount}
        selectedHostIds={selectedHostIds}
        isZh={isZh}
        onSelectAll={handleSelectAllHosts}
        onToggleHost={handleToggleHost}
      />

      {model.activeFilterLabel ? (
        <View style={styles.activeFilterRow} testID="usage-history-filter-badge">
          <Text style={styles.activeFilterText} numberOfLines={1}>
            {isZh ? `已筛选：${model.activeFilterLabel}` : `Filtered: ${model.activeFilterLabel}`}
          </Text>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={X}
            onPress={handleClearFilter}
            accessibilityLabel={isZh ? "清除筛选" : "Clear filter"}
            testID="usage-history-clear-filter"
          >
            {isZh ? "清除" : "Clear"}
          </Button>
        </View>
      ) : null}

      <UsageHistorySummaryAndChart
        model={model}
        isZh={isZh}
        baseTokenUnit={baseTokenUnit}
        onToggleDay={toggleDay}
      />

      {model.selectedDayDetail ? (
        <DayDetailPanel
          detail={model.selectedDayDetail}
          isZh={isZh}
          tokenUnit={baseTokenUnit}
          closeLabel={t("common.actions.close")}
          onClose={closeSelectedDay}
        />
      ) : null}

      <UsageHistoryBreakdownSection
        model={model}
        activeTab={effectiveTab}
        tabOptions={tabOptions}
        selectedModelKey={selectedModelKey}
        selectedHarness={selectedHarness}
        isZh={isZh}
        onTabChange={setActiveTab}
        onToggleModel={handleToggleModel}
        onToggleHarness={handleToggleHarness}
        onToggleHost={handleToggleHost}
      />
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
    flexWrap: "wrap",
  },
  headerTitleGroup: {
    flexShrink: 1,
    minWidth: 0,
  },
  scopeText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  hostChipsTrack: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  filterChipSelected: {
    backgroundColor: theme.colors.surface3,
    borderColor: theme.colors.borderAccent,
  },
  filterChipPressed: {
    backgroundColor: theme.colors.surface3,
  },
  filterChipText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    maxWidth: 140,
  },
  filterChipTextSelected: {
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.medium,
  },
  filterChipCount: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  activeFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
  },
  activeFilterText: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  summaryGrid: {
    flexDirection: "row",
    gap: theme.spacing[4],
  },
  summaryColumn: {
    flex: 1,
    gap: theme.spacing[0.5],
    minWidth: 0,
  },
  summaryCaption: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  figureRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: theme.spacing[1.5],
    flexWrap: "wrap",
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
    fontVariant: ["tabular-nums"],
  },
  compositionContainer: {
    gap: theme.spacing[1.5],
  },
  compositionTrack: {
    height: 6,
    borderRadius: theme.borderRadius.full,
    overflow: "hidden",
    flexDirection: "row",
    gap: 2,
    backgroundColor: theme.colors.surface2,
  },
  compositionBarSegment: {
    height: "100%",
    borderRadius: theme.borderRadius.full,
  },
  compositionLegend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  compositionLegendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  compositionLegendLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  compositionLegendValue: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  chartMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  metaText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  chartFrame: {
    position: "relative",
    height: CHART_MAX_BAR_HEIGHT + 4,
    justifyContent: "flex-end",
  },
  averageLine: {
    position: "absolute",
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderTopColor: theme.colors.borderAccent,
    opacity: 0.7,
    zIndex: 1,
  },
  chartContainer: {
    height: CHART_MAX_BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
  },
  barSlot: {
    flex: 1,
    height: CHART_MAX_BAR_HEIGHT,
    justifyContent: "flex-end",
  },
  barColumn: {
    width: "100%",
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    overflow: "hidden",
    flexDirection: "column-reverse",
  },
  barColumnStrong: {
    opacity: 1,
  },
  barColumnPast: {
    opacity: 0.72,
  },
  barSelectedOutline: {
    borderWidth: 1,
    borderColor: theme.colors.foreground,
  },
  barSegment: {
    width: "100%",
  },
  barSegmentTail: {
    backgroundColor: theme.colors.foregroundMuted,
    opacity: 0.4,
  },
  barFallbackToday: {
    backgroundColor: theme.colors.statusSuccess,
  },
  barFallbackPast: {
    backgroundColor: theme.colors.foregroundMuted,
    opacity: 0.55,
  },
  barEmpty: {
    width: "100%",
    borderRadius: 1,
    backgroundColor: theme.colors.surface3,
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
  dayPanel: {
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface2,
    gap: theme.spacing[1.5],
  },
  dayHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  dayCaption: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  daySubSection: {
    paddingTop: theme.spacing[2],
    gap: theme.spacing[1.5],
  },
  daySubHeading: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  dayModels: {
    gap: theme.spacing[1.5],
    paddingTop: theme.spacing[2],
  },
  breakdownContainer: {
    paddingTop: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: theme.spacing[2],
  },
  breakdownHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    flexWrap: "wrap",
  },
  breakdownHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  breakdownList: {
    gap: theme.spacing[1],
  },
  rowPressable: {
    borderRadius: theme.borderRadius.md,
  },
  rowPressed: {
    backgroundColor: theme.colors.surface2,
  },
  breakdownRow: {
    paddingVertical: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    gap: theme.spacing[1],
  },
  breakdownRowSelected: {
    backgroundColor: theme.colors.surface2,
  },
  breakdownRowDimmed: {
    opacity: theme.opacity[50],
  },
  breakdownTopLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  breakdownLabelGroup: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: theme.borderRadius.full,
    flexShrink: 0,
  },
  modelName: {
    flexShrink: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  tagPill: {
    paddingHorizontal: theme.spacing[1.5],
    paddingVertical: 1,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surface3,
    flexShrink: 0,
  },
  tagPillText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  modelValue: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
    flexShrink: 0,
  },
  progressTrack: {
    height: 4,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: theme.borderRadius.full,
  },
  breakdownSubRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  breakdownSubText: {
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  breakdownSubMeta: {
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
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
