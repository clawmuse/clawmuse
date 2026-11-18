import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { UsageRefreshButton } from "./refresh-button";
import { UsageOptions } from "./options";
import { hasHostChoice, type UsageHostSelection } from "./hosts";
import type { UsageView } from "./types";

/**
 * The controls on the right of every usage title row: Refresh all and the Settings cog. A host
 * that cannot report usage has none, unless there is another host to switch to: the host choice
 * lives in the cog, so the cog stays.
 */
export function UsageControls({
  views,
  serverId = null,
  onRefresh,
  hostSelection,
  onManageMonitoring,
}: {
  views: readonly UsageView[];
  serverId?: string | null;
  onRefresh: () => void;
  hostSelection?: UsageHostSelection;
  onManageMonitoring?: () => void;
}) {
  const busy = views.some(
    (view) => view.kind === "loading" || (view.kind === "ready" && view.isRefreshing),
  );
  if (!hasUsageControls(views, hostSelection)) return null;
  return (
    <View style={styles.controls}>
      {views.some((view) => view.kind !== "off" && view.kind !== "unavailable") ? (
        <UsageRefreshButton busy={busy} onRefresh={onRefresh} />
      ) : null}
      <UsageOptions
        serverId={serverId}
        hostSelection={hostSelection}
        onManageMonitoring={onManageMonitoring}
      />
    </View>
  );
}

export function hasUsageControls(
  views: readonly UsageView[],
  hostSelection: UsageHostSelection | undefined,
): boolean {
  return views.some((view) => view.kind !== "unavailable") || hasHostChoice(hostSelection);
}

const styles = StyleSheet.create((theme) => ({
  controls: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
}));
