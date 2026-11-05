import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { X, Sparkles } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { ToolbarButton } from "@/components/ui/pane-content-toolbar";
import { useIsCompactFormFactor } from "@/constants/layout";
import { ICON_SIZE, type Theme } from "@/styles/theme";

const ThemedX = withUnistyles(X, (theme: Theme) => ({ color: theme.colors.foregroundMuted }));

export function PromptSuggestion({
  prompt,
  onAccept,
  onDismiss,
}: {
  prompt: string;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const compact = useIsCompactFormFactor();
  const label = compact ? prompt : `${prompt}  ⇥`;
  return (
    <View style={styles.row} testID="composer-prompt-prediction">
      <Button
        variant="ghost"
        size={compact ? "md" : "sm"}
        leftIcon={Sparkles}
        onPress={onAccept}
        accessibilityLabel={t("composer.prediction.accept", { prompt })}
        style={styles.suggestion}
        testID="accept-prompt-prediction"
      >
        {label}
      </Button>
      <ToolbarButton
        onPress={onDismiss}
        label={t("composer.prediction.dismiss")}
        testID="dismiss-prompt-prediction"
      >
        <ThemedX size={ICON_SIZE.sm} />
      </ToolbarButton>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[1],
    paddingBottom: theme.spacing[1],
  },
  suggestion: { flex: 1, justifyContent: "flex-start", minWidth: 0 },
}));
