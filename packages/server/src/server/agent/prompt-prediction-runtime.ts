import type { Logger } from "pino";
import type { MutableDaemonConfig } from "@getpaseo/protocol/messages";
import { isConversationPluginActive } from "@getpaseo/protocol/conversation-plugins";
import type { AgentManager } from "./agent-manager.js";
import type { ProviderSnapshotManager } from "./provider-snapshot-manager.js";
import { generateAgentTextResponse } from "./agent-response-loop.js";
import { resolveStructuredGenerationProviders } from "./structured-generation-providers.js";
import { PromptPredictions, type PredictionSource } from "./prompt-prediction.js";
import { buildPredictionPrompt } from "./prompt-prediction-text.js";
import { validateTitleOutput } from "./prompt-prediction-output.js";

const services = new WeakMap<AgentManager, PromptPredictions>();

interface PredictionRuntimeOptions {
  agentManager: AgentManager;
  providerSnapshotManager: ProviderSnapshotManager;
  readConfig: () => MutableDaemonConfig;
  logger: Logger;
}

export function getPromptPredictions(options: PredictionRuntimeOptions): PromptPredictions {
  const existing = services.get(options.agentManager);
  if (existing) return existing;
  const { agentManager, providerSnapshotManager, readConfig, logger } = options;
  const predictions = new PromptPredictions({
    readSource(agentId): PredictionSource | null {
      const agent = agentManager.getAgent(agentId);
      const config = readConfig();
      const settings = config.metadataGeneration;
      if (!isConversationPluginActive(config, "prompt-prediction") || !agent || agent.internal)
        return null;
      if (agent.lifecycle !== "idle" || agent.activeTurnId || agent.pendingPermissions.size > 0)
        return null;
      const messages: PredictionSource["messages"] = [];
      for (const item of agentManager.getTimeline(agentId).slice(-40)) {
        if (item.type === "user_message") messages.push({ role: "user", text: item.text });
        if (item.type === "assistant_message")
          messages.push({ role: "assistant", text: item.text });
      }
      return {
        cwd: agent.cwd,
        provider: agent.provider,
        model: agent.config.model,
        thinkingOptionId: agent.config.thinkingOptionId,
        settingsKey: JSON.stringify(settings),
        messages,
      };
    },
    async generate({ source, context, signal, locale, beforeDispatch }) {
      const providers = await resolveStructuredGenerationProviders({
        cwd: source.cwd,
        providerSnapshotManager,
        daemonConfig: { metadataGeneration: readConfig().metadataGeneration },
        currentSelection: source,
      });
      const { system, user } = buildPredictionPrompt(context, locale, source.cwd);
      for (const provider of providers) {
        signal.throwIfAborted();
        if (!beforeDispatch()) return null;
        const availability = await agentManager.getProviderAvailability(provider.provider);
        if (!availability.available) continue;
        if (!beforeDispatch()) return null;
        try {
          const text = await generateAgentTextResponse({
            manager: agentManager,
            persistSession: false,
            signal,
            beforeDispatch,
            prompt: user.slice(-(2000 + 1024)),
            agentConfig: {
              ...provider,
              cwd: source.cwd,
              internal: true,
              title: "Prompt prediction",
              systemPrompt: system,
            },
          });
          const normalized = validateTitleOutput(text, 512);
          if (normalized) return Array.from(normalized).slice(0, 140).join("");
        } catch (error) {
          signal.throwIfAborted();
          logger.debug(
            { err: error, provider: provider.provider },
            "Prompt prediction model unavailable",
          );
        }
      }
      return null;
    },
    onError(error) {
      logger.debug({ err: error }, "Prompt prediction unavailable");
    },
  });
  agentManager.subscribe(
    (event) => {
      if (event.type === "timeline_replacement") predictions.invalidate(event.agentId);
      if (event.type === "agent_state" && event.agent.lifecycle !== "idle")
        predictions.invalidate(event.agent.id);
      if (event.type !== "agent_stream") return;
      if (event.event.type === "turn_completed" && event.event.turnId) {
        predictions.completed(event.agentId, event.event.turnId);
      } else if (["turn_started", "turn_failed", "turn_canceled"].includes(event.event.type)) {
        predictions.invalidate(event.agentId);
      }
    },
    { replayState: false },
  );
  services.set(agentManager, predictions);
  return predictions;
}
