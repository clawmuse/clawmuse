import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { HostFilter } from "@/components/hosts/host-filter";
import { UsageRefreshButton } from "./refresh-button";
import { UsageOptions } from "./options";
import type { UsageHost } from "./model";
import type { UsageView } from "./types";

/** The hosts to choose between, and which one is shown. */
export interface UsageHostSelection {
  hosts: UsageHost[];
  serverId: string;
  onSelect: (serverId: string) => void;
}

/**
 * The controls on the right of every usage title row: the host filter when there is more than one
 * host, Refresh all, and the Settings cog. A host that cannot report usage keeps only the host filter.
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
  const canRefresh = views.some((view) => view.kind !== "unavailable");
  return (
    <View style={styles.controls}>
      {hasHostChoice(hostSelection) ? (
        <HostFilter
          hosts={hostSelection.hosts}
          selectedHost={hostSelection.serverId}
          onSelectHost={hostSelection.onSelect}
          triggerTestID="usage-host-filter-trigger"
          hostOptionTestID={usageHostOptionTestID}
        />
      ) : null}
      {canRefresh ? (
        <>
          {views.some((view) => view.kind !== "off" && view.kind !== "unavailable") ? (
            <UsageRefreshButton busy={busy} onRefresh={onRefresh} />
          ) : null}
          <UsageOptions serverId={serverId} onManageMonitoring={onManageMonitoring} />
        </>
      ) : null}
    </View>
  );
}

function hasHostChoice(
  hostSelection: UsageHostSelection | undefined,
): hostSelection is UsageHostSelection {
  return hostSelection !== undefined && hostSelection.hosts.length > 1;
}

function usageHostOptionTestID(serverId: string): string {
  return `usage-host-filter-item-${serverId}`;
}

const styles = StyleSheet.create((theme) => ({
  controls: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
}));
