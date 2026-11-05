// Cindy's prompt recommendation lifecycle, adapted to daemon-owned turns and host scopes.
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { useConversationPluginActive } from "@/plugins/conversation-features";
import { useRetainedPanelActive } from "@/components/retained-panel";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useSessionStore, type Agent } from "@/stores/session-store";
import {
  beginPromptRecommendationPrediction,
  clearPromptRecommendationSession,
  dismissPromptRecommendation,
  getPromptRecommendationGeneration,
  notePromptRecommendationCompletion,
  resolvePromptRecommendationPrediction,
  restorePromptRecommendation,
  usePromptRecommendation,
} from "./store";

const hosts = new WeakMap<DaemonClient, { enabled: boolean; clear: () => void }>();

function recommendationKey(serverId: string, agentId: string): string {
  return JSON.stringify([serverId, agentId]);
}

function observeHost(serverId: string, client: DaemonClient, enabled: boolean): void {
  const existing = hosts.get(client);
  if (existing) {
    if (existing.enabled !== enabled) existing.clear();
    existing.enabled = enabled;
    return;
  }
  const running = new Map<string, { turnId: string; cancelling: boolean }>();
  const known = new Set<string>();
  const host = {
    enabled,
    clear: () => {
      for (const key of known) clearPromptRecommendationSession(key);
    },
  };
  hosts.set(client, host);
  const generation = useSessionStore.getState().sessions[serverId]?.clientGeneration;
  const observeAgents = (agents: ReadonlyMap<string, Agent>) => {
    for (const agent of agents.values()) {
      const key = recommendationKey(serverId, agent.id);
      known.add(key);
      if (agent.turn.phase === "open" && agent.turn.turnId) {
        const previous = running.get(agent.id);
        if (previous?.turnId !== agent.turn.turnId) clearPromptRecommendationSession(key);
        running.set(agent.id, {
          turnId: agent.turn.turnId,
          cancelling: agent.turn.cancellationRequestId !== null,
        });
        continue;
      }
      const previous = running.get(agent.id);
      if (!previous) continue;
      // Turn closure and the directory's idle status arrive on separate channels.
      // Keep the completion until both have settled, as Cindy does before predicting.
      if (agent.status === "running" || agent.status === "initializing") continue;
      running.delete(agent.id);
      const succeeded =
        agent.status === "idle" && !previous.cancelling && !agent.lastError && !agent.archivedAt;
      if (succeeded && host.enabled) notePromptRecommendationCompletion(key, previous.turnId);
      else clearPromptRecommendationSession(key);
    }
  };
  const initial = useSessionStore.getState().sessions[serverId];
  if (initial) observeAgents(initial.agents);
  const stopEvents = client.on("agent_stream", ({ payload }) => {
    const key = recommendationKey(serverId, payload.agentId);
    known.add(key);
    if (
      payload.event.type === "turn_completed" &&
      payload.event.turnId &&
      host.enabled &&
      !running.get(payload.agentId)?.cancelling
    ) {
      notePromptRecommendationCompletion(key, payload.event.turnId);
    } else if (["turn_started", "turn_failed", "turn_canceled"].includes(payload.event.type)) {
      clearPromptRecommendationSession(key);
    }
  });
  const stopStore = useSessionStore.subscribe((state, previous) => {
    const session = state.sessions[serverId];
    if (!session || session.clientGeneration !== generation) {
      stopEvents();
      stopStore();
      hosts.delete(client);
      host.clear();
      return;
    }
    if (session.agents === previous.sessions[serverId]?.agents) return;
    observeAgents(session.agents);
  });
}

interface PromptPredictionOptions {
  serverId: string;
  agentId: string;
  blocked: boolean;
  running: boolean;
}

export function usePromptPredictionHost(serverId: string) {
  const client = useHostRuntimeClient(serverId);
  const generation = useSessionStore((state) => state.sessions[serverId]?.clientGeneration);
  const supported = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.promptPredictions === true,
  );
  const active = useConversationPluginActive(serverId, "prompt-prediction");
  const enabled = supported && active;
  useEffect(() => {
    if (client) observeHost(serverId, client, enabled);
  }, [client, serverId, enabled, generation]);
  return { client, enabled };
}

export function usePromptPrediction({
  serverId,
  agentId,
  blocked,
  running,
}: PromptPredictionOptions) {
  const { i18n } = useTranslation();
  const { client, enabled } = usePromptPredictionHost(serverId);
  const connected = useHostRuntimeIsConnected(serverId);
  const retained = useRetainedPanelActive();
  const key = recommendationKey(serverId, agentId);
  const recommendation = usePromptRecommendation(key);
  const locale = i18n.resolvedLanguage ?? i18n.language;

  useEffect(() => {
    if (!enabled) dismissPromptRecommendation(key);
  }, [enabled, key]);
  useEffect(() => {
    if (!client || !connected || !enabled || !agentId || running) return;
    let current = true;
    const generation = getPromptRecommendationGeneration(key);
    void client
      .predictAgentPrompt(agentId)
      .then((result) => {
        if (current && result?.sourceTurnId && result.prompt)
          restorePromptRecommendation(key, result.sourceTurnId, result.prompt, generation);
        return undefined;
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [agentId, client, connected, enabled, key, running, serverId]);
  useEffect(() => {
    if (!client || !connected || !enabled || !retained || blocked || running) return;
    if (recommendation?.phase !== "candidate") return;
    const revision = recommendation.revision;
    const requestSeq = beginPromptRecommendationPrediction(key, revision);
    if (requestSeq === null) return;
    void client
      .predictAgentPrompt(agentId, revision, locale)
      .then(({ prompt }) =>
        resolvePromptRecommendationPrediction(key, revision, requestSeq, prompt),
      )
      .catch(() => resolvePromptRecommendationPrediction(key, revision, requestSeq, null));
  }, [
    agentId,
    serverId,
    blocked,
    client,
    connected,
    enabled,
    key,
    locale,
    recommendation,
    retained,
    running,
  ]);
  const dismiss = useCallback(() => dismissPromptRecommendation(key), [key]);
  const visible =
    enabled && connected && retained && !blocked && !running && recommendation?.phase === "ready";
  return { prompt: visible ? recommendation.prompt : null, dismiss };
}
