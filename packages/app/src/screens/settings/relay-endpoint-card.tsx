import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { brand } from "@/brand.generated";
import { useOptionalClawMuseAccountModel } from "@/clawmuse/account-provider";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { Alert as InlineAlert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { SegmentedControl, type SegmentedControlOption } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useIsLocalDaemon } from "@/hooks/use-is-local-daemon";
import { useHostFeature } from "@/runtime/host-features";
import {
  getHostRuntimeStore,
  useHostRuntimeClient,
  useHostRuntimeIsConnected,
} from "@/runtime/host-runtime";
import { settingsStyles } from "@/styles/settings";
import { confirmDialog } from "@/utils/confirm-dialog";
import { formatLatency } from "@/utils/latency";
import {
  classifyRelaySelection,
  findProbeForPreset,
  recommendRelayNode,
  resolveHostedRelayPresets,
  validateCustomRelayDraft,
  type RelayNodeId,
  type RelayNodePreset,
  type RelayProbeSample,
  type RelaySelectionMode,
  type RelaySwitchRecommendation,
} from "./relay-endpoint-model";

const HOSTED_PRESETS = resolveHostedRelayPresets(brand);

interface RelayPatchSubmission {
  endpoint: string;
  publicEndpoint?: string;
  useTls: boolean;
  publicUseTls: boolean;
}

function useRelayNodeLabel() {
  const { t } = useTranslation();
  return useCallback(
    (node: RelayNodeId) =>
      node === "guangzhou"
        ? t("settings.host.relay.nodes.guangzhou")
        : t("settings.host.relay.nodes.singapore"),
    [t],
  );
}

function useRelayEndpointProbing(serverId: string, enabled: boolean) {
  const client = useHostRuntimeClient(serverId);
  const [probes, setProbes] = useState<RelayProbeSample[]>([]);
  const [isProbing, setIsProbing] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);
  const generationRef = useRef(0);

  const runProbe = useCallback(async () => {
    if (!client || !enabled || HOSTED_PRESETS.length === 0) return;
    const generation = ++generationRef.current;
    setIsProbing(true);
    setProbeError(null);
    try {
      const result = await client.probeRelayEndpoints();
      if (generationRef.current !== generation) return;
      setProbes(result.probes);
    } catch (error) {
      if (generationRef.current !== generation) return;
      setProbeError(error instanceof Error ? error.message : String(error));
    } finally {
      if (generationRef.current === generation) {
        setIsProbing(false);
      }
    }
  }, [client, enabled]);

  useEffect(() => {
    if (!enabled || HOSTED_PRESETS.length === 0) return;
    void runProbe();
  }, [enabled, runProbe, serverId]);

  return { probes, isProbing, probeError, runProbe };
}

function useRelayEndpointSwitch(serverId: string, onSwitched: (endpoint: string) => void) {
  const { t } = useTranslation();
  const isLocalDaemon = useIsLocalDaemon(serverId);
  const accountModel = useOptionalClawMuseAccountModel();
  const { patchConfig } = useDaemonConfig(serverId);

  return useMutation({
    mutationFn: async (submission: RelayPatchSubmission) => {
      const updated = await patchConfig({
        relay: {
          endpoint: submission.endpoint,
          publicEndpoint: submission.publicEndpoint ?? "",
          useTls: submission.useTls,
          publicUseTls: submission.publicUseTls,
        },
      });
      if (!updated) {
        throw new Error(t("workspace.terminal.hostDisconnected"));
      }
      const nextPublicEndpoint =
        updated.relay?.publicEndpoint ?? (submission.publicEndpoint?.trim() || submission.endpoint);
      const nextPublicUseTls =
        updated.relay?.publicUseTls ?? updated.relay?.useTls ?? submission.publicUseTls;

      if (accountModel) {
        void accountModel
          .refreshDeviceRelayOffer(
            serverId,
            { endpoint: nextPublicEndpoint, useTls: nextPublicUseTls },
            { isLocalDaemon },
          )
          .catch((error) => {
            console.warn("[RelayEndpointSection] Failed to sync account relay offer", error);
          });
      }

      await getHostRuntimeStore().switchHostRelayEndpoint(serverId, {
        relayEndpoint: nextPublicEndpoint,
        useTls: nextPublicUseTls,
      });

      return nextPublicEndpoint;
    },
    onSuccess: onSwitched,
  });
}

// COMPAT(relayEndpointConfig): added in v1.6.1, remove gate after 2027-05-24.
export function RelayEndpointSection({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const isConnected = useHostRuntimeIsConnected(serverId);
  const isSupported = useHostFeature(serverId, "relayEndpointConfig");
  const { config } = useDaemonConfig(serverId);
  const nodeLabel = useRelayNodeLabel();

  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const [customSheetNonce, setCustomSheetNonce] = useState(0);
  const [switchedNotice, setSwitchedNotice] = useState<string | null>(null);

  const probeEnabled = isConnected && isSupported;
  const { probes, isProbing, probeError, runProbe } = useRelayEndpointProbing(
    serverId,
    probeEnabled,
  );

  const handleSwitched = useCallback(
    (nextPublicEndpoint: string) => {
      setIsCustomOpen(false);
      setSwitchedNotice(t("settings.host.relay.switchedNotice", { endpoint: nextPublicEndpoint }));
    },
    [t],
  );
  const switchMutation = useRelayEndpointSwitch(serverId, handleSwitched);

  const relay = config?.relay;
  const endpointMutable = relay?.endpointMutable !== false;
  const currentMode = useMemo(() => classifyRelaySelection(relay, HOSTED_PRESETS), [relay]);
  const recommendation = useMemo(
    () => recommendRelayNode({ currentMode, presets: HOSTED_PRESETS, probes }),
    [currentMode, probes],
  );

  const confirmAndSwitch = useCallback(
    async (submission: RelayPatchSubmission, targetLabel: string) => {
      setSwitchedNotice(null);
      switchMutation.reset();
      const confirmed = await confirmDialog({
        title: t("settings.host.relay.confirmTitle", { target: targetLabel }),
        message: t("settings.host.relay.confirmMessage"),
        confirmLabel: t("settings.host.relay.confirmAction"),
        cancelLabel: t("common.actions.cancel"),
        destructive: false,
      });
      if (!confirmed) return;
      switchMutation.mutate(submission);
    },
    [switchMutation, t],
  );

  const handleOpenCustom = useCallback(() => {
    setSwitchedNotice(null);
    switchMutation.reset();
    setCustomSheetNonce((prev) => prev + 1);
    setIsCustomOpen(true);
  }, [switchMutation]);

  const handleCloseCustom = useCallback(() => {
    if (switchMutation.isPending) return;
    setIsCustomOpen(false);
  }, [switchMutation.isPending]);

  const handleSegmentChange = useCallback(
    (nextMode: RelaySelectionMode) => {
      if (nextMode === "custom") {
        handleOpenCustom();
        return;
      }
      const preset = HOSTED_PRESETS.find((candidate) => candidate.id === nextMode);
      if (!preset) return;
      void confirmAndSwitch(
        { endpoint: preset.endpoint, publicEndpoint: "", useTls: true, publicUseTls: true },
        nodeLabel(preset.id),
      );
    },
    [confirmAndSwitch, handleOpenCustom, nodeLabel],
  );

  const handleApplyRecommendation = useCallback(() => {
    if (!recommendation) return;
    void confirmAndSwitch(
      {
        endpoint: recommendation.targetEndpoint,
        publicEndpoint: "",
        useTls: true,
        publicUseTls: true,
      },
      nodeLabel(recommendation.targetNode),
    );
  }, [confirmAndSwitch, recommendation, nodeLabel]);

  const handleSaveCustom = useCallback(
    (submission: RelayPatchSubmission) => {
      void confirmAndSwitch(submission, submission.endpoint);
    },
    [confirmAndSwitch],
  );

  const handlePressProbe = useCallback(() => {
    void runProbe();
  }, [runProbe]);

  const segmentOptions = useMemo<SegmentedControlOption<RelaySelectionMode>[]>(
    () => [
      ...HOSTED_PRESETS.map((preset) => ({
        value: preset.id as RelaySelectionMode,
        label: nodeLabel(preset.id),
        disabled: !endpointMutable || switchMutation.isPending,
        testID: `host-relay-node-${preset.id}`,
      })),
      {
        value: "custom",
        label: t("settings.host.relay.nodes.custom"),
        disabled: !endpointMutable || switchMutation.isPending,
        testID: "host-relay-node-custom",
      },
    ],
    [endpointMutable, nodeLabel, switchMutation.isPending, t],
  );

  if (!isConnected || !isSupported || !relay) return null;

  const initialPublicEndpoint =
    relay.publicEndpoint && relay.publicEndpoint !== relay.endpoint ? relay.publicEndpoint : "";

  return (
    <SettingsSection title={t("settings.host.relay.title")}>
      <View style={settingsStyles.card} testID="host-relay-endpoint-card">
        <RelayNodeHeaderRows
          relay={relay}
          currentMode={currentMode}
          segmentOptions={segmentOptions}
          disabled={!endpointMutable || switchMutation.isPending}
          onSegmentChange={handleSegmentChange}
          onOpenCustom={handleOpenCustom}
        />

        {HOSTED_PRESETS.length > 0 ? (
          <RelayProbeRow
            probes={probes}
            isProbing={isProbing}
            nodeLabel={nodeLabel}
            onPressProbe={handlePressProbe}
          />
        ) : null}

        {recommendation && endpointMutable ? (
          <RelayRecommendationBanner
            recommendation={recommendation}
            nodeLabel={nodeLabel}
            isPending={switchMutation.isPending}
            onApply={handleApplyRecommendation}
          />
        ) : null}

        <RelayStatusAlerts
          endpointMutable={endpointMutable}
          probeError={probeError}
          switchError={switchMutation.error?.message ?? null}
          switchedNotice={switchedNotice}
        />
      </View>

      {isCustomOpen ? (
        <CustomRelayEndpointSheet
          key={`custom-relay-${serverId}-${customSheetNonce}`}
          initialEndpoint={relay.endpoint ?? ""}
          initialPublicEndpoint={initialPublicEndpoint}
          initialUseTls={relay.useTls !== false}
          isSaving={switchMutation.isPending}
          onSave={handleSaveCustom}
          onClose={handleCloseCustom}
        />
      ) : null}
    </SettingsSection>
  );
}

function RelayNodeHeaderRows({
  relay,
  currentMode,
  segmentOptions,
  disabled,
  onSegmentChange,
  onOpenCustom,
}: {
  relay: { endpoint?: string; publicEndpoint?: string };
  currentMode: RelaySelectionMode;
  segmentOptions: SegmentedControlOption<RelaySelectionMode>[];
  disabled: boolean;
  onSegmentChange: (nextMode: RelaySelectionMode) => void;
  onOpenCustom: () => void;
}) {
  const { t } = useTranslation();
  const currentEndpointDisplay = relay.publicEndpoint || relay.endpoint || "—";

  return (
    <>
      <View style={settingsStyles.row}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>{t("settings.host.relay.nodeTitle")}</Text>
          <Text style={settingsStyles.rowHint} testID="host-relay-current-endpoint">
            {t("settings.host.relay.currentEndpoint", { endpoint: currentEndpointDisplay })}
          </Text>
        </View>
        {HOSTED_PRESETS.length > 0 ? (
          <SegmentedControl
            size="sm"
            options={segmentOptions}
            value={currentMode}
            onValueChange={onSegmentChange}
            testID="host-relay-node-control"
          />
        ) : (
          <Button
            size="sm"
            variant="outline"
            onPress={onOpenCustom}
            disabled={disabled}
            testID="host-relay-edit-custom-button"
          >
            {t("settings.host.relay.editCustom")}
          </Button>
        )}
      </View>

      {HOSTED_PRESETS.length > 0 && currentMode === "custom" ? (
        <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>{t("settings.host.relay.customTitle")}</Text>
            <Text style={settingsStyles.rowHint}>{relay.endpoint ?? "—"}</Text>
          </View>
          <Button
            size="sm"
            variant="outline"
            onPress={onOpenCustom}
            disabled={disabled}
            testID="host-relay-edit-custom-button"
          >
            {t("settings.host.relay.editCustom")}
          </Button>
        </View>
      ) : null}
    </>
  );
}

function RelayProbeRow({
  probes,
  isProbing,
  nodeLabel,
  onPressProbe,
}: {
  probes: readonly RelayProbeSample[];
  isProbing: boolean;
  nodeLabel: (node: RelayNodeId) => string;
  onPressProbe: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{t("settings.host.relay.latencyTitle")}</Text>
        <View style={styles.probeList} testID="host-relay-probe-list">
          {HOSTED_PRESETS.map((preset) => (
            <ProbeSummaryItem
              key={preset.id}
              preset={preset}
              label={nodeLabel(preset.id)}
              probes={probes}
              isProbing={isProbing}
            />
          ))}
        </View>
      </View>
      <Button
        size="sm"
        variant="outline"
        onPress={onPressProbe}
        disabled={isProbing}
        testID="host-relay-probe-button"
      >
        {isProbing ? t("settings.host.relay.probing") : t("settings.host.relay.probeAction")}
      </Button>
    </View>
  );
}

function RelayRecommendationBanner({
  recommendation,
  nodeLabel,
  isPending,
  onApply,
}: {
  recommendation: RelaySwitchRecommendation;
  nodeLabel: (node: RelayNodeId) => string;
  isPending: boolean;
  onApply: () => void;
}) {
  const { t } = useTranslation();
  const targetName = nodeLabel(recommendation.targetNode);
  const currentLatency =
    recommendation.currentMs !== null
      ? formatLatency(recommendation.currentMs)
      : t("settings.host.connections.timeout");
  const description = t("settings.host.relay.recommendDescription", {
    node: targetName,
    targetLatency: formatLatency(recommendation.targetMs),
    currentLatency,
  });

  return (
    <View style={styles.alertBlock} testID="host-relay-recommendation">
      <InlineAlert
        size="sm"
        variant="info"
        title={t("settings.host.relay.recommendTitle", { node: targetName })}
        description={description}
      />
      <View style={styles.recommendActions}>
        <Button
          size="sm"
          variant="default"
          onPress={onApply}
          disabled={isPending}
          loading={isPending}
          testID="host-relay-apply-recommendation"
        >
          {t("settings.host.relay.switchTo", { node: targetName })}
        </Button>
      </View>
    </View>
  );
}

function RelayStatusAlerts({
  endpointMutable,
  probeError,
  switchError,
  switchedNotice,
}: {
  endpointMutable: boolean;
  probeError: string | null;
  switchError: string | null;
  switchedNotice: string | null;
}) {
  const { t } = useTranslation();
  return (
    <>
      {!endpointMutable ? (
        <View style={styles.alertBlock}>
          <InlineAlert
            size="sm"
            variant="warning"
            title={t("settings.host.relay.lockedTitle")}
            description={t("settings.host.relay.lockedDescription")}
            testID="host-relay-locked-alert"
          />
        </View>
      ) : null}

      {probeError ? (
        <View style={styles.alertBlock}>
          <InlineAlert
            size="sm"
            variant="error"
            title={t("settings.host.relay.probeErrorTitle")}
            description={probeError}
            testID="host-relay-probe-error"
          />
        </View>
      ) : null}

      {switchError ? (
        <View style={styles.alertBlock}>
          <InlineAlert
            size="sm"
            variant="error"
            title={t("settings.host.relay.switchErrorTitle")}
            description={switchError}
            testID="host-relay-switch-error"
          />
        </View>
      ) : null}

      {switchedNotice ? (
        <View style={styles.alertBlock}>
          <InlineAlert
            size="sm"
            variant="success"
            title={switchedNotice}
            testID="host-relay-switched-notice"
          />
        </View>
      ) : null}
    </>
  );
}

function ProbeSummaryItem({
  preset,
  label,
  probes,
  isProbing,
}: {
  preset: RelayNodePreset;
  label: string;
  probes: readonly RelayProbeSample[];
  isProbing: boolean;
}) {
  const { t } = useTranslation();
  const sample = findProbeForPreset(preset, probes);
  const latencyText = (() => {
    if (isProbing && !sample) return "...";
    if (!sample) return "—";
    if (!sample.ok || sample.ms === null) return t("settings.host.connections.timeout");
    return formatLatency(sample.ms);
  })();
  const isError = sample !== null && (!sample.ok || sample.ms === null);

  return (
    <View style={styles.probeItem} testID={`host-relay-probe-${preset.id}`}>
      <Text style={styles.probeLabel}>{label}</Text>
      <Text style={[styles.probeLatency, isError && styles.probeLatencyError]}>{latencyText}</Text>
    </View>
  );
}

function CustomRelayEndpointSheet({
  initialEndpoint,
  initialPublicEndpoint,
  initialUseTls,
  isSaving,
  onSave,
  onClose,
}: {
  initialEndpoint: string;
  initialPublicEndpoint: string;
  initialUseTls: boolean;
  isSaving: boolean;
  onSave: (submission: RelayPatchSubmission) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [endpoint, setEndpoint] = useState(initialEndpoint);
  const [publicEndpoint, setPublicEndpoint] = useState(initialPublicEndpoint);
  const [useTls, setUseTls] = useState(initialUseTls);
  const [validationError, setValidationError] = useState<{
    field: "endpoint" | "publicEndpoint";
    message: string;
  } | null>(null);

  const header = useMemo<SheetHeader>(
    () => ({ title: t("settings.host.relay.customSheetTitle") }),
    [t],
  );

  const handleEndpointChange = useCallback((value: string) => {
    setEndpoint(value);
    setValidationError(null);
  }, []);

  const handlePublicEndpointChange = useCallback((value: string) => {
    setPublicEndpoint(value);
    setValidationError(null);
  }, []);

  const handleSubmit = useCallback(() => {
    const validated = validateCustomRelayDraft({ endpoint, publicEndpoint, useTls });
    if (!validated.ok) {
      setValidationError({ field: validated.field, message: validated.message });
      return;
    }
    onSave({
      endpoint: validated.endpoint,
      publicEndpoint: validated.publicEndpoint,
      useTls: validated.useTls,
      publicUseTls: validated.useTls,
    });
  }, [endpoint, onSave, publicEndpoint, useTls]);

  return (
    <AdaptiveModalSheet
      header={header}
      visible
      onClose={onClose}
      testID="host-relay-custom-sheet"
      desktopMaxWidth={480}
    >
      <View style={styles.sheetBody}>
        <Field
          label={t("settings.host.relay.customEndpointLabel")}
          error={validationError?.field === "endpoint" ? validationError.message : null}
          testID="host-relay-custom-endpoint-field"
        >
          <FormTextInput
            initialValue={initialEndpoint}
            onChangeText={handleEndpointChange}
            placeholder="relay.example.com:443"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isSaving}
            testID="host-relay-custom-endpoint-input"
          />
        </Field>

        <Field
          label={t("settings.host.relay.customPublicEndpointLabel")}
          hint={t("settings.host.relay.customPublicEndpointHint")}
          error={validationError?.field === "publicEndpoint" ? validationError.message : null}
          testID="host-relay-custom-public-field"
        >
          <FormTextInput
            initialValue={initialPublicEndpoint}
            onChangeText={handlePublicEndpointChange}
            placeholder={t("settings.host.relay.customPublicEndpointPlaceholder")}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isSaving}
            testID="host-relay-custom-public-input"
          />
        </Field>

        <View style={styles.tlsRow}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>{t("settings.host.relay.customTlsLabel")}</Text>
          </View>
          <Switch
            value={useTls}
            onValueChange={setUseTls}
            disabled={isSaving}
            accessibilityLabel={t("settings.host.relay.customTlsLabel")}
            testID="host-relay-custom-tls-switch"
          />
        </View>

        <View style={styles.sheetActions}>
          <Button variant="ghost" onPress={onClose} disabled={isSaving}>
            {t("common.actions.cancel")}
          </Button>
          <Button
            variant="default"
            onPress={handleSubmit}
            disabled={isSaving || endpoint.trim().length === 0}
            loading={isSaving}
            testID="host-relay-custom-save"
          >
            {t("common.actions.save")}
          </Button>
        </View>
      </View>
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  probeList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
    marginTop: theme.spacing[1],
  },
  probeItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  probeLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  probeLatency: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.mono,
    fontVariant: ["tabular-nums"],
  },
  probeLatencyError: {
    color: theme.colors.palette.red[300],
  },
  alertBlock: {
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[4],
    gap: theme.spacing[2],
  },
  recommendActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  sheetBody: {
    gap: theme.spacing[4],
  },
  tlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  sheetActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
}));
