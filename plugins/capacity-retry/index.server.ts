import type { PluginServerContext, PluginHookContext } from "@getpaseo/plugin/server";
import { preferences } from "./shared/settings.js";
import { createRetry, isCapacityError } from "./server/retry.js";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(preferences);
  let paseo: PluginHookContext["paseo"] | null = null;
  const report = (error: unknown) => console.error("[capacity-retry]", error);
  const retry = createRetry({
    async settings() {
      const state = await settings.read();
      return state.status === "ready" ? state.values : null;
    },
    schedule(callback, milliseconds) {
      const timer = setTimeout(() => void callback().catch(report), milliseconds);
      return () => clearTimeout(timer);
    },
    async available(agentId) {
      if (!paseo) return false;
      const result = await paseo.agents.ref(agentId).refresh();
      return (
        result !== null &&
        !result.agent.archivedAt &&
        !result.agent.activeTurn &&
        result.agent.pendingPermissions.length === 0
      );
    },
    async send(agentId, messageId) {
      if (!paseo) return;
      await paseo.agents.ref(agentId).send("请继续完成上一条任务。", {
        messageId,
        activeTurnBehavior: "steer",
      });
    },
    async notice(agentId, text) {
      if (!paseo) return;
      await paseo.agents.ref(agentId).timeline.append({
        type: "plugin",
        id: "capacity-retry-status",
        kind: "retry-status",
        version: 1,
        data: { text },
      });
    },
    report,
  });
  const stops = [
    settings.subscribe(() => retry.clear()),
    server.before("agent.prompt", ({ request }) => {
      retry.prompt(request.agentId, request.clientMessageId);
      return request;
    }),
    server.on("agent.turn_ended", (event, context) => {
      paseo = context.paseo;
      // Waiting in a hook would delay the daemon's lifecycle lane.
      void retry
        .ended(
          event.agent.id,
          event.turnId,
          async () => {
            if (event.outcome.kind === "failed")
              return isCapacityError(event.outcome.error.message);
            const page = await context.paseo.agents
              .ref(event.agent.id)
              .timeline.refetch({ direction: "tail", limit: 20 });
            for (const { item } of page.entries.toReversed()) {
              if (item.type === "user_message") return false;
              if (item.type === "assistant_message") return isCapacityError(item.text);
              if (item.type === "error") return isCapacityError(item.message);
            }
            return false;
          },
          event.outcome.kind === "canceled",
        )
        .catch(report);
    }),
    server.on("agent.archived", ({ agent }) => retry.cancel(agent.id)),
    server.on("agent.closed", ({ agent }) => retry.cancel(agent.id)),
    server.on("agent.permission_requested", ({ agent }) => retry.cancel(agent.id)),
  ];
  return () => {
    for (const stop of stops) stop();
    retry.dispose();
  };
}
