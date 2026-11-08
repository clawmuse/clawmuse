import { Buffer } from "buffer";
import { i18n } from "@/i18n/i18next";
import { v4 as uuidv4 } from "uuid";
import type { LocalVoiceInput, LocalVoiceInputEvent } from "./local-input";
import type {
  AgentStreamEventPayload,
  SessionOutboundMessage,
  VoiceInputStatus,
} from "@getpaseo/protocol/messages";
import { resolveVoiceUnavailableMessage } from "@/utils/server-info-capabilities";
import type { DaemonServerInfo } from "@/stores/session-store";
import type { AudioEngine } from "@/audio";
import {
  THINKING_TONE_NATIVE_PCM_BASE64,
  THINKING_TONE_NATIVE_PCM_DURATION_MS,
} from "@/utils/thinking-tone.native-pcm";

const PLAYBACK_ECHO_TAIL_MS = 400;
const PCM_MIME_TYPE = "audio/pcm;rate=16000;bits=16";
const KEEP_AWAKE_TAG = "paseo:voice";
const THINKING_TONE_REPEAT_GAP_MS = 350;
/**
 * A reply is spoken as one TTS segment per sentence, and the daemon starts the next segment
 * only once the current one has finished playing, so a reply in progress is punctuated by short
 * silences. The cue is for a wait the user cannot otherwise explain, so it starts only once the
 * silence has outlasted those gaps.
 */
const THINKING_TONE_MIN_SILENCE_MS = 1500;
const DISPLAY_VOLUME_PUBLISH_INTERVAL_MS = 120;
const DISPLAY_VOLUME_CHANGE_EPSILON = 0.02;
const DISPLAY_VOLUME_ATTACK = 0.35;
const DISPLAY_VOLUME_RELEASE = 0.18;
const INPUT_FAILURE_DISPLAY_MS = 4000;

function isInputFailurePhase(phase: VoiceRuntimePhase): boolean {
  return phase === "recognition_failed" || phase === "no_speech" || phase === "submission_failed";
}

type TurnEventType = Extract<
  AgentStreamEventPayload["type"],
  "turn_started" | "turn_completed" | "turn_failed" | "turn_canceled"
>;

export type VoiceRuntimePhase =
  | "disabled"
  | "starting"
  | "listening"
  | "submitting"
  | "waiting"
  | "playing"
  | "stopping"
  | "reconnecting"
  | "connection_failed"
  | VoiceInputStatus;

export interface VoiceRuntimeSnapshot {
  phase: VoiceRuntimePhase;
  isVoiceMode: boolean;
  isVoiceSwitching: boolean;
  isMuted: boolean;
  activeServerId: string | null;
  activeAgentId: string | null;
  lastTranscript: string;
  captureAvailable: boolean;
  isAssistant?: boolean;
  assistantMessage?: string;
  assistantUsage?: { inputTokens: number; outputTokens: number };
  inputSource?: "apple" | "server";
  inputError?: string;
  preparingLocalInput?: boolean;
  firstPartialMs?: number;
  finalizationMs?: number;
  endpointMs?: number;
}

export interface VoiceRuntimeTelemetrySnapshot {
  volume: number;
  isSpeaking: boolean;
  segmentDuration: number;
}

export interface VoiceSessionAdapter {
  serverId: string;
  setVoiceMode(
    enabled: boolean,
    agentId?: string,
    input?: { inputSource: "client"; inputSessionId: string },
    assistant?: boolean,
  ): Promise<void>;
  submitVoiceTranscript?(inputSessionId: string, text: string): Promise<void>;
  sendVoiceAudioChunk(audioData: string, mimeType: string): Promise<void>;
  audioPlayed(chunkId: string): Promise<void>;
  abortRequest(): Promise<void>;
  setAssistantAudioPlaying(isPlaying: boolean): void;
}

export interface VoiceRuntimeDeps {
  engine: AudioEngine;
  localInput?: LocalVoiceInput;
  getServerInfo(serverId: string): DaemonServerInfo | null;
  activateKeepAwake(tag: string): Promise<void>;
  deactivateKeepAwake(tag: string): Promise<void>;
}

interface RuntimeSessionState {
  adapter: VoiceSessionAdapter;
  connected: boolean;
}

interface ContinuousVoiceUploader {
  reset(): void;
  pushPcmChunk(chunk: Uint8Array): void;
}

interface RuntimeState {
  snapshot: VoiceRuntimeSnapshot;
  telemetry: VoiceRuntimeTelemetrySnapshot;
  turnInProgress: boolean;
  // True while turnInProgress was only assumed from a transcript (no turn_started yet), so a
  // failed submission can take the assumption back without touching a turn that really runs.
  turnAssumedFromTranscript: boolean;
  serverSpeechDetected: boolean;
  transportReady: boolean;
  generation: number;
  segmentDurationTimer: ReturnType<typeof setInterval> | null;
  lastDisplayVolumePublishMs: number;
  serverSpeechStartedAt: number | null;
}

type AudioOutputPayload = Extract<SessionOutboundMessage, { type: "audio_output" }>["payload"];

interface StreamingPlaybackChunk {
  id: string;
  chunkIndex: number;
  source: { arrayBuffer(): Promise<ArrayBuffer>; size: number; type: string };
}

interface StreamingPlaybackGroup {
  groupId: string;
  isVoiceMode: boolean;
  shouldPlay: boolean;
  chunks: Map<number, StreamingPlaybackChunk>;
  nextChunkToPlay: number;
  finalChunkIndex: number | null;
  started: boolean;
  ackedChunkIds: Set<string>;
}

interface RuntimePlaybackState {
  groups: Map<string, StreamingPlaybackGroup>;
  orderedGroupIds: string[];
  activeGroupId: string | null;
  processing: boolean;
  generation: number;
}

interface CueState {
  controller: AbortController | null;
  timeout: ReturnType<typeof setTimeout> | null;
}

const INITIAL_SNAPSHOT: VoiceRuntimeSnapshot = {
  phase: "disabled",
  isVoiceMode: false,
  isVoiceSwitching: false,
  isMuted: false,
  activeServerId: null,
  activeAgentId: null,
  lastTranscript: "",
  captureAvailable: true,
};

const INITIAL_TELEMETRY: VoiceRuntimeTelemetrySnapshot = {
  volume: 0,
  isSpeaking: false,
  segmentDuration: 0,
};

let nextVoiceRuntimeInstanceId = 1;

function snapshotsEqual(left: VoiceRuntimeSnapshot, right: VoiceRuntimeSnapshot): boolean {
  return (
    left.phase === right.phase &&
    left.isVoiceMode === right.isVoiceMode &&
    left.isVoiceSwitching === right.isVoiceSwitching &&
    left.isMuted === right.isMuted &&
    left.activeServerId === right.activeServerId &&
    left.activeAgentId === right.activeAgentId &&
    left.lastTranscript === right.lastTranscript &&
    left.isAssistant === right.isAssistant &&
    left.assistantMessage === right.assistantMessage &&
    left.assistantUsage === right.assistantUsage &&
    left.captureAvailable === right.captureAvailable &&
    left.preparingLocalInput === right.preparingLocalInput &&
    left.inputSource === right.inputSource &&
    left.inputError === right.inputError &&
    left.firstPartialMs === right.firstPartialMs &&
    left.finalizationMs === right.finalizationMs &&
    left.endpointMs === right.endpointMs
  );
}

function telemetryEqual(
  left: VoiceRuntimeTelemetrySnapshot,
  right: VoiceRuntimeTelemetrySnapshot,
): boolean {
  return (
    left.volume === right.volume &&
    left.isSpeaking === right.isSpeaking &&
    left.segmentDuration === right.segmentDuration
  );
}

export interface VoiceRuntime {
  subscribe(listener: () => void): () => void;
  getSnapshot(): VoiceRuntimeSnapshot;
  subscribeTelemetry(listener: () => void): () => void;
  getTelemetrySnapshot(): VoiceRuntimeTelemetrySnapshot;
  registerSession(adapter: VoiceSessionAdapter): () => void;
  updateSessionConnection(serverId: string, connected: boolean): void;
  handleCapturePcm(chunk: Uint8Array): void;
  handleCaptureVolume(level: number): void;
  handleAudioOutput(serverId: string, payload: AudioOutputPayload): void;
  startVoice(
    serverId: string,
    agentId: string,
    input?: { source: "apple"; locale: string },
    assistant?: boolean,
  ): Promise<void>;
  stopVoice(): Promise<void>;
  destroy(): Promise<void>;
  toggleMute(): void;
  interruptReply(): void;
  isVoiceModeForAgent(serverId: string, agentId: string): boolean;
  shouldPlayVoiceAudio(serverId: string): boolean;
  onAssistantAudioStarted(serverId: string): void;
  onAssistantAudioFinished(serverId: string): void;
  onTranscriptionResult(serverId: string, text: string): void;
  onServerSpeechStateChanged(
    serverId: string,
    isSpeaking: boolean,
    status?: VoiceInputStatus,
    assistantState?: "speaking" | "waiting" | "listening" | "reconnecting" | "connection_failed",
    assistantMessage?: string,
    assistantUsage?: { inputTokens: number; outputTokens: number },
  ): void;
  onCaptureAvailabilityChange(available: boolean): void;
  onTurnEvent(serverId: string, agentId: string, eventType: TurnEventType): void;
}

export function createVoiceRuntime(deps: VoiceRuntimeDeps): VoiceRuntime {
  const instanceId = nextVoiceRuntimeInstanceId++;
  let localInputSessionId: string | null = null;
  let localInputLocale = "";
  let assistantOutputActive = false;
  let echoGuardUntil = 0;
  let replyInterrupted = false;
  let inputFailureTimer: ReturnType<typeof setTimeout> | null = null;
  let assistantMode = false;
  let assistantFailed = false;
  const suppressMicrophone = () =>
    !assistantMode && (assistantOutputActive || Date.now() < echoGuardUntil);

  function localInputMustPause(): boolean {
    return (
      !state.transportReady ||
      assistantOutputActive ||
      state.snapshot.isMuted ||
      Boolean(state.snapshot.inputError) ||
      !state.snapshot.captureAvailable
    );
  }

  function preheatLocalInput(): void {
    if (localInputSessionId) deps.localInput!.suspend(localInputMustPause());
  }
  const listeners = new Set<() => void>();
  const telemetryListeners = new Set<() => void>();
  const sessions = new Map<string, RuntimeSessionState>();
  const state: RuntimeState = {
    snapshot: INITIAL_SNAPSHOT,
    telemetry: INITIAL_TELEMETRY,
    turnInProgress: false,
    turnAssumedFromTranscript: false,
    serverSpeechDetected: false,
    transportReady: false,
    generation: 0,
    segmentDurationTimer: null,
    lastDisplayVolumePublishMs: 0,
    serverSpeechStartedAt: null,
  };
  const playback: RuntimePlaybackState = {
    groups: new Map(),
    orderedGroupIds: [],
    activeGroupId: null,
    processing: false,
    generation: 0,
  };
  const cue: CueState = {
    controller: null,
    timeout: null,
  };
  const cuePcm16 = Uint8Array.from(Buffer.from(THINKING_TONE_NATIVE_PCM_BASE64, "base64"));
  const cueSource = {
    size: cuePcm16.byteLength,
    type: "audio/pcm;rate=16000;bits=16",
    async arrayBuffer() {
      return cuePcm16.buffer.slice(cuePcm16.byteOffset, cuePcm16.byteOffset + cuePcm16.byteLength);
    },
  };
  function emit(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  function emitTelemetry(): void {
    for (const listener of telemetryListeners) {
      listener();
    }
  }

  function patchSnapshot(
    patch:
      | Partial<VoiceRuntimeSnapshot>
      | ((previous: VoiceRuntimeSnapshot) => VoiceRuntimeSnapshot),
  ): void {
    const next =
      typeof patch === "function" ? patch(state.snapshot) : { ...state.snapshot, ...patch };
    if (snapshotsEqual(next, state.snapshot)) {
      return;
    }
    state.snapshot = next;
    emit();
  }

  function patchTelemetry(
    patch:
      | Partial<VoiceRuntimeTelemetrySnapshot>
      | ((previous: VoiceRuntimeTelemetrySnapshot) => VoiceRuntimeTelemetrySnapshot),
  ): void {
    const next =
      typeof patch === "function" ? patch(state.telemetry) : { ...state.telemetry, ...patch };
    if (telemetryEqual(next, state.telemetry)) {
      return;
    }
    state.telemetry = next;
    emitTelemetry();
  }

  function getActiveSession(): RuntimeSessionState | null {
    if (!state.snapshot.activeServerId) {
      return null;
    }
    return sessions.get(state.snapshot.activeServerId) ?? null;
  }

  function decodeAudioChunk(base64: string): Uint8Array {
    return Buffer.from(base64, "base64");
  }

  function toPlaybackSource(
    bytes: Uint8Array,
    format: string,
  ): { arrayBuffer(): Promise<ArrayBuffer>; size: number; type: string } {
    let mimeType: string;
    if (format === "pcm") mimeType = "audio/pcm;rate=24000;bits=16";
    else if (format === "mp3") mimeType = "audio/mpeg";
    else mimeType = `audio/${format}`;

    return {
      size: bytes.byteLength,
      type: mimeType,
      async arrayBuffer() {
        return Uint8Array.from(bytes).buffer;
      },
    };
  }

  const realtimeGroups = new Map<string, Promise<void>>();

  function resetPlaybackState(): void {
    realtimeGroups.clear();
    playback.generation += 1;
    playback.groups.clear();
    playback.orderedGroupIds = [];
    playback.activeGroupId = null;
    playback.processing = false;
  }

  function activateNextPlaybackGroup(): void {
    while (playback.orderedGroupIds.length > 0) {
      const groupId = playback.orderedGroupIds[0];
      if (playback.groups.has(groupId)) {
        playback.activeGroupId = groupId;
        return;
      }
      playback.orderedGroupIds.shift();
    }
    playback.activeGroupId = null;
  }

  function retireFinishedGroup(
    group: { groupId: string; started: boolean; isVoiceMode: boolean },
    serverId: string,
  ): void {
    playback.groups.delete(group.groupId);
    if (playback.orderedGroupIds[0] === group.groupId) {
      playback.orderedGroupIds.shift();
    } else {
      playback.orderedGroupIds = playback.orderedGroupIds.filter(
        (value) => value !== group.groupId,
      );
    }
    if (group.started && group.isVoiceMode) {
      api.onAssistantAudioFinished(serverId);
    }
  }

  async function acknowledgeChunk(chunkId: string): Promise<void> {
    const activeSession = getActiveSession();
    if (!activeSession) {
      return;
    }
    await activeSession.adapter.audioPlayed(chunkId);
  }

  async function processPlaybackQueue(serverId: string): Promise<void> {
    if (playback.processing) {
      return;
    }

    playback.processing = true;
    const generation = playback.generation;
    try {
      while (playback.activeGroupId) {
        if (generation !== playback.generation) {
          return;
        }

        const group = playback.groups.get(playback.activeGroupId);
        if (!group) {
          activateNextPlaybackGroup();
          continue;
        }

        const nextChunk = group.chunks.get(group.nextChunkToPlay);
        if (!nextChunk) {
          const groupIsFinished =
            group.finalChunkIndex !== null && group.nextChunkToPlay > group.finalChunkIndex;
          if (!groupIsFinished) {
            return;
          }
          retireFinishedGroup(group, serverId);
          activateNextPlaybackGroup();
          continue;
        }

        group.chunks.delete(group.nextChunkToPlay);

        if (group.shouldPlay && !group.started && group.isVoiceMode) {
          group.started = true;
          api.onAssistantAudioStarted(serverId);
        }

        try {
          if (group.shouldPlay && nextChunk.source.size > 0) {
            await deps.engine.play(nextChunk.source);
          }
        } catch (error) {
          if (generation !== playback.generation) {
            return;
          }
          console.error(`[VoiceRuntime] play error chunk=${group.nextChunkToPlay}:`, error);
        }

        if (generation !== playback.generation) {
          return;
        }

        if (!group.ackedChunkIds.has(nextChunk.id)) {
          group.ackedChunkIds.add(nextChunk.id);
          void acknowledgeChunk(nextChunk.id).catch((error) => {
            console.warn("[VoiceRuntime] Failed to confirm audio playback:", error);
          });
        }

        group.nextChunkToPlay += 1;
      }
    } finally {
      if (generation === playback.generation) {
        playback.processing = false;
      }
    }
  }

  function clearSegmentDurationTimer(): void {
    if (state.segmentDurationTimer) {
      clearInterval(state.segmentDurationTimer);
      state.segmentDurationTimer = null;
    }
  }

  function reconcileSegmentDurationTimer(): void {
    if (!state.serverSpeechDetected) {
      clearSegmentDurationTimer();
      patchTelemetry((prev) => ({ ...prev, segmentDuration: 0 }));
      return;
    }

    if (state.segmentDurationTimer) {
      return;
    }

    state.segmentDurationTimer = setInterval(() => {
      const startedAt = state.serverSpeechStartedAt;
      patchTelemetry((prev) => ({
        ...prev,
        segmentDuration: startedAt ? Date.now() - startedAt : 0,
      }));
    }, 100);
  }

  function canPlayCue(): boolean {
    // Keep the listening stream free of synthetic tones while Apple recognizes locally.
    return (
      !localInputSessionId &&
      state.snapshot.isVoiceMode &&
      (state.snapshot.phase === "waiting" || state.snapshot.phase === "submitting") &&
      state.snapshot.captureAvailable &&
      !state.telemetry.isSpeaking
    );
  }

  function stopCue(): void {
    cue.controller?.abort();
    cue.controller = null;
    if (cue.timeout) {
      clearTimeout(cue.timeout);
      cue.timeout = null;
    }
  }

  function resetCaptureTelemetry(): void {
    clearSegmentDurationTimer();
    state.serverSpeechStartedAt = null;
    patchTelemetry({ ...INITIAL_TELEMETRY });
  }

  function reconcileCue(): void {
    if (assistantMode) {
      stopCue();
      return;
    }
    if (!canPlayCue()) {
      stopCue();
      return;
    }
    if (cue.controller) {
      return;
    }
    const controller = new AbortController();
    cue.controller = controller;

    const playNext = () => {
      if (controller.signal.aborted) {
        return;
      }
      void deps.engine
        .play(cueSource, controller.signal)
        .catch((error) => {
          if (controller.signal.aborted) {
            return;
          }
          console.warn(`[VoiceRuntime#${instanceId}] Cue playback failed:`, error);
        })
        .finally(() => {
          if (controller.signal.aborted) {
            return;
          }
          cue.timeout = setTimeout(
            playNext,
            THINKING_TONE_NATIVE_PCM_DURATION_MS + THINKING_TONE_REPEAT_GAP_MS,
          );
        });
    };

    cue.timeout = setTimeout(playNext, THINKING_TONE_MIN_SILENCE_MS);
  }

  let uploadGeneration = 0;
  const uploader: ContinuousVoiceUploader = {
    reset() {
      uploadGeneration += 1;
    },
    pushPcmChunk(chunk) {
      const activeSession = getActiveSession();
      if (
        !activeSession ||
        !state.transportReady ||
        !state.snapshot.isVoiceMode ||
        chunk.byteLength === 0
      ) {
        return;
      }

      const base64 = Buffer.from(chunk).toString("base64");
      const generation = uploadGeneration;
      void activeSession.adapter.sendVoiceAudioChunk(base64, PCM_MIME_TYPE).catch((error) => {
        if (generation !== uploadGeneration || !state.snapshot.isVoiceMode) return;
        console.error(`[VoiceRuntime#${instanceId}] Failed to send audio chunk:`, error);
        if (!assistantMode || assistantFailed) return;
        api.onServerSpeechStateChanged(
          activeSession.adapter.serverId,
          false,
          undefined,
          "connection_failed",
          i18n.t("realtimeVoice.status.connection_failed"),
        );
        void activeSession.adapter.setVoiceMode(false).catch(() => undefined);
      });
    },
  };

  function clearInputFailureTimer(): void {
    if (inputFailureTimer === null) return;
    clearTimeout(inputFailureTimer);
    inputFailureTimer = null;
  }

  // Failure statuses are transient notices: fade them back to the resting phase so they never
  // sit next to the result of a later, successful utterance.
  function scheduleInputFailureFade(): void {
    clearInputFailureTimer();
    inputFailureTimer = setTimeout(() => {
      inputFailureTimer = null;
      if (!state.snapshot.isVoiceMode || !isInputFailurePhase(state.snapshot.phase)) return;
      patchSnapshot((prev) => ({ ...prev, phase: state.turnInProgress ? "waiting" : "listening" }));
      reconcileCue();
    }, INPUT_FAILURE_DISPLAY_MS);
  }

  function resetToDisabledState(): void {
    clearInputFailureTimer();
    assistantMode = false;
    assistantOutputActive = false;
    echoGuardUntil = 0;
    replyInterrupted = false;
    state.transportReady = false;
    state.turnInProgress = false;
    state.turnAssumedFromTranscript = false;
    state.serverSpeechDetected = false;
    state.lastDisplayVolumePublishMs = 0;
    uploader.reset();
    resetCaptureTelemetry();
    patchSnapshot({ ...INITIAL_SNAPSHOT });
  }

  function publishDisplayVolume(level: number, nowMs: number): void {
    const previousVolume = state.telemetry.volume;
    const smoothing = level >= previousVolume ? DISPLAY_VOLUME_ATTACK : DISPLAY_VOLUME_RELEASE;
    const nextVolume = Math.max(
      0,
      Math.min(1, previousVolume + (level - previousVolume) * smoothing),
    );
    const enoughTimeElapsed =
      nowMs - state.lastDisplayVolumePublishMs >= DISPLAY_VOLUME_PUBLISH_INTERVAL_MS;
    const enoughChange = Math.abs(nextVolume - previousVolume) >= DISPLAY_VOLUME_CHANGE_EPSILON;

    if (!enoughTimeElapsed && !enoughChange) {
      return;
    }

    state.lastDisplayVolumePublishMs = nowMs;
    patchTelemetry((prev) => ({
      ...prev,
      volume: Number(nextVolume.toFixed(3)),
    }));
  }

  function validateInputSource(
    serverId: string,
    session: RuntimeSessionState,
    input?: { source: "apple"; locale: string },
  ): void {
    const serverInfo = deps.getServerInfo(serverId);
    if (input && !serverInfo?.features?.clientVoiceTranscription) {
      throw new Error(i18n.t("speechSettings.appleUpdateHost"));
    }
    if (input && (!deps.localInput || !session.adapter.submitVoiceTranscript)) {
      throw new Error(i18n.t("speechSettings.appleUnavailable"));
    }
    const unavailableMessage = input
      ? serverInfo?.capabilities?.voice?.clientTranscription?.reason
      : resolveVoiceUnavailableMessage({
          serverInfo,
          mode: "voice",
        });
    if (unavailableMessage) {
      throw new Error(unavailableMessage);
    }
  }

  async function startLocalInput(generation: number): Promise<void> {
    const sessionId = localInputSessionId;
    if (!sessionId) return;
    await deps.localInput!.start(sessionId, localInputLocale, (event) => {
      if (sessionId === localInputSessionId) handleLocalInputEvent(generation, event);
    });
  }

  async function prepareVoiceInput(
    generation: number,
    input?: { source: "apple"; locale: string },
  ): Promise<boolean> {
    if (generation !== state.generation) return false;
    if (localInputSessionId) await deps.localInput!.stop();
    if (generation !== state.generation) return false;
    localInputSessionId = input ? uuidv4() : null;
    localInputLocale = input?.locale ?? "";
    await deps.engine.initialize();
    if (generation !== state.generation) return false;
    await startLocalInput(generation);
    return generation === state.generation;
  }

  async function discardCanceledStart(adapter: VoiceSessionAdapter): Promise<void> {
    // A late acknowledgment must not disable a newer conversation on the same host.
    if (
      state.snapshot.phase === "disabled" ||
      state.snapshot.phase === "stopping" ||
      state.snapshot.activeServerId !== adapter.serverId
    ) {
      await adapter.setVoiceMode(false);
    }
  }

  async function discardCanceledCapture(): Promise<void> {
    if (state.snapshot.phase === "disabled" || state.snapshot.phase === "stopping") {
      await deps.engine.stopCapture();
    }
  }

  async function enableSessionVoice(adapter: VoiceSessionAdapter, agentId?: string): Promise<void> {
    if (localInputSessionId) {
      await adapter.setVoiceMode(true, agentId, {
        inputSource: "client",
        inputSessionId: localInputSessionId,
      });
    } else if (assistantMode) {
      await adapter.setVoiceMode(true, agentId, undefined, true);
    } else {
      await adapter.setVoiceMode(true, agentId);
    }
  }

  function handleLocalInputEvent(generation: number, event: LocalVoiceInputEvent): void {
    if (generation !== state.generation || !localInputSessionId) return;
    if (event.type === "preparing") {
      patchSnapshot((prev) => ({ ...prev, preparingLocalInput: true }));
      return;
    }
    if (event.type === "error") {
      deps.localInput?.suspend(true);
      patchSnapshot((prev) => ({
        ...prev,
        phase: "recognition_failed",
        inputError: event.message,
      }));
      return;
    }
    const session = getActiveSession();
    if (!session || !state.transportReady || state.snapshot.isMuted || suppressMicrophone()) return;
    switch (event.type) {
      case "partial":
        patchSnapshot((prev) => ({ ...prev, lastTranscript: event.text }));
        break;
      case "speech":
        api.onServerSpeechStateChanged(session.adapter.serverId, true, "speaking");
        break;
      case "transcribing":
        api.onServerSpeechStateChanged(session.adapter.serverId, false, "transcribing");
        break;
      case "idle":
        api.onServerSpeechStateChanged(session.adapter.serverId, false, "no_speech");
        break;
      case "final": {
        patchSnapshot((prev) => ({
          ...prev,
          phase: "submitting",
          lastTranscript: event.text,
          firstPartialMs: event.firstPartialMs,
          finalizationMs: event.finalizationMs,
          endpointMs: event.endpointMs,
        }));
        const sessionId = localInputSessionId;
        void session.adapter.submitVoiceTranscript!(sessionId, event.text).catch(
          (error: unknown) => {
            if (generation !== state.generation || sessionId !== localInputSessionId) return;
            api.onServerSpeechStateChanged(session.adapter.serverId, false, "submission_failed");
            console.error("[VoiceRuntime] Local transcript submission failed", error);
          },
        );
        break;
      }
    }
  }

  async function performLocalStop(): Promise<void> {
    state.generation++;
    state.transportReady = false;
    localInputSessionId = null;
    await deps.localInput?.stop().catch(() => undefined);
    stopCue();
    uploader.reset();
    resetPlaybackState();
    deps.engine.stop();
    deps.engine.clearQueue();
    await deps.engine.stopCapture().catch(() => undefined);
    await deps.deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
    getActiveSession()?.adapter.setAssistantAudioPlaying(false);
    resetToDisabledState();
  }

  async function resyncVoiceMode(serverId: string): Promise<void> {
    if (
      !state.snapshot.isVoiceMode ||
      state.snapshot.activeServerId !== serverId ||
      (!state.snapshot.activeAgentId && !assistantMode)
    ) {
      return;
    }

    const activeSession = getActiveSession();
    if (!activeSession || !activeSession.connected) {
      return;
    }

    const generation = ++state.generation;
    const agentId = state.snapshot.activeAgentId;
    const isCurrentConnection = () => generation === state.generation && activeSession.connected;
    patchSnapshot((prev) => ({ ...prev, isVoiceSwitching: true }));
    try {
      if (localInputSessionId) {
        localInputSessionId = uuidv4();
        await deps.localInput!.stop();
        if (!isCurrentConnection()) return;
        await startLocalInput(generation);
      }
      if (!isCurrentConnection()) return;
      await enableSessionVoice(activeSession.adapter, agentId ?? undefined);
      if (!isCurrentConnection()) return;
      // An assistant failure releases capture. Re-establish the microphone before
      // reporting a restored conversation; reconnecting the socket alone cannot hear speech.
      await deps.engine.startCapture();
      if (!isCurrentConnection()) {
        await discardCanceledCapture();
        return;
      }
      if (deps.engine.isMuted() !== state.snapshot.isMuted) deps.engine.toggleMute();
      state.transportReady = true;
      patchSnapshot((prev) => ({
        ...prev,
        phase: "listening",
        inputError: undefined,
        preparingLocalInput: false,
      }));
    } catch (error) {
      console.error("[VoiceRuntime] Failed to restore voice connection", error);
      if (generation === state.generation && activeSession.connected) {
        patchSnapshot((prev) => ({ ...prev, phase: "connection_failed" }));
      }
    } finally {
      if (generation === state.generation) {
        patchSnapshot((prev) => ({ ...prev, isVoiceSwitching: false }));
      }
    }
  }

  function interruptPlaybackForSpeech(): void {
    const shouldInterruptPlayback =
      assistantOutputActive ||
      state.snapshot.phase === "playing" ||
      playback.groups.size > 0 ||
      realtimeGroups.size > 0;
    assistantOutputActive = false;
    resetPlaybackState();
    stopCue();
    if (shouldInterruptPlayback) {
      deps.engine.stop();
      deps.engine.clearQueue();
    }
    getActiveSession()?.adapter.setAssistantAudioPlaying(false);
  }

  function handleAssistantState(
    isSpeaking: boolean,
    assistantState: Parameters<VoiceRuntime["onServerSpeechStateChanged"]>[3],
    assistantMessage: string | undefined,
    assistantUsage: VoiceRuntimeSnapshot["assistantUsage"],
    status: VoiceInputStatus | undefined,
  ): boolean {
    if (assistantFailed) return true;
    if (assistantMessage !== undefined || assistantUsage !== undefined) {
      patchSnapshot((prev) => ({
        ...prev,
        ...(assistantMessage !== undefined ? { assistantMessage } : {}),
        ...(assistantUsage !== undefined ? { assistantUsage } : {}),
      }));
      if (!assistantState && !status) return true;
    }
    if (assistantState === "reconnecting") {
      patchSnapshot((prev) => ({ ...prev, phase: "reconnecting" }));
      return true;
    }
    if (assistantState === "connection_failed") {
      assistantFailed = true;
      state.transportReady = false;
      state.turnInProgress = false;
      assistantOutputActive = false;
      resetPlaybackState();
      stopCue();
      deps.engine.stop();
      deps.engine.clearQueue();
      getActiveSession()?.adapter.setAssistantAudioPlaying(false);
      void deps.engine.stopCapture().catch(() => undefined);
      patchSnapshot((prev) => ({ ...prev, phase: "connection_failed" }));
      return true;
    }
    if (isSpeaking || assistantState === "waiting") replyInterrupted = false;
    if (assistantState) state.turnInProgress = assistantState === "waiting";
    if (assistantState === "listening" && assistantOutputActive) return true;
    return false;
  }

  function resolveAssistantMode(
    serverId: string,
    assistant?: boolean,
    localInput = false,
  ): boolean {
    const serverInfo = deps.getServerInfo(serverId);
    const unavailableMessage = resolveVoiceUnavailableMessage({
      serverInfo,
      mode: "voice",
    });
    const useAssistant =
      assistant === true ||
      (!localInput &&
        assistant !== false &&
        serverInfo?.features?.voiceAssistant === true &&
        serverInfo.features.voiceAssistantEnabled === true);
    if (useAssistant && serverInfo?.features?.voiceAssistant !== true)
      throw new Error("Update the host to use the voice assistant");
    if (!useAssistant && !localInput && unavailableMessage) throw new Error(unavailableMessage);
    return useAssistant;
  }

  const api: VoiceRuntime = {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot() {
      return state.snapshot;
    },

    subscribeTelemetry(listener) {
      telemetryListeners.add(listener);
      return () => {
        telemetryListeners.delete(listener);
      };
    },

    getTelemetrySnapshot() {
      return state.telemetry;
    },

    registerSession(adapter) {
      sessions.set(adapter.serverId, {
        adapter,
        connected: true,
      });

      return () => {
        const activeServerId = state.snapshot.activeServerId;
        sessions.delete(adapter.serverId);
        if (activeServerId === adapter.serverId) {
          void performLocalStop();
        }
      };
    },

    updateSessionConnection(serverId, connected) {
      const session = sessions.get(serverId);
      if (!session) {
        return;
      }
      session.connected = connected;
      if (state.snapshot.activeServerId !== serverId) {
        return;
      }
      if (assistantFailed) return;
      if (!connected) {
        deps.localInput?.suspend(true);
        state.transportReady = false;
        assistantOutputActive = false;
        echoGuardUntil = Date.now() + PLAYBACK_ECHO_TAIL_MS;
        resetPlaybackState();
        stopCue();
        deps.engine.stop();
        deps.engine.clearQueue();
        session.adapter.setAssistantAudioPlaying(false);
        patchSnapshot((prev) => ({ ...prev, phase: "reconnecting" }));
        return;
      }
      void resyncVoiceMode(serverId);
    },

    handleCapturePcm(chunk) {
      if (!state.snapshot.isVoiceMode || state.snapshot.isMuted) {
        return;
      }
      if (localInputSessionId) {
        const paused = localInputMustPause();
        deps.localInput!.suspend(paused);
        // Prepare during the echo tail, but never feed it back into recognition.
        if (!paused && !suppressMicrophone()) deps.localInput!.append(chunk);
        return;
      }
      // Preserve the VAD clock while keeping speaker audio out of recognition.
      uploader.pushPcmChunk(suppressMicrophone() ? new Uint8Array(chunk.byteLength) : chunk);
    },

    handleCaptureVolume(level) {
      const nowMs = Date.now();
      const displayLevel = state.snapshot.isMuted || suppressMicrophone() ? 0 : level;
      publishDisplayVolume(displayLevel, nowMs);
      if (!state.snapshot.isVoiceMode || state.snapshot.isMuted) {
        patchTelemetry((prev) => ({
          ...prev,
          isSpeaking: false,
          segmentDuration: 0,
        }));
        return;
      }

      patchTelemetry((prev) => ({
        ...prev,
        isSpeaking: state.serverSpeechDetected,
      }));
      reconcileSegmentDurationTimer();
      reconcileCue();
    },

    handleAudioOutput(serverId, payload) {
      if (
        serverId !== state.snapshot.activeServerId ||
        !state.snapshot.isVoiceMode ||
        !payload.isVoiceMode ||
        assistantFailed
      ) {
        return;
      }

      if (replyInterrupted) {
        void acknowledgeChunk(payload.id).catch(() => undefined);
        return;
      }
      const groupId = payload.groupId ?? payload.id;
      if (assistantMode) {
        const generation = playback.generation;
        if (!realtimeGroups.size && payload.audio) api.onAssistantAudioStarted(serverId);
        const previous = realtimeGroups.get(groupId) ?? Promise.resolve();
        const chunk = payload.audio
          ? deps.engine.streamPcm(decodeAudioChunk(payload.audio), 24000)
          : Promise.resolve();
        const played = Promise.all([previous, chunk])
          .then(() => {
            if (generation !== playback.generation) return;
            void acknowledgeChunk(payload.id).catch(() => undefined);
            if (payload.isLastChunk) {
              realtimeGroups.delete(groupId);
              if (!realtimeGroups.size) api.onAssistantAudioFinished(serverId);
            }
            return undefined;
          })
          .catch((error) => {
            if (generation !== playback.generation) return;
            api.onServerSpeechStateChanged(
              serverId,
              false,
              undefined,
              "connection_failed",
              error instanceof Error ? error.message : "Audio playback failed",
            );
            void getActiveSession()
              ?.adapter.setVoiceMode(false)
              .catch(() => undefined);
          });
        realtimeGroups.set(groupId, played);
        return;
      }
      const chunkIndex = payload.chunkIndex ?? 0;
      const decoded = decodeAudioChunk(payload.audio);

      let group = playback.groups.get(groupId);
      if (!group) {
        group = {
          groupId,
          isVoiceMode: payload.isVoiceMode,
          shouldPlay: api.shouldPlayVoiceAudio(serverId),
          chunks: new Map(),
          nextChunkToPlay: 0,
          finalChunkIndex: null,
          started: false,
          ackedChunkIds: new Set(),
        };
        playback.groups.set(groupId, group);
        playback.orderedGroupIds.push(groupId);
        if (!playback.activeGroupId) {
          playback.activeGroupId = groupId;
        }
      }

      group.chunks.set(chunkIndex, {
        id: payload.id,
        chunkIndex,
        source: toPlaybackSource(decoded, payload.format),
      });
      if (payload.isLastChunk) {
        group.finalChunkIndex = chunkIndex;
      }

      void processPlaybackQueue(serverId);
    },

    async startVoice(serverId, agentId, input, assistant) {
      const session = sessions.get(serverId);
      if (!session) {
        throw new Error(`Voice runtime is not ready for host ${serverId}`);
      }
      if (!session.connected) {
        throw new Error(`Host ${serverId} is not connected`);
      }

      const useAssistant = resolveAssistantMode(serverId, assistant, Boolean(input));
      if (useAssistant) input = undefined;
      else validateInputSource(serverId, session, input);
      const previousServerId = state.snapshot.activeServerId;
      const previousAgentId = state.snapshot.activeAgentId;
      const generation = state.generation + 1;
      let enabledCurrentVoiceMode = false;
      state.generation = generation;
      assistantFailed = false;
      state.transportReady = false;
      patchSnapshot((prev) => ({
        ...prev,
        isVoiceSwitching: true,
        phase: "starting",
        activeServerId: serverId,
        activeAgentId: agentId,
        isAssistant: useAssistant,
        assistantMessage: "",
        assistantUsage: { inputTokens: 0, outputTokens: 0 },
        lastTranscript: "",
        captureAvailable: true,
        inputSource: input ? "apple" : "server",
        inputError: undefined,
        firstPartialMs: undefined,
        finalizationMs: undefined,
        endpointMs: undefined,
        preparingLocalInput: false,
      }));

      try {
        if (
          state.snapshot.isVoiceMode &&
          previousServerId &&
          (previousServerId !== serverId || previousAgentId !== agentId)
        ) {
          const previousSession = sessions.get(previousServerId);
          if (previousSession) {
            previousSession.adapter.setAssistantAudioPlaying(false);
            await previousSession.adapter.setVoiceMode(false);
          }
        }

        await deps.activateKeepAwake(KEEP_AWAKE_TAG).catch((error) => {
          console.warn("[VoiceRuntime] Failed to activate keep-awake:", error);
        });

        assistantMode = useAssistant;
        if (!(await prepareVoiceInput(generation, input))) return;
        await enableSessionVoice(session.adapter, agentId);
        enabledCurrentVoiceMode = true;
        if (state.generation !== generation) {
          await discardCanceledStart(session.adapter);
          return;
        }
        await deps.engine.startCapture();
        if (state.generation !== generation) {
          await discardCanceledCapture();
          return;
        }

        assistantOutputActive = false;
        echoGuardUntil = 0;
        replyInterrupted = false;
        state.transportReady = true;
        state.turnInProgress = false;
        state.turnAssumedFromTranscript = false;
        uploader.reset();
        resetCaptureTelemetry();
        patchSnapshot((prev) => ({
          ...prev,
          isVoiceMode: true,
          isVoiceSwitching: false,
          preparingLocalInput: false,
          phase: "listening",
          isMuted: deps.engine.isMuted(),
        }));
      } catch (error) {
        if (state.generation !== generation) return;
        if (enabledCurrentVoiceMode) {
          await session.adapter.setVoiceMode(false).catch(() => undefined);
        }
        await performLocalStop();
        throw error;
      }
    },

    async stopVoice() {
      const activeSession = getActiveSession();
      const generation = state.generation + 1;
      state.generation = generation;
      clearInputFailureTimer();
      patchSnapshot((prev) => ({
        ...prev,
        isVoiceSwitching: true,
        phase: "stopping",
      }));

      try {
        localInputSessionId = null;
        state.transportReady = false;
        await deps.localInput
          ?.stop()
          .catch((error: unknown) =>
            console.error("[VoiceRuntime] Local input cleanup failed", error),
          );
        stopCue();
        uploader.reset();
        state.transportReady = false;
        resetPlaybackState();
        deps.engine.stop();
        deps.engine.clearQueue();
        activeSession?.adapter.setAssistantAudioPlaying(false);
        await deps.engine.stopCapture();
        if (activeSession) {
          await activeSession.adapter.setVoiceMode(false);
        }
      } finally {
        await deps.deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
        if (state.generation === generation) {
          resetToDisabledState();
        }
      }
    },

    async destroy() {
      await this.stopVoice().catch(() => undefined);
      await deps.engine.destroy();
      listeners.clear();
      telemetryListeners.clear();
      sessions.clear();
    },

    interruptReply() {
      if (!state.snapshot.isVoiceMode || assistantFailed) return;
      replyInterrupted = true;
      assistantOutputActive = false;
      echoGuardUntil = Date.now() + PLAYBACK_ECHO_TAIL_MS;
      resetPlaybackState();
      stopCue();
      deps.engine.stop();
      deps.engine.clearQueue();
      state.turnInProgress = false;
      preheatLocalInput();
      state.turnAssumedFromTranscript = false;
      clearInputFailureTimer();
      state.serverSpeechDetected = false;
      resetCaptureTelemetry();
      getActiveSession()?.adapter.setAssistantAudioPlaying(false);
      patchSnapshot((prev) => ({ ...prev, phase: "listening" }));
      void getActiveSession()
        ?.adapter.abortRequest()
        .catch((error) => {
          console.warn("[VoiceRuntime] Failed to interrupt reply:", error);
        });
    },

    toggleMute() {
      const nextMuted = deps.engine.toggleMute();
      if (nextMuted) {
        if (localInputSessionId) deps.localInput!.suspend(true);
        uploader.reset();
        resetCaptureTelemetry();
        patchSnapshot((prev) => ({
          ...prev,
          isMuted: true,
        }));
        reconcileCue();
        return;
      }

      patchSnapshot((prev) => ({ ...prev, isMuted: false }));
      preheatLocalInput();
    },

    isVoiceModeForAgent(serverId, agentId) {
      return (
        (state.snapshot.isVoiceMode || state.snapshot.phase === "starting") &&
        state.snapshot.activeServerId === serverId &&
        state.snapshot.activeAgentId === agentId
      );
    },

    shouldPlayVoiceAudio(serverId) {
      return (
        state.snapshot.isVoiceMode &&
        state.snapshot.activeServerId === serverId &&
        state.snapshot.phase !== "stopping" &&
        state.snapshot.phase !== "disabled"
      );
    },

    onAssistantAudioStarted(serverId) {
      if (
        !state.snapshot.isVoiceMode ||
        state.snapshot.activeServerId !== serverId ||
        assistantFailed
      ) {
        return;
      }
      assistantOutputActive = true;
      if (localInputSessionId) deps.localInput!.suspend(true);
      state.serverSpeechDetected = false;
      resetCaptureTelemetry();
      stopCue();
      getActiveSession()?.adapter.setAssistantAudioPlaying(true);
      patchSnapshot((prev) => ({ ...prev, phase: "playing" }));
    },

    onAssistantAudioFinished(serverId) {
      if (state.snapshot.activeServerId !== serverId || assistantFailed) {
        return;
      }

      if (assistantOutputActive) echoGuardUntil = Date.now() + PLAYBACK_ECHO_TAIL_MS;
      assistantOutputActive = false;
      preheatLocalInput();
      getActiveSession()?.adapter.setAssistantAudioPlaying(false);
      if (!state.snapshot.isVoiceMode) {
        return;
      }

      if (state.turnInProgress) {
        patchSnapshot((prev) => ({ ...prev, phase: "waiting" }));
        reconcileCue();
        return;
      }

      patchSnapshot((prev) => ({ ...prev, phase: "listening" }));
      reconcileCue();
    },

    onTranscriptionResult(serverId, text) {
      if (
        serverId !== state.snapshot.activeServerId ||
        !state.snapshot.isVoiceMode ||
        assistantFailed
      ) {
        return;
      }

      if (assistantMode) {
        patchSnapshot((prev) => ({ ...prev, lastTranscript: text.trim() }));
        return;
      }
      if (assistantOutputActive) return;

      clearInputFailureTimer();
      if (text.trim()) {
        // Words spoken while the agent is already working are steered into its turn, so no new
        // turn_started follows: go straight back to waiting instead of hanging on "submitting".
        const steersRunningTurn = state.turnInProgress;
        if (!steersRunningTurn) state.turnAssumedFromTranscript = true;
        state.turnInProgress = true;
        patchSnapshot((prev) => ({
          ...prev,
          phase: steersRunningTurn ? "waiting" : "submitting",
          lastTranscript: text.trim(),
        }));
        reconcileCue();
        return;
      }

      // Nothing was understood: whatever the agent was doing is unaffected.
      patchSnapshot((prev) => ({ ...prev, phase: state.turnInProgress ? "waiting" : "listening" }));
      if (state.turnInProgress) {
        reconcileCue();
      } else {
        stopCue();
      }
    },

    onCaptureAvailabilityChange(available) {
      if (localInputSessionId && !available) deps.localInput!.suspend(true);
      patchSnapshot((prev) => ({ ...prev, captureAvailable: available }));
      reconcileCue();
    },

    onServerSpeechStateChanged(
      serverId,
      isSpeaking,
      status,
      assistantState,
      assistantMessage,
      assistantUsage,
    ) {
      if (serverId !== state.snapshot.activeServerId || !state.snapshot.isVoiceMode) {
        return;
      }

      if (
        assistantMode &&
        handleAssistantState(isSpeaking, assistantState, assistantMessage, assistantUsage, status)
      )
        return;
      if (isSpeaking && suppressMicrophone()) return;
      state.serverSpeechDetected = isSpeaking;
      // COMPAT(voiceInputStatus): added in v0.13, remove after 2027-04-25 once hosts send status.
      const phase =
        assistantMode && assistantState
          ? assistantState
          : (status ?? (isSpeaking ? "speaking" : "transcribing"));
      clearInputFailureTimer();
      // lastTranscript is the previous utterance; a failure about this one must not sit beside it.
      // submission_failed is the exception: the transcript is exactly the sentence that failed.
      patchSnapshot((prev) => ({
        ...prev,
        phase,
        lastTranscript:
          phase === "recognition_failed" || phase === "no_speech" ? "" : prev.lastTranscript,
      }));
      if (isInputFailurePhase(phase)) {
        // The agent may well still be working on an earlier request, so only take back a turn
        // that was assumed from this very transcript (the send never reached the agent).
        if (phase === "submission_failed" && state.turnAssumedFromTranscript) {
          state.turnInProgress = false;
          state.turnAssumedFromTranscript = false;
        }
        stopCue();
        scheduleInputFailureFade();
      }
      state.serverSpeechStartedAt = isSpeaking ? (state.serverSpeechStartedAt ?? Date.now()) : null;
      if (isSpeaking) {
        interruptPlaybackForSpeech();
      }
      patchTelemetry((prev) => ({
        ...prev,
        isSpeaking,
      }));
      reconcileSegmentDurationTimer();
      reconcileCue();
    },

    onTurnEvent(serverId, agentId, eventType) {
      if (assistantMode) return;
      if (
        !state.snapshot.isVoiceMode ||
        state.snapshot.activeServerId !== serverId ||
        state.snapshot.activeAgentId !== agentId
      ) {
        return;
      }

      state.turnAssumedFromTranscript = false;
      if (eventType === "turn_started") {
        replyInterrupted = false;
        state.turnInProgress = true;
        if (state.snapshot.phase !== "playing") {
          patchSnapshot((prev) => ({ ...prev, phase: "waiting" }));
          reconcileCue();
        }
        return;
      }

      state.turnInProgress = false;
      const keepInputStatus = [
        "playing",
        "speaking",
        "transcribing",
        "recognition_failed",
        "no_speech",
        "submission_failed",
        "reconnecting",
        "connection_failed",
      ].includes(state.snapshot.phase);
      if (!keepInputStatus) {
        patchSnapshot((prev) => ({ ...prev, phase: "listening" }));
      }
      stopCue();
    },
  };

  return api;
}
