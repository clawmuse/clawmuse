export type LocalVoiceInputEvent =
  | { type: "preparing" | "speech" | "transcribing" | "idle" }
  | { type: "partial"; text: string }
  | {
      type: "final";
      text: string;
      firstPartialMs?: number;
      finalizationMs: number;
      endpointMs?: number;
    }
  | { type: "error"; message: string };

export interface LocalVoiceInput {
  start(
    sessionId: string,
    locale: string,
    onEvent: (event: LocalVoiceInputEvent) => void,
  ): Promise<void>;
  append(data: Uint8Array): void;
  suspend(suspended: boolean): void;
  stop(): Promise<void>;
}
