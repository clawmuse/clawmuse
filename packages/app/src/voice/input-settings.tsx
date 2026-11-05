import { useCallback, useRef } from "react";
import { Platform, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { useFetchQuery } from "@/data/query";
import { StyleSheet } from "react-native-unistyles";
import { SettingsCard, SettingsSection } from "@/components/settings";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { DropdownTrigger } from "@/components/ui/dropdown-trigger";
import { useAppSettings } from "@/hooks/use-settings";
import { useVoiceOptional } from "@/contexts/voice-context";
import { settingsStyles } from "@/styles/settings";
import { isAppleInputAvailable } from "./apple-input";

export function VoiceInputSettings() {
  if (Platform.OS !== "ios") return null;
  return <AppleVoiceInputSettings />;
}

function AppleVoiceInputSettings() {
  const { t } = useTranslation();
  const { settings, updateSettings, isLoading } = useAppSettings();
  const voice = useVoiceOptional();
  const available = useFetchQuery({
    queryKey: ["apple-speech-available"],
    queryFn: isAppleInputAvailable,
    dataShape: "value",
    staleTimeMs: 60000,
  });
  const save = useMutation({ mutationFn: updateSettings });
  const { mutate } = save;
  const localeDraft = useRef<string | null>(null);
  const source = settings.voiceInputSource;
  const disabled =
    isLoading || save.isPending || Boolean(voice?.isVoiceMode || voice?.isVoiceSwitching);
  const hostLabel = t("speechSettings.hostRecognition");
  const selectServer = useCallback(() => mutate({ voiceInputSource: "server" }), [mutate]);
  const selectApple = useCallback(() => mutate({ voiceInputSource: "apple" }), [mutate]);
  const changeLocale = useCallback((value: string) => {
    localeDraft.current = value;
  }, []);
  const saveLocale = useCallback(() => {
    if (localeDraft.current !== null) mutate({ appleSpeechLocale: localeDraft.current.trim() });
  }, [mutate]);
  return (
    <SettingsSection title={t("speechSettings.realtimeInput")} testID="voice-input-settings">
      <SettingsCard>
        <View style={styles.fields}>
          <Field label={t("speechSettings.provider")}>
            <DropdownMenu>
              <DropdownTrigger
                disabled={disabled}
                accessibilityLabel={t("speechSettings.realtimeInput")}
                testID="voice-input-source"
              >
                {source === "apple" ? t("speechSettings.appleLocal") : hostLabel}
              </DropdownTrigger>
              <DropdownMenuContent side="bottom" align="start" width={280}>
                <DropdownMenuItem selected={source === "server"} onSelect={selectServer}>
                  {hostLabel}
                </DropdownMenuItem>
                <DropdownMenuItem
                  selected={source === "apple"}
                  onSelect={selectApple}
                  disabled={!available.data}
                >
                  {t("speechSettings.appleLocal")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </Field>
          <Text style={settingsStyles.rowHint}>{t("speechSettings.appleHint")}</Text>
          {available.data === false ? (
            <Text style={settingsStyles.rowHint}>{t("speechSettings.appleUnavailable")}</Text>
          ) : null}
          {source === "apple" ? (
            <Field label={t("speechSettings.language")}>
              <FormTextInput
                initialValue={settings.appleSpeechLocale}
                onChangeText={changeLocale}
                onBlur={saveLocale}
                placeholder={t("speechSettings.appleLanguageHint")}
                editable={!disabled}
                autoCapitalize="none"
                autoCorrect={false}
                testID="apple-speech-locale"
              />
            </Field>
          ) : null}
          {save.error || available.error ? (
            <Text style={settingsStyles.rowError}>{String(save.error ?? available.error)}</Text>
          ) : null}
          {save.isSuccess ? (
            <Text style={settingsStyles.rowHint}>{t("speechSettings.deviceSaved")}</Text>
          ) : null}
        </View>
      </SettingsCard>
    </SettingsSection>
  );
}
const styles = StyleSheet.create((theme) => ({
  fields: { padding: theme.spacing[4], gap: theme.spacing[4] },
}));
