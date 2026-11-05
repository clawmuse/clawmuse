import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { VoiceRuntime } from "./voice-runtime";

/** Voice keeps turn progress alive even when the viewed timeline is suspended in background. */
export function observeVoiceTurns({
  client,
  serverId,
  runtime,
}: {
  client: Pick<DaemonClient, "subscribeAgentTimeline">;
  serverId: string;
  runtime: VoiceRuntime;
}): () => void {
  let observedAgentId: string | null = null;
  let release: (() => void) | null = null;
  function reconcile() {
    const snapshot = runtime.getSnapshot();
    const agentId =
      !snapshot.isAssistant && snapshot.activeServerId === serverId ? snapshot.activeAgentId : null;
    if (agentId === observedAgentId) return;
    release?.();
    release = null;
    observedAgentId = agentId;
    if (!agentId) return;
    release = client.subscribeAgentTimeline(agentId, (message) => {
      if (message.type !== "agent_stream") return;
      const { event, agentId: targetAgentId } = message.payload;
      if (
        event.type === "turn_started" ||
        event.type === "turn_completed" ||
        event.type === "turn_failed" ||
        event.type === "turn_canceled"
      ) {
        runtime.onTurnEvent(serverId, targetAgentId, event.type);
      }
    });
  }
  const unsubscribe = runtime.subscribe(reconcile);
  reconcile();
  return () => {
    unsubscribe();
    release?.();
  };
}
