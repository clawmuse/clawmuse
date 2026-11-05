import { GenerationSuspendWatch } from "../../generation-suspend-watch.js";
import { UsageTokenSpeedMeter, type TokenSpeedSnapshot } from "../../token-speed.js";

/*
 * Codex output speed. Ported from Cindy (Apache-2.0): the generation clock in
 * packages/maker-core/src/agents/codex/translator.ts and the usage pairing in
 * packages/maker-core/src/agents/codex/index.ts.
 *
 * Codex streams reasoning summaries rather than every generated token, so counting streamed text
 * would undercount. Each usage report pairs the turn's real output with the model time so far.
 */

export interface CodexOutputUsage {
  /** Cumulative output tokens for the thread. */
  totalOutputTokens: number | undefined;
  /** Output tokens of the model response this report closes. */
  lastOutputTokens: number | undefined;
}

const GENERATION_PAUSE_ITEMS = new Set([
  "commandExecution",
  "mcpToolCall",
  "dynamicToolCall",
  "collabAgentToolCall",
  "webSearch",
  "imageGeneration",
  "imageView",
  "contextCompaction",
]);

export class CodexTokenSpeedTracker {
  private readonly meter = new UsageTokenSpeedMeter();
  private readonly suspendWatch = new GenerationSuspendWatch(() => this.meter.invalidate());
  private turnActive = false;
  /** Open generation interval; null while tools run or outside a turn. */
  private startedAt: number | null = null;
  private closedMs = 0;
  private readonly pendingToolIds = new Set<string>();
  private readonly completedToolIds = new Set<string>();
  private turnOutputTokens = 0;
  private latestTotalOutput: number | null = null;

  beginTurn(now = Date.now()): void {
    this.suspendWatch.stop();
    this.meter.reset();
    this.startedAt = null;
    this.closedMs = 0;
    this.pendingToolIds.clear();
    this.completedToolIds.clear();
    this.turnOutputTokens = 0;
    this.turnActive = true;
    this.open(now);
  }

  invalidate(): void {
    this.meter.invalidate();
  }

  observeItem(
    phase: "started" | "completed",
    itemType: string | undefined,
    itemId: string | undefined,
    now = Date.now(),
  ): void {
    // fileChange is completion-only in app-server; it is not a pairable tool interval.
    if (!itemType || !GENERATION_PAUSE_ITEMS.has(itemType)) return;
    const pauseId = itemId ? `item:${itemId}` : undefined;
    if (phase === "started") this.pauseForTool(pauseId, now);
    else this.resumeFromTool(pauseId, now);
  }

  /** A root-thread tool started running; its execution is not generation time. */
  pauseForTool(toolId: string | undefined, now = Date.now()): void {
    if (!this.turnActive) return;
    if (!toolId) {
      this.meter.invalidate();
      return;
    }
    if (this.pendingToolIds.has(toolId) || this.completedToolIds.has(toolId)) return;
    if (this.pendingToolIds.size === 0) this.close(now);
    this.pendingToolIds.add(toolId);
  }

  resumeFromTool(toolId: string | undefined, now = Date.now()): void {
    if (!this.turnActive || (toolId && this.completedToolIds.has(toolId))) return;
    if (!toolId || !this.pendingToolIds.delete(toolId)) {
      this.meter.invalidate();
      return;
    }
    this.completedToolIds.add(toolId);
    if (this.turnActive && this.pendingToolIds.size === 0) this.open(now);
  }

  recordUsage(usage: CodexOutputUsage, now = Date.now()): void {
    const { totalOutputTokens, lastOutputTokens } = usage;
    if (totalOutputTokens === undefined) return;
    // The thread cursor identifies duplicates; it may contain output from unobserved turns.
    if (this.latestTotalOutput !== null && totalOutputTokens <= this.latestTotalOutput) return;
    this.latestTotalOutput = totalOutputTokens;
    // Input-only reports cannot pair output already counted with a later clock.
    if (!this.turnActive || !lastOutputTokens || lastOutputTokens <= 0) return;
    this.turnOutputTokens += lastOutputTokens;
    this.meter.recordUsage(this.turnOutputTokens, this.elapsedMs(now));
  }

  completeTurn(now = Date.now()): void {
    if (!this.turnActive) return;
    // A tool still pending froze the clock while output may have accrued.
    if (this.pendingToolIds.size > 0) this.meter.invalidate();
    this.close(now);
    this.pendingToolIds.clear();
    this.turnActive = false;
    this.meter.stop();
  }

  snapshot(): TokenSpeedSnapshot | undefined {
    return this.meter.snapshot();
  }

  private open(now: number): void {
    if (this.startedAt !== null) return;
    this.startedAt = now;
    this.suspendWatch.start();
  }

  private close(now: number): void {
    if (this.startedAt === null) return;
    this.suspendWatch.stop();
    if (now < this.startedAt) this.meter.invalidate();
    this.closedMs += Math.max(0, now - this.startedAt);
    this.startedAt = null;
  }

  private elapsedMs(now: number): number {
    if (this.startedAt !== null && now < this.startedAt) this.meter.invalidate();
    return this.closedMs + (this.startedAt === null ? 0 : Math.max(0, now - this.startedAt));
  }
}
