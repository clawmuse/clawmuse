import type { ProviderTokenSpeed } from "@getpaseo/plugin/server/provider";
import type { Step } from "./wire.js";

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
    this.timer = setInterval(() => this.sample(), HEARTBEAT_MS);
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
 * Tracks live and completed-turn output token speed for an Antigravity turn:
 *
 * - `ACTIVE` `agent_response` deltas feed a 1s sliding window (`estimateDeltaTokens`),
 *   throttled to 1s live refresh intervals once the window has >= 5 tokens;
 * - `DONE` `agent_response` steps snap that step's count and duration to Antigravity's
 *   reported `usage.output_tokens` and `duration_seconds` (falling back to wall-clock step
 *   elapsed time when `duration_seconds` is absent);
 * - `tool`, `subagent`, and `error_message` (API retry backoff) steps pause the generation
 *   clock so non-generation wait time never dilutes tok/s;
 * - at turn end (`stop()`), `streaming` transitions to `false` and `rate` settles to the
 *   turn's overall `average`.
 */
export class AntigravityTokenSpeedObserver {
  private streaming = true;
  private invalid = false;
  private completedTokens = 0;
  private completedElapsedMs = 0;
  private maxPublishedElapsedMs = 0;
  private stepStartedAt: number | null = null;
  private activeStepIndex: number | null = null;
  private activeStepTokens = 0;
  private stepHadWindowReading = false;
  private tps = 0;
  private events: { time: number; tokens: number }[] = [];
  private windowStartIndex = 0;
  private lastPublishAt = -Infinity;
  private readonly activeTools = new Set<number>();
  private readonly doneSteps = new Set<number>();
  private readonly suspendWatch = new GenerationSuspendWatch(() => this.invalidate());

  invalidate(): void {
    this.invalid = true;
  }

  /** Returns true when a live `session.usage` refresh should be emitted immediately. */
  observeStep(step: Step, now = Date.now()): boolean {
    if (!this.streaming || this.invalid) return false;

    if (step.step_type === "user_input") {
      this.startStepClock(now);
      return false;
    }

    if (step.step_type === "tool" || step.step_type === "subagent") {
      this.flushUnclosedActiveStep(now);
      if (step.state === "ACTIVE") {
        this.activeTools.add(step.step_index);
        this.suspendWatch.stop(now);
      } else {
        this.activeTools.delete(step.step_index);
        if (this.activeTools.size === 0) {
          this.startStepClock(now);
        }
      }
      return false;
    }

    if (step.step_type === "error_message") {
      // API retry backoff is not generation time; start fresh when the retry responds.
      this.clearActiveStep();
      this.suspendWatch.stop(now);
      return false;
    }

    if (step.step_type === "agent_response") {
      if (step.state === "ACTIVE") {
        return this.recordDelta(step.step_index, step.text_delta, now);
      }
      if (step.state === "DONE") {
        return this.completeStep(step, now);
      }
      if (step.state === "ERROR") {
        this.clearActiveStep();
        this.suspendWatch.stop(now);
      }
    }

    return false;
  }

  stop(fallbackDurationSeconds?: number | null, now = Date.now()): void {
    this.suspendWatch.stop(now);
    if (!this.streaming) return;
    if (this.activeStepTokens > 0) {
      const wallElapsedMs = this.stepStartedAt !== null ? Math.max(0, now - this.stepStartedAt) : 0;
      const fallbackMs =
        this.completedElapsedMs === 0 &&
        fallbackDurationSeconds !== null &&
        fallbackDurationSeconds !== undefined &&
        fallbackDurationSeconds > 0
          ? Math.max(1, Math.round(fallbackDurationSeconds * 1_000))
          : 0;
      const stepElapsedMs = Math.max(wallElapsedMs, fallbackMs);
      this.completedTokens += this.activeStepTokens;
      this.completedElapsedMs = Math.max(
        this.maxPublishedElapsedMs,
        this.completedElapsedMs + stepElapsedMs,
      );
    }
    this.clearActiveStep();
    this.activeTools.clear();
    this.streaming = false;
  }

  snapshot(now = Date.now()): ProviderTokenSpeed | undefined {
    if (this.invalid) return undefined;
    const tokens = this.completedTokens + this.activeStepTokens;
    if (tokens <= 0) return undefined;
    const activeElapsedMs =
      this.streaming && this.activeStepTokens > 0 && this.stepStartedAt !== null
        ? Math.max(0, now - this.stepStartedAt)
        : 0;
    const elapsedMs = Math.max(
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

  private startStepClock(now: number): void {
    if (this.stepStartedAt === null) {
      this.stepStartedAt = now;
    }
    this.suspendWatch.start(now);
  }

  private recordDelta(stepIndex: number, text: string, now: number): boolean {
    if (this.activeStepIndex !== null && this.activeStepIndex !== stepIndex) {
      this.flushUnclosedActiveStep(now);
    }
    this.startStepClock(now);
    this.activeStepIndex = stepIndex;
    const tokens = estimateDeltaTokens(text);
    if (tokens <= 0) return false;
    this.activeStepTokens += tokens;
    this.events.push({ time: now, tokens });
    if (this.windowStartIndex >= COMPACTION_THRESHOLD) {
      this.events.splice(0, this.windowStartIndex - 1);
      this.windowStartIndex = 1;
    }
    const windowRate = this.windowTps(now);
    if (windowRate !== undefined) {
      this.tps = windowRate;
      this.stepHadWindowReading = true;
    }
    if (this.tps <= 0 || now - this.lastPublishAt < PUBLISH_INTERVAL_MS) return false;
    this.lastPublishAt = now;
    return true;
  }

  private completeStep(step: Step, now: number): boolean {
    if (this.doneSteps.has(step.step_index)) return false;
    this.doneSteps.add(step.step_index);
    if (step.text_delta) {
      this.activeStepTokens += estimateDeltaTokens(step.text_delta);
    }
    const reportedTokens = step.usage?.output_tokens ?? 0;
    const stepTokens = reportedTokens > 0 ? reportedTokens : this.activeStepTokens;
    const wallElapsedMs = this.stepStartedAt !== null ? Math.max(0, now - this.stepStartedAt) : 0;
    const durationMs =
      step.duration_seconds !== null && step.duration_seconds > 0
        ? Math.max(1, Math.round(step.duration_seconds * 1_000))
        : 0;
    const stepElapsedMs = durationMs > 0 ? durationMs : wallElapsedMs;
    this.completedTokens += stepTokens;
    this.completedElapsedMs = Math.max(
      this.maxPublishedElapsedMs,
      this.completedElapsedMs + stepElapsedMs,
    );
    if (!this.stepHadWindowReading && stepTokens > 0 && stepElapsedMs > 0) {
      this.tps = (stepTokens * 1_000) / stepElapsedMs;
    }
    this.clearActiveStep();
    this.suspendWatch.stop(now);
    return step.usage === null && stepTokens > 0;
  }

  private flushUnclosedActiveStep(now: number): void {
    if (this.activeStepTokens > 0) {
      const wallElapsedMs = this.stepStartedAt !== null ? Math.max(0, now - this.stepStartedAt) : 0;
      this.completedTokens += this.activeStepTokens;
      this.completedElapsedMs = Math.max(
        this.maxPublishedElapsedMs,
        this.completedElapsedMs + wallElapsedMs,
      );
    }
    this.clearActiveStep();
  }

  private clearActiveStep(): void {
    this.stepStartedAt = null;
    this.activeStepIndex = null;
    this.activeStepTokens = 0;
    this.stepHadWindowReading = false;
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
    const startTime = this.stepStartedAt ?? now;
    const previous =
      this.windowStartIndex > 0 ? this.events[this.windowStartIndex - 1].time : startTime;
    const spanStart = Math.max(previous, startTime);
    return (1_000 * windowTokens) / Math.max(now - spanStart, MIN_SPAN_MS);
  }
}
