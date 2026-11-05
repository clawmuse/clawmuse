import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { StyleSheet } from "react-native-unistyles";
import { useFetchQuery } from "@/data/query";
import type { UsageMonitoringMode, UsageMonitoringSource } from "@getpaseo/protocol/messages";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import { useIsCompactFormFactor } from "@/constants/layout";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Alert } from "@/components/ui/alert";

/** Settings belong to the daemon host and apply to every connected client. No account discovery. */
export function UsageMonitoringSettings({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const supported = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.usageMonitoring === true,
  );
  if (!supported) return <Text style={styles.hint}>{t("usageMonitoring.updateHost")}</Text>;
  return <HostMonitoringSettings key={serverId} serverId={serverId} />;
}

function HostMonitoringSettings({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const compact = useIsCompactFormFactor();
  const queryClient = useQueryClient();
  const client = useHostRuntimeClient(serverId);
  const { patchConfig } = useDaemonConfig(serverId);
  const queryKey = ["usage-monitoring", serverId];
  const query = useFetchQuery({
    queryKey,
    dataShape: "list",
    staleTimeMs: 60_000,
    queryFn: async () => {
      if (!client) throw new Error(t("workspace.terminal.hostDisconnected"));
      const result = await client.getUsageMonitoring();
      if (result.error) throw new Error(result.error);
      return result.sources;
    },
  });
  const mutation = useMutation({
    mutationFn: async ({ id, mode }: { id: string; mode: UsageMonitoringMode }) => {
      await queryClient.cancelQueries({ queryKey: ["usage", serverId] });
      const config = await patchConfig({ usageMonitoring: { [id]: mode } });
      if (!config) throw new Error(t("workspace.terminal.hostDisconnected"));
    },
    onSuccess: async () => {
      queryClient.setQueriesData({ queryKey: ["usage", serverId] }, []);
      await queryClient.invalidateQueries({ queryKey });
      // Saving a monitor must not wait for unrelated providers' quota APIs.
      void queryClient.invalidateQueries({ queryKey: ["usage", serverId] });
    },
  });
  const { mutate } = mutation;
  const changeMode = useCallback(
    (id: string, mode: UsageMonitoringMode) => mutate({ id, mode }),
    [mutate],
  );
  if (query.isPending) return <Text style={styles.hint}>{t("providerUsage.loading")}</Text>;
  if (query.isError) return <Alert variant="error" size="sm" description={query.error.message} />;
  return (
    <View style={styles.container} testID={`usage-monitoring-${serverId}`}>
      <Text style={styles.hint}>{t("usageMonitoring.hint")}</Text>
      {mutation.isError ? (
        <Alert variant="error" size="sm" description={mutation.error.message} />
      ) : null}
      {query.data.map((source) => (
        <MonitoringSourceRow
          key={source.id}
          source={source}
          serverId={serverId}
          compact={compact}
          pending={mutation.isPending}
          onChange={changeMode}
        />
      ))}
    </View>
  );
}

function MonitoringSourceRow({
  source,
  serverId,
  compact,
  pending,
  onChange,
}: {
  source: UsageMonitoringSource;
  serverId: string;
  compact: boolean;
  pending: boolean;
  onChange: (id: string, mode: UsageMonitoringMode) => void;
}) {
  const { t } = useTranslation();
  const change = useCallback(
    (mode: UsageMonitoringMode) => onChange(source.id, mode),
    [onChange, source.id],
  );
  const options = useMemo(
    () =>
      (["auto", "always", "off"] as const).map((mode) => ({
        value: mode,
        label: t(`usageMonitoring.${mode}`),
        disabled: pending,
        testID: `usage-monitoring-${serverId}-${source.id}-${mode}`,
      })),
    [t, pending, serverId, source.id],
  );
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{source.label}</Text>
      <SegmentedControl
        value={source.mode}
        size={compact ? "md" : "sm"}
        testID={`usage-monitoring-${serverId}-${source.id}`}
        options={options}
        onValueChange={change}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: { gap: theme.spacing[4], padding: theme.spacing[4] },
  row: { gap: theme.spacing[2] },
  label: { fontSize: theme.fontSize.sm, color: theme.colors.foreground },
  hint: { fontSize: theme.fontSize.sm, color: theme.colors.foregroundMuted },
}));
