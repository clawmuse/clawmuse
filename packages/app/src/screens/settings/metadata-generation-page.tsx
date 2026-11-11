import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { X } from "@/components/icons/app-icons";
import type { MutableDaemonConfig } from "@getpaseo/protocol/messages";
import { CombinedModelSelector } from "@/components/combined-model-selector";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Button } from "@/components/ui/button";
import { ToolbarButton } from "@/components/ui/pane-content-toolbar";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SettingsCard, SettingsRow, SettingsSwitch, SettingsSection } from "@/components/settings";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { useSessionStore } from "@/stores/session-store";
import { buildSelectableProviderSelectorProviders } from "@/provider-selection/provider-selection";
import { openAuxiliaryModelForm, type AuxiliaryModelFormState } from "./auxiliary-model-form";
import { ICON_SIZE, type Theme } from "@/styles/theme";

const ThemedX = withUnistyles(X, (theme: Theme) => ({ color: theme.colors.foregroundMuted }));
const ThemedSpinner = withUnistyles(LoadingSpinner, (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
}));

interface ModelRowProps {
  selected: AuxiliaryModelFormState["models"][number];
  index: number;
  model: ReturnType<typeof openAuxiliaryModelForm>;
  snapshot: ReturnType<typeof useProvidersSnapshot>;
  providers: ReturnType<typeof buildSelectableProviderSelectorProviders>;
  saving: boolean;
  serverId: string;
}

function AuxiliaryModelRow({
  selected,
  index,
  model,
  snapshot,
  providers,
  saving,
  serverId,
}: ModelRowProps) {
  const { t } = useTranslation();
  const select = useCallback(
    (provider: string, selectedModel: string) => model.selectModel(index, provider, selectedModel),
    [index, model],
  );
  const open = useCallback(
    () => snapshot.refetchIfStale(selected.provider),
    [selected.provider, snapshot],
  );
  const retry = useCallback((provider: string) => snapshot.refresh([provider]), [snapshot]);
  const remove = useCallback(() => model.removeModel(index), [index, model]);
  const label =
    index === 0
      ? t("settings.metadataGeneration.model")
      : t("settings.metadataGeneration.fallbackModel", { number: index + 1 });
  return (
    <SettingsRow label={label}>
      <View style={styles.model}>
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
            label={t("settings.metadataGeneration.removeModel")}
            disabled={saving}
          >
            <ThemedX size={ICON_SIZE.sm} />
          </ToolbarButton>
        ) : null}
      </View>
    </SettingsRow>
  );
}

export function MetadataGenerationPage({ serverId }: { serverId: string }) {
  const { config, isLoading, patchConfig } = useDaemonConfig(serverId);
  if (isLoading || !config)
    return (
      <View style={styles.loading}>
        <ThemedSpinner size="large" />
      </View>
    );
  return (
    <AuxiliaryModelSettings
      key={serverId}
      serverId={serverId}
      config={config}
      patchConfig={patchConfig}
    />
  );
}

interface SettingsProps {
  serverId: string;
  config: MutableDaemonConfig;
  patchConfig: ReturnType<typeof useDaemonConfig>["patchConfig"];
}

function AuxiliaryModelSettings({ serverId, config, patchConfig }: SettingsProps) {
  const { t } = useTranslation();
  const snapshot = useProvidersSnapshot(serverId);
  const providers = useMemo(
    () => buildSelectableProviderSelectorProviders(snapshot.entries),
    [snapshot.entries],
  );
  const [model] = useState(() =>
    openAuxiliaryModelForm({ initial: config.metadataGeneration, patch: patchConfig }),
  );
  const state = useSyncExternalStore(model.subscribe, model.getState, model.getState);
  const predictionsSupported = useSessionStore(
    (store) => store.sessions[serverId]?.serverInfo?.features?.promptPredictions === true,
  );
  useEffect(
    () => model.applySettings(config.metadataGeneration),
    [config.metadataGeneration, model],
  );
  useEffect(() => () => model.close(), [model]);
  const saving = state.save.status === "saving";
  const error = state.save.status === "error" ? state.save.message : undefined;
  return (
    <SettingsSection
      title={t("settings.metadataGeneration.title")}
      info={t("settings.metadataGeneration.description")}
      testID="metadata-generation-settings"
    >
      <SettingsCard>
        <SettingsRow label={t("settings.metadataGeneration.selection")} error={error}>
          <SegmentedControl
            options={[
              {
                value: "automatic" as const,
                label: t("settings.metadataGeneration.automatic"),
                disabled: saving,
              },
              {
                value: "preferred" as const,
                label: t("settings.metadataGeneration.preferred"),
                disabled: saving,
              },
            ]}
            value={state.mode}
            onValueChange={model.setMode}
            size="sm"
            testID="metadata-generation-mode"
          />
        </SettingsRow>
        {state.mode === "preferred"
          ? state.models.map((selected, index) => (
              <AuxiliaryModelRow
                key={selected.key}
                selected={selected}
                index={index}
                model={model}
                snapshot={snapshot}
                providers={providers}
                saving={saving}
                serverId={serverId}
              />
            ))
          : null}
        {state.mode === "preferred" && state.models.length < 3 ? (
          <SettingsRow label={t("settings.metadataGeneration.fallbacks")}>
            <Button
              variant="ghost"
              size="sm"
              onPress={model.addModel}
              disabled={saving || state.models.some((entry) => !entry.provider)}
            >
              {t("settings.metadataGeneration.addFallback")}
            </Button>
          </SettingsRow>
        ) : null}
        {predictionsSupported ? (
          <SettingsSwitch
            label={t("settings.metadataGeneration.predictions")}
            hint={t("settings.metadataGeneration.predictionsHint")}
            value={state.promptPredictions}
            onValueChange={model.setPromptPredictions}
            disabled={saving}
            testID="prompt-prediction-settings"
          />
        ) : null}
      </SettingsCard>
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  loading: { alignItems: "center", justifyContent: "center", minHeight: 180 },
  model: { flexDirection: "row", alignItems: "center", gap: theme.spacing[1] },
}));
