import { type ReactNode, useCallback, useMemo } from "react";
import { Import, Plus } from "@/components/icons/app-icons";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useClawMuseDeviceLabel } from "@/clawmuse/device-label";
import { Button } from "@/components/ui/button";
import { useHostRuntimeConnectionStatuses, useVisibleHosts } from "@/runtime/host-runtime";
import { useSidebarViewStore } from "@/stores/sidebar-view-store";

function SidebarEmptyStateCard({
  testID,
  title,
  description,
  children,
}: {
  testID: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      <View style={styles.actions}>{children}</View>
    </View>
  );
}

/**
 * The things the sidebar's workspace list says when it has no rows.
 *
 * Both are bodies, not screens: a list mode renders one where its groups would go, inside its own
 * scroll and below the section header it already owns. The header carries the display menu's
 * trigger, and an empty state that replaces the list rather than its body takes the header with
 * it — which is how filtering the last row away used to close the menu you were filtering from.
 */
export function SidebarFilterEmptyState() {
  const { t } = useTranslation();
  const clearLabelFilter = useSidebarViewStore((state) => state.clearLabelFilter);
  const clearProjectFilters = useSidebarViewStore((state) => state.clearProjectFilters);
  // Clears every filter that can empty the list, not just the one that did. The card names no
  // filter, so a Clear that undid only one of two active filters would leave it on screen looking
  // like it had failed.
  const clearFilters = useCallback(() => {
    clearLabelFilter();
    clearProjectFilters();
  }, [clearLabelFilter, clearProjectFilters]);

  return (
    <SidebarEmptyStateCard
      testID="sidebar-filter-empty-state"
      title={t("sidebar.filterEmpty.title")}
      description={t("sidebar.filterEmpty.description")}
    >
      <Button
        variant="secondary"
        size="xs"
        style={styles.action}
        textStyle={styles.actionText}
        onPress={clearFilters}
      >
        {t("sidebar.filterEmpty.clear")}
      </Button>
    </SidebarEmptyStateCard>
  );
}

export function SidebarProjectEmptyState({
  onAddProject,
  onImportSession,
}: {
  onAddProject?: () => void;
  onImportSession?: () => void;
}) {
  const { t } = useTranslation();
  const awayHosts = useAwayPinnedHosts();

  if (awayHosts) {
    return <SidebarHostAwayEmptyState hosts={awayHosts} />;
  }

  return (
    <SidebarEmptyStateCard
      testID="sidebar-project-empty-state"
      title={t("sidebar.project.empty.title")}
      description={t("sidebar.project.empty.description")}
    >
      <Button
        variant="secondary"
        size="xs"
        leftIcon={Plus}
        style={styles.action}
        textStyle={styles.actionText}
        onPress={onAddProject}
      >
        {t("sidebar.actions.addProject")}
      </Button>
      <Button
        variant="outline"
        size="xs"
        leftIcon={Import}
        style={styles.action}
        textStyle={styles.actionText}
        onPress={onImportSession}
      >
        {t("importSession.title")}
      </Button>
    </SidebarEmptyStateCard>
  );
}

interface AwayHost {
  label: string;
  connecting: boolean;
}

/**
 * The pinned hosts when none of them is online, else null. A host that is away has no
 * directory to list, so "no projects yet" would be false: the projects are there, the host
 * is not.
 */
function useAwayPinnedHosts(): AwayHost[] | null {
  const hosts = useVisibleHosts();
  const hostFilters = useSidebarViewStore((state) => state.hostFilters);
  const deviceLabel = useClawMuseDeviceLabel();
  const pinned = useMemo(
    () => hosts.filter((host) => hostFilters.includes(host.serverId)),
    [hostFilters, hosts],
  );
  const pinnedIds = useMemo(() => pinned.map((host) => host.serverId), [pinned]);
  const statuses = useHostRuntimeConnectionStatuses(pinnedIds);
  return useMemo(() => {
    if (pinned.length === 0) return null;
    if (pinned.some((host) => statuses.get(host.serverId) === "online")) return null;
    return pinned.map((host) => ({
      label: deviceLabel(host.serverId, host.label),
      connecting: statuses.get(host.serverId) === "connecting",
    }));
  }, [deviceLabel, pinned, statuses]);
}

function SidebarHostAwayEmptyState({ hosts }: { hosts: AwayHost[] }) {
  const { t } = useTranslation();
  const clearHostFilters = useSidebarViewStore((state) => state.clearHostFilters);
  const [only] = hosts;
  let title = t("sidebar.display.hostFilter.allOfflineTitle");
  if (hosts.length === 1 && only) {
    title = only.connecting
      ? t("sidebar.display.hostFilter.connectingTitle", { name: only.label })
      : t("sidebar.display.hostFilter.offlineTitle", { name: only.label });
  }

  return (
    <SidebarEmptyStateCard
      testID="sidebar-host-away-empty-state"
      title={title}
      description={t("sidebar.display.hostFilter.offlineDescription")}
    >
      <Button
        variant="secondary"
        size="xs"
        style={styles.action}
        textStyle={styles.actionText}
        onPress={clearHostFilters}
      >
        {t("sidebar.display.hostFilter.showAll")}
      </Button>
    </SidebarEmptyStateCard>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    marginTop: theme.spacing[3],
    padding: theme.spacing[4],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
  },
  copy: {
    gap: theme.spacing[1],
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
    marginTop: theme.spacing[4],
  },
  action: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    maxWidth: "100%",
  },
  actionText: {
    minWidth: 0,
    flexShrink: 1,
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
  },
  description: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
