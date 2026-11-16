import { isAgentNotificationsMuted } from "@getpaseo/protocol/agent-labels";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/contexts/toast-context";
import { useSessionStore } from "@/stores/session-store";

export function useAgentNotificationMute(
  serverId: string,
  agentId: string | null,
): {
  isAgentMuted: boolean;
  toggleAgentMute: (targetAgentId: string) => Promise<void>;
} {
  const { t } = useTranslation();
  const toast = useToast();
  const isAgentMuted = useSessionStore((state) => {
    if (!agentId) {
      return false;
    }
    const agent = state.sessions[serverId]?.agents.get(agentId);
    return agent ? isAgentNotificationsMuted(agent) : false;
  });

  const toggleAgentMute = useCallback(
    async (targetAgentId: string) => {
      const session = useSessionStore.getState().sessions[serverId];
      const client = session?.client;
      if (!client) {
        toast.error(t("common.errors.daemonUnavailable"));
        return;
      }
      const currentAgent = session?.agents.get(targetAgentId);
      const nextMuted = !(currentAgent ? isAgentNotificationsMuted(currentAgent) : false);
      try {
        await client.setAgentNotificationsMuted(targetAgentId, nextMuted);
        toast.show(
          t(nextMuted ? "notificationSettings.mutedToast" : "notificationSettings.unmutedToast"),
          { variant: "success" },
        );
      } catch {
        toast.error(t("notificationSettings.muteFailed"));
      }
    },
    [serverId, t, toast],
  );

  return { isAgentMuted, toggleAgentMute };
}
