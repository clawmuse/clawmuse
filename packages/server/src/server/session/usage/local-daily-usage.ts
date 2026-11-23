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

export interface UsageTokenBreakdown {
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
}

export interface ParsedUsageSample {
  timestampMs: number;
  harness: UsageHarness;
  model: string;
  tokens: number;
  costUsd?: number;
  breakdown?: UsageTokenBreakdown;
  dedupKey?: string;
}

interface ParsedJsonlFileResult {
  samples: ParsedUsageSample[];
  sessionId?: string;
}

interface CachedFileSamples {
  mtimeMs: number;
  size: number;
  result: ParsedJsonlFileResult;
}

interface DiscoveredJsonlFile {
  filePath: string;
  mtimeMs: number;
  size: number;
}

interface JsonlUsageSource {
  kind: "claude-code" | "codex" | "pi";
  dir: string;
  parse: (lines: AsyncIterable<string>) => Promise<ParsedJsonlFileResult>;
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
  stepIndex: number;
  timestampMs: number;
  explicitModel: string | null;
  tokens: number;
  breakdown: UsageTokenBreakdown;
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

export type ProviderEnvMap = Readonly<Record<string, string | undefined>>;

export interface LocalDailyUsageCollectorOptions {
  homeDir?: string;
  now?: () => number;
  cacheTtlMs?: number;
  /** Process environment for resolving custom provider directories (defaults to `process.env` when `homeDir` is omitted). */
  env?: ProviderEnvMap;
  /** Optional provider profile environments from daemon config so custom config dirs are scanned too. */
  getExtraEnvs?: () => readonly (ProviderEnvMap | undefined)[];
}

function capitalizeWord(word: string): string {
  if (!word) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function formatEffortLabel(effort: string): string {
  switch (effort.toLowerCase()) {
    case "xhigh":
      return "XHigh";
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    default:
      return capitalizeWord(effort);
  }
}

function formatAntigravityModelShort(withoutSuffix: string): string | null {
  const orchestratorMatch = withoutSuffix.match(
    /^gemini-pro-orchestrator(?:-(carbon|neon|argon))?$/iu,
  );
  if (orchestratorMatch) {
    const variant = orchestratorMatch[1] ? capitalizeWord(orchestratorMatch[1]) : "Carbon";
    return `Orchestrator (${variant})`;
  }
  if (/^gemini-flash-worker(?:-agy)?$/iu.test(withoutSuffix)) {
    return "Gemini Flash Worker";
  }
  const geminiMatch = withoutSuffix.match(
    /^gemini-([\d.]+)-([a-z0-9]+)(?:-(low|medium|high|xhigh))?$/iu,
  );
  if (geminiMatch) {
    const version = geminiMatch[1] ?? "";
    const variant = capitalizeWord(geminiMatch[2] ?? "");
    const effort = geminiMatch[3] ? ` (${formatEffortLabel(geminiMatch[3])})` : "";
    return `Gemini ${version} ${variant}${effort}`;
  }
  const gptOssMatch = withoutSuffix.match(/^gpt-oss-(\d+b)-(low|medium|high|xhigh)$/iu);
  if (gptOssMatch) {
    return `GPT-OSS ${(gptOssMatch[1] ?? "").toUpperCase()} (${formatEffortLabel(gptOssMatch[2] ?? "")})`;
  }
  return null;
}

function formatClaudeModelShort(withoutSuffix: string): string | null {
  const claudeEffortMatch = withoutSuffix.match(
    /^claude-([a-z]+)-(\d+)(?:-(\d+))?-(low|medium|high|xhigh)$/iu,
  );
  if (claudeEffortMatch) {
    const family = capitalizeWord(claudeEffortMatch[1] ?? "Claude");
    const major = claudeEffortMatch[2] ?? "";
    const minor = claudeEffortMatch[3];
    const ver = minor ? `${major}.${minor}` : major;
    return `Claude ${family} ${ver} (${formatEffortLabel(claudeEffortMatch[4] ?? "")})`;
  }

  const claudeMatch = withoutSuffix.match(/^claude-([a-z]+)-(\d+)(?:-(\d+))?$/iu);
  if (claudeMatch) {
    const family = capitalizeWord(claudeMatch[1] ?? "Claude");
    const major = claudeMatch[2] ?? "";
    const minor = claudeMatch[3];
    return minor ? `${family} ${major}.${minor}` : `${family} ${major}`;
  }
  return null;
}

export function formatUsageModelShort(id: string): string {
  const trimmed = id.trim();
  if (!trimmed) return id;
  const withoutSuffix = trimmed
    .replace(/\[[^\]]*\]\s*$/u, "")
    .replace(/-\d{6,8}$/u, "")
    .replace(/^.*\//u, "");

  const agyFormatted = formatAntigravityModelShort(withoutSuffix);
  if (agyFormatted) return agyFormatted;

  const claudeFormatted = formatClaudeModelShort(withoutSuffix);
  if (claudeFormatted) return claudeFormatted;

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

function shouldReplaceDedupedSample(
  existing: { tokens: number; timestampMs: number } | undefined,
  candidate: { tokens: number; timestampMs: number },
): boolean {
  if (!existing) return true;
  if (candidate.tokens > existing.tokens) return true;
  return candidate.tokens === existing.tokens && candidate.timestampMs >= existing.timestampMs;
}

function nonEmptyTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function extractClaudeUsageSample(
  parsed: Record<string, unknown>,
): { sample: ParsedUsageSample; explicitMsgId: string | null } | null {
  // Only count assistant messages (skip user/attachment/system records that happen to mention usage).
  // Records without a top-level `type` remain accepted for synthetic/minimal transcript fixtures.
  if (typeof parsed.type === "string" && parsed.type !== "assistant") return null;
  const message = isObjectRecord(parsed.message) ? parsed.message : null;
  const usage = message && isObjectRecord(message.usage) ? message.usage : null;
  if (!usage) return null;
  const timestampMs = typeof parsed.timestamp === "string" ? Date.parse(parsed.timestamp) : NaN;
  if (!Number.isFinite(timestampMs)) return null;

  const rawModel = nonEmptyTrimmedString(message?.model) ?? "claude";
  if (rawModel === "<synthetic>") return null;

  const inputTokens = finiteNonNegative(usage.input_tokens);
  const cacheWriteTokens = finiteNonNegative(usage.cache_creation_input_tokens);
  const cacheReadTokens = finiteNonNegative(usage.cache_read_input_tokens);
  const outputTokens = finiteNonNegative(usage.output_tokens);
  const tokens = inputTokens + cacheWriteTokens + cacheReadTokens + outputTokens;
  if (tokens <= 0) return null;

  const explicitMsgId =
    nonEmptyTrimmedString(message?.id) ?? nonEmptyTrimmedString(parsed.requestId);
  return {
    explicitMsgId,
    sample: {
      timestampMs,
      harness: "claude-code",
      model: rawModel,
      tokens,
      breakdown: {
        inputTokens,
        cacheReadTokens,
        cacheWriteTokens,
        outputTokens,
      },
      ...(explicitMsgId ? { dedupKey: explicitMsgId } : {}),
    },
  };
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
  const extracted = extractClaudeUsageSample(parsed);
  if (!extracted) return;

  const mapKey = extracted.explicitMsgId ?? `${extracted.sample.timestampMs}:${seenMessages.size}`;
  if (shouldReplaceDedupedSample(seenMessages.get(mapKey), extracted.sample)) {
    seenMessages.set(mapKey, extracted.sample);
  }
}

async function parseClaudeFileContent(
  lines: AsyncIterable<string>,
): Promise<ParsedJsonlFileResult> {
  const seenMessages = new Map<string, ParsedUsageSample>();
  for await (const line of lines) {
    if (line) parseClaudeLine(line, seenMessages);
  }
  return { samples: [...seenMessages.values()] };
}

function zeroArray(length: number): number[] {
  return Array.from({ length }, () => 0);
}

function parseTimestampMs(rawTs: unknown): number {
  if (typeof rawTs === "number") return rawTs;
  if (typeof rawTs === "string") return Date.parse(rawTs);
  return NaN;
}

interface CodexTokenCounters {
  total: number;
  input: number;
  cachedInput: number;
  cacheWriteInput: number;
  output: number;
  hasBreakdown: boolean;
}

interface CodexParserState {
  sessionId?: string;
  forkedFromId: string | null;
  sessionCreatedMs: number;
  currentModel: string;
  prev: CodexTokenCounters;
}

function emptyCodexCounters(): CodexTokenCounters {
  return {
    total: 0,
    input: 0,
    cachedInput: 0,
    cacheWriteInput: 0,
    output: 0,
    hasBreakdown: false,
  };
}

function extractCodexCounters(usage: Record<string, unknown> | null): CodexTokenCounters {
  if (!usage) return emptyCodexCounters();
  const input = finiteNonNegative(usage.input_tokens);
  const cachedInput = finiteNonNegative(usage.cached_input_tokens);
  const cacheWriteInput = finiteNonNegative(usage.cache_write_input_tokens);
  const output = finiteNonNegative(usage.output_tokens);
  const total = finiteNonNegative(usage.total_tokens) || input + output;
  const hasBreakdown = input > 0 || output > 0 || cachedInput > 0 || cacheWriteInput > 0;
  return { total, input, cachedInput, cacheWriteInput, output, hasBreakdown };
}

function buildCodexBreakdown(
  deltaTotal: number,
  deltaInput: number,
  deltaCachedInput: number,
  deltaCacheWriteInput: number,
  deltaOutput: number,
): UsageTokenBreakdown | undefined {
  if (deltaInput <= 0 && deltaOutput <= 0 && deltaCachedInput <= 0 && deltaCacheWriteInput <= 0) {
    return undefined;
  }
  // Codex `input_tokens` already includes `cached_input_tokens` and `cache_write_input_tokens`,
  // and `total_tokens === input_tokens + output_tokens`. Split cached out of input so the four
  // buckets are disjoint and sum to `deltaTotal`.
  const cacheReadTokens = Math.min(deltaCachedInput, deltaInput);
  const cacheWriteTokens = Math.min(
    deltaCacheWriteInput,
    Math.max(0, deltaInput - cacheReadTokens),
  );
  const inputTokens = Math.max(0, deltaInput - cacheReadTokens - cacheWriteTokens);
  const outputTokens = Math.max(0, deltaOutput);
  if (inputTokens + cacheReadTokens + cacheWriteTokens + outputTokens !== deltaTotal) {
    return undefined;
  }
  return {
    inputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    outputTokens,
  };
}

function applyCodexMetaOrContext(
  parsed: Record<string, unknown>,
  payload: Record<string, unknown>,
  state: CodexParserState,
): boolean {
  if (parsed.type === "session_meta") {
    const sid = nonEmptyTrimmedString(payload.id);
    if (sid) state.sessionId = sid;
    const forked = nonEmptyTrimmedString(payload.forked_from_id);
    if (forked) state.forkedFromId = forked;
    const metaTs = parseTimestampMs(payload.timestamp ?? parsed.timestamp);
    if (Number.isFinite(metaTs)) state.sessionCreatedMs = metaTs;
    return true;
  }
  if (parsed.type === "turn_context") {
    const model = nonEmptyTrimmedString(payload.model);
    if (model) state.currentModel = model;
    return true;
  }
  return false;
}

function computeCodexTokenDelta(
  totalCounters: CodexTokenCounters,
  lastCounters: CodexTokenCounters,
  prev: CodexTokenCounters,
): { delta: number; breakdown?: UsageTokenBreakdown } | null {
  if (totalCounters.total > prev.total) {
    const delta = totalCounters.total - prev.total;
    const breakdown = totalCounters.hasBreakdown
      ? buildCodexBreakdown(
          delta,
          Math.max(0, totalCounters.input - prev.input),
          Math.max(0, totalCounters.cachedInput - prev.cachedInput),
          Math.max(0, totalCounters.cacheWriteInput - prev.cacheWriteInput),
          Math.max(0, totalCounters.output - prev.output),
        )
      : undefined;
    return { delta, breakdown };
  }
  if (totalCounters.total > 0 && totalCounters.total < prev.total) {
    // Counter reset (e.g. session restart or compaction reset): do not drop subsequent tokens.
    const fallback = lastCounters.total > 0 ? lastCounters : totalCounters;
    const breakdown = fallback.hasBreakdown
      ? buildCodexBreakdown(
          fallback.total,
          fallback.input,
          fallback.cachedInput,
          fallback.cacheWriteInput,
          fallback.output,
        )
      : undefined;
    return { delta: fallback.total, breakdown };
  }
  return null;
}

function consumeCodexTokenEvent(
  parsed: Record<string, unknown>,
  payload: Record<string, unknown>,
  state: CodexParserState,
  samples: ParsedUsageSample[],
): void {
  const info = isObjectRecord(payload.info) ? payload.info : null;
  const totalCounters = extractCodexCounters(
    info && isObjectRecord(info.total_token_usage) ? info.total_token_usage : null,
  );
  const lastCounters = extractCodexCounters(
    info && isObjectRecord(info.last_token_usage) ? info.last_token_usage : null,
  );

  const change = computeCodexTokenDelta(totalCounters, lastCounters, state.prev);
  if (!change) return;
  state.prev = totalCounters;

  const timestampMs = parseTimestampMs(parsed.timestamp);
  if (!Number.isFinite(timestampMs) || change.delta <= 0) return;

  // A forked rollout file can replay parent `token_count` records timestamped before the fork
  // was created. Advance baselines above without emitting duplicate parent tokens.
  if (
    state.forkedFromId &&
    Number.isFinite(state.sessionCreatedMs) &&
    timestampMs < state.sessionCreatedMs
  ) {
    return;
  }

  samples.push({
    timestampMs,
    harness: "codex",
    model: state.currentModel,
    tokens: change.delta,
    ...(change.breakdown ? { breakdown: change.breakdown } : {}),
  });
}

async function parseCodexFileContent(lines: AsyncIterable<string>): Promise<ParsedJsonlFileResult> {
  const samples: ParsedUsageSample[] = [];
  const state: CodexParserState = {
    forkedFromId: null,
    sessionCreatedMs: NaN,
    currentModel: "codex",
    prev: emptyCodexCounters(),
  };

  for await (const line of lines) {
    if (
      !line.includes('"token_count"') &&
      !line.includes('"turn_context"') &&
      !line.includes('"session_meta"')
    ) {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isObjectRecord(parsed)) continue;
    const payload = isObjectRecord(parsed.payload) ? parsed.payload : null;
    if (!payload) continue;
    if (applyCodexMetaOrContext(parsed, payload, state)) continue;
    if (parsed.type === "event_msg" && payload.type === "token_count") {
      consumeCodexTokenEvent(parsed, payload, state, samples);
    }
  }
  return { samples, ...(state.sessionId ? { sessionId: state.sessionId } : {}) };
}

// The user's model pick appears inside USER_SETTINGS_CHANGE metadata appended to USER_INPUT steps,
// e.g. "The user changed setting `Model Selection` from None to Gemini 4 Argon (High)."
// Antigravity CLI also writes `model` directly on each PLANNER_RESPONSE record; prefer that exact
// per-step model when present, and keep USER_SETTINGS_CHANGE as fallback for IDE transcripts.
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

function parseAntigravityPlannerStep(
  parsed: Record<string, unknown>,
  stepIndex: number,
  currentModel: string | null,
): RawAntigravitySample | null {
  const inputTokens = finiteNonNegative(parsed.input_tokens);
  const cacheReadTokens = finiteNonNegative(parsed.cache_read_tokens);
  const outputTokens = finiteNonNegative(parsed.output_tokens);
  const tokens = inputTokens + cacheReadTokens + outputTokens;
  if (tokens <= 0) return null;

  const timestampMs = parseTimestampMs(parsed.created_at);
  if (!Number.isFinite(timestampMs)) return null;

  const stepModel = nonEmptyTrimmedString(parsed.model);
  return {
    stepIndex,
    timestampMs,
    explicitModel: stepModel ?? currentModel,
    tokens,
    breakdown: {
      inputTokens,
      cacheReadTokens,
      cacheWriteTokens: 0,
      outputTokens,
    },
  };
}

async function parseAntigravityTranscript(
  lines: AsyncIterable<string>,
): Promise<ParsedAntigravityTranscript> {
  const modelChanges: AntigravityModelChange[] = [];
  const subagentCalls: AntigravitySubagentCall[] = [];
  const samplesByStep = new Map<string, RawAntigravitySample>();
  let currentModel: string | null = null;
  let fallbackStepSeq = 0;

  for await (const line of lines) {
    const isPlanner = line.includes('"PLANNER_RESPONSE"');
    const hasModelNotice = line.includes("Model Selection");
    const hasSubagent = line.includes('"invoke_subagent"');
    if (!isPlanner && !hasModelNotice && !hasSubagent) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isObjectRecord(parsed)) continue;

    const hasExplicitStep =
      typeof parsed.step_index === "number" &&
      Number.isFinite(parsed.step_index) &&
      parsed.step_index >= 0;
    const stepIndex = hasExplicitStep ? (parsed.step_index as number) : 0;

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

    const candidate = parseAntigravityPlannerStep(parsed, stepIndex, currentModel);
    if (!candidate) continue;
    const sampleKey = hasExplicitStep ? `step:${stepIndex}` : `seq:${fallbackStepSeq++}`;
    if (shouldReplaceDedupedSample(samplesByStep.get(sampleKey), candidate)) {
      samplesByStep.set(sampleKey, candidate);
    }
  }

  return { modelChanges, subagentCalls, samples: [...samplesByStep.values()] };
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
    const role = nonEmptyTrimmedString(descriptor?.role);
    const explicitModel = nonEmptyTrimmedString(descriptor?.model);
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

function extractPiBreakdown(
  usage: Record<string, unknown>,
  totalTokens: number,
): UsageTokenBreakdown | undefined {
  const hasShortFields =
    usage.input !== undefined ||
    usage.output !== undefined ||
    usage.cacheRead !== undefined ||
    usage.cacheWrite !== undefined;
  if (hasShortFields) {
    const inputTokens = finiteNonNegative(usage.input);
    const outputTokens = finiteNonNegative(usage.output);
    const cacheReadTokens = finiteNonNegative(usage.cacheRead);
    const cacheWriteTokens = finiteNonNegative(usage.cacheWrite);
    const sum = inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;
    if (sum > 0 && sum === totalTokens) {
      return { inputTokens, cacheReadTokens, cacheWriteTokens, outputTokens };
    }
  }
  const hasLongFields =
    usage.inputTokens !== undefined ||
    usage.outputTokens !== undefined ||
    usage.cachedInputTokens !== undefined;
  if (hasLongFields) {
    const inputTokens = finiteNonNegative(usage.inputTokens);
    const outputTokens = finiteNonNegative(usage.outputTokens);
    const cacheReadTokens = finiteNonNegative(usage.cachedInputTokens);
    const sum = inputTokens + outputTokens + cacheReadTokens;
    if (sum > 0 && sum === totalTokens) {
      return { inputTokens, cacheReadTokens, cacheWriteTokens: 0, outputTokens };
    }
  }
  return undefined;
}

async function parsePiFileContent(lines: AsyncIterable<string>): Promise<ParsedJsonlFileResult> {
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
    const topModel = nonEmptyTrimmedString(parsed.model);
    if (topModel) currentModel = topModel;
    const message = isObjectRecord(parsed.message) ? parsed.message : parsed;
    const msgModel = nonEmptyTrimmedString(message.model);
    if (msgModel) currentModel = msgModel;
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
    const breakdown = extractPiBreakdown(usage, tokens);
    samples.push({
      timestampMs,
      harness: "pi",
      model: currentModel,
      tokens,
      costUsd: reportedPiCost(usage),
      ...(breakdown ? { breakdown } : {}),
    });
  }
  return { samples };
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

function deduplicateDirectoryPaths(dirs: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  const isWin = process.platform === "win32";
  for (const dir of dirs) {
    const trimmed = dir.trim();
    if (!trimmed) continue;
    const resolved = path.resolve(trimmed);
    const key = isWin ? resolved.toLowerCase() : resolved;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(resolved);
  }
  return unique;
}

function resolveUsageDirectories(homeDir: string, envs: readonly ProviderEnvMap[]) {
  const claudeDirs = [path.join(homeDir, ".claude", "projects")];
  const codexDirs = [
    path.join(homeDir, ".codex", "sessions"),
    path.join(homeDir, ".codex", "archived_sessions"),
  ];
  const piDirs = [
    path.join(homeDir, ".omp", "agent", "sessions"),
    path.join(homeDir, ".pi", "agent", "sessions"),
  ];
  const antigravityBrainDirs = [
    // Antigravity IDE conversations.
    path.join(homeDir, ".gemini", "antigravity", "brain"),
    // Antigravity CLI (`agy`) conversations.
    path.join(homeDir, ".gemini", "antigravity-cli", "brain"),
  ];

  for (const env of envs) {
    const claudeConfigDir = env.CLAUDE_CONFIG_DIR?.trim();
    if (claudeConfigDir) claudeDirs.push(path.join(claudeConfigDir, "projects"));
    const codexHome = env.CODEX_HOME?.trim();
    if (codexHome) {
      codexDirs.push(path.join(codexHome, "sessions"));
      codexDirs.push(path.join(codexHome, "archived_sessions"));
    }
    const piAgentDir = env.PI_CODING_AGENT_DIR?.trim();
    if (piAgentDir) piDirs.push(path.join(piAgentDir, "sessions"));
    const agyExplicit = env.ANTIGRAVITY_EXECUTABLE_DATA_DIR?.trim();
    if (agyExplicit) antigravityBrainDirs.push(path.join(agyExplicit, "brain"));
    const agyRel = env.ANTIGRAVITY_CONFIG_REL_DIR?.trim();
    if (agyRel) {
      const envHome = env.HOME?.trim() || env.USERPROFILE?.trim() || homeDir;
      antigravityBrainDirs.push(path.join(envHome, ".gemini", agyRel, "brain"));
    }
  }

  return {
    claudeDirs: deduplicateDirectoryPaths(claudeDirs),
    codexDirs: deduplicateDirectoryPaths(codexDirs),
    piDirs: deduplicateDirectoryPaths(piDirs),
    antigravityBrainDirs: deduplicateDirectoryPaths(antigravityBrainDirs),
  };
}

interface DailyTotalBucket {
  money: number[];
  paid: number;
  tokens: number[];
  sampleCount: number;
  knownCostCount: number;
  breakdownSampleCount: number;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
}

interface ModelAggregateBucket {
  harness: UsageHarness;
  tokensByDay: number[];
  inputByDay: number[];
  cacheReadByDay: number[];
  cacheWriteByDay: number[];
  outputByDay: number[];
  totalTokens: number;
}

function buildDailyPoint(
  point: DailyTotalBucket,
  dayIdx: number,
  ranked: readonly [string, ModelAggregateBucket][],
): UsageDailyPoint {
  const hasCompleteBreakdown =
    point.sampleCount > 0 && point.breakdownSampleCount === point.sampleCount;
  const result: UsageDailyPoint = {
    money: point.money,
    paid: point.paid,
    tokens: point.tokens,
    costAvailable: point.sampleCount > 0 && point.knownCostCount === point.sampleCount,
  };
  if (hasCompleteBreakdown) {
    result.inputTokens = point.inputTokens;
    result.cacheReadTokens = point.cacheReadTokens;
    result.cacheWriteTokens = point.cacheWriteTokens;
    result.outputTokens = point.outputTokens;
  }
  if (ranked.length === 0) return result;
  result.modelTokens = [...ranked.map(([, entry]) => entry.tokensByDay[dayIdx] ?? 0), 0];
  if (hasCompleteBreakdown) {
    result.modelInputTokens = [...ranked.map(([, entry]) => entry.inputByDay[dayIdx] ?? 0), 0];
    result.modelCacheReadTokens = [
      ...ranked.map(([, entry]) => entry.cacheReadByDay[dayIdx] ?? 0),
      0,
    ];
    result.modelCacheWriteTokens = [
      ...ranked.map(([, entry]) => entry.cacheWriteByDay[dayIdx] ?? 0),
      0,
    ];
    result.modelOutputTokens = [...ranked.map(([, entry]) => entry.outputByDay[dayIdx] ?? 0), 0];
  }
  return result;
}

export function buildUsageDailyHistoryFromSamples(
  samples: readonly ParsedUsageSample[],
  nowMs: number,
): UsageDailyHistory {
  const days = buildRecentDayKeys(nowMs, WIDGET_DAYS);
  const indexOfDay = new Map(days.map((day, idx) => [day, idx]));
  const dailyTotals: DailyTotalBucket[] = days.map(() => ({
    money: zeroArray(HARNESSES.length),
    paid: 0,
    tokens: zeroArray(HARNESSES.length),
    sampleCount: 0,
    knownCostCount: 0,
    breakdownSampleCount: 0,
    inputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
  }));

  const byModel = new Map<string, ModelAggregateBucket>();

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
      inputByDay: zeroArray(days.length),
      cacheReadByDay: zeroArray(days.length),
      cacheWriteByDay: zeroArray(days.length),
      outputByDay: zeroArray(days.length),
      totalTokens: 0,
    };
    existing.tokensByDay[dayIdx]! += sample.tokens;
    existing.totalTokens += sample.tokens;

    if (sample.breakdown) {
      point.breakdownSampleCount += 1;
      point.inputTokens += sample.breakdown.inputTokens;
      point.cacheReadTokens += sample.breakdown.cacheReadTokens;
      point.cacheWriteTokens += sample.breakdown.cacheWriteTokens;
      point.outputTokens += sample.breakdown.outputTokens;
      existing.inputByDay[dayIdx]! += sample.breakdown.inputTokens;
      existing.cacheReadByDay[dayIdx]! += sample.breakdown.cacheReadTokens;
      existing.cacheWriteByDay[dayIdx]! += sample.breakdown.cacheWriteTokens;
      existing.outputByDay[dayIdx]! += sample.breakdown.outputTokens;
    }

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

  const daily: UsageDailyPoint[] = dailyTotals.map((point, dayIdx) =>
    buildDailyPoint(point, dayIdx, ranked),
  );

  return {
    days,
    daily,
    ...(models.length > 0 ? { models } : {}),
  };
}

function deduplicateClaudeSamples(samples: readonly ParsedUsageSample[]): ParsedUsageSample[] {
  const byDedupKey = new Map<string, ParsedUsageSample>();
  const unkeyed: ParsedUsageSample[] = [];
  for (const sample of samples) {
    if (!sample.dedupKey) {
      unkeyed.push(sample);
      continue;
    }
    if (shouldReplaceDedupedSample(byDedupKey.get(sample.dedupKey), sample)) {
      byDedupKey.set(sample.dedupKey, sample);
    }
  }
  return [...byDedupKey.values(), ...unkeyed];
}

export class LocalDailyUsageCollector {
  private readonly homeDir: string;
  private readonly now: () => number;
  private readonly cacheTtlMs: number;
  private readonly baseEnv: ProviderEnvMap | undefined;
  private readonly getExtraEnvs: (() => readonly (ProviderEnvMap | undefined)[]) | undefined;
  private readonly fileCache = new Map<string, CachedFileSamples>();
  private readonly antigravityCache = new Map<string, CachedAntigravityTranscript>();
  private inFlight: Promise<UsageDailyHistory> | null = null;
  private lastResult: {
    atMs: number;
    dayKey: string;
    dirsKey: string;
    history: UsageDailyHistory;
  } | null = null;

  constructor(options: LocalDailyUsageCollectorOptions = {}) {
    this.homeDir = options.homeDir ?? os.homedir();
    this.now = options.now ?? Date.now;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    // Only read host `process.env` overrides when not pinned to an explicit isolated `homeDir`.
    this.baseEnv = options.env ?? (options.homeDir === undefined ? process.env : undefined);
    this.getExtraEnvs = options.getExtraEnvs;
  }

  async collect(
    forceRefresh = false,
    extraEnvs?: readonly (ProviderEnvMap | undefined)[],
  ): Promise<UsageDailyHistory> {
    const nowMs = this.now();
    const todayKey = formatLocalDayKey(nowMs);
    const dirs = this.resolveCurrentDirectories(extraEnvs);
    const dirsKey = JSON.stringify(dirs);
    if (
      !forceRefresh &&
      this.lastResult &&
      this.lastResult.dayKey === todayKey &&
      this.lastResult.dirsKey === dirsKey &&
      nowMs - this.lastResult.atMs < this.cacheTtlMs
    ) {
      return this.lastResult.history;
    }

    if (this.inFlight) return this.inFlight;
    this.inFlight = this.collectHistory(nowMs, todayKey, dirs, dirsKey);
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private resolveCurrentDirectories(extraEnvs?: readonly (ProviderEnvMap | undefined)[]) {
    const envList: ProviderEnvMap[] = [];
    if (this.baseEnv) envList.push(this.baseEnv);
    if (this.getExtraEnvs) {
      for (const extra of this.getExtraEnvs()) {
        if (extra) envList.push(extra);
      }
    }
    if (extraEnvs) {
      for (const extra of extraEnvs) {
        if (extra) envList.push(extra);
      }
    }
    return resolveUsageDirectories(this.homeDir, envList);
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
          breakdown: sample.breakdown,
        });
      }
    }
    return samples;
  }

  private async readJsonlFile(
    file: DiscoveredJsonlFile,
    source: JsonlUsageSource,
    cutoffMs: number,
    activePaths: Set<string>,
  ): Promise<ParsedJsonlFileResult | null> {
    activePaths.add(file.filePath);
    const cached = this.fileCache.get(file.filePath);
    if (cached && cached.mtimeMs === file.mtimeMs && cached.size === file.size) {
      return cached.result;
    }
    const stream = createReadStream(file.filePath, { encoding: "utf8" });
    const lines = createInterface({ input: stream, crlfDelay: Infinity });
    try {
      const parsed = await source.parse(lines);
      const result: ParsedJsonlFileResult = {
        samples: parsed.samples.filter((sample) => sample.timestampMs >= cutoffMs),
        ...(parsed.sessionId ? { sessionId: parsed.sessionId } : {}),
      };
      this.fileCache.set(file.filePath, { mtimeMs: file.mtimeMs, size: file.size, result });
      return result;
    } catch (error) {
      if (isMissingFileError(error)) return null;
      throw error;
    } finally {
      lines.close();
      stream.destroy();
    }
  }

  private async collectJsonlSourceFiles(
    source: JsonlUsageSource,
    cutoffMs: number,
    activePaths: Set<string>,
  ): Promise<Array<{ file: DiscoveredJsonlFile; result: ParsedJsonlFileResult }>> {
    const files = await collectRecentJsonlFiles(source.dir, cutoffMs);
    const collected: Array<{ file: DiscoveredJsonlFile; result: ParsedJsonlFileResult }> = [];
    for (const file of files) {
      const result = await this.readJsonlFile(file, source, cutoffMs, activePaths);
      if (result) collected.push({ file, result });
    }
    return collected;
  }

  private async collectHistory(
    nowMs: number,
    todayKey: string,
    dirs: ReturnType<typeof resolveUsageDirectories>,
    dirsKey: string,
  ): Promise<UsageDailyHistory> {
    const cutoffMs = nowMs - (WIDGET_DAYS + 1) * DAY_MS;

    const claudeSources: JsonlUsageSource[] = dirs.claudeDirs.map((dir) => ({
      kind: "claude-code",
      dir,
      parse: parseClaudeFileContent,
    }));
    const codexSources: JsonlUsageSource[] = dirs.codexDirs.map((dir) => ({
      kind: "codex",
      dir,
      parse: parseCodexFileContent,
    }));
    const piSources: JsonlUsageSource[] = dirs.piDirs.map((dir) => ({
      kind: "pi",
      dir,
      parse: parsePiFileContent,
    }));

    const activeFilePaths = new Set<string>();
    const activeAntigravityPaths = new Set<string>();
    const [claudeGroups, codexGroups, piGroups, antigravityGroups] = await Promise.all([
      Promise.all(
        claudeSources.map((source) =>
          this.collectJsonlSourceFiles(source, cutoffMs, activeFilePaths),
        ),
      ),
      Promise.all(
        codexSources.map((source) =>
          this.collectJsonlSourceFiles(source, cutoffMs, activeFilePaths),
        ),
      ),
      Promise.all(
        piSources.map((source) => this.collectJsonlSourceFiles(source, cutoffMs, activeFilePaths)),
      ),
      Promise.all(
        dirs.antigravityBrainDirs.map((dir) =>
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

    // Deduplicate Claude messages across files (e.g. forked/copied sessions sharing message.id).
    const claudeSamples = deduplicateClaudeSamples(
      claudeGroups.flat().flatMap(({ result }) => result.samples),
    );

    // Deduplicate Codex rollouts appearing in both sessions/ and archived_sessions/ by session_meta.id.
    const codexBySession = new Map<
      string,
      { file: DiscoveredJsonlFile; result: ParsedJsonlFileResult }
    >();
    const unkeyedCodexSamples: ParsedUsageSample[] = [];
    for (const entry of codexGroups.flat()) {
      const sid = entry.result.sessionId;
      if (!sid) {
        unkeyedCodexSamples.push(...entry.result.samples);
        continue;
      }
      const existing = codexBySession.get(sid);
      if (
        !existing ||
        entry.file.size > existing.file.size ||
        (entry.file.size === existing.file.size && entry.file.mtimeMs >= existing.file.mtimeMs)
      ) {
        codexBySession.set(sid, entry);
      }
    }
    const codexSamples = [
      ...[...codexBySession.values()].flatMap(({ result }) => result.samples),
      ...unkeyedCodexSamples,
    ];

    const piSamples = piGroups.flat().flatMap(({ result }) => result.samples);

    const allSamples = [
      ...claudeSamples,
      ...codexSamples,
      ...piSamples,
      ...antigravityGroups.flat(),
    ];
    const history = buildUsageDailyHistoryFromSamples(allSamples, nowMs);
    this.lastResult = { atMs: nowMs, dayKey: todayKey, dirsKey, history };
    return history;
  }
}
