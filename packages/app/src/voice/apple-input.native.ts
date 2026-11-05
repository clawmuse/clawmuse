import { Platform } from "react-native";
import * as native from "@getpaseo/expo-two-way-audio";
import { i18n } from "@/i18n/i18next";
import type { LocalVoiceInput } from "./local-input";
import { createAppleInputSession } from "./apple-input-session";

export async function isAppleInputAvailable(): Promise<boolean> {
  return Platform.OS === "ios" && (await native.isAppleSpeechAvailable());
}

export function createAppleInput(): LocalVoiceInput | undefined {
  if (Platform.OS !== "ios") return undefined;
  const input = createAppleInputSession(native);
  let generation = 0;
  return {
    ...input,
    async start(sessionId, locale, onEvent) {
      const token = ++generation;
      if (!(await isAppleInputAvailable()))
        throw new Error(i18n.t("speechSettings.appleUnavailable"));
      if (token !== generation) throw new Error("Voice input start canceled");
      await input.start(sessionId, locale, onEvent);
    },
    async stop() {
      generation++;
      await input.stop();
    },
  };
}
