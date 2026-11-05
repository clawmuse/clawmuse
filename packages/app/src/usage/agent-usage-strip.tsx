import { Fragment, memo } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useAppSettings } from "@/hooks/use-settings";
import { formatSessionCost } from "./format";
import { UsageFooter } from "./footer";
import { useAgentUsageStrip } from "./queries";
import { resolveAgentUsageStrip, type AgentUsageStripWindow } from "./strip";
import type { UsageTone } from "./types";
import { useRelativeTimeTick } from "./use-relative-time-tick";
import { useConversationPluginActive } from "@/plugins/conversation-features";

const SCROLL_CONTENT_STYLE = { flexGrow: 1 } as const;

/**
 * Account windows stay on one centered line, scrolling horizontally when they
 * exceed the available width. The context window meter's details hold the full cards.
 */
export const AgentUsageStrip = memo(function AgentUsageStrip({
  serverId,
  ...props
}: {
  serverId: string;
  agentId: string;
  totalCostUsd: number | null | undefined;
  inline?: boolean;
}) {
  const active = useConversationPluginActive(serverId, "usage-display");
  if (!active) return null;
  return <ActiveAgentUsageStrip serverId={serverId} {...props} />;
});

function ActiveAgentUsageStrip({
  serverId,
  agentId,
  totalCostUsd,
  inline = false,
}: {
  serverId: string;
  agentId: string;
  totalCostUsd: number | null | undefined;
  inline?: boolean;
}) {
  const { t } = useTranslation();
  const { settings } = useAppSettings();
  const view = useAgentUsageStrip(serverId, agentId);
  const now = useRelativeTimeTick({ enabled: true });
  const accounts =
    view.kind === "ready"
      ? resolveAgentUsageStrip({
          reports: view.reports,
          displayAs: settings.usage.displayAs,
          now,
          t,
        })
      : [];
  const cost = formatSessionCost(totalCostUsd);
  if (accounts.length === 0 && !cost) return null;

  const content = (
    <View style={[styles.container, inline && styles.inlineContainer]} testID="agent-usage-strip">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={SCROLL_CONTENT_STYLE}
        testID="agent-usage-strip-scroll"
      >
        <View style={styles.rows}>
          {accounts.map((account) => (
            <Fragment key={account.key}>
              {account.sourceLabel ? (
                <Text numberOfLines={1} style={styles.muted}>
                  {account.sourceLabel}
                </Text>
              ) : null}
              {account.windows.map((window) => (
                <StripWindow key={window.key} window={window} />
              ))}
            </Fragment>
          ))}
          {cost ? (
            <Text numberOfLines={1} style={styles.muted}>
              {t("agentUsageStrip.taskValue", { cost })}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
  return inline ? content : <UsageFooter>{content}</UsageFooter>;
}

function StripWindow({ window }: { window: AgentUsageStripWindow }) {
  return (
    <Text numberOfLines={1} style={styles.muted} testID="agent-usage-strip-window">
      {window.name} <Text style={percentStyle(window.tone)}>{window.percentText}</Text>
      {window.resetText ? ` · ${window.resetText}` : null}
    </Text>
  );
}

function percentStyle(tone: UsageTone) {
  if (tone === "danger") return styles.percentDanger;
  if (tone === "warning") return styles.percentWarning;
  return styles.percent;
}

const styles = StyleSheet.create((theme) => ({
  container: {
    minWidth: 0,
    width: "100%",
  },
  scroll: { flexGrow: 0, width: "100%" },
  rows: {
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    columnGap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
  },
  // Take the width left by the controls without making their labels shrink.
  inlineContainer: {
    flexBasis: 0,
    flexGrow: 100,
    flexShrink: 1,
  },
  muted: {
    textAlign: "center",
    flexShrink: 0,
    color: theme.colors.foregroundMuted,
    fontSize: Math.round(theme.fontSize.sm * 0.875),
    lineHeight: Math.round(theme.fontSize.sm * 0.875 * 1.4),
  },
  percent: { color: theme.colors.foreground },
  percentWarning: { color: theme.colors.statusWarning },
  percentDanger: { color: theme.colors.statusDanger },
}));
