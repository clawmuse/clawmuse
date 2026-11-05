import type { MutableDaemonConfig } from "./messages.js";

// These contributions use host-owned conversation surfaces rather than a plugin subprocess.
export const conversationPlugins = {
  "usage-display": {
    name: "额度展示",
    description: "在会话输入区展示当前账号的额度、重置时间和本次任务费用。默认开启，可随时关闭。",
  },
  "prompt-prediction": {
    name: "自动下一步提示",
    description:
      "回复完成后生成下一步输入建议，由你确认后发送。使用辅助模型，可能消耗额度。默认开启，可随时关闭。",
  },
} as const;

export type ConversationPluginId = keyof typeof conversationPlugins;
export const conversationPluginIds = Object.keys(conversationPlugins) as ConversationPluginId[];

export function resolvePluginsEnabled(config: {
  pluginsEnabled?: boolean;
  plugins?: MutableDaemonConfig["plugins"];
}): boolean {
  if (config.pluginsEnabled !== undefined) return config.pluginsEnabled;
  // Preserve the old global opt-out for previously installed, enabled third-party sources.
  const hasConfiguredPlugins = Object.entries(config.plugins ?? {}).some(
    ([id, source]) =>
      !conversationPluginIds.includes(id as ConversationPluginId) && source.enabled !== false,
  );
  return !hasConfiguredPlugins;
}

export function isConversationPluginEnabled(
  config: MutableDaemonConfig,
  id: ConversationPluginId,
): boolean {
  if (id === "prompt-prediction") return config.metadataGeneration.promptPredictions !== false;
  return config.plugins?.[id]?.enabled !== false;
}

export function isConversationPluginActive(
  config: MutableDaemonConfig,
  id: ConversationPluginId,
): boolean {
  return resolvePluginsEnabled(config) && isConversationPluginEnabled(config, id);
}
