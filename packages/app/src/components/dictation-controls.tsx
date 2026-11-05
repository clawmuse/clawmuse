import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ArrowUp, RefreshCcw, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { DictationStatus } from "@/hooks/use-dictation";

interface DictationControlsProps {
  duration: number;
  isProcessing: boolean;
  status: DictationStatus;
  onCancel: () => void;
  onAccept: () => void;
  onAcceptAndSend: () => void;
  onRetry: () => void;
  onDiscard: () => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function RecordingDot() {
  return <View style={styles.recordingDot} />;
}

/** Recording lives in the normal toolbar so the input and its transcript stay visible. */
export function DictationControls({
  duration,
  isProcessing,
  status,
  onCancel,
  onAccept,
  onAcceptAndSend,
  onRetry,
  onDiscard,
}: DictationControlsProps) {
  const { t } = useTranslation();
  const isFailed = status === "failed";

  return (
    <View style={styles.controls} testID="dictation-controls">
      <Button
        variant="ghost"
        size="sm"
        leftIcon={X}
        disabled={isProcessing}
        onPress={isFailed ? onDiscard : onCancel}
        accessibilityLabel={t("message.dictation.cancel")}
        style={styles.cancelButton}
      />
      {isFailed ? (
        <Button
          variant="outline"
          size="sm"
          leftIcon={RefreshCcw}
          onPress={onRetry}
          accessibilityLabel={t("message.dictation.retry")}
          testID="dictation-retry"
          style={styles.timerButton}
        >
          {formatDuration(duration)}
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onPress={onAccept}
          loading={isProcessing}
          leftIcon={RecordingDot}
          accessibilityLabel={t("composer.voice.stopDictation")}
          testID="dictation-stop"
          style={styles.timerButton}
          textStyle={styles.timerText}
        >
          {formatDuration(duration)}
        </Button>
      )}
      <Button
        variant="default"
        size="md"
        leftIcon={ArrowUp}
        onPress={onAcceptAndSend}
        disabled={isProcessing || isFailed}
        accessibilityLabel={t("message.dictation.insertAndSend")}
        testID="dictation-send"
        style={styles.sendButton}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  cancelButton: {
    width: 32,
    paddingHorizontal: 0,
    borderRadius: theme.borderRadius.full,
  },
  timerButton: {
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.full,
    gap: theme.spacing[2],
  },
  timerText: { fontVariant: ["tabular-nums"] },
  recordingDot: {
    width: theme.spacing[2],
    height: theme.spacing[2],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.destructive,
  },
  sendButton: {
    width: 44,
    paddingHorizontal: 0,
    borderRadius: theme.borderRadius.full,
  },
}));
