import { GenerationSuspendWatch } from "../../generation-suspend-watch.js";
import { TokenSpeedMeter, type TokenSpeedSnapshot } from "../../token-speed.js";

/*
 * Feeds Claude's main-thread stream events into TokenSpeedMeter. Ported from Cindy (Apache-2.0):
 * `observeClaudeTokenSpeed` in packages/maker-core/src/agents/claude-code/translator.ts.
 */
export class ClaudeTokenSpeedObserver {
  private readonly meter = new TokenSpeedMeter();
  /** Content block indexes of the current message that are tool calls. */
  private readonly toolBlockIndexes = new Set<number>();
  private readonly suspendWatch = new GenerationSuspendWatch(() => this.meter.invalidate());

  reset(): void {
    this.suspendWatch.stop();
    this.meter.reset();
    this.toolBlockIndexes.clear();
  }

  /** Returns true when a usage refresh is due. Subagent frames must not reach this. */
  observe(event: Record<string, unknown>): boolean {
    const index = typeof event.index === "number" ? event.index : 0;
    switch (event.type) {
      case "message_start":
        this.toolBlockIndexes.clear();
        return false;
      case "content_block_start": {
        const block = event.content_block as { type?: unknown } | undefined;
        if (block?.type === "tool_use") this.toolBlockIndexes.add(index);
        this.meter.start();
        this.suspendWatch.start();
        return false;
      }
      case "content_block_delta": {
        const delta = event.delta as
          | { type?: unknown; text?: unknown; thinking?: unknown; partial_json?: unknown }
          | undefined;
        // Tool arguments count only for blocks that announced themselves as tool calls.
        const toolArguments = this.toolBlockIndexes.has(index) ? delta?.partial_json : undefined;
        const text =
          delta?.type === "input_json_delta" ? toolArguments : (delta?.text ?? delta?.thinking);
        if (typeof text !== "string") return false;
        // A counted delta also ends a tool pause inside the meter.
        this.suspendWatch.start();
        return this.meter.recordDelta(text);
      }
      case "content_block_stop":
        if (this.toolBlockIndexes.has(index)) this.pause();
        return false;
      default:
        return false;
    }
  }

  /** A tool call or an API retry backoff is not generation time; the next block resumes. */
  pause(): void {
    this.suspendWatch.stop();
    this.meter.pause();
  }

  /** Turn end. `realOutputTokens` replaces the text estimate when Claude reported it. */
  stop(realOutputTokens: number | undefined): void {
    this.suspendWatch.stop();
    this.meter.stop(realOutputTokens);
  }

  snapshot(): TokenSpeedSnapshot | undefined {
    return this.meter.snapshot();
  }
}
