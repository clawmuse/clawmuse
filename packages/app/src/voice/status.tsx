import { MicrophoneModeButton } from "./microphone-mode";
import { ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import type { VoiceRuntimeSnapshot } from "./voice-runtime";

export function RealtimeVoiceStatus({
  snapshot,
  visible = true,
}: {
  snapshot: VoiceRuntimeSnapshot | null | undefined;
  visible?: boolean;
}) {
  const { t } = useTranslation();
  if (!visible || !snapshot) return null;
  const { status, failed } = resolveStatus(snapshot);

  return (
    <View style={styles.container} testID="realtime-voice-status">
      <Text accessibilityLiveRegion="polite" style={failed ? styles.error : styles.status}>
        {snapshot.isAssistant && status !== "muted" && status !== "capture_paused"
          ? t(`speechSettings.assistantPhase.${status}`)
          : t(`realtimeVoice.status.${status}`)}
      </Text>
      {snapshot.isVoiceMode && !snapshot.isVoiceSwitching ? <MicrophoneModeButton /> : null}
      {snapshot.preparingLocalInput ? (
        <Text style={styles.status}>{t("speechSettings.applePreparing")}</Text>
      ) : null}
      {snapshot.inputSource === "apple" ? (
        <Text style={styles.status}>{t("speechSettings.appleLocal")}</Text>
      ) : null}
      {snapshot.inputError ? <Text style={styles.error}>{snapshot.inputError}</Text> : null}
      {snapshot.firstPartialMs !== undefined && snapshot.finalizationMs !== undefined ? (
        <Text style={styles.status}>
          {t("speechSettings.appleTiming", {
            first: Math.round(snapshot.firstPartialMs),
            final: Math.round(snapshot.finalizationMs),
          })}
        </Text>
      ) : null}
      {snapshot.endpointMs !== undefined ? (
        <Text style={styles.status}>
          {t("speechSettings.appleEndpointTiming", { endpoint: Math.round(snapshot.endpointMs) })}
        </Text>
      ) : null}
      {snapshot.lastTranscript ? (
        <ScrollView style={styles.transcript} nestedScrollEnabled>
          <Text selectable style={styles.text}>
            {t("realtimeVoice.transcript", { text: snapshot.lastTranscript })}
          </Text>
        </ScrollView>
      ) : null}
    </View>
  );
}

function resolveStatus(snapshot: VoiceRuntimeSnapshot) {
  let status: VoiceRuntimeSnapshot["phase"] | "muted" | "capture_paused" = snapshot.phase;
  if (!snapshot.captureAvailable) status = "capture_paused";
  if (snapshot.isMuted) status = "muted";
  if (snapshot.phase === "reconnecting") status = "reconnecting";
  const failed = [
    "recognition_failed",
    "no_speech",
    "submission_failed",
    "connection_failed",
  ].includes(snapshot.phase);
  if (failed) status = snapshot.phase;

  return { status, failed };
}

const styles = StyleSheet.create((theme) => ({
  container: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    gap: theme.spacing[2],
  },
  status: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  error: { color: theme.colors.palette.red[600], fontSize: theme.fontSize.sm },
  transcript: { maxHeight: 120 },
  text: { color: theme.colors.foreground, fontSize: theme.fontSize.sm },
}));
