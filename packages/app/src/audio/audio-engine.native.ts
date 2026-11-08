import type {
  AudioEngine,
  AudioEngineCallbacks,
  AudioEngineOptions,
  AudioPlaybackSource,
} from "./audio-engine-types";

import { i18n } from "@/i18n/i18next";
import * as native from "@getpaseo/expo-two-way-audio";

import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { File, Paths } from "expo-file-system";
import { createPlaybackQueue } from "./playback";
import { playFile } from "./file-playback";
import { playPcm16, resamplePcm16 } from "./pcm";

// Chat composers and voice mode share one native engine. A page can release only
// its own reference; tearing down the singleton invalidates every retained page.
const nativeEngineUsers = new Set<symbol>();
const nativeCaptureUsers = new Set<symbol>();
let nativeInitialization: Promise<void> | null = null;

export function createAudioEngine(
  callbacks: AudioEngineCallbacks,
  options?: AudioEngineOptions,
): AudioEngine {
  const nativeOwner = Symbol();
  const refs: {
    initialized: boolean;
    captureActive: boolean;
    muted: boolean;
    destroyed: boolean;
  } = {
    initialized: false,
    captureActive: false,
    muted: false,
    destroyed: false,
  };

  const microphoneSubscription = native.addExpoTwoWayAudioEventListener(
    "onMicrophoneData",
    (event: { data: Uint8Array }) => {
      if (!refs.captureActive || refs.muted) {
        return;
      }
      const pcm = event.data;
      callbacks.onCaptureData(pcm);
    },
  );
  const volumeSubscription = native.addExpoTwoWayAudioEventListener(
    "onInputVolumeLevelData",
    (event: { data: number }) => {
      if (!refs.captureActive) {
        return;
      }
      const level = refs.muted ? 0 : event.data;
      callbacks.onVolumeLevel(level);
    },
  );
  const interruptionSubscription = native.addExpoTwoWayAudioEventListener(
    "onAudioInterruption",
    (event: { data: string }) => {
      if (event.data === "capture_paused" || event.data === "capture_resumed") {
        if (refs.captureActive) {
          callbacks.onCaptureAvailabilityChange?.(event.data === "capture_resumed");
        }
        return;
      }
      if (event.data !== "blocked") {
        return;
      }
      const wasCaptureActive = refs.captureActive;
      refs.captureActive = false;
      nativeCaptureUsers.delete(nativeOwner);
      refs.muted = false;
      callbacks.onVolumeLevel(0);
      if (wasCaptureActive) {
        callbacks.onInterruption?.();
      }
    },
  );

  async function ensureInitialized(): Promise<void> {
    if (refs.destroyed) {
      throw new Error("Audio engine destroyed");
    }
    if (refs.initialized) {
      return;
    }
    nativeEngineUsers.add(nativeOwner);
    if (!nativeInitialization) {
      nativeInitialization = native
        .initialize()
        .then((success) => {
          if (!success) {
            throw new Error("expo-two-way-audio: native initialize() returned false");
          }
          return undefined;
        })
        .catch((error) => {
          nativeInitialization = null;
          throw error;
        });
    }
    await nativeInitialization;
    if (refs.destroyed) {
      throw new Error("Audio engine destroyed");
    }
    refs.initialized = true;
  }

  /**
   * Release the OS audio session as soon as we are neither capturing nor playing.
   * Holding it keeps the user's background music paused — on iOS the non-mixing
   * `.playAndRecord` category survives backgrounding and is re-asserted on every
   * foreground, so an unreleased session means their music never comes back.
   */
  function releaseSessionIfIdle(): void {
    if (!refs.initialized || refs.destroyed) {
      return;
    }
    if (refs.captureActive || playback.isPlaying()) {
      return;
    }
    // The wrapper no-ops on binaries whose native module predates this function.
    native.releaseAudioSession();
  }

  async function ensureMicrophonePermission(): Promise<void> {
    let permission = await native.getMicrophonePermissionsAsync().catch(() => null);
    if (!permission?.granted) {
      permission = await native.requestMicrophonePermissionsAsync().catch(() => null);
    }
    if (!permission?.granted) {
      throw new Error(i18n.t("common.errors.microphonePermissionDenied"));
    }
  }

  function releaseCapture(): void {
    refs.captureActive = false;
    if (nativeCaptureUsers.delete(nativeOwner) && nativeCaptureUsers.size === 0) {
      native.toggleRecording(false);
    }
  }

  let nextFileId = 0;
  async function playAudio(audio: AudioPlaybackSource, signal: AbortSignal): Promise<number> {
    const bytes = new Uint8Array(await audio.arrayBuffer());
    if (signal.aborted) throw new Error("Playback stopped");
    if (audio.type.startsWith("audio/pcm")) {
      await ensureInitialized();
      return playPcm16(bytes, audio.type, signal, native);
    }
    // Expo pauses its file players on background unless opted in, even when the
    // native two-way engine keeps recording. Preserve play-and-record while it owns input.
    const captureActive = native.isRecording();
    const interruptionMode = captureActive ? "doNotMix" : "duckOthers";
    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: captureActive,
      shouldPlayInBackground: true,
      allowsBackgroundRecording: captureActive,
      interruptionMode,
      interruptionModeAndroid: interruptionMode,
    });
    if (signal.aborted) throw new Error("Playback stopped");
    // AVPlayer needs a file extension to recognize local encoded audio on iOS.
    const extension =
      {
        "audio/wav": "wav",
        "audio/x-wav": "wav",
        "audio/wave": "wav",
        "audio/mpeg": "mp3",
        "audio/mp3": "mp3",
        "audio/mp4": "m4a",
        "audio/aac": "aac",
        "audio/ogg": "ogg",
        "audio/flac": "flac",
      }[audio.type.split(";")[0].trim()] ?? "audio";
    const file = new File(Paths.cache, `paseo-audio-${Date.now()}-${nextFileId++}.${extension}`);
    try {
      file.write(bytes);
      const player = createAudioPlayer(file.uri, {
        updateInterval: 100,
        keepAudioSessionActive: native.isRecording(),
      });
      return await playFile(player, signal);
    } finally {
      if (file.exists) file.delete();
    }
  }
  const playback = createPlaybackQueue(playAudio, releaseSessionIfIdle);
  let streamEnd = 0;
  const streamTimers = new Map<ReturnType<typeof setTimeout>, (error: Error) => void>();
  function stopStream(): void {
    const hadStream = streamTimers.size > 0;
    streamEnd = 0;
    for (const [timer, reject] of streamTimers) {
      clearTimeout(timer);
      reject(new Error("Playback stopped"));
    }
    streamTimers.clear();
    if (hadStream) native.stopPlayback();
  }
  function streamPcm(bytes: Uint8Array, sampleRate: number): Promise<void> {
    if (!refs.initialized || refs.destroyed)
      return Promise.reject(new Error("Audio engine is not initialized"));
    if (!bytes.byteLength || bytes.byteLength % 2)
      return Promise.reject(new Error("Invalid PCM16 chunk"));
    const now = Date.now();
    if (streamEnd - now > 15_000) return Promise.reject(new Error("Voice playback fell behind"));
    const pcm = resamplePcm16(bytes, sampleRate, 16000);
    streamEnd = Math.max(now, streamEnd) + pcm.length / 32;
    return new Promise<void>((resolve, reject) => {
      try {
        native.resumePlayback();
        native.playPCMData(pcm);
        const timer = setTimeout(
          () => {
            streamTimers.delete(timer);
            resolve();
          },
          Math.max(0, streamEnd - now),
        );
        streamTimers.set(timer, reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  return {
    async initialize() {
      await ensureInitialized();
    },

    async destroy() {
      if (refs.destroyed) {
        return;
      }
      refs.destroyed = true;
      stopStream();
      playback.destroy();
      releaseCapture();
      refs.muted = false;
      callbacks.onVolumeLevel(0);
      if (refs.initialized) {
        native.releaseAudioSession();
      }
      microphoneSubscription.remove();
      volumeSubscription.remove();
      interruptionSubscription.remove();
      refs.initialized = false;
      nativeEngineUsers.delete(nativeOwner);
      const initialization = nativeInitialization;
      if (nativeEngineUsers.size === 0 && initialization) {
        await initialization.catch(() => undefined);
        if (nativeEngineUsers.size === 0 && nativeInitialization === initialization) {
          native.tearDown();
          nativeInitialization = null;
        }
      }
    },

    async startCapture() {
      if (refs.captureActive) {
        return;
      }

      try {
        await ensureMicrophonePermission();
        await ensureInitialized();
        const isRecording =
          options?.captureMode === "dictation"
            ? native.startDictation()
            : native.toggleRecording(true);
        if (!isRecording) {
          throw new Error(i18n.t("common.errors.microphoneCaptureUnavailable"));
        }
        refs.captureActive = true;
        nativeCaptureUsers.add(nativeOwner);
      } catch (error) {
        const wrapped = error instanceof Error ? error : new Error(String(error));
        callbacks.onError?.(wrapped);
        throw wrapped;
      }
    },

    async stopCapture() {
      releaseCapture();
      refs.muted = false;
      callbacks.onVolumeLevel(0);
      callbacks.onCaptureAvailabilityChange?.(true);
      releaseSessionIfIdle();
    },

    toggleMute() {
      refs.muted = !refs.muted;
      if (refs.muted) {
        callbacks.onVolumeLevel(0);
      }
      return refs.muted;
    },

    isMuted() {
      return refs.muted;
    },

    play: playback.play,
    streamPcm,
    stop: () => {
      stopStream();
      playback.stop();
    },
    clearQueue: playback.clearQueue,
    isPlaying: () => streamTimers.size > 0 || playback.isPlaying(),
  };
}
