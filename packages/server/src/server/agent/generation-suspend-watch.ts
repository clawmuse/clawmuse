/*
 * Detects host sleep during model generation. Ported from Cindy (Apache-2.0): the generation
 * heartbeat in packages/maker-core/src/agents/claude-code/generation-timing.ts.
 */

const HEARTBEAT_MS = 5_000;
const SUSPEND_GAP_MS = 30_000;

/**
 * Ticks every 5s while generation runs. A tick far later than scheduled means the host slept,
 * and that wall time must not enter a tok/s denominator. Run it only while generating, so a
 * sleep during a tool run, which no denominator counts, is not reported.
 */
export class GenerationSuspendWatch {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTickAt: number | null = null;

  constructor(private readonly onSuspend: () => void) {}

  start(): void {
    if (this.timer !== null) return;
    this.lastTickAt = Date.now();
    const timer = setInterval(() => this.sample(), HEARTBEAT_MS);
    timer.unref?.();
    this.timer = timer;
  }

  /** Samples once more first, so a sleep that ends with the generation is still caught. */
  stop(): void {
    if (this.timer === null) return;
    this.sample();
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
