import type { AgentTokenSpeed } from "./agent-sdk-types.js";

/**
 * The figures Cindy's speed popover shows besides the live reading, kept per agent on the daemon
 * so they survive the app going to the background: the turn's highest and lowest live readings,
 * and the totals of completed turns for a session average. Providers only report the current
 * turn; this decorates whatever they report.
 */
export class TokenSpeedStats {
  private peak: number | undefined;
  private low: number | undefined;
  private lastElapsedMs = 0;
  private sessionTokens = 0;
  private sessionElapsedMs = 0;
  /** Whether the current turn's final reading is already in the session totals. */
  private turnCounted = false;

  /** Seeds the session totals from a persisted reading, so a daemon restart keeps adding up. */
  constructor(seed?: AgentTokenSpeed) {
    if (!seed) return;
    this.sessionTokens = seed.sessionTokens ?? 0;
    this.sessionElapsedMs = seed.sessionElapsedMs ?? 0;
    this.turnCounted = !seed.streaming;
  }

  beginTurn(): void {
    this.peak = undefined;
    this.low = undefined;
    this.lastElapsedMs = 0;
    this.turnCounted = false;
  }

  decorate(speed: AgentTokenSpeed | undefined): AgentTokenSpeed | undefined {
    if (!speed) return undefined;
    if (speed.streaming) {
      // Not every provider announces turn starts; a fresh reading after a finished turn, or a
      // clock that went back to the start, is a new turn.
      if (this.turnCounted || speed.elapsedMs < this.lastElapsedMs) this.beginTurn();
      this.lastElapsedMs = speed.elapsedMs;
      if (speed.rate > 0) {
        this.peak = Math.max(this.peak ?? 0, speed.rate);
        this.low = Math.min(this.low ?? Number.POSITIVE_INFINITY, speed.rate);
      }
    } else if (!this.turnCounted) {
      this.sessionTokens += speed.tokens;
      this.sessionElapsedMs += speed.elapsedMs;
      this.turnCounted = true;
    }
    return {
      ...speed,
      ...(this.peak !== undefined ? { peak: this.peak } : {}),
      ...(this.low !== undefined ? { low: this.low } : {}),
      sessionTokens: this.sessionTokens,
      sessionElapsedMs: this.sessionElapsedMs,
    };
  }
}
