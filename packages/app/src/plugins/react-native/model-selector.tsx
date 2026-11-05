import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ModelSelectorProps } from "@getpaseo/plugin/client/ui";
import { CombinedModelSelector } from "@/components/combined-model-selector";
import { SelectFieldTrigger } from "@/components/ui/select-field";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { buildSelectableProviderSelectorProviders } from "@/provider-selection/provider-selection";
import { queryClient } from "@/data/query-client";

export function ModelSelector(props: ModelSelectorProps) {
  // Provider catalog pushes update the app cache, outside each plugin's private cache.
  return (
    <QueryClientProvider client={queryClient}>
      <HostModelSelector {...props} />
    </QueryClientProvider>
  );
}

function HostModelSelector({
  serverId,
  value,
  onChange,
  providerIds,
  disabled,
}: ModelSelectorProps) {
  const { t } = useTranslation();
  const snapshot = useProvidersSnapshot(serverId);
  const providers = useMemo(
    () =>
      buildSelectableProviderSelectorProviders(
        snapshot.entries?.filter((entry) => !providerIds || providerIds.includes(entry.provider)),
      ),
    [snapshot.entries, providerIds],
  );
  const select = useCallback(
    (provider: string, model: string) => onChange({ provider, model }),
    [onChange],
  );
  const open = useCallback(
    () => snapshot.refetchIfStale(value.provider || null),
    [snapshot, value.provider],
  );
  const retry = useCallback((provider: string) => void snapshot.refresh([provider]), [snapshot]);
  const renderTrigger = useCallback(
    ({
      selectedModelLabel,
      disabled: triggerDisabled,
      isOpen,
      hovered,
      pressed,
    }: {
      selectedModelLabel: string;
      disabled: boolean;
      isOpen: boolean;
      hovered: boolean;
      pressed: boolean;
    }) => (
      <SelectFieldTrigger
        label={value.model ? selectedModelLabel || value.model : undefined}
        isPlaceholder={!value.model}
        placeholder={t("modelSelector.selectModel")}
        disabled={triggerDisabled}
        active={hovered || pressed || isOpen}
      />
    ),
    [value.model, t],
  );
  return (
    <View style={styles.field}>
      <CombinedModelSelector
        serverId={serverId}
        providers={providers}
        selectedProvider={value.provider}
        selectedModel={value.model}
        onSelect={select}
        disabled={disabled}
        isLoading={snapshot.isLoading || snapshot.isFetching}
        onOpen={open}
        onRetryProvider={retry}
        isRetryingProvider={snapshot.isRefreshing}
        renderTrigger={renderTrigger}
        desktopMinWidth={320}
        triggerFill
      />
      {snapshot.error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {snapshot.error}
        </Text>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create((theme) => ({
  field: { width: 240, maxWidth: "100%", minWidth: 0, flexShrink: 1 },
  error: { color: theme.colors.statusDanger },
}));
