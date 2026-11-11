import { accountRequest } from "@/clawmuse/transport";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import type { SpeechSettings, SpeechSettingsPatch } from "@getpaseo/protocol/speech-config";
import { SettingsCard, SettingsRow, SettingsSection } from "@/components/settings";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { DropdownTrigger } from "@/components/ui/dropdown-trigger";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Switch } from "@/components/ui/switch";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useSessionStore } from "@/stores/session-store";
import { settingsStyles } from "@/styles/settings";
import { openSpeechForm, openVoiceAssistantForm, type SpeechProvider } from "./speech-form-model";

export function SpeechSettingsSection({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  // COMPAT(speechSettings): added in v0.13.0, remove after 2027-04-24 when the daemon floor supports speech settings.
  const supported = useSessionStore(
    (s) => s.sessions[serverId]?.serverInfo?.features?.speechSettings === true,
  );
  const { config, patchConfig } = useDaemonConfig(serverId);
  const persist = useCallback(
    async (patch: SpeechSettingsPatch) => {
      const result = await patchConfig({ speech: patch });
      if (!result) throw new Error(t("workspace.terminal.hostDisconnected"));
    },
    [patchConfig, t],
  );
  if (!supported)
    return <Text style={settingsStyles.rowHint}>{t("speechSettings.updateHost")}</Text>;
  if (!config?.speech) return <LoadingSpinner color={styles.spinner.color} />;
  return <SpeechForm key={serverId} snapshot={config.speech} persist={persist} />;
}

interface ChoiceOption<T extends string> {
  id: string;
  value: T;
  label: string;
}
interface ChoiceFieldProps<T extends string> {
  label: string;
  value: T;
  selectedDisplay: { label: string };
  options: ChoiceOption<T>[];
  onChange: (value: T) => void;
  disabled: boolean;
  testID: string;
}

function ChoiceItem<T extends string>({
  option,
  selected,
  onChange,
}: {
  option: ChoiceOption<T>;
  selected: boolean;
  onChange: (value: T) => void;
}) {
  const select = useCallback(() => onChange(option.value), [option.value, onChange]);
  return (
    <DropdownMenuItem selected={selected} onSelect={select}>
      {option.label}
    </DropdownMenuItem>
  );
}

function ChoiceField<T extends string>({
  label,
  value,
  selectedDisplay,
  options,
  onChange,
  disabled,
  testID,
}: ChoiceFieldProps<T>) {
  return (
    <Field label={label} testID={testID}>
      <DropdownMenu>
        <DropdownTrigger disabled={disabled} accessibilityLabel={label}>
          {selectedDisplay.label}
        </DropdownTrigger>
        <DropdownMenuContent side="bottom" align="start" width={280}>
          {options.map((option) => (
            <ChoiceItem
              key={option.id}
              option={option}
              selected={option.value === value}
              onChange={onChange}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </Field>
  );
}

export function SpeechForm({
  snapshot,
  persist,
}: {
  snapshot: SpeechSettings;
  persist: (patch: SpeechSettingsPatch) => Promise<void>;
}) {
  const { t } = useTranslation();
  const compact = useIsCompactFormFactor();
  const size = compact ? "md" : "sm";
  const [model] = useState(() => openSpeechForm(snapshot));
  const setOfficialDictation = useCallback(
    (value: boolean) => model.setService(value ? "official" : "custom"),
    [model],
  );
  const state = useSyncExternalStore(model.subscribe, model.getState, model.getState);
  useEffect(() => () => model.close(), [model]);
  const providerOptions = useMemo(
    () =>
      (["local", "stepfun", "openai"] as const).map((value) => ({
        id: value,
        value,
        label: t(`speechSettings.providers.${value}`),
      })),
    [t],
  );
  const modeOptions = useMemo(
    () =>
      (["official", "custom"] as const).map((value) => ({
        id: value,
        value,
        label: t(`speechSettings.${value}`),
      })),
    [t],
  );
  const selectedProvider = useMemo(
    () => ({ label: t(`speechSettings.providers.${state.provider}`) }),
    [state.provider, t],
  );
  const remote = state.provider === "local" ? null : state.provider;
  const endpoint = remote ? state.endpoints[remote] : null;
  const endpointMode = endpoint?.mode ?? "official";
  const selectedMode = useMemo(
    () => ({ label: t(`speechSettings.${endpointMode}`) }),
    [endpointMode, t],
  );
  const selectProvider = useCallback(
    (provider: SpeechProvider) => model.setProvider(provider),
    [model],
  );
  const selectMode = useCallback(
    (mode: "official" | "custom") => {
      if (remote) model.setEndpointMode(remote, mode);
    },
    [model, remote],
  );
  const setBaseUrl = useCallback(
    (baseUrl: string) => {
      if (remote) model.setEndpoint(remote, { baseUrl });
    },
    [model, remote],
  );
  const setApiKey = useCallback(
    (apiKey: string) => {
      if (remote) model.setEndpoint(remote, { apiKey });
    },
    [model, remote],
  );
  const save = useCallback(() => {
    void model.save(persist);
  }, [model, persist]);
  const busy = state.status === "saving";
  return (
    <SettingsSection title={t("speechSettings.title")} testID="speech-settings">
      <SettingsCard>
        <SettingsRow label={t("speechSettings.enabled")}>
          <Switch
            value={state.enabled}
            onValueChange={model.setEnabled}
            disabled={busy}
            testID="speech-enabled"
          />
        </SettingsRow>
        <View style={styles.fields}>
          <SettingsRow label={t("speechSettings.officialDictation")}>
            <Switch
              value={state.service !== "custom"}
              onValueChange={setOfficialDictation}
              disabled={busy}
              testID="dictation-official"
            />
          </SettingsRow>
          {state.service !== "custom" ? (
            <Text style={settingsStyles.rowHint}>{t("speechSettings.officialDictationHint")}</Text>
          ) : (
            <>
              <ChoiceField
                label={t("speechSettings.provider")}
                value={state.provider}
                selectedDisplay={selectedProvider}
                options={providerOptions}
                onChange={selectProvider}
                disabled={busy}
                testID="speech-provider"
              />
              {endpoint ? (
                <>
                  <ChoiceField
                    label={t("speechSettings.endpoint")}
                    value={endpointMode}
                    selectedDisplay={selectedMode}
                    options={modeOptions}
                    onChange={selectMode}
                    disabled={busy}
                    testID="speech-endpoint-mode"
                  />
                  <Field label={t("speechSettings.baseUrl")}>
                    <FormTextInput
                      key={remote}
                      initialValue={endpoint.baseUrl}
                      resetKey={endpointMode}
                      onChangeText={setBaseUrl}
                      editable={!busy && endpointMode === "custom"}
                      autoCapitalize="none"
                      autoCorrect={false}
                      size={size}
                      testID="speech-base-url"
                    />
                  </Field>
                  <Field label={t("speechSettings.apiKey")}>
                    <FormTextInput
                      key={`key-${remote}`}
                      initialValue=""
                      resetKey={state.savedRevision}
                      onChangeText={setApiKey}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholder={
                        endpoint.hasApiKey
                          ? t("speechSettings.keySaved")
                          : t("speechSettings.keyPlaceholder")
                      }
                      editable={!busy}
                      size={size}
                      testID="speech-api-key"
                    />
                  </Field>
                </>
              ) : null}
              <Field label={t("speechSettings.model")}>
                <FormTextInput
                  initialValue={state.model}
                  resetKey={state.provider}
                  onChangeText={model.setModel}
                  editable={!busy}
                  autoCapitalize="none"
                  autoCorrect={false}
                  size={size}
                  testID="speech-model"
                />
              </Field>
              <Field label={t("speechSettings.language")}>
                <FormTextInput
                  initialValue={state.language}
                  resetKey={state.provider}
                  onChangeText={model.setLanguage}
                  editable={!busy}
                  autoCapitalize="none"
                  autoCorrect={false}
                  size={size}
                  testID="speech-language"
                />
              </Field>
            </>
          )}
          {state.validation ? (
            <Text style={settingsStyles.rowError}>{t(`speechSettings.${state.validation}`)}</Text>
          ) : null}
          {state.error ? (
            <Text style={settingsStyles.rowError} testID="speech-save-error">
              {state.error}
            </Text>
          ) : null}
          <Text style={settingsStyles.rowHint} testID="speech-save-status">
            {t(state.status === "saved" ? "speechSettings.saved" : "speechSettings.restartHint")}
          </Text>
          <Button onPress={save} disabled={busy} size={size} testID="speech-save">
            {t(busy ? "speechSettings.saving" : "speechSettings.save")}
          </Button>
        </View>
      </SettingsCard>
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  spinner: { color: theme.colors.foregroundMuted },
  fields: { padding: theme.spacing[4], gap: theme.spacing[4] },
}));

export function VoiceAssistantSettings({
  snapshot,
  persist,
}: {
  snapshot: NonNullable<SpeechSettings["assistant"]>;
  persist: (patch: SpeechSettingsPatch) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [model] = useState(() => openVoiceAssistantForm(snapshot));
  const [officialStatus, setOfficialStatus] = useState<string>(t("speechSettings.officialSignIn"));
  useEffect(() => {
    let active = true;
    void accountRequest("/clawmuse/official")
      .then((result) => {
        if (!active) return undefined;
        const value = result.data as {
          configured?: boolean;
          freeSeconds?: number;
          remainingSeconds?: number;
        };
        if (result.status === 200)
          setOfficialStatus(
            value.configured
              ? t("speechSettings.officialAllowance", {
                  minutes: Math.ceil((value.remainingSeconds ?? 0) / 60),
                })
              : t("speechSettings.officialConfiguring"),
          );
        return undefined;
      })
      .catch(() => {
        if (active) setOfficialStatus(t("speechSettings.officialFetchFailed"));
      });
    return () => {
      active = false;
    };
  }, [t]);
  const state = useSyncExternalStore(model.subscribe, model.getState, model.getState);
  useEffect(() => () => model.close(), [model]);
  const busy = state.status === "saving";
  const setOfficialService = useCallback(
    (value: boolean) => model.setService(value ? "official" : "custom"),
    [model],
  );
  const preset = state.baseUrl.includes("/step_plan/") ? "plan" : "preview";
  const options = useMemo(
    () =>
      (["plan", "preview"] as const).map((value) => ({
        id: value,
        value,
        label: t(`speechSettings.assistantPreset.${value}`),
      })),
    [t],
  );
  const selectedDisplay = useMemo(
    () => ({ label: t(`speechSettings.assistantPreset.${preset}`) }),
    [preset, t],
  );
  const save = useCallback(() => {
    void model.save(persist);
  }, [model, persist]);
  return (
    <SettingsSection title={t("speechSettings.assistantTitle")} testID="assistant-settings">
      <SettingsCard>
        <SettingsRow label={t("speechSettings.assistantEnabled")}>
          <Switch
            value={state.enabled}
            onValueChange={model.setEnabled}
            disabled={busy}
            testID="assistant-enabled"
          />
        </SettingsRow>
        <View style={styles.fields}>
          <Text style={settingsStyles.rowHint}>{t("speechSettings.assistantDescription")}</Text>
          <SettingsRow label={t("speechSettings.officialVoice")}>
            <Switch
              value={state.service !== "custom"}
              onValueChange={setOfficialService}
              disabled={busy}
              testID="assistant-official"
            />
          </SettingsRow>
          {state.service !== "custom" ? (
            <View>
              <Text style={settingsStyles.rowHint}>{officialStatus}</Text>
              <Text style={settingsStyles.rowHint}>{t("speechSettings.officialPrivacy")}</Text>
            </View>
          ) : (
            <>
              <ChoiceField
                label={t("speechSettings.assistantBilling")}
                value={preset}
                selectedDisplay={selectedDisplay}
                options={options}
                onChange={model.setPreset}
                disabled={busy}
                testID="assistant-billing"
              />
              <Text style={settingsStyles.rowHint}>
                {t(`speechSettings.assistantCost.${preset}`)}
              </Text>
              <Field label={t("speechSettings.apiKey")}>
                <FormTextInput
                  initialValue=""
                  resetKey={state.revision}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={model.setApiKey}
                  placeholder={t(
                    state.hasApiKey ? "speechSettings.keySaved" : "speechSettings.keyPlaceholder",
                  )}
                  editable={!busy}
                  testID="assistant-api-key"
                />
              </Field>
            </>
          )}
          <Field label={t("speechSettings.assistantVoice")}>
            <FormTextInput
              initialValue={state.voice}
              onChangeText={model.setVoice}
              editable={!busy}
              autoCapitalize="none"
              autoCorrect={false}
              testID="assistant-voice"
            />
          </Field>
          <Field label={t("speechSettings.assistantMinutes")}>
            <FormTextInput
              initialValue={state.maxSessionMinutes}
              onChangeText={model.setMinutes}
              editable={!busy}
              keyboardType="number-pad"
              testID="assistant-minutes"
            />
          </Field>
          {state.validation ? (
            <Text style={settingsStyles.rowError}>{t(`speechSettings.${state.validation}`)}</Text>
          ) : null}
          {state.error ? (
            <Text style={settingsStyles.rowError} testID="assistant-save-error">
              {state.error}
            </Text>
          ) : null}
          <Text style={settingsStyles.rowHint}>
            {t(
              state.status === "saved"
                ? "speechSettings.assistantSaved"
                : "speechSettings.assistantApplyHint",
            )}
          </Text>
          <Button onPress={save} disabled={busy} testID="assistant-save">
            {t(busy ? "speechSettings.saving" : "speechSettings.save")}
          </Button>
        </View>
      </SettingsCard>
    </SettingsSection>
  );
}
