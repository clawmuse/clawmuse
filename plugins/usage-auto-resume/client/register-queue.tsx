import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { messages } from "./messages";
import { QueuePopover } from "./queue";

export function registerQueuePills(client: PluginClientContext) {
  const pills = new Map<string, { workspaceId: string; registration: PluginButtonRegistration }>();
  const lifetime = new AbortController();
  let stopped = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const remove = (agentId: string) => {
    pills.get(agentId)?.registration.remove();
    pills.delete(agentId);
  };
  const register = (agent: {
    id: string;
    workspaceId?: string | null;
    archivedAt?: string | null;
  }) => {
    if (stopped) return;
    if (!agent.workspaceId || agent.archivedAt) {
      remove(agent.id);
      return;
    }
    // Ordinary status updates must not replace the registration and dismiss an open sheet.
    if (pills.get(agent.id)?.workspaceId === agent.workspaceId) return;
    remove(agent.id);
    const registration = client.addComposerPill({
      id: "follow-up-queue",
      workspaceId: agent.workspaceId,
      agentId: agent.id,
      button: {
        title: messages.message("pillTitle"),
        label: null,
        icon: "ListOrdered",
        behavior: { kind: "popover", Content: QueuePopover },
      },
    });
    pills.set(agent.id, { workspaceId: agent.workspaceId, registration });
  };
  const observe = () => {
    void client.paseo.agents
      .list({ subscribe: {}, signal: lifetime.signal })
      .then(({ subscription }) => {
        if (stopped) return undefined;
        subscription.subscribe({
          snapshot: ({ entries }) => {
            if (stopped) return;
            const ids = new Set(entries.map(({ agent }) => agent.id));
            for (const agentId of pills.keys()) if (!ids.has(agentId)) remove(agentId);
            for (const { agent } of entries) register(agent);
          },
          update: (message) => {
            if (message.type !== "agent_update") return;
            const update = message.payload;
            if (update.kind === "remove") remove(update.agentId);
            else register(update.agent);
          },
        });
        return undefined;
      })
      .catch((error: unknown) => {
        if (stopped) return;
        console.error("Could not observe agents for the follow-up queue", error);
        retry = setTimeout(observe, 5_000);
      });
  };
  observe();
  return () => {
    stopped = true;
    lifetime.abort();
    clearTimeout(retry);
    for (const { registration } of pills.values()) registration.remove();
    pills.clear();
  };
}
