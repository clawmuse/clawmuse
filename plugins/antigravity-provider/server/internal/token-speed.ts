import type { ProviderTokenSpeed } from "@getpaseo/plugin/server/provider";
import { unrefTimer } from "./data-dir.js";

const WINDOW_MS = 1_000;
const MIN_SPAN_MS = 100;
const MIN_WINDOW_TOKENS = 5;
const COMPACTION_THRESHOLD = 5_000;
const PUBLISH_INTERVAL_MS = 1_000;
const HEARTBEAT_MS = 5_000;
const SUSPEND_GAP_MS = 30_000;
const TOKEN_REGEX = /\w+|[^\s\w]/g;

export function estimateDeltaTokens(text: string): number {
  return text ? (text.match(TOKEN_REGEX)?.length ?? 0) : 0;
}

class GenerationSuspendWatch {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTickAt: number | null = null;

  constructor(private readonly onSuspend: () => void) {}

  start(now = Date.now()): void {
    if (this.timer !== null) return;
    this.lastTickAt = now;
    const timer = setInterval(() => this.sample(), HEARTBEAT_MS);
    unrefTimer(timer);
    this.timer = timer;
  }

  stop(now = Date.now()): void {
    if (this.timer === null) return;
    this.sample(now);
    clearInterval(this.timer);
    this.timer = null;
    this.lastTickAt = null;
  }

  private sample(now = Date.now()): void {
    const previous = this.lastTickAt;
    if (previous !== null && now - previous > HEARTBEAT_MS + SUSPEND_GAP_MS) {
      this.onSuspend();
    }
    this.lastTickAt = now;
  }
}

/**
 * Tracks live and completed-turn output token speed for an Antigravity ACP turn:
 *
 * - Streamed `agent_message_chunk` and `agent_thought_chunk` deltas feed a 1s sliding window
 *   (`estimateDeltaTokens`), throttled to 1s live refresh intervals once >= 5 tokens arrive;
 * - Tool calls and interactive permission prompts pause the generation clock so tool execution
 *   and human approval waits never dilute tok/s;
 * - At turn end (`stop()`), `streaming` transitions to `false`, `tokens` optionally snaps to
 *   Antigravity's reported `outputTokens`, and `rate` settles to `average`.
 */
export class AntigravityTokenSpeedObserver {
  private streaming = true;
  private invalid = false;
  private completedTokens = 0;
  private completedElapsedMs = 0;
  private maxPublishedElapsedMs = 0;
  private segmentStartedAt: number | null = null;
  private activeSegmentTokens = 0;
  private tps = 0;
  private events: { time: number; tokens: number }[] = [];
  private windowStartIndex = 0;
  private lastPublishAt = -Infinity;
  private readonly suspendWatch = new GenerationSuspendWatch(() => this.invalidate());

  invalidate(): void {
    this.invalid = true;
  }

  /** Called when a turn starts so live refreshes publish on 1s intervals during streaming. */
  start(now = Date.now()): void {
    if (!this.streaming || this.invalid) return;
    if (this.lastPublishAt === -Infinity) {
      this.lastPublishAt = now;
    }
    this.startSegmentClock(now);
  }

  /** Returns true when a live `session.usage` refresh should be emitted immediately. */
  observeDelta(text: string, now = Date.now()): boolean {
    if (!this.streaming || this.invalid) return false;
    const tokens = estimateDeltaTokens(text);
    if (tokens <= 0) return false;
    this.startSegmentClock(now);
    this.activeSegmentTokens += tokens;
    this.events.push({ time: now, tokens });
    if (this.windowStartIndex >= COMPACTION_THRESHOLD) {
      this.events.splice(0, this.windowStartIndex - 1);
      this.windowStartIndex = 1;
    }
    const windowRate = this.windowTps(now);
    if (windowRate !== undefined) {
      this.tps = windowRate;
    }
    if (this.tps <= 0 || now - this.lastPublishAt < PUBLISH_INTERVAL_MS) return false;
    this.lastPublishAt = now;
    return true;
  }

  /** Pauses generation timing across tool calls and permission prompts. */
  pause(now = Date.now()): void {
    if (!this.streaming) return;
    this.flushActiveSegment(now);
    this.suspendWatch.stop(now);
  }

  stop(reportedOutputTokens?: number | null, now = Date.now()): void {
    this.suspendWatch.stop(now);
    if (!this.streaming) return;
    this.flushActiveSegment(now);
    if (
      reportedOutputTokens !== null &&
      reportedOutputTokens !== undefined &&
      reportedOutputTokens > 0 &&
      (this.completedTokens > 0 || this.completedElapsedMs > 0)
    ) {
      this.completedTokens = reportedOutputTokens;
    }
    this.streaming = false;
  }

  snapshot(now = Date.now()): ProviderTokenSpeed | undefined {
    if (this.invalid) return undefined;
    const tokens = this.completedTokens + this.activeSegmentTokens;
    if (tokens <= 0) return undefined;
    const activeElapsedMs =
      this.streaming && this.activeSegmentTokens > 0 && this.segmentStartedAt !== null
        ? Math.max(0, now - this.segmentStartedAt)
        : 0;
    const elapsedMs = Math.max(
      1,
      this.maxPublishedElapsedMs,
      this.completedElapsedMs + activeElapsedMs,
    );
    if (this.streaming) {
      this.maxPublishedElapsedMs = elapsedMs;
    }
    const average = elapsedMs > 0 ? (tokens * 1_000) / elapsedMs : 0;
    const liveRate = this.tps > 0 ? this.tps : average;
    const rate = this.streaming ? liveRate : average;
    return {
      rate,
      average,
      tokens: Math.round(tokens),
      elapsedMs,
      streaming: this.streaming,
    };
  }

  private startSegmentClock(now: number): void {
    if (this.segmentStartedAt === null) {
      this.segmentStartedAt = now;
    }
    this.suspendWatch.start(now);
  }

  private flushActiveSegment(now: number): void {
    if (this.activeSegmentTokens > 0) {
      const wallElapsedMs =
        this.segmentStartedAt !== null ? Math.max(1, now - this.segmentStartedAt) : 1;
      this.completedTokens += this.activeSegmentTokens;
      this.completedElapsedMs = Math.max(
        this.maxPublishedElapsedMs,
        this.completedElapsedMs + wallElapsedMs,
      );
    }
    this.segmentStartedAt = null;
    this.activeSegmentTokens = 0;
    this.events = [];
    this.windowStartIndex = 0;
  }

  private windowTps(now: number): number | undefined {
    const windowStart = now - WINDOW_MS;
    while (
      this.windowStartIndex < this.events.length &&
      this.events[this.windowStartIndex].time < windowStart
    ) {
      this.windowStartIndex += 1;
    }
    if (this.windowStartIndex >= this.events.length) return undefined;
    let windowTokens = 0;
    for (let i = this.windowStartIndex; i < this.events.length; i += 1) {
      windowTokens += this.events[i].tokens;
    }
    if (windowTokens < MIN_WINDOW_TOKENS) return undefined;
    const startTime = this.segmentStartedAt ?? now;
    const previous =
      this.windowStartIndex > 0 ? this.events[this.windowStartIndex - 1].time : startTime;
    const spanStart = Math.max(previous, startTime);
    return (1_000 * windowTokens) / Math.max(now - spanStart, MIN_SPAN_MS);
  }
}
