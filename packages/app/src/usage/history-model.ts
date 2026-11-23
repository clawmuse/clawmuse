import type { UsageDailyHistory, UsageDailyModelEntry } from "@getpaseo/protocol/messages";
import type { HostColor } from "@/hosts/appearance";
import {
  deriveIdentityColorName,
  identityColor,
  type IdentityColorName,
} from "@/styles/identity-colors";
import {
  buildWidgetLocalizedStrings,
  toWidgetUsageHistory,
  type MobileUsageWidgetDay,
  type MobileUsageWidgetSnapshot,
} from "@/widgets/usage-widget-sync";

export type UsageHistoryHarness = UsageDailyModelEntry["harness"];
export type HistoryRangeDays = 7 | 14 | 30;
export type HistoryBreakdownTab = "models" | "harnesses" | "hosts";

export const HISTORY_HARNESS_ORDER: readonly UsageHistoryHarness[] = [
  "claude-code",
  "codex",
  "pi",
  "antigravity",
];

const MODEL_SERIES_COLORS: readonly IdentityColorName[] = [
  "teal",
  "violet",
  "blue",
  "orange",
  "pink",
  "emerald",
  "indigo",
  "amber",
  "sky",
  "red",
];

const HARNESS_COLOR_MAP: Record<UsageHistoryHarness, IdentityColorName> = {
  "claude-code": "orange",
  codex: "blue",
  pi: "teal",
  antigravity: "violet",
};

export const BREAKDOWN_COLORS = {
  input: identityColor("blue"),
  cacheRead: identityColor("teal"),
  cacheWrite: identityColor("amber"),
  output: identityColor("violet"),
} as const;

export interface HostDailyHistoryEntry {
  serverId: string;
  label: string;
  color?: HostColor;
  dailyUsage?: UsageDailyHistory;
}

export interface TokenComposition {
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  available: boolean;
  /** Share of cache-read tokens among all input tokens (input + cacheRead + cacheWrite), 0-100. */
  cacheHitPercent: number | null;
}

export interface HistoryModelBreakdownRow {
  key: string;
  name: string;
  harness: UsageHistoryHarness | null;
  harnessLabel: string | null;
  tokens: number;
  sharePercent: number;
  shareLabel: string;
  barRatio: number;
  color: string;
  composition: TokenComposition;
  hostLabels: string[];
}

export interface HistoryHarnessBreakdownRow {
  harness: UsageHistoryHarness;
  label: string;
  tokens: number;
  modelCount: number;
  sharePercent: number;
  shareLabel: string;
  barRatio: number;
  color: string;
  composition: TokenComposition;
}

export interface HistoryHostBreakdownRow {
  serverId: string;
  label: string;
  tokens: number;
  todayTokens: number;
  topModel: string | null;
  sharePercent: number;
  shareLabel: string;
  barRatio: number;
  color: string;
  selected: boolean;
}

export interface HistoryChartSegment {
  key: string;
  tokens: number;
  /** Solid identity color for primary series, or null for the muted tail segment. */
  color: string | null;
}

export interface HistoryChartDay {
  date: string;
  tokens: number;
  isToday: boolean;
  segments: HistoryChartSegment[];
}

export interface HistoryDayDetail {
  date: string;
  caption: string;
  tokens: number;
  costLabel: string;
  hasReportedCost: boolean;
  composition: TokenComposition;
  models: HistoryModelBreakdownRow[];
  hosts: HistoryHostBreakdownRow[];
}

export interface UsageHistoryViewModel {
  isEmpty: boolean;
  scopeCaption: string;
  rangeCaption: string;
  firstDate: string;
  lastDate: string;
  lastDateIsActualToday: boolean;
  todayCaption: string;
  todayTokens: number;
  todayCostLabel: string;
  todayHasReportedCost: boolean;
  todayComposition: TokenComposition;
  rangeTotalTokens: number;
  rangeCostLabel: string;
  rangeHasReportedCost: boolean;
  rangeComposition: TokenComposition;
  dailyAverageTokens: number;
  activeDaysCount: number;
  windowDaysCount: number;
  peakDay: { date: string; tokens: number } | null;
  chartDays: HistoryChartDay[];
  peakTokens: number;
  models: HistoryModelBreakdownRow[];
  harnesses: HistoryHarnessBreakdownRow[];
  hosts: HistoryHostBreakdownRow[];
  availableHostCount: number;
  selectedHostCount: number;
  activeFilterLabel: string | null;
  selectedDayIndex: number;
  selectedDayDetail: HistoryDayDetail | null;
  strings: Readonly<Record<string, string>>;
}

export function formatLocalDayKey(ms: number): string {
  const date = new Date(ms);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatOneDecimal(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatHistoryTokens(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  const billions = value / 1_000_000_000;
  if (billions >= 100) return `${Math.round(billions)}B`;
  if (billions >= 1) return `${formatOneDecimal(billions)}B`;
  if (value >= 999_500_000) return "1B";
  const millions = value / 1_000_000;
  if (millions >= 100) return `${Math.round(millions)}M`;
  if (millions >= 1) return `${formatOneDecimal(millions)}M`;
  if (value >= 999_500) return "1M";
  const thousands = value / 1_000;
  if (thousands >= 100) return `${Math.round(thousands)}K`;
  if (thousands >= 1) return `${formatOneDecimal(thousands)}K`;
  return `${Math.round(value)}`;
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

export function formatSharePercent(
  part: number,
  total: number,
): { percent: number; label: string } {
  if (total <= 0 || part <= 0) return { percent: 0, label: "0%" };
  const raw = (part / total) * 100;
  if (raw < 0.5) return { percent: 0, label: "<1%" };
  const rounded = Math.min(100, Math.round(raw));
  return { percent: rounded, label: `${rounded}%` };
}

function formatHistoryMoney(value: number, symbol = "$"): string {
  if (value >= 10_000) return `${symbol}${(value / 1000).toFixed(1)}k`;
  if (value >= 100) return `${symbol}${Math.round(value).toLocaleString("en-US")}`;
  return `${symbol}${value.toFixed(2)}`;
}

function sumDayTokens(day: MobileUsageWidgetDay): number {
  return day.tokens.reduce((sum, value) => sum + value, 0);
}

function sumDayMoney(day: MobileUsageWidgetDay): number {
  return day.money.reduce((sum, value) => sum + value, 0);
}

function hasDayCost(day: MobileUsageWidgetDay): boolean {
  return day.costAvailable ?? sumDayMoney(day) > 0;
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

interface CompositionAccumulator {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  withBreakdown: number;
  totalActive: number;
}

function createCompositionAcc(): CompositionAccumulator {
  return { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, withBreakdown: 0, totalActive: 0 };
}

function addSliceToComposition(acc: CompositionAccumulator, slice: ExtractedSlice): void {
  acc.totalActive += 1;
  if (!slice.hasBreakdown) return;
  acc.withBreakdown += 1;
  acc.input += slice.input;
  acc.cacheRead += slice.cacheRead;
  acc.cacheWrite += slice.cacheWrite;
  acc.output += slice.output;
}

function emptyComposition(): TokenComposition {
  return {
    inputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    available: false,
    cacheHitPercent: null,
  };
}

function finalizeComposition(acc: CompositionAccumulator): TokenComposition {
  const available = acc.totalActive > 0 && acc.withBreakdown === acc.totalActive;
  if (!available) return emptyComposition();
  const totalInputSide = acc.input + acc.cacheRead + acc.cacheWrite;
  const cacheHitPercent =
    totalInputSide > 0 ? Math.round((acc.cacheRead / totalInputSide) * 100) : null;
  return {
    inputTokens: acc.input,
    cacheReadTokens: acc.cacheRead,
    cacheWriteTokens: acc.cacheWrite,
    outputTokens: acc.output,
    available: true,
    cacheHitPercent,
  };
}

function resolveHostAccentColor(host: Pick<HostDailyHistoryEntry, "serverId" | "color">): string {
  if (host.color && host.color !== "none") {
    return identityColor(host.color);
  }
  return identityColor(deriveIdentityColorName(host.serverId));
}

function resolveHarnessColor(harness: UsageHistoryHarness): string {
  return identityColor(HARNESS_COLOR_MAP[harness]);
}

function resolveModelColor(rankIndex: number): string {
  return identityColor(MODEL_SERIES_COLORS[rankIndex % MODEL_SERIES_COLORS.length]!);
}

interface NormalizedHostUsage {
  serverId: string;
  label: string;
  color: string;
  usage: MobileUsageWidgetSnapshot["usage"];
  dayMap: Map<string, MobileUsageWidgetDay>;
}

interface ExtractedSlice {
  key: string;
  name: string;
  harness: UsageHistoryHarness | null;
  tokens: number;
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  hasBreakdown: boolean;
}

interface ModelAccumulator {
  key: string;
  name: string;
  harness: UsageHistoryHarness | null;
  tokens: number;
  comp: CompositionAccumulator;
  hostLabels: Set<string>;
}

interface HarnessAccumulator {
  harness: UsageHistoryHarness;
  tokens: number;
  models: Set<string>;
  comp: CompositionAccumulator;
}

function hasModelBreakdownArrays(day: MobileUsageWidgetDay, expectedLen: number): boolean {
  return (
    day.modelInputTokens?.length === expectedLen &&
    day.modelCacheReadTokens?.length === expectedLen &&
    day.modelCacheWriteTokens?.length === expectedLen &&
    day.modelOutputTokens?.length === expectedLen
  );
}

function sliceFromModelSlot(input: {
  day: MobileUsageWidgetDay;
  slotIndex: number;
  key: string;
  name: string;
  harness: UsageHistoryHarness | null;
  hasPerModelBreakdown: boolean;
}): ExtractedSlice | null {
  const { day, slotIndex, key, name, harness, hasPerModelBreakdown } = input;
  const tokens = day.modelTokens?.[slotIndex] ?? 0;
  if (tokens <= 0) return null;
  return {
    key,
    name,
    harness,
    tokens,
    input: hasPerModelBreakdown ? (day.modelInputTokens?.[slotIndex] ?? 0) : 0,
    cacheRead: hasPerModelBreakdown ? (day.modelCacheReadTokens?.[slotIndex] ?? 0) : 0,
    cacheWrite: hasPerModelBreakdown ? (day.modelCacheWriteTokens?.[slotIndex] ?? 0) : 0,
    output: hasPerModelBreakdown ? (day.modelOutputTokens?.[slotIndex] ?? 0) : 0,
    hasBreakdown: hasPerModelBreakdown,
  };
}

function extractModelDaySlices(
  models: readonly NonNullable<MobileUsageWidgetSnapshot["usage"]["models"]>[number][],
  day: MobileUsageWidgetDay,
  otherLabel: string,
): ExtractedSlice[] {
  const expectedLen = models.length + 1;
  const hasPerModelBreakdown = hasModelBreakdownArrays(day, expectedLen);
  const slices: ExtractedSlice[] = [];

  for (let m = 0; m < models.length; m += 1) {
    const model = models[m]!;
    const harness = HISTORY_HARNESS_ORDER.includes(model.harness as UsageHistoryHarness)
      ? (model.harness as UsageHistoryHarness)
      : null;
    const slice = sliceFromModelSlot({
      day,
      slotIndex: m,
      key: `model:${model.harness}:${model.name}`,
      name: model.name,
      harness,
      hasPerModelBreakdown,
    });
    if (slice) slices.push(slice);
  }

  const otherSlice = sliceFromModelSlot({
    day,
    slotIndex: models.length,
    key: "model:other",
    name: otherLabel,
    harness: null,
    hasPerModelBreakdown,
  });
  if (otherSlice) slices.push(otherSlice);
  return slices;
}

function extractHarnessDaySlices(
  day: MobileUsageWidgetDay,
  strings: Readonly<Record<string, string>>,
): ExtractedSlice[] {
  const slices: ExtractedSlice[] = [];
  const totalDay = sumDayTokens(day);
  const hasDayBreakdown =
    day.inputTokens !== undefined &&
    day.cacheReadTokens !== undefined &&
    day.cacheWriteTokens !== undefined &&
    day.outputTokens !== undefined;
  const activeHarnessCount = HISTORY_HARNESS_ORDER.reduce(
    (count, _, idx) => count + ((day.tokens[idx] ?? 0) > 0 ? 1 : 0),
    0,
  );

  for (let h = 0; h < HISTORY_HARNESS_ORDER.length; h += 1) {
    const tokens = day.tokens[h] ?? 0;
    if (tokens <= 0) continue;
    const harness = HISTORY_HARNESS_ORDER[h]!;
    const useBreakdown = hasDayBreakdown && activeHarnessCount === 1 && tokens === totalDay;
    slices.push({
      key: `harness:${harness}`,
      name: strings[`harness.${harness}`] ?? harness,
      harness,
      tokens,
      input: useBreakdown ? (day.inputTokens ?? 0) : 0,
      cacheRead: useBreakdown ? (day.cacheReadTokens ?? 0) : 0,
      cacheWrite: useBreakdown ? (day.cacheWriteTokens ?? 0) : 0,
      output: useBreakdown ? (day.outputTokens ?? 0) : 0,
      hasBreakdown: useBreakdown,
    });
  }
  return slices;
}

function extractDaySlices(
  usage: MobileUsageWidgetSnapshot["usage"],
  day: MobileUsageWidgetDay,
  strings: Readonly<Record<string, string>>,
  otherLabel: string,
): ExtractedSlice[] {
  const models = usage.models;
  if (models && models.length > 0 && day.modelTokens?.length === models.length + 1) {
    return extractModelDaySlices(models, day, otherLabel);
  }
  return extractHarnessDaySlices(day, strings);
}

function matchesFilter(
  slice: ExtractedSlice,
  selectedHarness: UsageHistoryHarness | "all",
  selectedModelKey: string | null,
): boolean {
  if (selectedModelKey !== null && slice.key !== selectedModelKey) return false;
  if (selectedHarness !== "all" && slice.harness !== selectedHarness) return false;
  return true;
}

function formatRangeLabel(rangeDays: HistoryRangeDays, isZh: boolean): string {
  return isZh ? `近 ${rangeDays} 天` : `Last ${rangeDays} days`;
}

function resolveScopeCaption(input: {
  rangeCaption: string;
  scope: "all" | "local";
  normalizedHosts: readonly NormalizedHostUsage[];
  activeHosts: readonly NormalizedHostUsage[];
  strings: Readonly<Record<string, string>>;
  isZh: boolean;
}): string {
  const { rangeCaption, scope, normalizedHosts, activeHosts, strings, isZh } = input;
  if (normalizedHosts.length > 1) {
    if (activeHosts.length < normalizedHosts.length) {
      if (activeHosts.length === 1) {
        return `${rangeCaption} · ${activeHosts[0]!.label}`;
      }
      const subset = isZh
        ? `已选 ${activeHosts.length}/${normalizedHosts.length} 台设备`
        : `${activeHosts.length} of ${normalizedHosts.length} devices`;
      return `${rangeCaption} · ${subset}`;
    }
    const allLabel = isZh
      ? `全部设备 (${normalizedHosts.length})`
      : `All devices (${normalizedHosts.length})`;
    return `${rangeCaption} · ${allLabel}`;
  }
  if (scope === "local") {
    const singleLabel = normalizedHosts[0]?.label;
    if (singleLabel && !singleLabel.startsWith("__")) {
      return `${rangeCaption} · ${singleLabel}`;
    }
    return `${rangeCaption} · ${strings.scopeLocal ?? "This computer"}`;
  }
  return `${rangeCaption} · ${strings.scopeAll ?? "All devices"}`;
}

function normalizeHostUsages(
  hosts: readonly HostDailyHistoryEntry[],
  scope: "all" | "local",
): NormalizedHostUsage[] {
  const normalized: NormalizedHostUsage[] = [];
  for (const entry of hosts) {
    const usage = toWidgetUsageHistory(entry.dailyUsage, scope);
    const dayMap = new Map<string, MobileUsageWidgetDay>();
    const count = Math.min(usage.days.length, usage.daily.length);
    for (let i = 0; i < count; i += 1) {
      const dayKey = usage.days[i];
      const dayVal = usage.daily[i];
      if (dayKey && dayVal) dayMap.set(dayKey, dayVal);
    }
    if (dayMap.size > 0) {
      normalized.push({
        serverId: entry.serverId,
        label: entry.label,
        color: resolveHostAccentColor(entry),
        usage,
        dayMap,
      });
    }
  }
  return normalized;
}

function computeHostBreakdownRows(input: {
  normalizedHosts: readonly NormalizedHostUsage[];
  activeHostIds: ReadonlySet<string>;
  windowDays: readonly string[];
  lastDate: string;
  selectedHarness: UsageHistoryHarness | "all";
  selectedModelKey: string | null;
  strings: Readonly<Record<string, string>>;
  otherLabel: string;
}): HistoryHostBreakdownRow[] {
  const {
    normalizedHosts,
    activeHostIds,
    windowDays,
    lastDate,
    selectedHarness,
    selectedModelKey,
    strings,
    otherLabel,
  } = input;

  const aggs = normalizedHosts.map((host) => {
    let total = 0;
    let todayTotal = 0;
    const perModel = new Map<string, { name: string; tokens: number }>();
    for (const dayKey of windowDays) {
      const day = host.dayMap.get(dayKey);
      if (!day) continue;
      for (const slice of extractDaySlices(host.usage, day, strings, otherLabel)) {
        if (!matchesFilter(slice, selectedHarness, selectedModelKey)) continue;
        total += slice.tokens;
        if (dayKey === lastDate) todayTotal += slice.tokens;
        const prev = perModel.get(slice.key);
        if (prev) prev.tokens += slice.tokens;
        else perModel.set(slice.key, { name: slice.name, tokens: slice.tokens });
      }
    }
    let topModel: string | null = null;
    let topTokens = 0;
    for (const entry of perModel.values()) {
      if (entry.tokens > topTokens) {
        topTokens = entry.tokens;
        topModel = entry.name;
      }
    }
    return {
      serverId: host.serverId,
      label: host.label,
      color: host.color,
      tokens: total,
      todayTokens: todayTotal,
      topModel,
      selected: activeHostIds.has(host.serverId),
    };
  });

  const allTotal = aggs.reduce((sum, host) => sum + host.tokens, 0);
  const maxTokens = Math.max(1, ...aggs.map((host) => host.tokens));
  return [...aggs]
    .sort((a, b) => b.tokens - a.tokens)
    .map((host) => {
      const share = formatSharePercent(host.tokens, allTotal);
      return {
        serverId: host.serverId,
        label: host.label,
        tokens: host.tokens,
        todayTokens: host.todayTokens,
        topModel: host.topModel,
        sharePercent: share.percent,
        shareLabel: share.label,
        barRatio: host.tokens > 0 ? Math.max(0.03, host.tokens / maxTokens) : 0,
        color: host.color,
        selected: host.selected,
      };
    });
}

function recordModelAcc(
  modelAccs: Map<string, ModelAccumulator>,
  slice: ExtractedSlice,
  hostLabel: string,
): void {
  let acc = modelAccs.get(slice.key);
  if (!acc) {
    acc = {
      key: slice.key,
      name: slice.name,
      harness: slice.harness,
      tokens: 0,
      comp: createCompositionAcc(),
      hostLabels: new Set(),
    };
    modelAccs.set(slice.key, acc);
  }
  acc.tokens += slice.tokens;
  acc.hostLabels.add(hostLabel);
  addSliceToComposition(acc.comp, slice);
}

function recordHarnessAcc(
  harnessAccs: Map<UsageHistoryHarness, HarnessAccumulator>,
  slice: ExtractedSlice,
): void {
  if (!slice.harness) return;
  let acc = harnessAccs.get(slice.harness);
  if (!acc) {
    acc = {
      harness: slice.harness,
      tokens: 0,
      models: new Set(),
      comp: createCompositionAcc(),
    };
    harnessAccs.set(slice.harness, acc);
  }
  acc.tokens += slice.tokens;
  acc.models.add(slice.name);
  addSliceToComposition(acc.comp, slice);
}

function readCostContribution(
  day: MobileUsageWidgetDay,
  selectedHarness: UsageHistoryHarness | "all",
): { tokens: number; money: number; hasCost: boolean } {
  const harnessIdx =
    selectedHarness === "all" ? -1 : HISTORY_HARNESS_ORDER.indexOf(selectedHarness);
  const tokens = harnessIdx >= 0 ? (day.tokens[harnessIdx] ?? 0) : sumDayTokens(day);
  const money = harnessIdx >= 0 ? (day.money[harnessIdx] ?? 0) : sumDayMoney(day);
  return { tokens, money, hasCost: hasDayCost(day) };
}

function buildRankedModelRows(
  modelAccs: ReadonlyMap<string, ModelAccumulator>,
  denominator: number,
  strings: Readonly<Record<string, string>>,
  colorOverride?: ReadonlyMap<string, string>,
): { rows: HistoryModelBreakdownRow[]; colorByKey: Map<string, string> } {
  const ranked = [...modelAccs.values()].sort((a, b) => b.tokens - a.tokens);
  const maxTokens = Math.max(1, ranked[0]?.tokens ?? 1);
  const colorByKey = new Map<string, string>();
  const rows = ranked.map((acc, idx) => {
    const color = colorOverride?.get(acc.key) ?? resolveModelColor(idx);
    colorByKey.set(acc.key, color);
    const share = formatSharePercent(acc.tokens, denominator);
    return {
      key: acc.key,
      name: acc.name,
      harness: acc.harness,
      harnessLabel: acc.harness ? (strings[`harness.${acc.harness}`] ?? acc.harness) : null,
      tokens: acc.tokens,
      sharePercent: share.percent,
      shareLabel: share.label,
      barRatio: acc.tokens > 0 ? Math.max(0.03, acc.tokens / maxTokens) : 0,
      color,
      composition: finalizeComposition(acc.comp),
      hostLabels: [...acc.hostLabels],
    };
  });
  return { rows, colorByKey };
}

function buildRankedHarnessRows(
  harnessAccs: ReadonlyMap<UsageHistoryHarness, HarnessAccumulator>,
  strings: Readonly<Record<string, string>>,
): HistoryHarnessBreakdownRow[] {
  const ranked = [...harnessAccs.values()].sort((a, b) => b.tokens - a.tokens);
  const total = ranked.reduce((sum, acc) => sum + acc.tokens, 0);
  const maxTokens = Math.max(1, ranked[0]?.tokens ?? 1);
  return ranked.map((acc) => {
    const share = formatSharePercent(acc.tokens, total);
    return {
      harness: acc.harness,
      label: strings[`harness.${acc.harness}`] ?? acc.harness,
      tokens: acc.tokens,
      modelCount: acc.models.size,
      sharePercent: share.percent,
      shareLabel: share.label,
      barRatio: acc.tokens > 0 ? Math.max(0.03, acc.tokens / maxTokens) : 0,
      color: resolveHarnessColor(acc.harness),
      composition: finalizeComposition(acc.comp),
    };
  });
}

function buildChartSegmentsForDay(input: {
  activeTab: HistoryBreakdownTab;
  activeHostCount: number;
  perModel: ReadonlyMap<string, number> | undefined;
  perHarness: ReadonlyMap<UsageHistoryHarness, number> | undefined;
  perHost: ReadonlyMap<string, number> | undefined;
  modelRows: readonly HistoryModelBreakdownRow[];
  harnessRows: readonly HistoryHarnessBreakdownRow[];
  hostRows: readonly HistoryHostBreakdownRow[];
}): HistoryChartSegment[] {
  const {
    activeTab,
    activeHostCount,
    perModel,
    perHarness,
    perHost,
    modelRows,
    harnessRows,
    hostRows,
  } = input;
  const segments: HistoryChartSegment[] = [];

  if (activeTab === "hosts" && activeHostCount > 1 && perHost) {
    for (const hostRow of hostRows) {
      const val = perHost.get(hostRow.serverId) ?? 0;
      if (val > 0) segments.push({ key: hostRow.serverId, tokens: val, color: hostRow.color });
    }
    return segments;
  }

  if (activeTab === "harnesses" && perHarness) {
    for (const harnessRow of harnessRows) {
      const val = perHarness.get(harnessRow.harness) ?? 0;
      if (val > 0) segments.push({ key: harnessRow.harness, tokens: val, color: harnessRow.color });
    }
    return segments;
  }

  if (!perModel) return segments;
  let tailSum = 0;
  modelRows.forEach((modelRow, idx) => {
    const val = perModel.get(modelRow.key) ?? 0;
    if (val <= 0) return;
    if (idx < 5) {
      segments.push({ key: modelRow.key, tokens: val, color: modelRow.color });
    } else {
      tailSum += val;
    }
  });
  if (tailSum > 0) {
    segments.push({ key: "tail", tokens: tailSum, color: null });
  }
  return segments;
}

function buildSelectedDayDetail(input: {
  selectedDay: string;
  isLastWindowDay: boolean;
  activeHosts: readonly NormalizedHostUsage[];
  selectedHarness: UsageHistoryHarness | "all";
  selectedModelKey: string | null;
  modelColorByKey: ReadonlyMap<string, string>;
  strings: Readonly<Record<string, string>>;
  otherLabel: string;
}): HistoryDayDetail {
  const {
    selectedDay,
    isLastWindowDay,
    activeHosts,
    selectedHarness,
    selectedModelKey,
    modelColorByKey,
    strings,
    otherLabel,
  } = input;

  const canComputeCost = selectedModelKey === null;
  let dayTokens = 0;
  const dayComp = createCompositionAcc();
  const dayModelsAcc = new Map<string, ModelAccumulator>();
  const dayHostsAcc: Array<{
    serverId: string;
    label: string;
    color: string;
    tokens: number;
    topModel: string | null;
  }> = [];
  let costSum = 0;
  let costContributors = 0;
  let allCostAvailable = true;

  for (const host of activeHosts) {
    const day = host.dayMap.get(selectedDay);
    if (!day) continue;
    if (canComputeCost) {
      const c = readCostContribution(day, selectedHarness);
      if (c.tokens > 0 || c.hasCost) {
        costContributors += 1;
        allCostAvailable = allCostAvailable && c.hasCost;
        costSum += c.money;
      }
    }
    let hostTotal = 0;
    let hostTopModel: string | null = null;
    let hostTopTokens = 0;
    for (const slice of extractDaySlices(host.usage, day, strings, otherLabel)) {
      if (!matchesFilter(slice, selectedHarness, selectedModelKey)) continue;
      dayTokens += slice.tokens;
      hostTotal += slice.tokens;
      if (slice.tokens > hostTopTokens) {
        hostTopTokens = slice.tokens;
        hostTopModel = slice.name;
      }
      addSliceToComposition(dayComp, slice);
      recordModelAcc(dayModelsAcc, slice, host.label);
    }
    if (hostTotal > 0) {
      dayHostsAcc.push({
        serverId: host.serverId,
        label: host.label,
        color: host.color,
        tokens: hostTotal,
        topModel: hostTopModel,
      });
    }
  }

  const { rows: models } = buildRankedModelRows(dayModelsAcc, dayTokens, strings, modelColorByKey);
  dayHostsAcc.sort((a, b) => b.tokens - a.tokens);
  const maxHost = Math.max(1, dayHostsAcc[0]?.tokens ?? 1);
  const hosts: HistoryHostBreakdownRow[] = dayHostsAcc.map((h) => {
    const share = formatSharePercent(h.tokens, dayTokens);
    return {
      serverId: h.serverId,
      label: h.label,
      tokens: h.tokens,
      todayTokens: h.tokens,
      topModel: h.topModel,
      sharePercent: share.percent,
      shareLabel: share.label,
      barRatio: Math.max(0.03, h.tokens / maxHost),
      color: h.color,
      selected: true,
    };
  });

  const hasReportedCost = canComputeCost && costContributors > 0 && allCostAvailable;
  const costLabel = hasReportedCost
    ? `${strings.reportedCost ?? "Reported cost"} ${formatHistoryMoney(costSum)}`
    : (strings.noCostData ?? "Cost unavailable");

  return {
    date: selectedDay,
    caption: isLastWindowDay ? `${strings.today} · ${selectedDay}` : selectedDay,
    tokens: dayTokens,
    costLabel,
    hasReportedCost,
    composition: finalizeComposition(dayComp),
    models,
    hosts,
  };
}

function aggregateSingleDay(input: {
  dayKey: string;
  isLastDate: boolean;
  activeHosts: readonly NormalizedHostUsage[];
  selectedHarness: UsageHistoryHarness | "all";
  selectedModelKey: string | null;
  canComputeCost: boolean;
  strings: Readonly<Record<string, string>>;
  otherLabel: string;
  modelAccs: Map<string, ModelAccumulator>;
  harnessAccs: Map<UsageHistoryHarness, HarnessAccumulator>;
  rangeComp: CompositionAccumulator;
  todayComp: CompositionAccumulator;
}) {
  const {
    dayKey,
    isLastDate,
    activeHosts,
    selectedHarness,
    selectedModelKey,
    canComputeCost,
    strings,
    otherLabel,
    modelAccs,
    harnessAccs,
    rangeComp,
    todayComp,
  } = input;

  let daySum = 0;
  const perModelDay = new Map<string, number>();
  const perHarnessDay = new Map<UsageHistoryHarness, number>();
  const perHostDay = new Map<string, number>();
  let dayCostSum = 0;
  let dayCostContributors = 0;
  let dayAllCostAvailable = true;

  for (const host of activeHosts) {
    const day = host.dayMap.get(dayKey);
    if (!day) continue;
    if (canComputeCost) {
      const c = readCostContribution(day, selectedHarness);
      if (c.tokens > 0 || c.hasCost) {
        dayCostContributors += 1;
        dayAllCostAvailable = dayAllCostAvailable && c.hasCost;
        dayCostSum += c.money;
      }
    }
    for (const slice of extractDaySlices(host.usage, day, strings, otherLabel)) {
      if (selectedHarness === "all" || slice.harness === selectedHarness) {
        recordModelAcc(modelAccs, slice, host.label);
      }
      recordHarnessAcc(harnessAccs, slice);
      if (!matchesFilter(slice, selectedHarness, selectedModelKey)) continue;

      daySum += slice.tokens;
      perModelDay.set(slice.key, (perModelDay.get(slice.key) ?? 0) + slice.tokens);
      if (slice.harness) {
        perHarnessDay.set(slice.harness, (perHarnessDay.get(slice.harness) ?? 0) + slice.tokens);
      }
      perHostDay.set(host.serverId, (perHostDay.get(host.serverId) ?? 0) + slice.tokens);
      addSliceToComposition(rangeComp, slice);
      if (isLastDate) addSliceToComposition(todayComp, slice);
    }
  }

  return {
    daySum,
    perModelDay,
    perHarnessDay,
    perHostDay,
    dayCostSum,
    dayCostContributors,
    dayAllCostAvailable,
  };
}

function aggregateWindowForActiveHosts(input: {
  activeHosts: readonly NormalizedHostUsage[];
  windowDays: readonly string[];
  lastDate: string;
  selectedHarness: UsageHistoryHarness | "all";
  selectedModelKey: string | null;
  strings: Readonly<Record<string, string>>;
  otherLabel: string;
}) {
  const {
    activeHosts,
    windowDays,
    lastDate,
    selectedHarness,
    selectedModelKey,
    strings,
    otherLabel,
  } = input;
  const canComputeCost = selectedModelKey === null;

  const modelAccs = new Map<string, ModelAccumulator>();
  const harnessAccs = new Map<UsageHistoryHarness, HarnessAccumulator>();
  const dayModelMap = new Map<string, Map<string, number>>();
  const dayHarnessMap = new Map<string, Map<UsageHistoryHarness, number>>();
  const dayHostMap = new Map<string, Map<string, number>>();
  const dayTotals = new Map<string, number>();
  const rangeComp = createCompositionAcc();
  const todayComp = createCompositionAcc();

  let rangeCostTotal = 0;
  let rangeCostUsedDays = 0;
  let rangeCostAvailableDays = 0;
  let todayCostTotal = 0;
  let todayCostUsed = false;
  let todayCostAvailable = true;

  for (const dayKey of windowDays) {
    const isLastDate = dayKey === lastDate;
    const single = aggregateSingleDay({
      dayKey,
      isLastDate,
      activeHosts,
      selectedHarness,
      selectedModelKey,
      canComputeCost,
      strings,
      otherLabel,
      modelAccs,
      harnessAccs,
      rangeComp,
      todayComp,
    });

    dayTotals.set(dayKey, single.daySum);
    dayModelMap.set(dayKey, single.perModelDay);
    dayHarnessMap.set(dayKey, single.perHarnessDay);
    dayHostMap.set(dayKey, single.perHostDay);

    if (canComputeCost && single.dayCostContributors > 0) {
      rangeCostUsedDays += 1;
      if (single.dayAllCostAvailable) {
        rangeCostAvailableDays += 1;
        rangeCostTotal += single.dayCostSum;
      }
      if (isLastDate) {
        todayCostUsed = true;
        todayCostAvailable = single.dayAllCostAvailable;
        todayCostTotal = single.dayCostSum;
      }
    }
  }

  return {
    modelAccs,
    harnessAccs,
    dayModelMap,
    dayHarnessMap,
    dayHostMap,
    dayTotals,
    rangeComp,
    todayComp,
    rangeHasReportedCost:
      canComputeCost && rangeCostUsedDays > 0 && rangeCostAvailableDays === rangeCostUsedDays,
    rangeCostTotal,
    todayHasReportedCost: canComputeCost && todayCostUsed && todayCostAvailable,
    todayCostTotal,
  };
}

function summarizeWindowTotals(windowDays: readonly string[], dayTotals: Map<string, number>) {
  let rangeTotalTokens = 0;
  let activeDaysCount = 0;
  let peakTokens = 0;
  let peakDate: string | null = null;
  for (const dayKey of windowDays) {
    const t = dayTotals.get(dayKey) ?? 0;
    rangeTotalTokens += t;
    if (t > 0) activeDaysCount += 1;
    if (t > peakTokens) {
      peakTokens = t;
      peakDate = dayKey;
    }
  }
  return { rangeTotalTokens, activeDaysCount, peakTokens, peakDate };
}

function resolveActiveFilterLabel(
  selectedModelKey: string | null,
  selectedHarness: UsageHistoryHarness | "all",
  modelRows: readonly HistoryModelBreakdownRow[],
  strings: Readonly<Record<string, string>>,
): string | null {
  if (selectedModelKey !== null) {
    const matched = modelRows.find((row) => row.key === selectedModelKey);
    return matched?.name ?? selectedModelKey.replace(/^model:[^:]+:/, "");
  }
  if (selectedHarness !== "all") {
    return strings[`harness.${selectedHarness}`] ?? selectedHarness;
  }
  return null;
}

function formatCostCaption(
  hasReportedCost: boolean,
  amount: number,
  strings: Readonly<Record<string, string>>,
): string {
  return hasReportedCost
    ? `${strings.reportedCost ?? "Reported cost"} ${formatHistoryMoney(amount)}`
    : (strings.noCostData ?? "Cost unavailable");
}

function collectWindowDays(
  normalizedHosts: readonly NormalizedHostUsage[],
  rangeDays: HistoryRangeDays,
): string[] {
  const daySet = new Set<string>();
  for (const host of normalizedHosts) {
    for (const dayKey of host.dayMap.keys()) daySet.add(dayKey);
  }
  return [...daySet].sort().slice(-30).slice(-rangeDays);
}

function selectActiveHosts(
  normalizedHosts: readonly NormalizedHostUsage[],
  selectedHostIds: readonly string[],
): NormalizedHostUsage[] {
  if (selectedHostIds.length === 0) return [...normalizedHosts];
  const selectedHostSet = new Set(selectedHostIds);
  const matched = normalizedHosts.filter((host) => selectedHostSet.has(host.serverId));
  return matched.length > 0 ? matched : [...normalizedHosts];
}

function buildEmptyViewModel(
  scopeCaption: string,
  rangeCaption: string,
  strings: Readonly<Record<string, string>>,
): UsageHistoryViewModel {
  return {
    isEmpty: true,
    scopeCaption,
    rangeCaption,
    firstDate: "",
    lastDate: "",
    lastDateIsActualToday: false,
    todayCaption: strings.today ?? "Today",
    todayTokens: 0,
    todayCostLabel: strings.noCostData ?? "Cost unavailable",
    todayHasReportedCost: false,
    todayComposition: emptyComposition(),
    rangeTotalTokens: 0,
    rangeCostLabel: strings.noCostData ?? "Cost unavailable",
    rangeHasReportedCost: false,
    rangeComposition: emptyComposition(),
    dailyAverageTokens: 0,
    activeDaysCount: 0,
    windowDaysCount: 0,
    peakDay: null,
    chartDays: [],
    peakTokens: 1,
    models: [],
    harnesses: [],
    hosts: [],
    availableHostCount: 0,
    selectedHostCount: 0,
    activeFilterLabel: null,
    selectedDayIndex: -1,
    selectedDayDetail: null,
    strings,
  };
}

export function buildUsageHistoryViewModel(input: {
  hosts: readonly HostDailyHistoryEntry[];
  scope: "all" | "local";
  rangeDays: HistoryRangeDays;
  selectedHostIds: readonly string[];
  selectedHarness: UsageHistoryHarness | "all";
  selectedModelKey: string | null;
  activeTab: HistoryBreakdownTab;
  selectedDay: string | null;
  locale: string;
  nowMs?: number;
}): UsageHistoryViewModel {
  const {
    hosts,
    scope,
    rangeDays,
    selectedHostIds,
    selectedHarness,
    selectedModelKey,
    activeTab,
    selectedDay,
    locale,
    nowMs = Date.now(),
  } = input;

  const isZh = locale.toLowerCase().startsWith("zh");
  const strings = buildWidgetLocalizedStrings(locale);
  const otherLabel = isZh ? "其他" : "Other";
  const rangeCaption = formatRangeLabel(rangeDays, isZh);

  const normalizedHosts = normalizeHostUsages(hosts, scope);
  if (normalizedHosts.length === 0) {
    const emptyScope = resolveScopeCaption({
      rangeCaption,
      scope,
      normalizedHosts,
      activeHosts: [],
      strings,
      isZh,
    });
    return buildEmptyViewModel(emptyScope, rangeCaption, strings);
  }

  const windowDays = collectWindowDays(normalizedHosts, rangeDays);
  const lastDate = windowDays[windowDays.length - 1] ?? "";
  const firstDate = windowDays[0] ?? "";
  const lastDateIsActualToday = lastDate === formatLocalDayKey(nowMs);

  const activeHosts = selectActiveHosts(normalizedHosts, selectedHostIds);
  const activeHostIds = new Set(activeHosts.map((host) => host.serverId));

  const scopeCaption = resolveScopeCaption({
    rangeCaption,
    scope,
    normalizedHosts,
    activeHosts,
    strings,
    isZh,
  });

  const hostRows = computeHostBreakdownRows({
    normalizedHosts,
    activeHostIds,
    windowDays,
    lastDate,
    selectedHarness,
    selectedModelKey,
    strings,
    otherLabel,
  });

  const agg = aggregateWindowForActiveHosts({
    activeHosts,
    windowDays,
    lastDate,
    selectedHarness,
    selectedModelKey,
    strings,
    otherLabel,
  });

  const { rangeTotalTokens, activeDaysCount, peakTokens, peakDate } = summarizeWindowTotals(
    windowDays,
    agg.dayTotals,
  );

  const modelsTotal = [...agg.modelAccs.values()].reduce((sum, acc) => sum + acc.tokens, 0);
  const { rows: modelRows, colorByKey: modelColorByKey } = buildRankedModelRows(
    agg.modelAccs,
    modelsTotal,
    strings,
  );
  const harnessRows = buildRankedHarnessRows(agg.harnessAccs, strings);

  const chartDays: HistoryChartDay[] = windowDays.map((date) => {
    const tokens = agg.dayTotals.get(date) ?? 0;
    return {
      date,
      tokens,
      isToday: date === lastDate,
      segments:
        tokens > 0
          ? buildChartSegmentsForDay({
              activeTab,
              activeHostCount: activeHosts.length,
              perModel: agg.dayModelMap.get(date),
              perHarness: agg.dayHarnessMap.get(date),
              perHost: agg.dayHostMap.get(date),
              modelRows,
              harnessRows,
              hostRows,
            })
          : [],
    };
  });

  const selectedDayIndex = selectedDay === null ? -1 : windowDays.indexOf(selectedDay);
  const selectedDayDetail =
    selectedDayIndex >= 0 && selectedDay !== null
      ? buildSelectedDayDetail({
          selectedDay,
          isLastWindowDay: selectedDayIndex === windowDays.length - 1,
          activeHosts,
          selectedHarness,
          selectedModelKey,
          modelColorByKey,
          strings,
          otherLabel,
        })
      : null;

  return {
    isEmpty: false,
    scopeCaption,
    rangeCaption,
    firstDate,
    lastDate,
    lastDateIsActualToday,
    todayCaption: lastDate ? `${strings.today} · ${lastDate}` : (strings.today ?? "Today"),
    todayTokens: agg.dayTotals.get(lastDate) ?? 0,
    todayCostLabel: formatCostCaption(agg.todayHasReportedCost, agg.todayCostTotal, strings),
    todayHasReportedCost: agg.todayHasReportedCost,
    todayComposition: finalizeComposition(agg.todayComp),
    rangeTotalTokens,
    rangeCostLabel: formatCostCaption(agg.rangeHasReportedCost, agg.rangeCostTotal, strings),
    rangeHasReportedCost: agg.rangeHasReportedCost,
    rangeComposition: finalizeComposition(agg.rangeComp),
    dailyAverageTokens: windowDays.length > 0 ? rangeTotalTokens / windowDays.length : 0,
    activeDaysCount,
    windowDaysCount: windowDays.length,
    peakDay: peakDate && peakTokens > 0 ? { date: peakDate, tokens: peakTokens } : null,
    chartDays,
    peakTokens: Math.max(1, peakTokens),
    models: modelRows,
    harnesses: harnessRows,
    hosts: hostRows,
    availableHostCount: normalizedHosts.length,
    selectedHostCount: activeHosts.length,
    activeFilterLabel: resolveActiveFilterLabel(
      selectedModelKey,
      selectedHarness,
      modelRows,
      strings,
    ),
    selectedDayIndex,
    selectedDayDetail,
    strings,
  };
}
