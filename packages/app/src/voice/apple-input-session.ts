import type { AppleSpeechEvent } from "@getpaseo/expo-two-way-audio";
import { createLocalTurnBoundary } from "./local-turn-boundary";
import type { LocalVoiceInput, LocalVoiceInputEvent } from "./local-input";

type AppleSpeechBridge = Pick<
  typeof import("@getpaseo/expo-two-way-audio"),
  | "startAppleSpeech"
  | "appendAppleSpeechAudio"
  | "suspendAppleSpeech"
  | "stopAppleSpeech"
  | "subscribeAppleSpeech"
>;

/** Serializes native session transitions and retains at most two seconds during preheating. */
export function createAppleInputSession(native: AppleSpeechBridge): LocalVoiceInput {
  let subscription: { remove(): void } | null = null;
  let sessionId: string | null = null;
  let suspended = false;
  let acceptingEvents = false;
  let ready = false;
  let failed = false;
  let generation = 0;
  let transition = Promise.resolve();
  let pending: Uint8Array[] = [];
  let pendingBytes = 0;
  let speechReported = false;
  let detectedSpeech: boolean | null = null;
  let pendingPartial: Extract<AppleSpeechEvent, { type: "partial" }> | null = null;
  let finishing = false;
  let onEvent: (event: LocalVoiceInputEvent) => void = () => {};
  const boundary = createLocalTurnBoundary();

  function resetTurn(): void {
    boundary.reset();
    speechReported = false;
    detectedSpeech = null;
    pendingPartial = null;
  }
  function publishPartial(event: Extract<AppleSpeechEvent, { type: "partial" }>): void {
    if (!speechReported && event.text.trim()) {
      speechReported = true;
      onEvent({ type: "speech" });
    }
    onEvent(event);
  }
  function clearPending(): void {
    pending = [];
    pendingBytes = 0;
  }
  function fail(message: string): void {
    if (failed) return;
    failed = true;
    ready = false;
    clearPending();
    onEvent({ type: "error", message });
    if (sessionId)
      void native
        .stopAppleSpeech(sessionId)
        .catch((error: unknown) => console.error("[AppleSpeech] Cleanup failed", error));
  }
  function append(data: Uint8Array): void {
    if (!sessionId || suspended || failed) return;
    if (!ready) {
      if (pendingBytes + data.byteLength > 64000) {
        fail("Apple transcription could not keep up with audio. Restart the conversation.");
        return;
      }
      pending.push(data.slice());
      pendingBytes += data.byteLength;
      return;
    }
    const endOfTurn = boundary.append(data);
    if (endOfTurn) {
      ready = false;
      finishing = true;
    }
    native.appendAppleSpeechAudio(sessionId, data, endOfTurn);
  }
  function handleActivity(event: Extract<AppleSpeechEvent, { type: "activity" }>): void {
    // Native detection and transcription arrive independently. Keep positive evidence
    // through finalization, and retain text until a delayed detector can confirm it.
    detectedSpeech = detectedSpeech === true || event.speechDetected;
    if (!finishing) boundary.activity(event.speechDetected, event.audioTimeMs);
    if (detectedSpeech && pendingPartial) {
      const partial = pendingPartial;
      pendingPartial = null;
      publishPartial(partial);
    }
  }
  function receive(event: AppleSpeechEvent): void {
    if (event.sessionId !== sessionId || failed) return;
    if (event.type === "error") {
      fail(event.message);
      return;
    }
    if (suspended || !acceptingEvents) return;
    if (event.type === "ready") {
      ready = true;
      finishing = false;
      resetTurn();
      const buffered = pending;
      clearPending();
      for (const data of buffered) append(data);
      return;
    }
    if (!ready && !finishing && event.type !== "preparing") return;
    if (event.type === "activity") {
      handleActivity(event);
      return;
    }
    if (event.type === "final") {
      if (detectedSpeech === false) {
        pendingPartial = null;
        onEvent({ type: "idle" });
        return;
      }
      onEvent({ ...event, endpointMs: boundary.getEndpointMs() });
      return;
    }
    if (event.type === "partial") {
      // Still endpoint rejected text so the native analyzer can start a fresh turn.
      if (!finishing) boundary.transcript(event.text);
      if (detectedSpeech === false) {
        pendingPartial = event;
        return;
      }
      publishPartial(event);
      return;
    }
    onEvent(event);
  }
  return {
    async start(id, locale, listener) {
      const token = ++generation;
      sessionId = id;
      onEvent = listener;
      suspended = false;
      acceptingEvents = true;
      failed = false;
      ready = false;
      finishing = false;
      resetTurn();
      clearPending();
      subscription?.remove();
      subscription = native.subscribeAppleSpeech(receive);
      try {
        await native.startAppleSpeech(id, locale);
        if (token !== generation) throw new Error("Voice input start canceled");
      } catch (error) {
        if (token === generation) {
          sessionId = null;
          subscription?.remove();
          subscription = null;
        }
        throw error;
      }
    },
    append,
    suspend(value) {
      if (!sessionId || value === suspended || failed) return;
      suspended = value;
      acceptingEvents = false;
      ready = false;
      finishing = false;
      resetTurn();
      clearPending();
      const id = sessionId;
      const token = generation;
      transition = transition
        .then(async () => {
          if (token !== generation) return undefined;
          if (!value) acceptingEvents = true;
          await native.suspendAppleSpeech(id, value);
          return undefined;
        })
        .catch((error: unknown) => {
          if (token === generation) fail(error instanceof Error ? error.message : String(error));
        });
    },
    async stop() {
      generation++;
      const id = sessionId;
      sessionId = null;
      acceptingEvents = false;
      ready = false;
      clearPending();
      resetTurn();
      subscription?.remove();
      subscription = null;
      if (id) await native.stopAppleSpeech(id);
    },
  };
}
