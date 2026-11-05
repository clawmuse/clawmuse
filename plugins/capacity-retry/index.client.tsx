import { useMemo } from "react";
import { Text } from "react-native";
import type { PluginClientContext, PluginTimelineItemProps } from "@getpaseo/plugin/client";
import type { z } from "zod";
import { noticeSchema } from "./shared/settings.js";
import { RetrySettings } from "./client/settings.js";

function RetryNotice({ item, theme }: PluginTimelineItemProps<z.output<typeof noticeSchema>>) {
  const style = useMemo(() => ({ color: theme.colors.foreground }), [theme]);
  return (
    <Text style={style} accessibilityRole="alert">
      {item.data.text}
    </Text>
  );
}

export default function contribute(client: PluginClientContext) {
  client.addSettingsScreen({
    id: "retry",
    title: "模型满载自动重试",
    icon: "RotateCcw",
    Component: RetrySettings,
  });
  client.addTimelineRenderer({
    kind: "retry-status",
    version: 1,
    schema: noticeSchema,
    Component: RetryNotice,
  });
  return () => {};
}
