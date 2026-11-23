import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { MutableDaemonConfig } from "@getpaseo/protocol/messages";
import { X } from "@/components/icons/app-icons";
import { CombinedModelSelector } from "@/components/combined-model-selector";
import { HostStatusDot } from "@/components/host-status-dot";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ToolbarButton } from "@/components/ui/pane-content-toolbar";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SettingsCard, SettingsRow } from "@/components/settings";
import { useClawMuseDeviceLabel } from "@/clawmuse/device-label";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { buildSelectableProviderSelectorProviders } from "@/provider-selection/provider-selection";
import { useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import { openAiArchiveModelForm, type ArchiveModelItem } from "./model-config-form";
import type { HostArchiveInfo } from "./types";

const ThemedX = withUnistyles(X, (theme: Theme) => ({ color: theme.colors.foregroundMuted }));
const ThemedSpinner = withUnistyles(LoadingSpinner, (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
}));

function formatProviderEntry(entry: { provider: string; model?: string }): string {
  return entry.model ? `${entry.provider} / ${entry.model}` : entry.provider;
}

export function formatAiArchiveModelSummary(
  config: MutableDaemonConfig | null | undefined,
  t: TFunction,
): string {
  const custom = config?.metadataGeneration?.aiArchiveProviders ?? [];
  if (custom.length > 0) {
    const first = formatProviderEntry(custom[0]);
    if (custom.length > 1) {
      return t("aiArchive.modelConfig.summaryCustomMore", {
        model: first,
        count: custom.length - 1,
      });
    }
    return first;
  }
  const auxiliary = config?.metadataGeneration?.providers ?? [];
  if (auxiliary.length > 0) {
    return t("aiArchive.modelConfig.summaryFollowAuxiliary", {
      model: formatProviderEntry(auxiliary[0]),
    });
  }
  return t("aiArchive.modelConfig.summaryAuto");
}

export function AiArchiveModelSummaryText({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const { config } = useDaemonConfig(serverId);
  return <Text style={styles.summaryText}>{formatAiArchiveModelSummary(config, t)}</Text>;
}

export function useAiArchiveModelButtonLabel(selectedHost: string, isAllHosts: boolean): string {
  const { t } = useTranslation();
  const { config } = useDaemonConfig(isAllHosts ? null : selectedHost);
  if (isAllHosts) {
    return t("aiArchive.modelConfig.buttonAllHosts");
  }
  return t("aiArchive.modelConfig.buttonLabel", {
    summary: formatAiArchiveModelSummary(config, t),
  });
}

interface ArchiveModelRowProps {
  selected: ArchiveModelItem;
  index: number;
  form: ReturnType<typeof openAiArchiveModelForm>;
  snapshot: ReturnType<typeof useProvidersSnapshot>;
  providers: ReturnType<typeof buildSelectableProviderSelectorProviders>;
  saving: boolean;
  serverId: string;
}

function ArchiveModelRow({
  selected,
  index,
  form,
  snapshot,
  providers,
  saving,
  serverId,
}: ArchiveModelRowProps) {
  const { t } = useTranslation();
  const select = useCallback(
    (provider: string, selectedModel: string) => form.selectModel(index, provider, selectedModel),
    [form, index],
  );
  const open = useCallback(
    () => snapshot.refetchIfStale(selected.provider),
    [selected.provider, snapshot],
  );
  const retry = useCallback((provider: string) => snapshot.refresh([provider]), [snapshot]);
  const remove = useCallback(() => form.removeModel(index), [form, index]);
  const label =
    index === 0
      ? t("aiArchive.modelConfig.model")
      : t("aiArchive.modelConfig.fallbackModel", { number: index + 1 });

  return (
    <SettingsRow label={label}>
      <View style={styles.modelControl}>
        <CombinedModelSelector
          providers={providers}
          selectedProvider={selected.provider}
          selectedModel={selected.model ?? ""}
          onSelect={select}
          isLoading={snapshot.isLoading || snapshot.isFetching}
          onOpen={open}
          onRetryProvider={retry}
          isRetryingProvider={snapshot.isRefreshing}
          disabled={saving}
          serverId={serverId}
          desktopPlacement="bottom-start"
          desktopMinWidth={360}
        />
        {index > 0 ? (
          <ToolbarButton
            onPress={remove}
            label={t("aiArchive.modelConfig.removeModel")}
            disabled={saving}
          >
            <ThemedX size={ICON_SIZE.sm} />
          </ToolbarButton>
        ) : null}
      </View>
    </SettingsRow>
  );
}

interface ArchiveModelEditorProps {
  serverId: string;
  config: MutableDaemonConfig;
  patchConfig: ReturnType<typeof useDaemonConfig>["patchConfig"];
  canManageDaemon: boolean;
}

function ArchiveModelEditor({
  serverId,
  config,
  patchConfig,
  canManageDaemon,
}: ArchiveModelEditorProps) {
  const { t } = useTranslation();
  const snapshot = useProvidersSnapshot(serverId);
  const providers = useMemo(
    () => buildSelectableProviderSelectorProviders(snapshot.entries),
    [snapshot.entries],
  );
  const [form] = useState(() =>
    openAiArchiveModelForm({ initial: config.metadataGeneration, patch: patchConfig }),
  );
  const state = useSyncExternalStore(form.subscribe, form.getState, form.getState);

  useEffect(() => form.applySettings(config.metadataGeneration), [config.metadataGeneration, form]);
  useEffect(() => () => form.close(), [form]);

  const modeOptions = useMemo(
    () => [
      {
        value: "default" as const,
        label: t("aiArchive.modelConfig.modeDefault"),
        disabled: state.save.status === "saving" || !canManageDaemon,
      },
      {
        value: "custom" as const,
        label: t("aiArchive.modelConfig.modeCustom"),
        disabled: state.save.status === "saving" || !canManageDaemon,
      },
    ],
    [canManageDaemon, state.save.status, t],
  );

  const saving = state.save.status === "saving";
  const error = state.save.status === "error" ? state.save.message : undefined;
  const auxiliaryList = config.metadataGeneration.providers ?? [];
  const defaultHint =
    auxiliaryList.length > 0
      ? t("aiArchive.modelConfig.defaultAuxiliaryHint", {
          models: auxiliaryList.map(formatProviderEntry).join(", "),
        })
      : t("aiArchive.modelConfig.defaultAutoHint");

  let modeHint: string | undefined;
  if (state.mode === "default") {
    modeHint = defaultHint;
  } else if (!canManageDaemon) {
    modeHint = t("aiArchive.modelConfig.noManagePermission");
  }

  return (
    <SettingsCard testID="ai-archive-model-card">
      <SettingsRow label={t("aiArchive.modelConfig.modeLabel")} hint={modeHint} error={error}>
        <View style={styles.modeControl}>
          {saving ? <ThemedSpinner size={14} /> : null}
          <SegmentedControl
            size="sm"
            options={modeOptions}
            value={state.mode}
            onValueChange={form.setMode}
            testID="ai-archive-model-mode"
          />
        </View>
      </SettingsRow>
      {state.mode === "custom"
        ? state.models.map((selected, index) => (
            <ArchiveModelRow
              key={selected.key}
              selected={selected}
              index={index}
              form={form}
              snapshot={snapshot}
              providers={providers}
              saving={saving || !canManageDaemon}
              serverId={serverId}
            />
          ))
        : null}
      {state.mode === "custom" && canManageDaemon && state.models.length < 3 ? (
        <SettingsRow label={t("aiArchive.modelConfig.fallbacks")}>
          <Button
            variant="ghost"
            size="sm"
            onPress={form.addModel}
            disabled={saving || state.models.some((entry) => !entry.provider)}
            testID="ai-archive-model-add"
          >
            {t("aiArchive.modelConfig.addFallback")}
          </Button>
        </SettingsRow>
      ) : null}
    </SettingsCard>
  );
}

export function AiArchiveModelConfigCard({
  serverId,
  onOpenHostSettings,
}: {
  serverId: string;
  onOpenHostSettings?: (serverId: string) => void;
}) {
  const { t } = useTranslation();
  const isConnected = useHostRuntimeIsConnected(serverId);
  const { config, isLoading, patchConfig } = useDaemonConfig(serverId);
  const supportsModelConfig = useSessionStore(
    (store) => store.sessions[serverId]?.serverInfo?.features?.aiArchiveModelConfig === true,
  );
  const canManageDaemon = useSessionStore(
    (store) =>
      store.sessions[serverId]?.serverInfo?.permissions?.includes("daemon.manage") ?? false,
  );
  const openSettings = useCallback(() => {
    onOpenHostSettings?.(serverId);
  }, [onOpenHostSettings, serverId]);

  if (!isConnected) {
    return <Alert variant="warning" size="sm" description={t("aiArchive.offline")} />;
  }

  if (!supportsModelConfig) {
    return (
      <Alert variant="info" size="sm" description={t("aiArchive.modelConfig.updateHost")}>
        {onOpenHostSettings ? (
          <Button variant="outline" size="sm" onPress={openSettings}>
            {t("aiArchive.modelConfig.openSettings")}
          </Button>
        ) : null}
      </Alert>
    );
  }

  if (isLoading || !config) {
    return (
      <SettingsCard>
        <View style={styles.loadingCard}>
          <ThemedSpinner size={14} />
          <Text style={styles.loadingText}>{t("aiArchive.loading")}</Text>
        </View>
      </SettingsCard>
    );
  }

  return (
    <ArchiveModelEditor
      key={serverId}
      serverId={serverId}
      config={config}
      patchConfig={patchConfig}
      canManageDaemon={canManageDaemon}
    />
  );
}

function HostModelSummaryRow({
  host,
  onConfigure,
}: {
  host: HostArchiveInfo;
  onConfigure: (serverId: string) => void;
}) {
  const { t } = useTranslation();
  const deviceLabel = useClawMuseDeviceLabel();
  const handlePress = useCallback(() => onConfigure(host.serverId), [host.serverId, onConfigure]);
  const displayLabel = deviceLabel(host.serverId, host.label);

  return (
    <View style={styles.allHostRow}>
      <View style={styles.allHostIdentity}>
        <HostStatusDot serverId={host.serverId} />
        <View style={styles.allHostText}>
          <Text style={styles.allHostTitle} numberOfLines={1}>
            {displayLabel}
          </Text>
          {host.isConnected ? (
            <AiArchiveModelSummaryText serverId={host.serverId} />
          ) : (
            <Text style={styles.summaryText}>{t("aiArchive.hostOfflineShort")}</Text>
          )}
        </View>
      </View>
      <Button
        variant="outline"
        size="sm"
        onPress={handlePress}
        testID={`ai-archive-configure-host-${host.serverId}`}
      >
        {t("aiArchive.modelConfig.configureHost")}
      </Button>
    </View>
  );
}

export function AllHostsModelConfigList({
  hosts,
  onSelectHost,
}: {
  hosts: readonly HostArchiveInfo[];
  onSelectHost: (serverId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.allHostsWrap}>
      <Text style={styles.allHostsHint}>{t("aiArchive.modelConfig.allHostsHint")}</Text>
      <SettingsCard testID="ai-archive-all-hosts-model-card">
        {hosts.map((host) => (
          <HostModelSummaryRow key={host.serverId} host={host} onConfigure={onSelectHost} />
        ))}
      </SettingsCard>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  modelControl: { flexDirection: "row", alignItems: "center", gap: theme.spacing[1] },
  modeControl: { flexDirection: "row", alignItems: "center", gap: theme.spacing[2] },
  loadingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    padding: theme.spacing[4],
  },
  loadingText: { fontSize: theme.fontSize.sm, color: theme.colors.foregroundMuted },
  summaryText: { fontSize: theme.fontSize.sm, color: theme.colors.foregroundMuted },
  allHostsWrap: { gap: theme.spacing[2] },
  allHostsHint: { fontSize: theme.fontSize.sm, color: theme.colors.foregroundMuted },
  allHostRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
  },
  allHostIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  allHostText: { flex: 1, minWidth: 0, gap: theme.spacing[0.5] },
  allHostTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foreground,
  },
}));
