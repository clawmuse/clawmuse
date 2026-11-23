import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { AlertCircle, RefreshCcw } from "@/components/icons/app-icons";
import { Button } from "@/components/ui/button";
import {
  getHostRuntimeStore,
  useHostRuntimeConnectionStatuses,
  useVisibleHosts,
} from "@/runtime/host-runtime";
import { useNetworkStatus } from "@/runtime/network-status/model";
import { useSidebarViewStore } from "@/stores/sidebar-view-store";
import type { Theme } from "@/styles/theme";

const ThemedAlertCircle = withUnistyles(AlertCircle);
const warningIconMapping = (theme: Theme) => ({
  color: theme.colors.statusWarning,
});

export function SidebarConnectivityBanner({
  hasProjects,
  onRefresh,
}: {
  hasProjects: boolean;
  onRefresh?: () => void;
}) {
  const { t } = useTranslation();
  const networkStatus = useNetworkStatus();
  const hosts = useVisibleHosts();
  const hostFilters = useSidebarViewStore((state) => state.hostFilters);

  const targetServerIds = useMemo(() => {
    if (hostFilters.length === 0) {
      return hosts.map((host) => host.serverId);
    }
    const selected = new Set(hostFilters);
    const filtered = hosts
      .filter((host) => selected.has(host.serverId))
      .map((host) => host.serverId);
    return filtered.length > 0 ? filtered : hosts.map((host) => host.serverId);
  }, [hostFilters, hosts]);

  const statuses = useHostRuntimeConnectionStatuses(targetServerIds);
  const allTargetsOffline = useMemo(() => {
    if (targetServerIds.length === 0) return false;
    return targetServerIds.every((serverId) => {
      const status = statuses.get(serverId);
      return status === "offline" || status === "error";
    });
  }, [statuses, targetServerIds]);

  const handleRetry = useCallback(() => {
    const runtime = getHostRuntimeStore();
    runtime.ensureConnectedAll({ verify: true });
    void runtime.runProbeCycleNow();
    onRefresh?.();
  }, [onRefresh]);

  // When no cached projects exist, SidebarProjectEmptyState already shows a full
  // offline/unreachable card with a retry button, so avoid duplicating the notice.
  const showNetworkOffline = !networkStatus.online && hasProjects;
  const showHostsOffline = networkStatus.online && hasProjects && allTargetsOffline;

  if (!showNetworkOffline && !showHostsOffline) {
    return null;
  }

  const label = showNetworkOffline
    ? t("connectionResilience.list.offlineBanner")
    : t("connectionResilience.list.hostsOfflineBanner");

  return (
    <View style={styles.container} testID="sidebar-connectivity-banner">
      <View style={styles.row}>
        <ThemedAlertCircle size={14} uniProps={warningIconMapping} />
        <Text style={styles.text} numberOfLines={2}>
          {label}
        </Text>
      </View>
      <Button
        variant="ghost"
        size="sm"
        leftIcon={RefreshCcw}
        onPress={handleRetry}
        testID="sidebar-connectivity-retry"
      >
        {t("common.actions.retry")}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    marginHorizontal: theme.spacing[2],
    marginTop: theme.spacing[1],
    marginBottom: theme.spacing[1],
    paddingLeft: theme.spacing[3],
    paddingRight: theme.spacing[1],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
  },
  row: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
  },
  text: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
