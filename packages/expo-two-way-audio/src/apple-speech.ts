import ExpoTwoWayAudioModule from "./ExpoTwoWayAudioModule";

export type AppleSpeechEvent = { sessionId: string } & (
  | { type: "preparing" }
  | { type: "ready" }
  | { type: "transcribing" }
  | { type: "idle" }
  | { type: "activity"; speechDetected: boolean; audioTimeMs?: number }
  | { type: "partial"; text: string }
  | { type: "final"; text: string; firstPartialMs?: number; finalizationMs: number }
  | { type: "error"; message: string }
);

/** Feature detection also covers JS updates running in older native binaries. */
export async function isAppleSpeechAvailable(): Promise<boolean> {
  return (
    typeof ExpoTwoWayAudioModule.isAppleSpeechAvailable === "function" &&
    (await ExpoTwoWayAudioModule.isAppleSpeechAvailable())
  );
}
export function startAppleSpeech(sessionId: string, locale: string): Promise<void> {
  return ExpoTwoWayAudioModule.startAppleSpeech(sessionId, locale);
}
export function appendAppleSpeechAudio(
  sessionId: string,
  data: Uint8Array,
  endOfTurn: boolean,
): void {
  ExpoTwoWayAudioModule.appendAppleSpeechAudio(sessionId, data, endOfTurn);
}
export function suspendAppleSpeech(sessionId: string, suspended: boolean): Promise<void> {
  return ExpoTwoWayAudioModule.suspendAppleSpeech(sessionId, suspended);
}
export function stopAppleSpeech(sessionId: string): Promise<void> {
  return ExpoTwoWayAudioModule.stopAppleSpeech(sessionId);
}
export function subscribeAppleSpeech(listener: (event: AppleSpeechEvent) => void): {
  remove(): void;
} {
  return ExpoTwoWayAudioModule.addListener("onAppleSpeech", listener);
}
