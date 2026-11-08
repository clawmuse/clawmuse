import { z } from "zod";
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
  /** Completed output tokens per harness: [claude-code, codex, pi]. */
  tokens: number[];
  /** Tokens per top model in `usage.models` order. */
  modelTokens?: number[];
}

export interface MobileUsageWidgetModel {
  id: string;
  label: string;
  tokens: number;
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

export const EMPTY_USAGE_WIDGET_STORE: UsageWidgetStore = {
  version: 2,
  autoDeviceId: null,
  computers: [],
  states: {},
};

const MAX_USAGE_WIDGET_STATE_AGE_MS = 7 * 24 * 60 * 60_000;
const DAYS_COUNT = 30;
const TOP_MODELS_LIMIT = 5;

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
        Boolean(item && typeof item.id === "string" && typeof item.name === "string"),
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

export function selectAutoUsageWidgetDeviceId(input: {
  states: Readonly<Record<string, UsageWidgetState>>;
  preferredDeviceId?: string | null;
}): string | null {
  const { states, preferredDeviceId } = input;
  if (preferredDeviceId && states[preferredDeviceId]?.kind === "snapshot") {
    return preferredDeviceId;
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
    if (nowMs - existing.receivedAtMs <= MAX_USAGE_WIDGET_STATE_AGE_MS) {
      nextStates[id] = existing;
    }
  }
  const previous = nextStates[input.deviceId];
  if (input.state.kind === "update-desktop" && previous?.kind === "snapshot") {
    nextStates[input.deviceId] = previous;
  } else {
    nextStates[input.deviceId] = input.state;
  }

  const computers = [...store.computers];
  const existingIdx = computers.findIndex((item) => item.id === input.deviceId);
  if (existingIdx >= 0) {
    computers[existingIdx] = { id: input.deviceId, name: input.deviceName };
  } else {
    computers.push({ id: input.deviceId, name: input.deviceName });
  }

  return {
    version: 2,
    computers,
    states: nextStates,
    autoDeviceId: selectAutoUsageWidgetDeviceId({
      states: nextStates,
      preferredDeviceId: input.preferredDeviceId ?? store.autoDeviceId,
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
  const allowed = new Set(input.computers.map((item) => item.id));
  const nextStates: Record<string, UsageWidgetState> = {};
  for (const [id, state] of Object.entries(store.states)) {
    if (allowed.has(id)) {
      nextStates[id] = state;
    }
  }
  return {
    version: 2,
    computers: [...input.computers],
    states: nextStates,
    autoDeviceId: selectAutoUsageWidgetDeviceId({
      states: nextStates,
      preferredDeviceId: input.preferredDeviceId ?? store.autoDeviceId,
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

export function formatLocalIsoDay(ms: number): string {
  const date = new Date(ms);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildRecentDayKeys(nowMs: number, count = DAYS_COUNT): string[] {
  const anchor = new Date(nowMs);
  anchor.setHours(12, 0, 0, 0);
  const days: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(anchor.getTime() - i * 86_400_000);
    days.push(formatLocalIsoDay(d.getTime()));
  }
  return days;
}

function harnessIndexForProvider(provider: string): 0 | 1 | 2 {
  const lower = provider.toLowerCase();
  if (lower.includes("claude")) return 0;
  if (lower.includes("codex") || lower.includes("openai")) return 1;
  return 2;
}

function defaultHarnessLabel(idx: 0 | 1 | 2): string {
  if (idx === 0) return "Claude";
  if (idx === 1) return "Codex";
  return "Pi";
}

function cleanModelLabel(rawModel: string | null | undefined, provider: string): string {
  const trimmed = rawModel?.trim();
  if (!trimmed || trimmed === "default") {
    return defaultHarnessLabel(harnessIndexForProvider(provider));
  }
  return trimmed.replace(/^models\//, "").replace(/-\d{8}$/, "");
}

export interface PersistedHostDailyBucket {
  /** [claude-code, codex, pi] */
  money: [number, number, number];
  paid: number;
  /** [claude-code, codex, pi] */
  tokens: [number, number, number];
  models: Record<string, { label: string; tokens: number }>;
}

export interface PersistedAgentMeter {
  tokens: number;
  money: number;
  day: string;
  provider: string;
  model: string;
}

export interface HostUsageLedger {
  days: Record<string, PersistedHostDailyBucket>;
  agents: Record<string, PersistedAgentMeter>;
}

const counterSchema = z.number().finite().nonnegative();
const ledgerSchema = z.object({
  days: z.record(
    z.string(),
    z.object({
      money: z.tuple([counterSchema, counterSchema, counterSchema]),
      paid: counterSchema,
      tokens: z.tuple([counterSchema, counterSchema, counterSchema]),
      models: z.record(z.string(), z.object({ label: z.string(), tokens: counterSchema })),
    }),
  ),
  agents: z.record(
    z.string(),
    z.object({
      tokens: counterSchema,
      money: counterSchema,
      day: z.string(),
      provider: z.string(),
      model: z.string(),
    }),
  ),
});

function finiteNonnegative(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function parseUsageWidgetLedgers(raw: string | null): Record<string, HostUsageLedger> {
  try {
    const result = z.record(z.string(), ledgerSchema).safeParse(JSON.parse(raw ?? "{}"));
    return result.success ? result.data : {};
  } catch {
    return {};
  }
}

export function createEmptyHostUsageLedger(): HostUsageLedger {
  return { days: {}, agents: {} };
}

export type AgentUsageSample = Pick<
  Agent,
  "id" | "provider" | "model" | "lastUsage" | "lastActivityAt" | "updatedAt"
> & {
  turnOpen?: boolean;
};

function pruneValidDays(
  days: Readonly<Record<string, PersistedHostDailyBucket>>,
  validDays: ReadonlySet<string>,
): Record<string, PersistedHostDailyBucket> {
  const nextDays: Record<string, PersistedHostDailyBucket> = {};
  for (const [day, bucket] of Object.entries(days)) {
    if (validDays.has(day)) {
      nextDays[day] = {
        money: [...bucket.money] as [number, number, number],
        paid: bucket.paid,
        tokens: [...bucket.tokens] as [number, number, number],
        models: { ...bucket.models },
      };
    }
  }
  return nextDays;
}

function extractAgentTotals(agent: AgentUsageSample): {
  totalTokens: number;
  totalMoney: number;
  harnessIndex: 0 | 1 | 2;
} | null {
  const usage = agent.lastUsage;
  if (!usage) return null;
  // Input/context counters have different semantics across providers. Only the
  // daemon's completed-turn output counter is a session total across all providers.
  const totalTokens = finiteNonnegative(usage.tokenSpeed?.sessionTokens);
  const totalMoney = finiteNonnegative(usage.totalCostUsd);
  if (totalTokens === 0 && totalMoney === 0) return null;
  const harnessIndex = harnessIndexForProvider(agent.provider);
  return { totalTokens, totalMoney, harnessIndex };
}

function recordSingleAgentSample(
  agent: AgentUsageSample,
  nextDays: Record<string, PersistedHostDailyBucket>,
  nextAgents: Record<string, PersistedAgentMeter>,
  validDays: ReadonlySet<string>,
  nowMs: number,
): void {
  const totals = extractAgentTotals(agent);
  if (!totals) return;
  const { totalTokens, totalMoney, harnessIndex } = totals;
  const activityTime = agent.lastActivityAt?.getTime() ?? agent.updatedAt?.getTime() ?? nowMs;
  const dayKey = formatLocalIsoDay(activityTime);
  const modelLabel = cleanModelLabel(agent.model, agent.provider);
  const modelId = `${harnessIndex}:${modelLabel}`;

  const prev = nextAgents[agent.id];
  const deltaTokens = Math.max(0, totalTokens - (prev?.tokens ?? 0));
  const deltaMoney = Math.max(0, totalMoney - (prev?.money ?? 0));

  nextAgents[agent.id] = {
    tokens: Math.max(totalTokens, prev?.tokens ?? 0),
    money: Math.max(totalMoney, prev?.money ?? 0),
    day: dayKey,
    provider: agent.provider,
    model: modelLabel,
  };

  if ((deltaTokens <= 0 && deltaMoney <= 0) || !validDays.has(dayKey)) return;

  const bucket = nextDays[dayKey] ?? {
    money: [0, 0, 0],
    paid: 0,
    tokens: [0, 0, 0],
    models: {},
  };
  bucket.tokens[harnessIndex] += deltaTokens;
  bucket.money[harnessIndex] += deltaMoney;
  const existingModel = bucket.models[modelId];
  bucket.models[modelId] = {
    label: modelLabel,
    tokens: (existingModel?.tokens ?? 0) + deltaTokens,
  };
  nextDays[dayKey] = bucket;
}

/**
 * Updates a host's persistent 30-day usage ledger with the latest agent snapshots.
 * Tracks per-agent cumulative token/cost high-water marks so multi-day agents attribute
 * each day's newly generated tokens to that day and archived agents' historical totals stay intact.
 */
export function recordAgentsIntoUsageLedger(
  ledger: HostUsageLedger,
  agents: readonly AgentUsageSample[],
  nowMs: number,
): HostUsageLedger {
  const validDays = new Set(buildRecentDayKeys(nowMs, DAYS_COUNT));
  const nextDays = pruneValidDays(ledger.days, validDays);
  const nextAgents = Object.fromEntries(
    Object.entries(ledger.agents).filter(([, meter]) => validDays.has(meter.day)),
  );

  for (const agent of agents) {
    recordSingleAgentSample(agent, nextDays, nextAgents, validDays, nowMs);
  }

  return {
    days: nextDays,
    agents: nextAgents,
  };
}

export function buildUsageSeriesFromLedger(
  ledger: HostUsageLedger,
  nowMs: number,
): MobileUsageWidgetSnapshot["usage"] {
  const days = buildRecentDayKeys(nowMs, DAYS_COUNT);
  const modelTotals = new Map<string, { id: string; label: string; tokens: number }>();

  for (const day of days) {
    const bucket = ledger.days[day];
    if (!bucket) continue;
    for (const [id, entry] of Object.entries(bucket.models)) {
      if (entry.tokens <= 0) continue;
      const prev = modelTotals.get(id);
      if (prev) {
        prev.tokens += entry.tokens;
      } else {
        modelTotals.set(id, { id, label: entry.label, tokens: entry.tokens });
      }
    }
  }

  const topModels = [...modelTotals.values()]
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, TOP_MODELS_LIMIT);

  const daily: MobileUsageWidgetDay[] = days.map((day) => {
    const bucket = ledger.days[day];
    if (!bucket) {
      return {
        money: [0, 0, 0],
        paid: 0,
        tokens: [0, 0, 0],
        ...(topModels.length > 0 ? { modelTokens: [...topModels.map(() => 0), 0] } : {}),
      };
    }
    return {
      money: [
        Math.round(bucket.money[0] * 100) / 100,
        Math.round(bucket.money[1] * 100) / 100,
        Math.round(bucket.money[2] * 100) / 100,
      ],
      paid: Math.round(bucket.paid * 100) / 100,
      tokens: [
        Math.round(bucket.tokens[0]),
        Math.round(bucket.tokens[1]),
        Math.round(bucket.tokens[2]),
      ],
      ...(topModels.length > 0
        ? {
            modelTokens: [
              ...topModels.map((m) => Math.round(bucket.models[m.id]?.tokens ?? 0)),
              Math.max(
                0,
                Math.round(
                  bucket.tokens.reduce((a, b) => a + b, 0) -
                    topModels.reduce((sum, m) => sum + (bucket.models[m.id]?.tokens ?? 0), 0),
                ),
              ),
            ],
          }
        : {}),
    };
  });

  return {
    scope: "local",
    days,
    daily,
    ...(topModels.length > 0
      ? {
          models: topModels.map((model) => ({
            id: model.id,
            label: model.label,
            tokens: model.tokens,
            name: model.label,
            harness: ["claude-code", "codex", "pi"][Number(model.id.split(":")[0])] ?? "pi",
          })),
        }
      : {}),
  };
}

export function buildWidgetLocalizedStrings(locale: string): Record<string, string> {
  const isZh = locale.toLowerCase().startsWith("zh");
  if (isZh) {
    return {
      today: "今天",
      dailyAverage: "日均",
      paid: "实付",
      reportedCost: "已上报费用",
      tokenUnit: "输出 token",
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
    tokenUnit: "output tokens",
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
  ledger: HostUsageLedger;
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
  ledger: HostUsageLedger;
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

  const updatedLedger = recordAgentsIntoUsageLedger(input.ledger, input.agents, nowMs);
  const usage = buildUsageSeriesFromLedger(updatedLedger, nowMs);
  const latestReportAtMs = findLatestReportTimestampMs(input.reports);

  return {
    ledger: updatedLedger,
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
