import type { AgentStreamEvent } from "./agent-sdk-types.js";
import { GenerationSuspendWatch } from "./generation-suspend-watch.js";
import { TokenSpeedMeter, type TokenSpeedSnapshot } from "./token-speed.js";

/** These providers measure output speed inside their adapters, from provider-level events. */
const PROVIDERS_WITH_OWN_TOKEN_SPEED = new Set(["claude", "codex", "antigravity"]);

export function providerMeasuresOwnTokenSpeed(provider: string): boolean {
  return PROVIDERS_WITH_OWN_TOKEN_SPEED.has(provider);
}

/**
 * Output speed for every other provider, estimated from the streamed assistant and reasoning
 * text with Cindy's TokenSpeedMeter (the pi-token-speed algorithm). Tool calls pause the clock;
 * the next streamed text resumes it.
 *
 * The estimate is never snapped to provider usage at turn end, because providers disagree on
 * whether `outputTokens` covers the turn or the whole session, and a wrong snap is worse than
 * the estimate.
 */
export class StreamTokenSpeedEstimator {
  private readonly meter = new TokenSpeedMeter();
  private readonly suspendWatch = new GenerationSuspendWatch(() => this.meter.invalidate());
  private ended = false;

  /** Returns true when a live refresh is due. */
  observe(event: AgentStreamEvent): boolean {
    switch (event.type) {
      case "turn_started":
        this.reset();
        return false;
      case "timeline":
        return this.observeTimelineItem(event.item);
      case "turn_completed":
      case "turn_failed":
      case "turn_canceled":
        this.suspendWatch.stop();
        this.meter.stop();
        this.ended = true;
        return false;
      default:
        return false;
    }
  }

  dispose(): void {
    this.suspendWatch.stop();
  }

  snapshot(): TokenSpeedSnapshot | undefined {
    return this.meter.snapshot();
  }

  private observeTimelineItem(item: Extract<AgentStreamEvent, { type: "timeline" }>["item"]) {
    if (item.type === "tool_call") {
      this.suspendWatch.stop();
      this.meter.pause();
      return false;
    }
    if (item.type !== "assistant_message" && item.type !== "reasoning") {
      return false;
    }
    // Not every provider announces turn starts, so the first text after a turn ends starts over.
    if (this.ended) this.reset();
    this.suspendWatch.start();
    return this.meter.recordDelta(item.text);
  }

  private reset(): void {
    this.suspendWatch.stop();
    this.meter.reset();
    this.ended = false;
  }
}
