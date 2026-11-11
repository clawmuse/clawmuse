import type { UsageDailyHistory } from "@getpaseo/protocol/messages";
import type { ClawMuseStatusUsage, ClawMuseStatusUsageWindow } from "@/clawmuse-status/summary";
import type {
  ClawMuseProviderPlan,
  ClawMuseProviderPlanWindow,
} from "@/clawmuse-status/usage-windows";
import type { Agent } from "@/stores/session-store";
import type {
  AvailableUsageReport,
  UsageBalance,
  UsageReportEntry,
  UsageWindow,
} from "@/usage/types";

export type UsageWidgetLevel = "normal" | "warn" | "error";

export interface MobileUsageWidgetDetail {
  title: string;
  plan: string;
  rings: { fraction: number; color: string }[];
  bigValue: string;
  bigUnit: string;
  bigColor: string;
  bigCompact: boolean;
  bigCaption: string;
  legend: { label: string; color: string }[];
}

export interface MobileUsageWidgetSource {
  id: string;
  kind: "subscription" | "balance";
  name: string;
  logo: "claude" | "codex" | "grok" | "kimi" | "cindy" | null;
  monogram: string;
  value: string | null;
  unit: string | null;
  label: string | null;
  sub?: string | null;
  level: UsageWidgetLevel;
  fill: number;
  reserve: boolean;
  emphasized: boolean;
  stale?: boolean;
  when: string;
  resetsAtMs: number | null;
  unusedAtReset?: boolean;
  detail?: MobileUsageWidgetDetail;
}

export interface MobileUsageWidgetDay {
  /** Reported cost per harness: [claude-code, codex, pi]. */
  money: number[];
  /** Paid API / extra usage cost for the day. */
  paid: number;
  costAvailable?: boolean;
  /** Total tokens per harness: [claude-code, codex, pi]. */
  tokens: number[];
  /** Tokens per top model in `usage.models` order. */
  modelTokens?: number[];
}

export interface MobileUsageWidgetModel {
  name: string;
  harness: string;
}

export interface MobileUsageWidgetSnapshot {
  version: 1;
  generatedAtMs: number;
  updatedAtMs: number | null;
  locale: string;
  moneySymbol: string;
  sources: MobileUsageWidgetSource[];
  usage: {
    scope: "all" | "local";
    days: string[];
    daily: MobileUsageWidgetDay[];
    models?: MobileUsageWidgetModel[];
  };
  strings: Record<string, string>;
}

export interface UsageWidgetComputer {
  id: string;
  name: string;
}

export type UsageWidgetState =
  | {
      kind: "snapshot";
      receivedAtMs: number;
      deviceName: string;
      snapshot: MobileUsageWidgetSnapshot;
    }
  | {
      kind: "update-desktop";
      receivedAtMs: number;
      deviceName: string;
    };

export interface UsageWidgetStore {
  version: 2;
  /** Computer shown when a widget is set to "Automatic". */
  autoDeviceId: string | null;
  /** Known computers for the widget edit sheet. */
  computers: UsageWidgetComputer[];
  states: Record<string, UsageWidgetState>;
}

export const AUTO_USAGE_WIDGET_DEVICE_ID = "auto";

export const EMPTY_USAGE_WIDGET_STORE: UsageWidgetStore = {
  version: 2,
  autoDeviceId: null,
  computers: [],
  states: {},
};

const MAX_USAGE_WIDGET_STATE_AGE_MS = 7 * 24 * 60 * 60_000;
const MERGED_SERIES_MODELS = 5;
const MERGED_HISTORY_DAYS = 30;

export function parseUsageWidgetStore(raw: string | null): UsageWidgetStore {
  if (!raw) return EMPTY_USAGE_WIDGET_STORE;
  try {
    const parsed = JSON.parse(raw) as Partial<UsageWidgetStore>;
    if (
      parsed.version !== 2 ||
      !parsed.states ||
      typeof parsed.states !== "object" ||
      !Array.isArray(parsed.computers)
    ) {
      return EMPTY_USAGE_WIDGET_STORE;
    }
    return {
      version: 2,
      autoDeviceId: typeof parsed.autoDeviceId === "string" ? parsed.autoDeviceId : null,
      computers: parsed.computers.filter((item): item is UsageWidgetComputer =>
        Boolean(
          item &&
          typeof item.id === "string" &&
          item.id !== AUTO_USAGE_WIDGET_DEVICE_ID &&
          typeof item.name === "string",
        ),
      ),
      states: Object.fromEntries(
        Object.entries(parsed.states).filter(([, state]) => {
          if (
            !state ||
            typeof state.deviceName !== "string" ||
            !Number.isFinite(state.receivedAtMs)
          )
            return false;
          if (state.kind === "update-desktop") return true;
          return (
            state.kind === "snapshot" &&
            state.snapshot?.version === 1 &&
            Array.isArray(state.snapshot.sources) &&
            Array.isArray(state.snapshot.usage?.daily) &&
            Array.isArray(state.snapshot.usage?.days)
          );
        }),
      ),
    };
  } catch {
    return EMPTY_USAGE_WIDGET_STORE;
  }
}

function orderedComputerStateEntries(input: {
  states: Readonly<Record<string, UsageWidgetState>>;
  computers: readonly UsageWidgetComputer[];
  preferredDeviceId?: string | null;
}): { id: string; state: UsageWidgetState }[] {
  const { states, computers, preferredDeviceId } = input;
  const orderedIds: string[] = [];
  const seen = new Set<string>();
  const addId = (id: string | null | undefined) => {
    if (!id || id === AUTO_USAGE_WIDGET_DEVICE_ID || seen.has(id) || !states[id]) return;
    seen.add(id);
    orderedIds.push(id);
  };
  addId(preferredDeviceId);
  for (const computer of computers) {
    addId(computer.id);
  }
  const remainingIds = Object.keys(states)
    .filter((id) => id !== AUTO_USAGE_WIDGET_DEVICE_ID && !seen.has(id))
    .sort((a, b) => (states[b]?.receivedAtMs ?? 0) - (states[a]?.receivedAtMs ?? 0));
  for (const id of remainingIds) {
    addId(id);
  }
  return orderedIds.map((id) => ({ id, state: states[id]! }));
}

interface MergedSourceRecord {
  deviceId: string;
  source: MobileUsageWidgetSource;
  updatedAtMs: number;
}

function shouldReplaceMergedSource(
  existing: MergedSourceRecord,
  candidate: MergedSourceRecord,
): boolean {
  if (existing.source.kind === "balance" && candidate.source.kind === "balance") {
    const existingValue = Number(existing.source.value);
    const candidateValue = Number(candidate.source.value);
    const existingPositive = Number.isFinite(existingValue) && existingValue > 0;
    const candidatePositive = Number.isFinite(candidateValue) && candidateValue > 0;
    if (candidatePositive !== existingPositive) {
      return candidatePositive;
    }
  }
  const existingStale = existing.source.stale === true;
  const candidateStale = candidate.source.stale === true;
  if (existingStale !== candidateStale) {
    return !candidateStale;
  }
  return candidate.updatedAtMs > existing.updatedAtMs;
}

function upsertMergedSource(
  map: Map<string, MergedSourceRecord>,
  key: string,
  candidate: MergedSourceRecord,
): void {
  const existing = map.get(key);
  if (!existing) {
    map.set(key, candidate);
    return;
  }
  const emphasized = existing.source.emphasized || candidate.source.emphasized;
  if (shouldReplaceMergedSource(existing, candidate)) {
    map.set(key, {
      deviceId: candidate.deviceId,
      source:
        emphasized === candidate.source.emphasized
          ? candidate.source
          : { ...candidate.source, emphasized },
      updatedAtMs: candidate.updatedAtMs,
    });
    return;
  }
  if (emphasized !== existing.source.emphasized) {
    map.set(key, {
      ...existing,
      source: { ...existing.source, emphasized },
    });
  }
}

function assignUniqueMergedSourceIds(
  records: readonly MergedSourceRecord[],
): MobileUsageWidgetSource[] {
  const usedIds = new Set<string>();
  const result: MobileUsageWidgetSource[] = [];
  for (const { deviceId, source } of records) {
    let uniqueId = source.id;
    if (usedIds.has(uniqueId)) {
      uniqueId = `${deviceId}:${source.id}`;
      let suffix = 2;
      while (usedIds.has(uniqueId)) {
        uniqueId = `${deviceId}:${source.id}:${suffix}`;
        suffix += 1;
      }
    }
    usedIds.add(uniqueId);
    result.push(uniqueId === source.id ? source : { ...source, id: uniqueId });
  }
  return result;
}

function mergeWidgetSources(
  entries: readonly {
    id: string;
    state: Extract<UsageWidgetState, { kind: "snapshot" }>;
  }[],
): MobileUsageWidgetSource[] {
  const subscriptions = new Map<string, MergedSourceRecord>();
  const balances = new Map<string, MergedSourceRecord>();

  for (const entry of entries) {
    const updatedAtMs = entry.state.snapshot.updatedAtMs ?? entry.state.snapshot.generatedAtMs;
    for (const source of entry.state.snapshot.sources) {
      const normalizedName = source.name.trim().toLowerCase();
      const candidate: MergedSourceRecord = { deviceId: entry.id, source, updatedAtMs };
      if (source.kind === "subscription") {
        const key = `${source.logo ?? ""}:${normalizedName}`;
        upsertMergedSource(subscriptions, key, candidate);
      } else {
        const key = `${source.logo ?? ""}:${normalizedName}:${(source.unit ?? "").trim().toLowerCase()}`;
        upsertMergedSource(balances, key, candidate);
      }
    }
  }

  return assignUniqueMergedSourceIds([...subscriptions.values(), ...balances.values()]);
}

interface ModelTotalRecord {
  name: string;
  harness: string;
  byDay: number[];
  total: number;
}

function createZeroNumbers(length: number): number[] {
  return Array.from({ length }, () => 0);
}

function accumulateHostModelTokens(input: {
  usage: MobileUsageWidgetSnapshot["usage"];
  day: MobileUsageWidgetDay;
  dayTokens: number;
  dayIdx: number;
  dayCount: number;
  modelTotals: Map<string, ModelTotalRecord>;
  otherByDay: number[];
}): boolean {
  const { usage, day, dayTokens, dayIdx, dayCount, modelTotals, otherByDay } = input;
  if (
    !usage.models ||
    usage.models.length === 0 ||
    !day.modelTokens ||
    day.modelTokens.length !== usage.models.length + 1
  ) {
    if (dayTokens > 0) {
      otherByDay[dayIdx] = (otherByDay[dayIdx] ?? 0) + dayTokens;
    }
    return false;
  }

  for (let m = 0; m < usage.models.length; m += 1) {
    const model = usage.models[m]!;
    const value = day.modelTokens[m] ?? 0;
    if (value <= 0) continue;
    const key = `${model.harness}\u0000${model.name}`;
    let record = modelTotals.get(key);
    if (!record) {
      record = {
        name: model.name,
        harness: model.harness,
        byDay: createZeroNumbers(dayCount),
        total: 0,
      };
      modelTotals.set(key, record);
    }
    record.byDay[dayIdx] = (record.byDay[dayIdx] ?? 0) + value;
    record.total += value;
  }
  otherByDay[dayIdx] = (otherByDay[dayIdx] ?? 0) + (day.modelTokens[usage.models.length] ?? 0);
  return true;
}

function sumNumbers(values: readonly number[]): number {
  let sum = 0;
  for (const val of values) {
    sum += val;
  }
  return sum;
}

function addTripleInPlace(target: number[], source: readonly number[]): void {
  for (let i = 0; i < 3; i += 1) {
    target[i] = (target[i] ?? 0) + (source[i] ?? 0);
  }
}

function mergeSingleDayAcrossHosts(input: {
  dayKey: string;
  dayIdx: number;
  dayCount: number;
  perHostDays: readonly {
    usage: MobileUsageWidgetSnapshot["usage"];
    map: ReadonlyMap<string, MobileUsageWidgetDay>;
  }[];
  modelTotals: Map<string, ModelTotalRecord>;
  otherByDay: number[];
}): { day: MobileUsageWidgetDay; sawModelSeries: boolean } {
  const { dayKey, dayIdx, dayCount, perHostDays, modelTotals, otherByDay } = input;
  const money = [0, 0, 0];
  const tokens = [0, 0, 0];
  let paid = 0;
  let activeContributors = 0;
  let allActiveContributorsHaveCost = true;
  let sawModelSeries = false;

  for (const { usage, map } of perHostDays) {
    const day = map.get(dayKey);
    if (!day) continue;
    addTripleInPlace(money, day.money);
    addTripleInPlace(tokens, day.tokens);
    paid += day.paid;

    const dayTokens = sumNumbers(day.tokens);
    const dayMoney = sumNumbers(day.money) + day.paid;
    const hasCost = day.costAvailable ?? dayMoney > 0;
    if (dayTokens > 0 || hasCost) {
      activeContributors += 1;
      allActiveContributorsHaveCost = allActiveContributorsHaveCost && hasCost;
    }

    const hadModels = accumulateHostModelTokens({
      usage,
      day,
      dayTokens,
      dayIdx,
      dayCount,
      modelTotals,
      otherByDay,
    });
    sawModelSeries = sawModelSeries || hadModels;
  }

  const hasExplicitZeroCost =
    sumNumbers(tokens) === 0 &&
    sumNumbers(money) + paid === 0 &&
    perHostDays.some(({ map }) => map.get(dayKey)?.costAvailable === true);
  const costAvailable =
    activeContributors > 0 ? allActiveContributorsHaveCost : hasExplicitZeroCost;

  return {
    day: {
      money,
      paid,
      tokens,
      costAvailable,
    },
    sawModelSeries,
  };
}

export function toWidgetUsageHistory(
  dailyUsage: UsageDailyHistory | undefined,
  scope: "all" | "local" = "local",
): MobileUsageWidgetSnapshot["usage"] {
  return {
    scope,
    days: dailyUsage?.days ?? [],
    daily: (dailyUsage?.daily ?? []).map((day) => ({
      money: day.money,
      paid: day.paid,
      tokens: day.tokens,
      modelTokens: day.modelTokens,
      // COMPAT(widgetHistoryCost): added in v1.5.6, remove after 2027-05-09.
      // Beta hosts sent placeholder zero costs without availability metadata.
      costAvailable: day.costAvailable ?? day.money.some((cost) => cost > 0),
    })),
    models: dailyUsage?.models,
  };
}

export function mergeWidgetUsageHistories(
  usages: readonly MobileUsageWidgetSnapshot["usage"][],
  scope: "all" | "local" = "all",
): MobileUsageWidgetSnapshot["usage"] {
  const nonEmpty = usages.filter((usage) => usage.days.length > 0 && usage.daily.length > 0);
  if (nonEmpty.length === 0) {
    return {
      scope,
      days: [],
      daily: [],
    };
  }

  const daySet = new Set<string>();
  const perHostDays = nonEmpty.map((usage) => {
    const map = new Map<string, MobileUsageWidgetDay>();
    const count = Math.min(usage.days.length, usage.daily.length);
    for (let i = 0; i < count; i += 1) {
      const dayKey = usage.days[i];
      const dayVal = usage.daily[i];
      if (dayKey && dayVal) {
        daySet.add(dayKey);
        map.set(dayKey, dayVal);
      }
    }
    return { usage, map };
  });

  const mergedDays = [...daySet].sort().slice(-MERGED_HISTORY_DAYS);
  const modelTotals = new Map<string, ModelTotalRecord>();
  const otherByDay = createZeroNumbers(mergedDays.length);
  let hasModelSeries = false;

  const mergedDaily: MobileUsageWidgetDay[] = mergedDays.map((dayKey, dayIdx) => {
    const { day, sawModelSeries } = mergeSingleDayAcrossHosts({
      dayKey,
      dayIdx,
      dayCount: mergedDays.length,
      perHostDays,
      modelTotals,
      otherByDay,
    });
    if (sawModelSeries) {
      hasModelSeries = true;
    }
    return day;
  });

  let mergedModels: MobileUsageWidgetModel[] | undefined;
  if (hasModelSeries && modelTotals.size > 0) {
    const ranked = [...modelTotals.values()].sort((a, b) => b.total - a.total);
    const topModels = ranked.slice(0, MERGED_SERIES_MODELS);
    const overflowModels = ranked.slice(MERGED_SERIES_MODELS);
    for (const overflow of overflowModels) {
      for (let d = 0; d < mergedDays.length; d += 1) {
        otherByDay[d] = (otherByDay[d] ?? 0) + (overflow.byDay[d] ?? 0);
      }
    }
    mergedModels = topModels.map((model) => ({ name: model.name, harness: model.harness }));
    for (let d = 0; d < mergedDaily.length; d += 1) {
      mergedDaily[d]!.modelTokens = [
        ...topModels.map((model) => model.byDay[d] ?? 0),
        otherByDay[d] ?? 0,
      ];
    }
  }

  return {
    scope,
    days: mergedDays,
    daily: mergedDaily,
    ...(mergedModels ? { models: mergedModels } : {}),
  };
}

function resolvePreferredComputerId(
  preferredDeviceId: string | null | undefined,
  fallbackAutoDeviceId: string | null | undefined,
): string | null {
  if (preferredDeviceId && preferredDeviceId !== AUTO_USAGE_WIDGET_DEVICE_ID) {
    return preferredDeviceId;
  }
  if (fallbackAutoDeviceId && fallbackAutoDeviceId !== AUTO_USAGE_WIDGET_DEVICE_ID) {
    return fallbackAutoDeviceId;
  }
  return null;
}

export function buildMergedUsageWidgetState(input: {
  states: Readonly<Record<string, UsageWidgetState>>;
  computers: readonly UsageWidgetComputer[];
  preferredDeviceId?: string | null;
}): UsageWidgetState | null {
  const ordered = orderedComputerStateEntries(input);
  if (ordered.length === 0) return null;

  const snapshotEntries = ordered.filter(
    (entry): entry is { id: string; state: Extract<UsageWidgetState, { kind: "snapshot" }> } =>
      entry.state.kind === "snapshot",
  );
  if (snapshotEntries.length === 0) {
    const latestReceivedAtMs = Math.max(...ordered.map((entry) => entry.state.receivedAtMs));
    return {
      kind: "update-desktop",
      receivedAtMs: latestReceivedAtMs,
      deviceName: ordered[0]?.state.deviceName ?? "ClawMuse",
    };
  }

  const primary = snapshotEntries[0]!.state;
  const receivedAtMs = Math.max(...snapshotEntries.map((entry) => entry.state.receivedAtMs));
  const generatedAtMs = Math.max(
    ...snapshotEntries.map((entry) => entry.state.snapshot.generatedAtMs),
  );
  const updatedTimestamps = snapshotEntries
    .map((entry) => entry.state.snapshot.updatedAtMs)
    .filter((ts): ts is number => typeof ts === "number" && Number.isFinite(ts));
  const updatedAtMs = updatedTimestamps.length > 0 ? Math.max(...updatedTimestamps) : generatedAtMs;

  const sources = mergeWidgetSources(snapshotEntries);
  const usage = mergeWidgetUsageHistories(
    snapshotEntries.map((entry) => entry.state.snapshot.usage),
  );

  return {
    kind: "snapshot",
    receivedAtMs,
    deviceName: primary.snapshot.strings.scopeAll ?? primary.deviceName,
    snapshot: {
      version: 1,
      generatedAtMs,
      updatedAtMs,
      locale: primary.snapshot.locale,
      moneySymbol: primary.snapshot.moneySymbol,
      sources,
      usage,
      strings: primary.snapshot.strings,
    },
  };
}

export function selectAutoUsageWidgetDeviceId(input: {
  states: Readonly<Record<string, UsageWidgetState>>;
  preferredDeviceId?: string | null;
}): string | null {
  const { states, preferredDeviceId } = input;
  if (states[AUTO_USAGE_WIDGET_DEVICE_ID]) {
    return AUTO_USAGE_WIDGET_DEVICE_ID;
  }
  const preferred =
    preferredDeviceId && preferredDeviceId !== AUTO_USAGE_WIDGET_DEVICE_ID
      ? preferredDeviceId
      : null;
  if (preferred && states[preferred]?.kind === "snapshot") {
    return preferred;
  }
  let bestId: string | null = null;
  let bestKindRank = -1;
  let bestReceivedAt = -Infinity;
  for (const [deviceId, state] of Object.entries(states)) {
    const rank = state.kind === "snapshot" ? 2 : 1;
    if (rank > bestKindRank || (rank === bestKindRank && state.receivedAtMs > bestReceivedAt)) {
      bestId = deviceId;
      bestKindRank = rank;
      bestReceivedAt = state.receivedAtMs;
    }
  }
  return bestId;
}

export function mergeUsageWidgetState(
  store: UsageWidgetStore,
  input: {
    deviceId: string;
    deviceName: string;
    state: UsageWidgetState;
    preferredDeviceId?: string | null;
    nowMs?: number;
  },
): UsageWidgetStore {
  const nowMs = input.nowMs ?? Date.now();
  const nextStates: Record<string, UsageWidgetState> = {};
  for (const [id, existing] of Object.entries(store.states)) {
    if (
      id !== AUTO_USAGE_WIDGET_DEVICE_ID &&
      nowMs - existing.receivedAtMs <= MAX_USAGE_WIDGET_STATE_AGE_MS
    ) {
      nextStates[id] = existing;
    }
  }
  const previous = nextStates[input.deviceId];
  if (input.state.kind === "update-desktop" && previous?.kind === "snapshot") {
    nextStates[input.deviceId] = previous;
  } else {
    nextStates[input.deviceId] = input.state;
  }

  const computers = store.computers.filter((item) => item.id !== AUTO_USAGE_WIDGET_DEVICE_ID);
  const existingIdx = computers.findIndex((item) => item.id === input.deviceId);
  if (existingIdx >= 0) {
    computers[existingIdx] = { id: input.deviceId, name: input.deviceName };
  } else if (input.deviceId !== AUTO_USAGE_WIDGET_DEVICE_ID) {
    computers.push({ id: input.deviceId, name: input.deviceName });
  }

  const preferredDeviceId = resolvePreferredComputerId(input.preferredDeviceId, store.autoDeviceId);
  const mergedAutoState = buildMergedUsageWidgetState({
    states: nextStates,
    computers,
    preferredDeviceId,
  });
  if (mergedAutoState) {
    nextStates[AUTO_USAGE_WIDGET_DEVICE_ID] = mergedAutoState;
  }

  return {
    version: 2,
    computers,
    states: nextStates,
    autoDeviceId: selectAutoUsageWidgetDeviceId({
      states: nextStates,
      preferredDeviceId,
    }),
  };
}

export function reconcileUsageWidgetComputers(
  store: UsageWidgetStore,
  input: {
    computers: readonly UsageWidgetComputer[];
    preferredDeviceId?: string | null;
  },
): UsageWidgetStore {
  const computers = input.computers.filter((item) => item.id !== AUTO_USAGE_WIDGET_DEVICE_ID);
  const allowed = new Set(computers.map((item) => item.id));
  const nextStates: Record<string, UsageWidgetState> = {};
  for (const [id, state] of Object.entries(store.states)) {
    if (id !== AUTO_USAGE_WIDGET_DEVICE_ID && allowed.has(id)) {
      nextStates[id] = state;
    }
  }
  const preferredDeviceId = resolvePreferredComputerId(input.preferredDeviceId, store.autoDeviceId);
  const mergedAutoState = buildMergedUsageWidgetState({
    states: nextStates,
    computers,
    preferredDeviceId,
  });
  if (mergedAutoState) {
    nextStates[AUTO_USAGE_WIDGET_DEVICE_ID] = mergedAutoState;
  }
  return {
    version: 2,
    computers,
    states: nextStates,
    autoDeviceId: selectAutoUsageWidgetDeviceId({
      states: nextStates,
      preferredDeviceId,
    }),
  };
}

function mapSourceLogo(providerId: string): MobileUsageWidgetSource["logo"] {
  const normalized = providerId.toLowerCase();
  if (normalized.includes("claude")) return "claude";
  if (normalized.includes("codex") || normalized.includes("openai")) return "codex";
  if (normalized.includes("grok") || normalized.includes("xai")) return "grok";
  if (normalized.includes("kimi") || normalized.includes("moonshot")) return "kimi";
  if (
    normalized.includes("cindy") ||
    normalized.includes("clawmuse") ||
    normalized.includes("muse")
  ) {
    return "cindy";
  }
  return null;
}

function levelFromRemainingPercent(remainingPercent: number): UsageWidgetLevel {
  if (remainingPercent <= 10) return "error";
  if (remainingPercent <= 30) return "warn";
  return "normal";
}

function parseResetsAtMs(resetsAt: string | number | null | undefined): number | null {
  if (typeof resetsAt === "number" && Number.isFinite(resetsAt)) {
    return resetsAt > 1e11 ? resetsAt : resetsAt * 1000;
  }
  if (typeof resetsAt === "string" && resetsAt.length > 0) {
    const parsed = Date.parse(resetsAt);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function windowDurationMinutes(window: UsageWindow): number {
  const id = `${window.id} ${window.label}`.toLowerCase();
  if (
    id.includes("5h") ||
    id.includes("5-hour") ||
    id.includes("session") ||
    id.includes("5 小时")
  ) {
    return 300;
  }
  if (id.includes("7d") || id.includes("week") || id.includes("7 天") || id.includes("周")) {
    return 7 * 24 * 60;
  }
  if (id.includes("month") || id.includes("30d") || id.includes("月")) {
    return 30 * 24 * 60;
  }
  if (id.includes("day") || id.includes("24h") || id.includes("日") || id.includes("天")) {
    return 24 * 60;
  }
  return 7 * 24 * 60;
}

function computeTimeFraction(
  windowMinutes: number,
  resetsAtMs: number | null,
  nowMs: number,
): number | null {
  if (resetsAtMs === null || windowMinutes <= 0) return null;
  const totalMs = windowMinutes * 60_000;
  const remainingMs = Math.max(0, Math.min(totalMs, resetsAtMs - nowMs));
  return Math.max(0, Math.min(1, 1 - remainingMs / totalMs));
}

function willLeaveQuotaUnused(
  remainingPercent: number,
  windowMinutes: number,
  resetsAtMs: number | null,
  nowMs: number,
): boolean {
  if (resetsAtMs === null || windowMinutes < 24 * 60) return false;
  const remainingHours = (resetsAtMs - nowMs) / 3_600_000;
  if (remainingHours <= 0 || remainingHours > 72) return false;
  const timeFraction = computeTimeFraction(windowMinutes, resetsAtMs, nowMs);
  if (timeFraction === null || timeFraction < 0.5) return false;
  const usedFraction = Math.max(0, Math.min(1, (100 - remainingPercent) / 100));
  const projectedUsedAtReset = timeFraction > 0 ? usedFraction / timeFraction : 0;
  return projectedUsedAtReset < 0.75 && remainingPercent >= 25;
}

function ringColorForSource(
  logo: MobileUsageWidgetSource["logo"],
  index: number,
  level: UsageWidgetLevel,
): string {
  if (level === "error") return "error";
  if (level === "warn") return "warn";
  if (logo === "claude") {
    if (index === 0) return "claude";
    if (index === 1) return "claude2";
    return "claude3";
  }
  if (logo === "codex") return "codex";
  return "pi";
}

function computeLegendSubLevel(unusedAtReset: boolean, leftHours: number): UsageWidgetLevel {
  if (!unusedAtReset || leftHours <= 0) return "normal";
  if (leftHours <= 6) return "error";
  if (leftHours <= 24) return "warn";
  return "normal";
}

function formatShortResetDuration(
  resetsAtMs: number | null,
  nowMs: number,
  strings: Record<string, string>,
): string {
  if (resetsAtMs === null) return "";
  const diffMs = resetsAtMs - nowMs;
  if (diffMs <= 0) return "";
  const totalMinutes = Math.max(1, Math.floor(diffMs / 60_000));
  const d = Math.floor(totalMinutes / 1440);
  const h = Math.floor((totalMinutes % 1440) / 60);
  const m = totalMinutes % 60;
  const render = (key: string, vars: Record<string, string>) => {
    let template = strings[key] ?? "";
    for (const [k, v] of Object.entries(vars)) {
      template = template.replace(`{{${k}}}`, v);
    }
    return template;
  };
  if (d > 0) {
    return h > 0
      ? render("durationShort.daysHours", { d: String(d), h: String(h) })
      : render("durationShort.days", { d: String(d) });
  }
  if (h > 0) {
    return m > 0
      ? render("durationShort.hoursMinutes", { h: String(h), m: String(m) })
      : render("durationShort.hours", { h: String(h) });
  }
  return render("durationShort.minutes", { m: String(m) });
}

function shortWindowTag(window: UsageWindow): string {
  if (window.shortLabel) return window.shortLabel;
  const id = `${window.id} ${window.label}`.toLowerCase();
  if (
    id.includes("5h") ||
    id.includes("5-hour") ||
    id.includes("session") ||
    id.includes("5 小时")
  ) {
    return "5h";
  }
  if (id.includes("7d") || id.includes("week") || id.includes("7 天") || id.includes("周")) {
    return "7d";
  }
  if (id.includes("month") || id.includes("30d") || id.includes("月")) {
    return "30d";
  }
  return window.label.slice(0, 6);
}

function resolveAvailableContent(entry: UsageReportEntry): {
  content: AvailableUsageReport | null;
  stale: boolean;
} {
  if (entry.report.status === "available") {
    return { content: entry.report, stale: false };
  }
  if (entry.lastSuccessful) {
    return { content: entry.lastSuccessful.report, stale: true };
  }
  return { content: null, stale: true };
}

function resolveWindowRemainingPct(window: UsageWindow): number {
  const raw =
    window.remainingPct ??
    (window.usedPct !== undefined && window.usedPct !== null ? 100 - window.usedPct : 100);
  return Math.max(0, Math.min(100, raw));
}

function buildSubscriptionSourceFromReport(
  entry: UsageReportEntry,
  activeProviders: ReadonlySet<string>,
  nowMs: number,
  strings: Record<string, string>,
): MobileUsageWidgetSource | null {
  const { content, stale } = resolveAvailableContent(entry);
  const windows = content?.windows ?? [];
  if (windows.length === 0) return null;

  const logo = mapSourceLogo(entry.sourceId);
  const displayName = entry.account.label?.trim() || entry.sourceLabel || entry.sourceId;
  const monogram = (displayName[0] ?? entry.sourceId[0] ?? "?").toUpperCase();

  const evaluated = windows.map((window) => {
    const remainingPct = resolveWindowRemainingPct(window);
    const resetsAtMs = parseResetsAtMs(window.resetsAt);
    const durationMin = windowDurationMinutes(window);
    return {
      window,
      remainingPct,
      resetsAtMs,
      durationMin,
      timeFraction: computeTimeFraction(durationMin, resetsAtMs, nowMs),
      unusedAtReset: willLeaveQuotaUnused(remainingPct, durationMin, resetsAtMs, nowMs),
    };
  });

  // Choose the tightest window (lowest remaining percentage) for the primary tube reading.
  const tightest = evaluated.reduce((best, current) =>
    current.remainingPct < best.remainingPct ? current : best,
  );

  const remaining = Math.round(tightest.remainingPct);
  const fill = Math.max(0, Math.min(1, remaining / 100));
  const level = levelFromRemainingPercent(remaining);
  const emphasized = activeProviders.has(entry.sourceId.toLowerCase());
  const when = formatShortResetDuration(tightest.resetsAtMs, nowMs, strings);
  const anyUnusedAtReset = evaluated.some((item) => item.unusedAtReset);

  const rings = evaluated.slice(0, 3).map((item, idx) => {
    const wLevel = levelFromRemainingPercent(item.remainingPct);
    return {
      fraction: Math.max(0, Math.min(1, item.remainingPct / 100)),
      color: ringColorForSource(logo, idx, wLevel),
      track: null,
      timeFraction: item.timeFraction,
    };
  });

  const legend = evaluated.slice(0, 3).map((item, idx) => {
    const wLevel = levelFromRemainingPercent(item.remainingPct);
    const sub = formatShortResetDuration(item.resetsAtMs, nowMs, strings);
    const leftHours =
      item.resetsAtMs !== null ? (item.resetsAtMs - nowMs) / 3_600_000 : Number.POSITIVE_INFINITY;
    return {
      window: shortWindowTag(item.window),
      value: String(Math.round(item.remainingPct)),
      unit: "%",
      sub: sub || null,
      subLevel: computeLegendSubLevel(item.unusedAtReset, leftHours),
      color: ringColorForSource(logo, idx, wLevel),
    };
  });

  const detail: MobileUsageWidgetDetail = {
    title: displayName,
    plan: content?.planLabel ?? "",
    rings,
    bigValue: String(remaining),
    bigUnit: "%",
    bigCaption: when,
    bigCompact: false,
    bigColor: ringColorForSource(logo, 0, level),
    legend: legend.map((item) => ({
      label: `${item.window} ${item.value}%${item.sub ? ` · ${item.sub}` : ""}`,
      color: item.color,
    })),
  };

  return {
    id: entry.id,
    kind: "subscription",
    name: displayName,
    logo,
    monogram,
    value: String(remaining),
    unit: "%",
    label: null,
    sub: content?.planLabel ?? null,
    level,
    fill,
    reserve: false,
    emphasized,
    stale,
    when,
    resetsAtMs: tightest.resetsAtMs,
    unusedAtReset: anyUnusedAtReset,
    detail,
  };
}

function resolveBalanceTotal(balance: UsageBalance): number | null {
  if (balance.limit != null) return balance.limit;
  if (balance.remaining != null && balance.used != null) {
    return balance.remaining + balance.used;
  }
  return null;
}

function resolveBalanceFillAndLevel(
  remaining: number | null | undefined,
  total: number | null,
): { fill: number; level: UsageWidgetLevel } {
  if (remaining == null) {
    return { fill: 0.65, level: "normal" };
  }
  if (remaining <= 0) {
    return { fill: 0, level: "error" };
  }
  if (!total || total <= 0) {
    return { fill: 0.65, level: "normal" };
  }
  const ratio = Math.max(0, Math.min(1, remaining / total));
  return {
    fill: ratio,
    level: ratio <= 0.2 ? "warn" : "normal",
  };
}

function formatBalanceAmount(rawAmount: number): string {
  if (rawAmount >= 100) return String(Math.round(rawAmount));
  return rawAmount.toFixed(rawAmount >= 10 ? 1 : 2);
}

function buildBalanceSource(
  entry: UsageReportEntry,
  balance: UsageBalance,
  activeProviders: ReadonlySet<string>,
): MobileUsageWidgetSource | null {
  const { content, stale } = resolveAvailableContent(entry);
  const rawAmount = balance.remaining ?? balance.used;
  if (rawAmount === undefined || rawAmount === null || !Number.isFinite(rawAmount)) return null;

  const logo = mapSourceLogo(entry.sourceId);
  const displayName =
    balance.label?.trim() || entry.account.label?.trim() || entry.sourceLabel || entry.sourceId;
  const monogram = (displayName[0] ?? entry.sourceId[0] ?? "?").toUpperCase();
  const total = resolveBalanceTotal(balance);
  const { fill, level } = resolveBalanceFillAndLevel(balance.remaining, total);
  const unit = balance.unit === "usd" ? "$" : balance.unit;

  return {
    id: `${entry.id}:balance:${balance.id}`,
    kind: "balance",
    name: displayName,
    logo,
    monogram,
    value: formatBalanceAmount(rawAmount),
    unit,
    label: null,
    sub: content?.planLabel ?? null,
    level,
    fill,
    reserve: false,
    emphasized: activeProviders.has(entry.sourceId.toLowerCase()),
    stale,
    when: "",
    resetsAtMs: parseResetsAtMs(balance.resetsAt),
  };
}

function toSyntheticUsageWindow(
  id: "session" | "weekly",
  label: "5h" | "7d",
  window: ClawMuseProviderPlanWindow | ClawMuseStatusUsageWindow | null | undefined,
): UsageWindow | null {
  if (!window || window.unlimited) return null;
  return {
    id,
    label,
    usedPct: window.usedPercent,
    remainingPct: Math.max(0, 100 - window.usedPercent),
    resetsAt: window.resetsAt ? new Date(window.resetsAt).toISOString() : undefined,
  };
}

function buildSyntheticPlanWindows(input: {
  session?: ClawMuseProviderPlanWindow | ClawMuseStatusUsageWindow | null;
  weekly?: ClawMuseProviderPlanWindow | ClawMuseStatusUsageWindow | null;
}): UsageWindow[] {
  const session = toSyntheticUsageWindow("session", "5h", input.session);
  const weekly = toSyntheticUsageWindow("weekly", "7d", input.weekly);
  return [session, weekly].filter((item): item is UsageWindow => item !== null);
}

function buildSourcesFromFallbackPlans(
  plans: readonly ClawMuseProviderPlan[],
  serviceUsages: readonly ClawMuseStatusUsage[],
  activeProviders: ReadonlySet<string>,
  nowMs: number,
  strings: Record<string, string>,
): MobileUsageWidgetSource[] {
  const sources: MobileUsageWidgetSource[] = [];
  const seenProviders = new Set<string>();
  const nowIso = new Date(nowMs).toISOString();

  for (const plan of plans) {
    seenProviders.add(plan.provider);
    const windows = buildSyntheticPlanWindows(plan);
    if (windows.length === 0) continue;
    const built = buildSubscriptionSourceFromReport(
      {
        id: `plan:${plan.provider}:${plan.name}`,
        sourceId: plan.provider,
        sourceLabel: plan.name,
        account: { label: plan.name },
        fetchedAt: nowIso,
        successfulAt: nowIso,
        report: {
          status: "available",
          planLabel: plan.planLabel ?? undefined,
          windows,
        },
      },
      activeProviders,
      nowMs,
      strings,
    );
    if (built) sources.push(built);
  }

  for (const usage of serviceUsages) {
    if (seenProviders.has(usage.provider)) continue;
    const windows = buildSyntheticPlanWindows(usage);
    if (windows.length === 0) continue;
    const label = usage.label ?? usage.provider;
    const built = buildSubscriptionSourceFromReport(
      {
        id: `service:${usage.provider}:${label}`,
        sourceId: usage.provider,
        sourceLabel: label,
        account: { label },
        fetchedAt: nowIso,
        successfulAt: nowIso,
        report: { status: "available", windows },
      },
      activeProviders,
      nowMs,
      strings,
    );
    if (built) sources.push(built);
  }

  return sources;
}

export type AgentUsageSample = Pick<
  Agent,
  "id" | "provider" | "model" | "lastUsage" | "lastActivityAt" | "updatedAt"
> & { turnOpen?: boolean };

export function buildWidgetLocalizedStrings(locale: string): Record<string, string> {
  const isZh = locale.toLowerCase().startsWith("zh");
  if (isZh) {
    return {
      today: "今天",
      dailyAverage: "日均",
      paid: "实付",
      reportedCost: "已上报费用",
      noCostData: "暂无费用数据",
      noHistoryTitle: "暂无历史用量",
      noHistoryBody: "打开 ClawMuse 连接电脑同步用量；若仍无数据，请更新电脑端。",
      tokenUnit: "总 token",
      monthScopeAll: "近 30 天 · 全部设备",
      monthScopeLocal: "近 30 天 · 这台电脑",
      scopeAll: "全部设备",
      scopeLocal: "这台电脑",
      "harness.claude-code": "Claude Code",
      "harness.codex": "Codex",
      "harness.pi": "Pi",
      updatedJustNow: "刚刚更新",
      updatedMinutes: "{{n}} 分钟前更新",
      updatedHours: "{{n}} 小时前更新",
      updatedDays: "{{n}} 天前更新",
      "durationShort.daysHours": "{{d}}天{{h}}时",
      "durationShort.days": "{{d}}天",
      "durationShort.hoursMinutes": "{{h}}时{{m}}分",
      "durationShort.hours": "{{h}}时",
      "durationShort.minutes": "{{m}}分",
    };
  }
  return {
    today: "Today",
    dailyAverage: "Daily avg",
    paid: "Paid",
    reportedCost: "Reported cost",
    noCostData: "Cost unavailable",
    noHistoryTitle: "History unavailable",
    noHistoryBody:
      "Open ClawMuse and connect to sync usage. Update the host if history is unavailable.",
    tokenUnit: "total tokens",
    monthScopeAll: "Last 30 days · All devices",
    monthScopeLocal: "Last 30 days · This computer",
    scopeAll: "All devices",
    scopeLocal: "This computer",
    "harness.claude-code": "Claude Code",
    "harness.codex": "Codex",
    "harness.pi": "Pi",
    updatedJustNow: "Updated just now",
    updatedMinutes: "Updated {{n}}m ago",
    updatedHours: "Updated {{n}}h ago",
    updatedDays: "Updated {{n}}d ago",
    "durationShort.daysHours": "{{d}}d {{h}}h",
    "durationShort.days": "{{d}}d",
    "durationShort.hoursMinutes": "{{h}}h {{m}}m",
    "durationShort.hours": "{{h}}h",
    "durationShort.minutes": "{{m}}m",
  };
}

export interface BuildHostUsageWidgetSnapshotInput {
  reports: readonly UsageReportEntry[];
  fallbackPlans?: readonly ClawMuseProviderPlan[];
  fallbackServiceUsages?: readonly ClawMuseStatusUsage[];
  agents: readonly AgentUsageSample[];
  dailyUsage?: UsageDailyHistory;
  locale: string;
  nowMs?: number;
}

function collectSourcesFromReports(
  reports: readonly UsageReportEntry[],
  activeProviders: ReadonlySet<string>,
  nowMs: number,
  strings: Record<string, string>,
): MobileUsageWidgetSource[] {
  const sources: MobileUsageWidgetSource[] = [];
  for (const entry of reports) {
    const subscription = buildSubscriptionSourceFromReport(entry, activeProviders, nowMs, strings);
    if (subscription) {
      sources.push(subscription);
    }
    const { content } = resolveAvailableContent(entry);
    for (const balance of content?.balances ?? []) {
      const builtBalance = buildBalanceSource(entry, balance, activeProviders);
      if (builtBalance) {
        sources.push(builtBalance);
      }
    }
  }
  return sources;
}

function findLatestReportTimestampMs(reports: readonly UsageReportEntry[]): number | null {
  let latest: number | null = null;
  for (const entry of reports) {
    const ts = Date.parse(entry.successfulAt ?? entry.fetchedAt);
    if (Number.isFinite(ts) && (latest === null || ts > latest)) {
      latest = ts;
    }
  }
  return latest;
}

export function buildHostUsageWidgetSnapshot(input: BuildHostUsageWidgetSnapshotInput): {
  snapshot: MobileUsageWidgetSnapshot;
} {
  const nowMs = input.nowMs ?? Date.now();
  const strings = buildWidgetLocalizedStrings(input.locale);

  const activeProviders = new Set<string>();
  for (const agent of input.agents) {
    if (agent.turnOpen) {
      activeProviders.add(agent.provider.toLowerCase());
    }
  }

  const sources = collectSourcesFromReports(input.reports, activeProviders, nowMs, strings);
  if (
    sources.length === 0 &&
    (input.fallbackPlans?.length || input.fallbackServiceUsages?.length)
  ) {
    sources.push(
      ...buildSourcesFromFallbackPlans(
        input.fallbackPlans ?? [],
        input.fallbackServiceUsages ?? [],
        activeProviders,
        nowMs,
        strings,
      ),
    );
  }

  const usage = toWidgetUsageHistory(input.dailyUsage, "local");
  const latestReportAtMs = findLatestReportTimestampMs(input.reports);

  return {
    snapshot: {
      version: 1,
      generatedAtMs: nowMs,
      updatedAtMs: latestReportAtMs ?? nowMs,
      locale: input.locale,
      moneySymbol: "$",
      sources,
      usage,
      strings,
    },
  };
}
