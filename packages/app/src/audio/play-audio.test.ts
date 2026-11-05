import { expect, test, vi } from "vitest";
import { createAudioEngine } from "./audio-engine.native";
import * as native from "@getpaseo/expo-two-way-audio";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { createPlayAudio } from "./play-audio";
import { playPcm16, parsePcmSampleRate, resampleToPcm16 } from "./pcm";
import { playFile, type FilePlaybackStatus, type FilePlayer } from "./file-playback";

vi.mock("expo-audio", () => ({ createAudioPlayer: vi.fn(), setAudioModeAsync: vi.fn() }));
vi.mock("expo-file-system", () => ({
  File: class {
    uri = "file:///speech.wav";
    exists = true;
    write(_bytes: Uint8Array) {}
    delete() {
      this.exists = false;
    }
  },
  Paths: { cache: "cache" },
}));
vi.mock("@getpaseo/expo-two-way-audio", () => {
  let initialized = false;
  let recording = false;
  return {
    initialize: vi.fn(async () => {
      initialized = true;
      return true;
    }),
    tearDown: vi.fn(() => {
      initialized = false;
      recording = false;
    }),
    startDictation: vi.fn(() => {
      recording = initialized;
      return recording;
    }),
    toggleRecording: vi.fn((active: boolean) => {
      recording = active && initialized;
      return recording;
    }),
    isRecording: vi.fn(() => recording),
    getMicrophonePermissionsAsync: vi.fn(async () => ({ granted: true })),
    addExpoTwoWayAudioEventListener: vi.fn(() => ({ remove: vi.fn() })),
    releaseAudioSession: vi.fn(),
    stopPlayback: vi.fn(),
    resumePlayback: vi.fn(),
    playPCMData: vi.fn(),
  };
});

test("background file playback preserves another chat's live microphone session", async () => {
  const callbacks = { onCaptureData() {}, onVolumeLevel() {} };
  const voice = createAudioEngine(callbacks);
  const chat = createAudioEngine(callbacks);
  const playerError = new Error("Native file player unavailable");
  // Stop at player creation so the test exercises session ownership without a decoder.
  vi.mocked(createAudioPlayer).mockImplementationOnce(() => {
    throw playerError;
  });
  try {
    await voice.startCapture();
    await expect(chat.play(new Blob(["audio"], { type: "audio/wav" }))).rejects.toBe(playerError);
    expect(setAudioModeAsync).toHaveBeenLastCalledWith(
      expect.objectContaining({
        allowsRecording: true,
        allowsBackgroundRecording: true,
        shouldPlayInBackground: true,
      }),
    );
    expect(createAudioPlayer).toHaveBeenLastCalledWith("file:///speech.wav", {
      updateInterval: 100,
      keepAudioSessionActive: true,
    });
  } finally {
    await chat.destroy();
    await voice.destroy();
  }
});

test("closing one chat preserves microphone capture in another initialized chat", async () => {
  const callbacks = { onCaptureData() {}, onVolumeLevel() {} };
  const first = createAudioEngine(callbacks, { captureMode: "dictation" });
  const second = createAudioEngine(callbacks, { captureMode: "dictation" });
  try {
    await first.startCapture();
    await first.stopCapture();
    await second.startCapture();
    await second.stopCapture();
    await first.destroy();
    await expect(second.startCapture()).resolves.toBeUndefined();
  } finally {
    await first.destroy();
    await second.destroy();
  }
});

test("native initialization is shared and the final owner releases the engine", async () => {
  const callbacks = { onCaptureData() {}, onVolumeLevel() {} };
  const first = createAudioEngine(callbacks);
  const second = createAudioEngine(callbacks);
  const initializations = vi.mocked(native.initialize).mock.calls.length;
  const teardowns = vi.mocked(native.tearDown).mock.calls.length;
  try {
    await Promise.all([first.initialize(), first.initialize(), second.initialize()]);
    expect(native.initialize).toHaveBeenCalledTimes(initializations + 1);
    await first.destroy();
    expect(native.tearDown).toHaveBeenCalledTimes(teardowns);
    await second.destroy();
    expect(native.tearDown).toHaveBeenCalledTimes(teardowns + 1);
    await expect(first.startCapture()).rejects.toThrow("Audio engine destroyed");
  } finally {
    await first.destroy();
    await second.destroy();
  }
});

test("closing a chat during initialization releases the engine without starting capture", async () => {
  let complete!: (success: boolean) => void;
  vi.mocked(native.initialize).mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        complete = resolve;
      }),
  );
  const engine = createAudioEngine({ onCaptureData() {}, onVolumeLevel() {} });
  const initialized = expect(engine.initialize()).rejects.toThrow("Audio engine destroyed");
  const teardowns = vi.mocked(native.tearDown).mock.calls.length;
  const destroyed = engine.destroy();
  complete(true);
  await initialized;
  await destroyed;
  expect(native.tearDown).toHaveBeenCalledTimes(teardowns + 1);
});

test("capture failure does not misidentify the phone's platform", async () => {
  vi.mocked(native.startDictation).mockReturnValueOnce(false);
  const engine = createAudioEngine(
    { onCaptureData() {}, onVolumeLevel() {} },
    { captureMode: "dictation" },
  );
  try {
    await expect(engine.startCapture()).rejects.toThrow(
      "Microphone recording could not start. Please try again.",
    );
  } finally {
    await engine.destroy();
  }
});

test("closing an idle chat does not stop another owner's streamed audio", async () => {
  const callbacks = { onCaptureData() {}, onVolumeLevel() {} };
  const chat = createAudioEngine(callbacks);
  const voice = createAudioEngine(callbacks);
  await chat.initialize();
  await voice.initialize();
  const stopped = vi.mocked(native.stopPlayback).mock.calls.length;
  const playback = voice.streamPcm(new Uint8Array(32000), 16000);
  const cancelled = expect(playback).rejects.toThrow("Playback stopped");
  try {
    await chat.destroy();
    expect(native.stopPlayback).toHaveBeenCalledTimes(stopped);
  } finally {
    await chat.destroy();
    await voice.destroy();
    await cancelled;
  }
});

const source = { base64: "UklGRg==", mimeType: "audio/wav" };
test("passes RPC file bytes to the shared engine and awaits completion", async () => {
  const owner = new AbortController();
  let finish!: () => void;
  const played = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let completed = false;
  const play = createPlayAudio(
    {
      async play(audio, signal) {
        expect(signal).toBe(owner.signal);
        expect(audio.type).toBe("audio/wav");
        expect(audio.size).toBe(4);
        expect(new Uint8Array(await audio.arrayBuffer())).toEqual(new Uint8Array([82, 73, 70, 70]));
        await played;
        return 1;
      },
    },
    owner.signal,
  );
  const result = play(source).then(() => {
    completed = true;
    return undefined;
  });
  await Promise.resolve();
  expect(completed).toBe(false);
  finish();
  await result;
  expect(completed).toBe(true);
});

test.each([
  { ...source, base64: "garbage!" },
  { ...source, base64: "" },
  { ...source, mimeType: "text/plain" },
])("rejects invalid input before reaching a decoder: %o", async (input) => {
  const play = createPlayAudio(
    {
      play() {
        throw new Error("Reached decoder");
      },
    },
    new AbortController().signal,
  );
  await expect(play(input)).rejects.toThrow(/^Audio must/);
});

test("rejects calls from an unloaded plugin", async () => {
  const owner = new AbortController();
  owner.abort(new Error("Plugin unloaded"));
  const play = createPlayAudio(
    {
      play() {
        throw new Error("Reached decoder");
      },
    },
    owner.signal,
  );
  await expect(play(source)).rejects.toThrow("Playback stopped");
});

test("voice PCM retains its native output and 16 kHz samples", async () => {
  const pcm = new Uint8Array([0, 0, 255, 127, 0, 128]);
  let written: Uint8Array | undefined;
  const duration = await playPcm16(
    pcm,
    "audio/pcm;rate=16000;bits=16",
    new AbortController().signal,
    {
      resumePlayback() {},
      playPCMData(bytes) {
        written = bytes;
      },
      stopPlayback() {},
    },
  );
  expect(written).toEqual(pcm);
  expect(duration).toBe(3 / 16000);
});

test("voice PCM cancellation stops native output and rejects", async () => {
  let stopped = false;
  const owner = new AbortController();
  const result = playPcm16(new Uint8Array(32000), "audio/pcm;rate=16000;bits=16", owner.signal, {
    resumePlayback() {},
    playPCMData() {},
    stopPlayback() {
      stopped = true;
    },
  });
  owner.abort();
  await expect(result).rejects.toThrow("Playback stopped");
  expect(stopped).toBe(true);
});

function filePlayer() {
  let listener: (status: FilePlaybackStatus) => void = () => {};
  let removed = false;
  let started = false;
  const player: FilePlayer = {
    play() {
      started = true;
    },
    remove() {
      removed = true;
    },
    addListener(_event, callback) {
      listener = callback;
      return {
        remove() {
          listener = () => {};
        },
      };
    },
  };
  return {
    player,
    status: (status: Partial<FilePlaybackStatus>) =>
      listener({
        playbackState: "ready",
        duration: 1,
        didJustFinish: false,
        isLoaded: true,
        ...status,
      }),
    removed: () => removed,
    started: () => started,
  };
}

test("native file playback waits for completion and releases its player", async () => {
  const h = filePlayer();
  const promise = playFile(h.player, new AbortController().signal);
  expect(h.started()).toBe(true);
  h.status({ didJustFinish: true });
  await expect(promise).resolves.toBe(1);
  expect(h.removed()).toBe(true);
});

test("native decoder errors reject and release the player", async () => {
  const h = filePlayer();
  const promise = playFile(h.player, new AbortController().signal);
  h.status({ playbackState: "failed" });
  await expect(promise).rejects.toThrow("could not be decoded");
  expect(h.removed()).toBe(true);
});

test("native cancellation releases playback and settles the caller", async () => {
  const h = filePlayer();
  const owner = new AbortController();
  const promise = playFile(h.player, owner.signal);
  owner.abort(new Error("Plugin unloaded"));
  await expect(promise).rejects.toThrow("Playback stopped");
  expect(h.removed()).toBe(true);
});

test.each(["audio/pcm;rate=16000;bits=16", "AUDIO/PCM; rate=16000"])(
  "rejects raw PCM instead of initializing voice capture: %s",
  async (mimeType) => {
    const play = createPlayAudio(
      {
        play: async () => {
          throw new Error("Reached engine");
        },
      },
      new AbortController().signal,
    );
    await expect(play({ base64: "AAAAAA==", mimeType })).rejects.toThrow(
      "Pass an audio file, such as WAV or MP3",
    );
  },
);

// Voice capture and browser dictation use this same PCM boundary.
test("capture PCM preserves clipping, signed samples, and empty input", () => {
  expect(resampleToPcm16(new Float32Array([-2, -1, -0.5, 0, 0.5, 1, 2]), 16000, 16000)).toEqual(
    new Int16Array([-32768, -32768, -16384, 0, 16384, 32767, 32767]),
  );
  expect(resampleToPcm16(new Float32Array(), 48000, 16000)).toEqual(new Int16Array());
});

test("capture PCM resamples with interpolation and preserves the last sample", () => {
  expect(resampleToPcm16(new Float32Array([-1, 0, 1]), 24000, 16000)).toEqual(
    new Int16Array([-32768, 16384]),
  );
  expect(resampleToPcm16(new Float32Array([0, 1]), 8000, 16000)).toEqual(
    new Int16Array([0, 16384, 32767, 32767]),
  );
});

test("voice playback shares PCM sample-rate parsing", () => {
  expect(parsePcmSampleRate("audio/pcm;rate=16000;bits=16")).toBe(16000);
  expect(parsePcmSampleRate("audio/PCM;RATE=48000")).toBe(48000);
  expect(parsePcmSampleRate("audio/pcm")).toBeNull();
  expect(parsePcmSampleRate("audio/pcm;rate=0")).toBeNull();
});
