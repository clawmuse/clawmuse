import {
  useCallback,
  useMemo,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { AgentProvider } from "@getpaseo/protocol/agent-types";
import {
  getClawMuseStatusBindingSnapshot,
  subscribeClawMuseStatusBindings,
  type ClawMuseStatusBindingSnapshot,
} from "@/clawmuse-status/binding-state";
import {
  AUTO_HOST_OPTION,
  joinGoalAgent,
  resolveModelSourceHost,
  splitGoalAgent,
} from "@/clawmuse-status/goals/target";
import type { GoalRepo, GoalTarget } from "@/clawmuse-status/goals/types";
import { CombinedModelSelector } from "@/components/combined-model-selector";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form-field";
import {
  SelectField,
  SelectFieldTrigger,
  type SelectFieldDisplay,
  type SelectFieldOption,
} from "@/components/ui/select-field";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { buildSelectableProviderSelectorProviders } from "@/provider-selection/provider-selection";

interface GoalTargetFieldsProps {
  repo: GoalRepo | null;
  value: GoalTarget;
  onChange: (next: GoalTarget) => void;
  /** Planner runs read; executor runs write. Only the hint text differs. */
  kind: "plan" | "execute";
  testIDPrefix: string;
}

function relayToServerIds(snapshot: ClawMuseStatusBindingSnapshot): Map<string, string> {
  const map = new Map<string, string>();
  for (const [serverId, binding] of Object.entries(snapshot.hosts)) {
    if (binding.kind === "bound") {
      map.set(binding.relayHostId, serverId);
    }
  }
  return map;
}

/**
 * Which host a goal runs on and which model it uses. The model list comes from
 * the host's own provider snapshot over this client's paired connection, the
 * same source the schedule form uses, so only models the host actually has can
 * be picked. The service remembers the choice per repository.
 */
export function GoalTargetFields({
  repo,
  value,
  onChange,
  kind,
  testIDPrefix,
}: GoalTargetFieldsProps): ReactElement {
  const { t } = useTranslation();
  const bindings = useSyncExternalStore(
    subscribeClawMuseStatusBindings,
    getClawMuseStatusBindingSnapshot,
    getClawMuseStatusBindingSnapshot,
  );
  const serverIdByRelay = useMemo(() => relayToServerIds(bindings), [bindings]);
  const source = useMemo(
    () =>
      resolveModelSourceHost({
        repo,
        hostId: value.hostId,
        serverIdForRelayHost: (relayHostId) => serverIdByRelay.get(relayHostId) ?? null,
      }),
    [repo, serverIdByRelay, value.hostId],
  );
  const snapshot = useProvidersSnapshot(source?.serverId ?? null, {
    enabled: source !== null,
  });
  const providers = useMemo(
    () => buildSelectableProviderSelectorProviders(snapshot.entries),
    [snapshot.entries],
  );
  const { provider: selectedProvider, model: selectedModel } = splitGoalAgent(value.agent);

  const hostOptions = useMemo<SelectFieldOption<string>[]>(
    () => [
      {
        id: AUTO_HOST_OPTION,
        value: AUTO_HOST_OPTION,
        label: t("clawmuseStatus.goals.target.autoHost"),
        description: t("clawmuseStatus.goals.target.autoHostHint"),
      },
      ...(repo?.hosts ?? []).map((host) => ({
        id: host.hostId,
        value: host.hostId,
        label: host.displayName,
        description: t(
          host.connectivity === "live"
            ? "clawmuseStatus.goals.target.online"
            : "clawmuseStatus.goals.target.offline",
        ),
      })),
    ],
    [repo, t],
  );
  const selectedHostDisplay = useMemo<SelectFieldDisplay>(() => {
    const host = repo?.hosts.find((candidate) => candidate.hostId === value.hostId);
    return { label: host?.displayName ?? t("clawmuseStatus.goals.target.autoHost") };
  }, [repo, t, value.hostId]);
  const pinnedHostOffline =
    value.hostId !== null &&
    repo?.hosts.find((host) => host.hostId === value.hostId)?.connectivity !== "live";

  const onHostChange = useCallback(
    (next: string) => onChange({ ...value, hostId: next === AUTO_HOST_OPTION ? null : next }),
    [onChange, value],
  );
  const onModelSelect = useCallback(
    (provider: AgentProvider, modelId: string) =>
      onChange({ ...value, agent: joinGoalAgent(provider, modelId) }),
    [onChange, value],
  );
  const useHostDefault = useCallback(() => onChange({ ...value, agent: null }), [onChange, value]);
  const onModelOpen = useCallback(
    () => snapshot.refetchIfStale(selectedProvider || null),
    [selectedProvider, snapshot],
  );
  const onRetryProvider = useCallback(
    (provider: AgentProvider) => void snapshot.refresh([provider]),
    [snapshot],
  );

  const renderModelTrigger = useCallback(
    ({
      selectedModelLabel,
      disabled,
      isOpen,
      hovered,
      pressed,
    }: {
      selectedModelLabel: string;
      onPress: () => void;
      disabled: boolean;
      isOpen: boolean;
      hovered: boolean;
      pressed: boolean;
    }): ReactNode => {
      const label = value.agent
        ? selectedModelLabel || value.agent
        : t("clawmuseStatus.goals.target.hostDefaultModel");
      return (
        <SelectFieldTrigger
          label={label}
          isPlaceholder={!value.agent}
          placeholder={label}
          disabled={disabled}
          active={hovered || pressed || isOpen}
          testID={`${testIDPrefix}-model-trigger`}
        />
      );
    },
    [t, testIDPrefix, value.agent],
  );

  const modelHint =
    source === null
      ? t("clawmuseStatus.goals.target.modelUnavailable")
      : t(
          kind === "plan"
            ? "clawmuseStatus.goals.target.planModelHint"
            : "clawmuseStatus.goals.target.executeModelHint",
          { host: source.host.displayName },
        );

  return (
    <View style={styles.container}>
      <SelectField
        label={t("clawmuseStatus.goals.target.host")}
        value={value.hostId ?? AUTO_HOST_OPTION}
        selectedDisplay={selectedHostDisplay}
        options={hostOptions}
        onChange={onHostChange}
        placeholder={t("clawmuseStatus.goals.target.autoHost")}
        emptyText={t("clawmuseStatus.goals.create.repoEmpty")}
        hint={pinnedHostOffline ? t("clawmuseStatus.goals.target.pinnedOffline") : undefined}
        triggerTestID={`${testIDPrefix}-host-trigger`}
      />
      <Field label={t("clawmuseStatus.goals.target.model")} hint={modelHint}>
        <CombinedModelSelector
          providers={providers}
          selectedProvider={selectedProvider}
          selectedModel={selectedModel}
          onSelect={onModelSelect}
          isLoading={snapshot.isLoading || snapshot.isFetching}
          renderTrigger={renderModelTrigger}
          triggerFill
          serverId={source?.serverId ?? null}
          disabled={source === null}
          onOpen={onModelOpen}
          onRetryProvider={onRetryProvider}
          isRetryingProvider={snapshot.isRefreshing}
        />
      </Field>
      {value.agent ? (
        <View style={styles.resetRow}>
          <Text style={styles.resetHint} numberOfLines={1}>
            {value.agent}
          </Text>
          <Button
            size="xs"
            variant="ghost"
            onPress={useHostDefault}
            testID={`${testIDPrefix}-model-reset`}
          >
            {t("clawmuseStatus.goals.target.useHostDefault")}
          </Button>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.spacing[4],
  },
  resetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    marginTop: -theme.spacing[2],
  },
  resetHint: {
    flex: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
