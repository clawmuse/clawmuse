import { useCallback, useState } from "react";
import { Platform, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { setMicrophoneModeIOS } from "@getpaseo/expo-two-way-audio";
import { Button } from "@/components/ui/button";
import { settingsStyles } from "@/styles/settings";

export function MicrophoneModeButton() {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const open = useCallback(() => {
    try {
      setMicrophoneModeIOS();
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);
  if (Platform.OS !== "ios") return null;
  return (
    <View>
      <Button variant="ghost" onPress={open} testID="voice-microphone-mode">
        {t("speechSettings.microphoneMode")}
      </Button>
      {error ? <Text style={settingsStyles.rowError}>{error}</Text> : null}
    </View>
  );
}
