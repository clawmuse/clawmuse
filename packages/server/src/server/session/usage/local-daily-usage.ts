import { createReadStream } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
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

interface DiscoveredJsonlFile {
  filePath: string;
  mtimeMs: number;
  size: number;
}

interface JsonlUsageSource {
  dir: string;
  parse: (lines: AsyncIterable<string>) => Promise<ParsedUsageSample[]>;
}

interface AntigravityModelChange {
  stepIndex: number;
  model: string;
}

interface AntigravitySubagentCall {
  stepIndex: number;
  role: string | null;
  model: string | null;
}

interface RawAntigravitySample {
  timestampMs: number;
  explicitModel: string | null;
  tokens: number;
}

interface ParsedAntigravityTranscript {
  modelChanges: AntigravityModelChange[];
  subagentCalls: AntigravitySubagentCall[];
  samples: RawAntigravitySample[];
}

interface CachedAntigravityTranscript {
  mtimeMs: number;
  size: number;
  transcript: ParsedAntigravityTranscript;
}

interface AntigravitySubagentLink {
  parentId: string;
  spawnStepIndex: number;
  role: string | null;
  explicitModel: string | null;
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

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isUnavailableDirectoryError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
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

// The user's model pick only appears inside USER_SETTINGS_CHANGE metadata appended to
// USER_INPUT steps, e.g.:
// "The user changed setting `Model Selection` from None to Gemini 4 Argon (High)."
// Restrict matching to trailing metadata outside </USER_REQUEST> so transcripts or prompts
// quoted inside conversation messages/tool outputs never overwrite the active model.
const USER_REQUEST_CLOSE_TAG = "</USER_REQUEST>";
const TRAILING_SETTINGS_BLOCKS_PATTERN =
  /(?:<USER_SETTINGS_CHANGE>[\s\S]*?<\/USER_SETTINGS_CHANGE>\s*)+$/;
const SETTINGS_BLOCK_PATTERN = /<USER_SETTINGS_CHANGE>([\s\S]*?)<\/USER_SETTINGS_CHANGE>/g;
const ANTIGRAVITY_MODEL_LINE_PATTERN =
  /The user changed setting `Model Selection`(?: from [^\r\n]+?)? to ([^\r\n]+?)\.(?= |\r|\n|$|<)/g;
const ANTIGRAVITY_TRANSCRIPT_CANDIDATES = ["transcript.jsonl", "transcript_full.jsonl"] as const;

function finiteStepIndex(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function unwrapQuotedJsonString(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      return typeof parsed === "string" && parsed.trim() ? parsed.trim() : null;
    } catch {
      return trimmed.slice(1, -1).trim() || null;
    }
  }
  return trimmed;
}

function extractAntigravitySettingsScope(content: string): string | null {
  const requestCloseIdx = content.lastIndexOf(USER_REQUEST_CLOSE_TAG);
  if (requestCloseIdx >= 0) {
    return content.slice(requestCloseIdx + USER_REQUEST_CLOSE_TAG.length);
  }
  const trailingMatch = TRAILING_SETTINGS_BLOCKS_PATTERN.exec(content);
  return trailingMatch ? trailingMatch[0] : null;
}

function extractAntigravityModel(content: string): string | null {
  const scope = extractAntigravitySettingsScope(content);
  if (!scope || !scope.includes("Model Selection")) return null;
  let found: string | null = null;
  for (const blockMatch of scope.matchAll(SETTINGS_BLOCK_PATTERN)) {
    const block = blockMatch[1] ?? "";
    for (const lineMatch of block.matchAll(ANTIGRAVITY_MODEL_LINE_PATTERN)) {
      const candidate = lineMatch[1]?.trim();
      if (candidate) found = candidate;
    }
  }
  return found;
}

function extractSubagentCallsFromStep(
  stepIndex: number,
  toolCalls: unknown,
): AntigravitySubagentCall[] {
  if (!Array.isArray(toolCalls)) return [];
  const calls: AntigravitySubagentCall[] = [];
  for (const rawCall of toolCalls) {
    if (!isObjectRecord(rawCall) || rawCall.name !== "invoke_subagent") continue;
    const args = isObjectRecord(rawCall.args) ? rawCall.args : null;
    calls.push({
      stepIndex,
      role: unwrapQuotedJsonString(args?.Role),
      model: unwrapQuotedJsonString(args?.Model),
    });
  }
  return calls;
}

async function parseAntigravityTranscript(
  lines: AsyncIterable<string>,
): Promise<ParsedAntigravityTranscript> {
  const modelChanges: AntigravityModelChange[] = [];
  const subagentCalls: AntigravitySubagentCall[] = [];
  const samples: RawAntigravitySample[] = [];
  let currentModel: string | null = null;

  for await (const line of lines) {
    const hasTokens = line.includes('"input_tokens"');
    const hasModelNotice = line.includes("Model Selection");
    const hasSubagent = line.includes('"invoke_subagent"');
    if (!hasTokens && !hasModelNotice && !hasSubagent) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isObjectRecord(parsed)) continue;

    const stepIndex = finiteStepIndex(parsed.step_index);
    if (parsed.type === "USER_INPUT" && typeof parsed.content === "string") {
      const model = extractAntigravityModel(parsed.content);
      if (model) {
        currentModel = model;
        modelChanges.push({ stepIndex, model });
      }
      continue;
    }

    if (parsed.type !== "PLANNER_RESPONSE") continue;
    if (hasSubagent) {
      subagentCalls.push(...extractSubagentCallsFromStep(stepIndex, parsed.tool_calls));
    }
    const tokens =
      finiteNonNegative(parsed.input_tokens) +
      finiteNonNegative(parsed.cache_read_tokens) +
      finiteNonNegative(parsed.output_tokens);
    if (tokens <= 0) continue;
    const timestampMs = parseTimestampMs(parsed.created_at);
    if (!Number.isFinite(timestampMs)) continue;
    samples.push({
      timestampMs,
      explicitModel: currentModel,
      tokens,
    });
  }

  return { modelChanges, subagentCalls, samples };
}

async function statCanonicalAntigravityTranscript(
  convDir: string,
): Promise<DiscoveredJsonlFile | null> {
  // Each conversation directory writes transcript.jsonl, transcript_full.jsonl, and
  // fixed-byte slices under chunks/{transcript,transcript_full}/*.jsonl with identical
  // PLANNER_RESPONSE records. Read only one canonical log per conversation.
  const logsDir = path.join(convDir, ".system_generated", "logs");
  for (const fileName of ANTIGRAVITY_TRANSCRIPT_CANDIDATES) {
    const filePath = path.join(logsDir, fileName);
    try {
      const fileStat = await stat(filePath);
      if (fileStat.isFile()) {
        return { filePath, mtimeMs: fileStat.mtimeMs, size: fileStat.size };
      }
    } catch (error) {
      if (!isUnavailableDirectoryError(error)) throw error;
    }
  }
  return null;
}

async function readJsonObjectIfPresent(filePath: string): Promise<Record<string, unknown> | null> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw error;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isObjectRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function readSubagentLinksForConversation(
  brainDir: string,
  parentId: string,
): Promise<Array<[string, AntigravitySubagentLink]>> {
  const subagentsDir = path.join(brainDir, parentId, ".system_generated", "subagents");
  let entries;
  try {
    entries = await readdir(subagentsDir, { withFileTypes: true });
  } catch (error) {
    if (isUnavailableDirectoryError(error)) return [];
    throw error;
  }
  const links: Array<[string, AntigravitySubagentLink]> = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const parsed = await readJsonObjectIfPresent(path.join(subagentsDir, entry.name));
    if (!parsed || typeof parsed.conversationId !== "string") continue;
    const descriptor = isObjectRecord(parsed.subagentDescriptor) ? parsed.subagentDescriptor : null;
    const role = typeof descriptor?.role === "string" ? descriptor.role.trim() || null : null;
    const explicitModel =
      typeof descriptor?.model === "string" ? descriptor.model.trim() || null : null;
    links.push([
      parsed.conversationId,
      {
        parentId,
        spawnStepIndex: finiteStepIndex(parsed.spawnStepIndex),
        role,
        explicitModel,
      },
    ]);
  }
  return links;
}

async function collectBrainSubagentLinks(
  brainDir: string,
  conversationIds: readonly string[],
): Promise<Map<string, AntigravitySubagentLink>> {
  const nested = await Promise.all(
    conversationIds.map((id) => readSubagentLinksForConversation(brainDir, id)),
  );
  return new Map(nested.flat());
}

function findSubagentCallModel(
  calls: readonly AntigravitySubagentCall[],
  spawnStepIndex: number,
  role: string | null,
): string | null {
  let matched: string | null = null;
  for (const call of calls) {
    if (call.stepIndex > spawnStepIndex) continue;
    if (role !== null && call.role !== null && call.role !== role) continue;
    matched = call.model;
  }
  return matched;
}

function findModelAtStep(
  changes: readonly AntigravityModelChange[],
  stepIndex: number,
): string | null {
  let active: string | null = null;
  for (const change of changes) {
    if (change.stepIndex <= stepIndex) {
      active = change.model;
    }
  }
  return active;
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
): Promise<DiscoveredJsonlFile[]> {
  let entries;
  try {
    entries = await readdir(rootDir, { withFileTypes: true });
  } catch (error) {
    if (isMissingFileError(error)) return [];
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
        if (isMissingFileError(error)) return [];
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
  private readonly antigravityCache = new Map<string, CachedAntigravityTranscript>();
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

  private async readAntigravityTranscript(
    file: DiscoveredJsonlFile,
    activePaths: Set<string>,
  ): Promise<ParsedAntigravityTranscript | null> {
    activePaths.add(file.filePath);
    const cached = this.antigravityCache.get(file.filePath);
    if (cached && cached.mtimeMs === file.mtimeMs && cached.size === file.size) {
      return cached.transcript;
    }
    const stream = createReadStream(file.filePath, { encoding: "utf8" });
    const lines = createInterface({ input: stream, crlfDelay: Infinity });
    try {
      const transcript = await parseAntigravityTranscript(lines);
      this.antigravityCache.set(file.filePath, {
        mtimeMs: file.mtimeMs,
        size: file.size,
        transcript,
      });
      return transcript;
    } catch (error) {
      if (isMissingFileError(error)) return null;
      throw error;
    } finally {
      lines.close();
      stream.destroy();
    }
  }

  private async resolveAntigravitySubagentModel(input: {
    convId: string;
    links: ReadonlyMap<string, AntigravitySubagentLink>;
    transcriptFiles: ReadonlyMap<string, DiscoveredJsonlFile>;
    parsedByConv: Map<string, ParsedAntigravityTranscript>;
    activePaths: Set<string>;
    visited: ReadonlySet<string>;
  }): Promise<string> {
    const { convId, links, transcriptFiles, parsedByConv, activePaths, visited } = input;
    const link = links.get(convId);
    if (!link || visited.has(convId)) return "Antigravity";
    if (link.explicitModel && link.explicitModel !== "inherit") return "Antigravity";

    const parentFile = transcriptFiles.get(link.parentId);
    if (!parentFile) return "Antigravity";
    let parentTranscript = parsedByConv.get(link.parentId) ?? null;
    if (!parentTranscript) {
      parentTranscript = await this.readAntigravityTranscript(parentFile, activePaths);
      if (!parentTranscript) return "Antigravity";
      parsedByConv.set(link.parentId, parentTranscript);
    }

    const callModel = findSubagentCallModel(
      parentTranscript.subagentCalls,
      link.spawnStepIndex,
      link.role,
    );
    if (callModel && callModel !== "inherit") return "Antigravity";

    const activeParentModel = findModelAtStep(parentTranscript.modelChanges, link.spawnStepIndex);
    if (activeParentModel) return activeParentModel;

    const nextVisited = new Set(visited);
    nextVisited.add(convId);
    return await this.resolveAntigravitySubagentModel({
      convId: link.parentId,
      links,
      transcriptFiles,
      parsedByConv,
      activePaths,
      visited: nextVisited,
    });
  }

  private async collectAntigravityBrainSamples(
    brainDir: string,
    cutoffMs: number,
    activePaths: Set<string>,
  ): Promise<ParsedUsageSample[]> {
    let entries;
    try {
      entries = await readdir(brainDir, { withFileTypes: true });
    } catch (error) {
      if (isUnavailableDirectoryError(error)) return [];
      throw error;
    }

    const conversationIds = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    const discovered = await Promise.all(
      conversationIds.map(async (convId) => {
        const file = await statCanonicalAntigravityTranscript(path.join(brainDir, convId));
        return file ? ([convId, file] as const) : null;
      }),
    );

    const transcriptFiles = new Map<string, DiscoveredJsonlFile>();
    for (const pair of discovered) {
      if (pair) transcriptFiles.set(pair[0], pair[1]);
    }

    const parsedByConv = new Map<string, ParsedAntigravityTranscript>();
    let needsFallbackResolution = false;
    for (const [convId, file] of transcriptFiles) {
      if (file.mtimeMs < cutoffMs) continue;
      const transcript = await this.readAntigravityTranscript(file, activePaths);
      if (!transcript) continue;
      parsedByConv.set(convId, transcript);
      const hasUnattributed = transcript.samples.some(
        (sample) => sample.timestampMs >= cutoffMs && sample.explicitModel === null,
      );
      if (hasUnattributed) needsFallbackResolution = true;
    }

    const subagentLinks = needsFallbackResolution
      ? await collectBrainSubagentLinks(brainDir, conversationIds)
      : new Map<string, AntigravitySubagentLink>();

    const samples: ParsedUsageSample[] = [];
    for (const [convId, transcript] of parsedByConv) {
      const recentSamples = transcript.samples.filter((sample) => sample.timestampMs >= cutoffMs);
      if (recentSamples.length === 0) continue;

      const needsFallback = recentSamples.some((sample) => sample.explicitModel === null);
      const fallbackModel = needsFallback
        ? await this.resolveAntigravitySubagentModel({
            convId,
            links: subagentLinks,
            transcriptFiles,
            parsedByConv,
            activePaths,
            visited: new Set(),
          })
        : "Antigravity";

      for (const sample of recentSamples) {
        samples.push({
          timestampMs: sample.timestampMs,
          harness: "antigravity",
          model: sample.explicitModel ?? fallbackModel,
          tokens: sample.tokens,
        });
      }
    }
    return samples;
  }

  private async collectJsonlSourceSamples(
    source: JsonlUsageSource,
    cutoffMs: number,
    activePaths: Set<string>,
  ): Promise<ParsedUsageSample[]> {
    const files = await collectRecentJsonlFiles(source.dir, cutoffMs);
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
        const samples = (await source.parse(lines)).filter(
          (sample) => sample.timestampMs >= cutoffMs,
        );
        this.fileCache.set(filePath, { mtimeMs, size, samples });
        perFile.push(samples);
      } catch (error) {
        if (!isMissingFileError(error)) throw error;
      } finally {
        lines.close();
        stream.destroy();
      }
    }
    return perFile.flat();
  }

  private async collectHistory(nowMs: number): Promise<UsageDailyHistory> {
    const cutoffMs = nowMs - (WIDGET_DAYS + 1) * DAY_MS;
    const jsonlSources: JsonlUsageSource[] = [
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
    ];
    const antigravityBrainDirs = [
      // Antigravity IDE conversations.
      path.join(this.homeDir, ".gemini", "antigravity", "brain"),
      // Antigravity CLI (`agy`) conversations.
      path.join(this.homeDir, ".gemini", "antigravity-cli", "brain"),
    ];

    const activeFilePaths = new Set<string>();
    const activeAntigravityPaths = new Set<string>();
    const [jsonlGroups, antigravityGroups] = await Promise.all([
      Promise.all(
        jsonlSources.map((source) =>
          this.collectJsonlSourceSamples(source, cutoffMs, activeFilePaths),
        ),
      ),
      Promise.all(
        antigravityBrainDirs.map((dir) =>
          this.collectAntigravityBrainSamples(dir, cutoffMs, activeAntigravityPaths),
        ),
      ),
    ]);

    for (const cachedPath of this.fileCache.keys()) {
      if (!activeFilePaths.has(cachedPath)) {
        this.fileCache.delete(cachedPath);
      }
    }
    for (const cachedPath of this.antigravityCache.keys()) {
      if (!activeAntigravityPaths.has(cachedPath)) {
        this.antigravityCache.delete(cachedPath);
      }
    }

    const allSamples = [...jsonlGroups.flat(), ...antigravityGroups.flat()];
    const history = buildUsageDailyHistoryFromSamples(allSamples, nowMs);
    this.lastResult = { atMs: nowMs, history };
    return history;
  }
}
