import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  UsageDailyHistory,
  UsageDailyModelEntry,
  UsageDailyPoint,
} from "@getpaseo/protocol/messages";

export type UsageHarness = UsageDailyModelEntry["harness"];

const WIDGET_DAYS = 30;
const DAY_MS = 86_400_000;
const DEFAULT_CACHE_TTL_MS = 60_000;
const HARNESSES: readonly UsageHarness[] = ["claude-code", "codex", "pi", "antigravity"];

interface ParsedUsageSample {
  timestampMs: number;
  harness: UsageHarness;
  model: string;
  tokens: number;
  costUsd?: number;
}

interface CachedFileSamples {
  mtimeMs: number;
  size: number;
  samples: ParsedUsageSample[];
}

export interface LocalDailyUsageCollectorOptions {
  homeDir?: string;
  now?: () => number;
  cacheTtlMs?: number;
}

export function formatUsageModelShort(id: string): string {
  const trimmed = id.trim();
  if (!trimmed) return id;
  const withoutSuffix = trimmed
    .replace(/\[[^\]]*\]\s*$/u, "")
    .replace(/-\d{6,8}$/u, "")
    .replace(/^.*\//u, "");
  const claudeMatch = withoutSuffix.match(/^claude-(opus|sonnet|haiku)-(\d+)(?:-(\d+))?$/iu);
  if (claudeMatch) {
    const rawFamily = claudeMatch[1] ?? "Claude";
    const family = rawFamily.charAt(0).toUpperCase() + rawFamily.slice(1).toLowerCase();
    const major = claudeMatch[2] ?? "";
    const minor = claudeMatch[3];
    return minor ? `${family} ${major}.${minor}` : `${family} ${major}`;
  }
  if (/^gpt-/iu.test(withoutSuffix)) {
    return withoutSuffix.toUpperCase();
  }
  return withoutSuffix || trimmed;
}

export function formatLocalDayKey(ms: number): string {
  const date = new Date(ms);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildRecentDayKeys(nowMs: number, count = WIDGET_DAYS): string[] {
  const end = new Date(nowMs);
  end.setHours(12, 0, 0, 0);
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    keys.push(formatLocalDayKey(end.getTime() - i * DAY_MS));
  }
  return keys;
}

function finiteNonNegative(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseClaudeLine(line: string, seenMessages: Map<string, ParsedUsageSample>): void {
  if (!line.includes('"usage"')) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return;
  }
  if (!isObjectRecord(parsed)) return;
  const message = isObjectRecord(parsed.message) ? parsed.message : null;
  const usage = message && isObjectRecord(message.usage) ? message.usage : null;
  if (!usage) return;
  const timestampMs = typeof parsed.timestamp === "string" ? Date.parse(parsed.timestamp) : NaN;
  if (!Number.isFinite(timestampMs)) return;
  const tokens =
    finiteNonNegative(usage.input_tokens) +
    finiteNonNegative(usage.cache_creation_input_tokens) +
    finiteNonNegative(usage.cache_read_input_tokens) +
    finiteNonNegative(usage.output_tokens);
  if (tokens <= 0) return;
  const rawModel =
    typeof message?.model === "string" && message.model.trim() ? message.model : "claude";
  const msgId =
    (typeof message?.id === "string" && message.id) ||
    (typeof parsed.requestId === "string" && parsed.requestId) ||
    `${timestampMs}:${seenMessages.size}`;
  seenMessages.set(msgId, {
    timestampMs,
    harness: "claude-code",
    model: rawModel,
    tokens,
  });
}

async function parseClaudeFileContent(lines: AsyncIterable<string>): Promise<ParsedUsageSample[]> {
  const seenMessages = new Map<string, ParsedUsageSample>();
  for await (const line of lines) {
    if (line) parseClaudeLine(line, seenMessages);
  }
  return [...seenMessages.values()];
}

function zeroArray(length: number): number[] {
  return Array.from({ length }, () => 0);
}

function parseTimestampMs(rawTs: unknown): number {
  if (typeof rawTs === "number") return rawTs;
  if (typeof rawTs === "string") return Date.parse(rawTs);
  return NaN;
}

function extractCodexLineTokens(payload: Record<string, unknown> | null): number {
  const info = payload && isObjectRecord(payload.info) ? payload.info : null;
  const totalUsage = info && isObjectRecord(info.total_token_usage) ? info.total_token_usage : null;
  return finiteNonNegative(totalUsage?.total_tokens);
}

async function parseCodexFileContent(lines: AsyncIterable<string>): Promise<ParsedUsageSample[]> {
  const samples: ParsedUsageSample[] = [];
  let currentModel = "codex";
  let prevTotal = 0;
  for await (const line of lines) {
    if (!line.includes('"token_count"') && !line.includes('"turn_context"')) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isObjectRecord(parsed)) continue;
    const payload = isObjectRecord(parsed.payload) ? parsed.payload : null;
    if (
      parsed.type === "turn_context" &&
      typeof payload?.model === "string" &&
      payload.model.trim()
    ) {
      currentModel = payload.model.trim();
      continue;
    }
    if (parsed.type !== "event_msg" || payload?.type !== "token_count") continue;
    const totalTokens = extractCodexLineTokens(payload);
    if (totalTokens <= prevTotal) continue;
    const delta = totalTokens - prevTotal;
    prevTotal = totalTokens;
    const timestampMs = parseTimestampMs(parsed.timestamp);
    if (!Number.isFinite(timestampMs)) continue;
    samples.push({
      timestampMs,
      harness: "codex",
      model: currentModel,
      tokens: delta,
    });
  }
  return samples;
}

// The user's model pick only appears inside USER_SETTINGS_CHANGE notices, e.g.
// "The user changed setting `Model Selection` from None to Gemini 4 Argon (High)."
const ANTIGRAVITY_MODEL_PATTERN = /`Model Selection`(?:\s+from\s+.*?)?\s+to\s+(.+?)\.(?=\s|$|<)/;

function extractAntigravityModel(content: string): string | null {
  const match = ANTIGRAVITY_MODEL_PATTERN.exec(content);
  const model = match?.[1]?.trim();
  return model ? model : null;
}

async function parseAntigravityFileContent(
  lines: AsyncIterable<string>,
): Promise<ParsedUsageSample[]> {
  const samples: ParsedUsageSample[] = [];
  // Transcripts before the settings notice carried no model name; group them under
  // the harness label instead of guessing.
  let currentModel = "Antigravity";
  for await (const line of lines) {
    if (!line.includes('"input_tokens"') && !line.includes("Model Selection")) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isObjectRecord(parsed)) continue;
    if (typeof parsed.content === "string") {
      const model = extractAntigravityModel(parsed.content);
      if (model) currentModel = model;
    }
    if (parsed.type !== "PLANNER_RESPONSE") continue;
    const tokens =
      finiteNonNegative(parsed.input_tokens) +
      finiteNonNegative(parsed.cache_read_tokens) +
      finiteNonNegative(parsed.output_tokens);
    if (tokens <= 0) continue;
    const timestampMs = parseTimestampMs(parsed.created_at);
    if (!Number.isFinite(timestampMs)) continue;
    samples.push({
      timestampMs,
      harness: "antigravity",
      model: currentModel,
      tokens,
    });
  }
  return samples;
}

function reportedPiCost(usage: Record<string, unknown>): number | undefined {
  const cost = isObjectRecord(usage.cost) ? usage.cost.total : undefined;
  return typeof cost === "number" && Number.isFinite(cost) && cost >= 0 ? cost : undefined;
}

async function parsePiFileContent(lines: AsyncIterable<string>): Promise<ParsedUsageSample[]> {
  const samples: ParsedUsageSample[] = [];
  let currentModel = "pi";
  for await (const line of lines) {
    if (!line.includes('"usage"') && !line.includes('"model"')) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isObjectRecord(parsed)) continue;
    if (typeof parsed.model === "string" && parsed.model.trim()) {
      currentModel = parsed.model.trim();
    }
    const message = isObjectRecord(parsed.message) ? parsed.message : parsed;
    if (typeof message.model === "string" && message.model.trim()) {
      currentModel = message.model.trim();
    }
    const usage = isObjectRecord(message.usage) ? message.usage : null;
    if (!usage) continue;
    const tokens =
      finiteNonNegative(usage.totalTokens) ||
      finiteNonNegative(usage.input) +
        finiteNonNegative(usage.output) +
        finiteNonNegative(usage.cacheRead) +
        finiteNonNegative(usage.cacheWrite) ||
      finiteNonNegative(usage.inputTokens) +
        finiteNonNegative(usage.outputTokens) +
        finiteNonNegative(usage.cachedInputTokens);
    if (tokens <= 0) continue;
    const timestampMs = parseTimestampMs(parsed.timestamp ?? message.timestamp);
    if (!Number.isFinite(timestampMs)) continue;
    samples.push({
      timestampMs,
      harness: "pi",
      model: currentModel,
      tokens,
      costUsd: reportedPiCost(usage),
    });
  }
  return samples;
}

async function collectRecentJsonlFiles(
  rootDir: string,
  cutoffMs: number,
): Promise<Array<{ filePath: string; mtimeMs: number; size: number }>> {
  let entries;
  try {
    entries = await readdir(rootDir, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) {
        return await collectRecentJsonlFiles(fullPath, cutoffMs);
      }
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) return [];
      try {
        const fileStat = await stat(fullPath);
        if (fileStat.mtimeMs < cutoffMs) return [];
        return [{ filePath: fullPath, mtimeMs: fileStat.mtimeMs, size: fileStat.size }];
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
        throw error;
      }
    }),
  );
  return nested.flat();
}

export function buildUsageDailyHistoryFromSamples(
  samples: readonly ParsedUsageSample[],
  nowMs: number,
): UsageDailyHistory {
  const days = buildRecentDayKeys(nowMs, WIDGET_DAYS);
  const indexOfDay = new Map(days.map((day, idx) => [day, idx]));
  const dailyTotals = days.map(() => ({
    money: zeroArray(HARNESSES.length),
    paid: 0,
    tokens: zeroArray(HARNESSES.length),
    sampleCount: 0,
    knownCostCount: 0,
  }));

  interface ModelAggregate {
    harness: UsageHarness;
    tokensByDay: number[];
    totalTokens: number;
  }
  const byModel = new Map<string, ModelAggregate>();

  for (const sample of samples) {
    if (sample.tokens <= 0) continue;
    const dayKey = formatLocalDayKey(sample.timestampMs);
    const dayIdx = indexOfDay.get(dayKey);
    if (dayIdx === undefined) continue;
    const harnessIdx = HARNESSES.indexOf(sample.harness);
    if (harnessIdx < 0) continue;
    const point = dailyTotals[dayIdx]!;
    point.tokens[harnessIdx]! += sample.tokens;
    point.sampleCount += 1;
    if (sample.costUsd !== undefined) {
      point.money[harnessIdx]! += sample.costUsd;
      point.knownCostCount += 1;
    }

    const modelName = formatUsageModelShort(sample.model);
    const modelKey = `${sample.harness}:${modelName}`;
    const existing = byModel.get(modelKey) ?? {
      harness: sample.harness,
      tokensByDay: zeroArray(days.length),
      totalTokens: 0,
    };
    existing.tokensByDay[dayIdx]! += sample.tokens;
    existing.totalTokens += sample.tokens;
    byModel.set(modelKey, existing);
  }

  // Every series is reported: each sample carries its model, so nothing is folded into an
  // anonymous bucket. The trailing "other" slot stays in the wire shape for older clients but
  // is always zero; hosts only fill it when a day's tokens have no model to attribute to.
  const ranked = [...byModel.entries()]
    .filter(([, entry]) => entry.totalTokens > 0)
    .sort((a, b) => b[1].totalTokens - a[1].totalTokens);

  const models: UsageDailyModelEntry[] = ranked.map(([name, entry]) => ({
    name: name.slice(name.indexOf(":") + 1),
    harness: entry.harness,
  }));

  const daily: UsageDailyPoint[] = dailyTotals.map((point, dayIdx) => {
    const day = {
      money: point.money,
      paid: point.paid,
      tokens: point.tokens,
      costAvailable: point.sampleCount > 0 && point.knownCostCount === point.sampleCount,
    };
    if (ranked.length === 0) return day;
    const modelTokens = [...ranked.map(([, entry]) => entry.tokensByDay[dayIdx] ?? 0), 0];
    return {
      money: day.money,
      paid: day.paid,
      tokens: day.tokens,
      costAvailable: day.costAvailable,
      modelTokens,
    };
  });

  return {
    days,
    daily,
    ...(models.length > 0 ? { models } : {}),
  };
}

export class LocalDailyUsageCollector {
  private readonly homeDir: string;
  private readonly now: () => number;
  private readonly cacheTtlMs: number;
  private readonly fileCache = new Map<string, CachedFileSamples>();
  private inFlight: Promise<UsageDailyHistory> | null = null;
  private lastResult: { atMs: number; history: UsageDailyHistory } | null = null;

  constructor(options: LocalDailyUsageCollectorOptions = {}) {
    this.homeDir = options.homeDir ?? os.homedir();
    this.now = options.now ?? Date.now;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  }

  async collect(forceRefresh = false): Promise<UsageDailyHistory> {
    const nowMs = this.now();
    if (!forceRefresh && this.lastResult && nowMs - this.lastResult.atMs < this.cacheTtlMs) {
      return this.lastResult.history;
    }

    if (this.inFlight) return this.inFlight;
    this.inFlight = this.collectHistory(nowMs);
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async collectHistory(nowMs: number): Promise<UsageDailyHistory> {
    const cutoffMs = nowMs - (WIDGET_DAYS + 1) * DAY_MS;
    const sources: Array<{
      dir: string;
      parse: (lines: AsyncIterable<string>) => Promise<ParsedUsageSample[]>;
    }> = [
      {
        dir: path.join(this.homeDir, ".claude", "projects"),
        parse: parseClaudeFileContent,
      },
      {
        dir: path.join(this.homeDir, ".codex", "sessions"),
        parse: parseCodexFileContent,
      },
      {
        dir: path.join(this.homeDir, ".codex", "archived_sessions"),
        parse: parseCodexFileContent,
      },
      {
        dir: path.join(this.homeDir, ".omp", "agent", "sessions"),
        parse: parsePiFileContent,
      },
      {
        dir: path.join(this.homeDir, ".pi", "agent", "sessions"),
        parse: parsePiFileContent,
      },
      {
        // Antigravity IDE conversations.
        dir: path.join(this.homeDir, ".gemini", "antigravity", "brain"),
        parse: parseAntigravityFileContent,
      },
      {
        // Antigravity CLI (`agy`) conversations.
        dir: path.join(this.homeDir, ".gemini", "antigravity-cli", "brain"),
        parse: parseAntigravityFileContent,
      },
    ];

    const activePaths = new Set<string>();
    const sampleGroups = await Promise.all(
      sources.map(async ({ dir, parse }) => {
        const files = await collectRecentJsonlFiles(dir, cutoffMs);
        const perFile: ParsedUsageSample[][] = [];
        for (const { filePath, mtimeMs, size } of files) {
          activePaths.add(filePath);
          const cached = this.fileCache.get(filePath);
          if (cached && cached.mtimeMs === mtimeMs && cached.size === size) {
            perFile.push(cached.samples);
            continue;
          }
          const stream = createReadStream(filePath, { encoding: "utf8" });
          const lines = createInterface({ input: stream, crlfDelay: Infinity });
          try {
            const samples = (await parse(lines)).filter((sample) => sample.timestampMs >= cutoffMs);
            this.fileCache.set(filePath, { mtimeMs, size, samples });
            perFile.push(samples);
          } catch (error) {
            if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
              throw error;
          } finally {
            lines.close();
            stream.destroy();
          }
        }
        return perFile.flat();
      }),
    );

    for (const cachedPath of this.fileCache.keys()) {
      if (!activePaths.has(cachedPath)) {
        this.fileCache.delete(cachedPath);
      }
    }

    const history = buildUsageDailyHistoryFromSamples(sampleGroups.flat(), nowMs);
    this.lastResult = { atMs: nowMs, history };
    return history;
  }
}
