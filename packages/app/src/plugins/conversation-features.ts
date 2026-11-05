import {
  isConversationPluginActive,
  type ConversationPluginId,
} from "@getpaseo/protocol/conversation-plugins";
import { useDaemonConfig } from "@/hooks/use-daemon-config";

export function useConversationPluginActive(serverId: string, id: ConversationPluginId): boolean {
  const { config } = useDaemonConfig(serverId);
  if (!config) return false;
  return isConversationPluginActive(config, id);
}
