import { observeVoiceTurns } from "./turn-observation";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DaemonServerInfo } from "@/stores/session-store";
import type { AudioEngine } from "@/audio";
import { createVoiceRuntime, type VoiceSessionAdapter } from "@/voice/voice-runtime";
import { REALTIME_VOICE_VAD_CONFIG } from "@/voice/realtime-voice-config";
import { i18n } from "@/i18n/i18next";

const CUE_MIME_TYPE = "audio/pcm;rate=16000;bits=16";
const THINKING_TONE_MIN_SILENCE_MS = 1500;
const SEGMENT_MIME_TYPE = "audio/pcm;rate=24000;bits=16";

function createAudioEngineMock(): AudioEngine {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
    startCapture: vi.fn().mockResolvedValue(undefined),
    stopCapture: vi.fn().mockResolvedValue(undefined),
    toggleMute: vi.fn().mockReturnValue(true),
    isMuted: vi.fn().mockReturnValue(false),
    play: vi.fn().mockResolvedValue(0.1),
    streamPcm: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    clearQueue: vi.fn(),
    isPlaying: vi.fn().mockReturnValue(false),
  };
}

function createSessionAdapter(serverId = "server-1"): VoiceSessionAdapter {
  return {
    serverId,
    setVoiceMode: vi.fn().mockResolvedValue(undefined),
    sendVoiceAudioChunk: vi.fn().mockResolvedValue(undefined),
    audioPlayed: vi.fn().mockResolvedValue(undefined),
    abortRequest: vi.fn().mockResolvedValue(undefined),
    setAssistantAudioPlaying: vi.fn(),
  };
}

function createAudioPayload(args: {
  id: string;
  groupId: string;
  chunkIndex: number;
  isLastChunk: boolean;
  isVoiceMode?: boolean;
}) {
  return {
    id: args.id,
    groupId: args.groupId,
    chunkIndex: args.chunkIndex,
    isLastChunk: args.isLastChunk,
    isVoiceMode: args.isVoiceMode ?? true,
    format: "pcm",
    audio: Buffer.from(`chunk-${args.chunkIndex}`).toString("base64"),
  } as const;
}

function createServerInfo(): DaemonServerInfo {
  return {
    serverId: "server-1",
    hostname: "host",
    version: "1.0.0",
    capabilities: {
      voice: {
        dictation: { enabled: true, reason: "" },
        voice: { enabled: true, reason: "" },
      },
    },
  };
}

function createRuntime(options?: {
  engine?: AudioEngine;
  getServerInfo?: (serverId: string) => DaemonServerInfo | null;
}) {
  const engine = options?.engine ?? createAudioEngineMock();
  const runtime = createVoiceRuntime({
    engine,
    getServerInfo: options?.getServerInfo ?? (() => createServerInfo()),
    activateKeepAwake: vi.fn().mockResolvedValue(undefined),
    deactivateKeepAwake: vi.fn().mockResolvedValue(undefined),
  });

  return { runtime, engine };
}

describe("voice runtime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("streams assistant playback ahead while continuing to send real microphone samples", async () => {
    const info = {
      ...createServerInfo(),
      features: { voiceAssistant: true, voiceAssistantEnabled: true },
    };
    const { runtime, engine } = createRuntime({ getServerInfo: () => info });
    const adapter = createSessionAdapter();
    runtime.registerSession(adapter);
    const finishes: Array<() => void> = [];
    vi.mocked(engine.streamPcm).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishes.push(resolve);
        }),
    );
    await runtime.startVoice("server-1", "", undefined, true);
    for (let i = 0; i < 2; i++)
      runtime.handleAudioOutput("server-1", {
        ...createAudioPayload({ id: `a${i}`, groupId: "g", chunkIndex: i, isLastChunk: i === 1 }),
        audio: "AQABAA==",
      });
    expect(engine.streamPcm).toHaveBeenCalledTimes(2);
    expect(engine.play).not.toHaveBeenCalled();
    runtime.handleCapturePcm(new Uint8Array(6400).fill(1));
    await vi.advanceTimersByTimeAsync(100);
    expect(adapter.sendVoiceAudioChunk).toHaveBeenCalled();
    expect(
      Buffer.from(vi.mocked(adapter.sendVoiceAudioChunk).mock.calls[0]![0], "base64").some(
        (byte) => byte === 1,
      ),
    ).toBe(true);
    expect(adapter.audioPlayed).not.toHaveBeenCalled();
    runtime.onServerSpeechStateChanged("server-1", true, "speaking");
    expect(engine.stop).toHaveBeenCalled();
    for (const finish of finishes) finish();
    await vi.advanceTimersByTimeAsync(1);
    expect(adapter.abortRequest).not.toHaveBeenCalled();
    runtime.onTranscriptionResult("server-1", "新增一个任务");
    expect(runtime.getSnapshot()).toMatchObject({
      lastTranscript: "新增一个任务",
      phase: "speaking",
    });
    runtime.onServerSpeechStateChanged(
      "server-1",
      false,
      undefined,
      "connection_failed",
      "Quota exhausted",
    );
    expect(engine.stopCapture).toHaveBeenCalled();
    expect(runtime.getSnapshot()).toMatchObject({
      phase: "connection_failed",
      assistantMessage: "Quota exhausted",
    });
    await runtime.stopVoice();
  });

  it("shows failed microphone delivery and stops the assistant instead of silently losing speech", async () => {
    const { runtime, engine } = createRuntime({
      getServerInfo: () => ({
        ...createServerInfo(),
        features: { voiceAssistant: true, voiceAssistantEnabled: true },
      }),
    });
    const adapter = createSessionAdapter();
    runtime.registerSession(adapter);
    await runtime.startVoice("server-1", "", undefined, true);
    vi.mocked(adapter.sendVoiceAudioChunk).mockRejectedValueOnce(
      new Error("transport unavailable"),
    );
    runtime.handleCapturePcm(new Uint8Array([1, 2]));
    await vi.advanceTimersByTimeAsync(1);
    expect(runtime.getSnapshot()).toMatchObject({ phase: "connection_failed" });
    expect(engine.stopCapture).toHaveBeenCalled();
    expect(adapter.setVoiceMode).toHaveBeenLastCalledWith(false);
    runtime.handleCapturePcm(new Uint8Array([1, 2]));
    expect(adapter.sendVoiceAudioChunk).toHaveBeenCalledOnce();
  });

  it("ignores an old upload rejection after the user starts a new voice session", async () => {
    const { runtime } = createRuntime({
      getServerInfo: () => ({
        ...createServerInfo(),
        features: { voiceAssistant: true, voiceAssistantEnabled: true },
      }),
    });
    const adapter = createSessionAdapter();
    runtime.registerSession(adapter);
    let rejectUpload!: (error: Error) => void;
    vi.mocked(adapter.sendVoiceAudioChunk).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectUpload = reject;
        }),
    );
    await runtime.startVoice("server-1", "", undefined, true);
    runtime.handleCapturePcm(new Uint8Array([1, 2]));
    await runtime.stopVoice();
    await runtime.startVoice("server-1", "", undefined, true);
    rejectUpload(new Error("old connection closed"));
    await vi.advanceTimersByTimeAsync(1);
    expect(runtime.getSnapshot()).toMatchObject({ phase: "listening", isVoiceMode: true });
    runtime.handleCapturePcm(new Uint8Array([1, 2]));
    expect(adapter.sendVoiceAudioChunk).toHaveBeenCalledTimes(2);
  });
  it.each([false, true])(
    "restores microphone capture and mute=%s after a transport reconnect",
    async (initialMuted) => {
      const info = {
        ...createServerInfo(),
        features: { voiceAssistant: true, voiceAssistantEnabled: true },
      };
      const { runtime, engine } = createRuntime({ getServerInfo: () => info });
      let muted = false;
      vi.mocked(engine.isMuted).mockImplementation(() => muted);
      vi.mocked(engine.toggleMute).mockImplementation(() => (muted = !muted));
      vi.mocked(engine.stopCapture).mockImplementation(async () => {
        muted = false;
      });
      const adapter = createSessionAdapter();
      runtime.registerSession(adapter);
      await runtime.startVoice("server-1", "", undefined, true);
      if (initialMuted) runtime.toggleMute();
      runtime.updateSessionConnection("server-1", false);
      // The audio session can lose its engine mute state while disconnected.
      muted = false;
      runtime.updateSessionConnection("server-1", true);
      await vi.advanceTimersByTimeAsync(1);
      expect(engine.startCapture).toHaveBeenCalledTimes(2);
      expect(runtime.getSnapshot().phase).toBe("listening");
      expect(engine.isMuted()).toBe(initialMuted);
      expect(runtime.getSnapshot().isMuted).toBe(initialMuted);
      if (initialMuted) runtime.toggleMute();
      expect(runtime.getSnapshot().isMuted).toBe(false);
      runtime.handleCapturePcm(new Uint8Array([1, 2]));
      expect(adapter.sendVoiceAudioChunk).toHaveBeenLastCalledWith("AQI=", CUE_MIME_TYPE);
      await runtime.stopVoice();
    },
  );

  it("keeps a failed assistant stopped across socket reconnect until explicitly restarted", async () => {
    const info = {
      ...createServerInfo(),
      features: { voiceAssistant: true, voiceAssistantEnabled: true },
    };
    const { runtime, engine } = createRuntime({ getServerInfo: () => info });
    runtime.registerSession(createSessionAdapter());
    await runtime.startVoice("server-1", "", undefined, true);
    runtime.onServerSpeechStateChanged("server-1", false, undefined, "connection_failed");
    runtime.updateSessionConnection("server-1", false);
    runtime.updateSessionConnection("server-1", true);
    await vi.advanceTimersByTimeAsync(1);
    expect(engine.stopCapture).toHaveBeenCalledOnce();
    expect(engine.startCapture).toHaveBeenCalledOnce();
    expect(runtime.getSnapshot().phase).toBe("connection_failed");
    await runtime.stopVoice();
    await runtime.startVoice("server-1", "", undefined, true);
    expect(engine.startCapture).toHaveBeenCalledTimes(2);
    expect(runtime.getSnapshot().phase).toBe("listening");
    await runtime.stopVoice();
  });

  it("stops capture even when the host cannot acknowledge ending voice", async () => {
    const { runtime, engine } = createRuntime();
    const adapter = createSessionAdapter();
    runtime.registerSession(adapter);
    await runtime.startVoice("server-1", "agent-1");
    vi.mocked(adapter.setVoiceMode).mockRejectedValueOnce(new Error("Offline"));
    await expect(runtime.stopVoice()).rejects.toThrow("Offline");
    expect(engine.stopCapture).toHaveBeenCalled();
    expect(runtime.getSnapshot().isVoiceMode).toBe(false);
  });

  it("keeps playback failure terminal when queued audio and status events arrive late", async () => {
    const { runtime: assistant, engine } = createRuntime({
      getServerInfo: () => ({ ...createServerInfo(), features: { voiceAssistant: true } }),
    });
    const adapter = createSessionAdapter();
    assistant.registerSession(adapter);
    await assistant.startVoice("server-1", "", undefined, true);
    vi.mocked(engine.streamPcm).mockRejectedValueOnce(new Error("Voice playback fell behind"));
    const payload = createAudioPayload({
      id: "failed",
      groupId: "g",
      chunkIndex: 0,
      isLastChunk: false,
    });
    assistant.handleAudioOutput("server-1", payload);
    await vi.advanceTimersByTimeAsync(1);
    assistant.handleAudioOutput("server-1", { ...payload, id: "late", chunkIndex: 1 });
    assistant.onServerSpeechStateChanged("server-1", false, undefined, "waiting");
    assistant.onServerSpeechStateChanged("server-1", false, undefined, "listening", "正在读取");
    assistant.updateSessionConnection("server-1", false);
    assistant.updateSessionConnection("server-1", true);
    assistant.interruptReply();
    assistant.onAssistantAudioStarted("server-1");
    assistant.onAssistantAudioFinished("server-1");
    await vi.advanceTimersByTimeAsync(1);
    expect(engine.streamPcm).toHaveBeenCalledOnce();
    expect(assistant.getSnapshot()).toMatchObject({
      phase: "connection_failed",
      assistantMessage: "Voice playback fell behind",
    });
    expect(adapter.setVoiceMode).toHaveBeenLastCalledWith(false);
    await assistant.stopVoice();
    await assistant.startVoice("server-1", "", undefined, true);
    assistant.handleAudioOutput("server-1", { ...payload, id: "retry", isLastChunk: true });
    await vi.advanceTimersByTimeAsync(1);
    expect(engine.streamPcm).toHaveBeenCalledTimes(2);
    expect(assistant.getSnapshot().phase).toBe("listening");
    await assistant.stopVoice();
  });

  it("does not start the microphone when voice was stopped during connection", async () => {
    const { runtime, engine } = createRuntime();
    const adapter = createSessionAdapter();
    runtime.registerSession(adapter);
    let finish!: () => void;
    vi.mocked(adapter.setVoiceMode).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const starting = runtime.startVoice("server-1", "agent-1");
    await vi.advanceTimersByTimeAsync(1);
    await runtime.stopVoice();
    finish();
    await starting;
    expect(engine.startCapture).not.toHaveBeenCalled();
    expect(runtime.getSnapshot().isVoiceMode).toBe(false);
  });

  it("owns turn progress independently of the viewed timeline and releases it on stop", async () => {
    const { runtime } = createRuntime();
    runtime.registerSession(createSessionAdapter());
    const releases: string[] = [];
    const observed: string[] = [];
    const handlers: Array<Parameters<DaemonClient["subscribeAgentTimeline"]>[1]> = [];
    const subscribeAgentTimeline: DaemonClient["subscribeAgentTimeline"] = (agentId, handler) => {
      observed.push(agentId);
      handlers.push(handler);
      return Object.assign(
        () => {
          releases.push(agentId);
        },
        {
          ready: Promise.resolve(),
          subscriptionId: agentId,
          release: async () => {
            releases.push(agentId);
          },
        },
      );
    };
    const dispose = observeVoiceTurns({
      client: { subscribeAgentTimeline },
      runtime,
      serverId: "server-1",
    });
    expect(observed).toEqual([]);
    await runtime.startVoice("server-1", "agent-1");
    runtime.onCaptureAvailabilityChange(false);
    runtime.onCaptureAvailabilityChange(true);
    expect(observed).toEqual(["agent-1"]);
    expect(releases).toEqual([]);
    const deliver = (type: "turn_started" | "turn_completed") =>
      handlers[0]({
        type: "agent_stream",
        payload: {
          agentId: "agent-1",
          event: { type, provider: "codex" },
          timestamp: "2026-10-25T00:00:00Z",
        },
      });
    deliver("turn_started");
    expect(runtime.getSnapshot().phase).toBe("waiting");
    deliver("turn_completed");
    expect(runtime.getSnapshot().phase).toBe("listening");
    await runtime.startVoice("server-1", "agent-2");
    expect(observed).toEqual(["agent-1", "agent-2"]);
    expect(releases).toEqual(["agent-1"]);
    await runtime.stopVoice();
    expect(releases).toEqual(["agent-1", "agent-2"]);
    dispose();
  });

  it("keeps recognition failures visible until the next speech or the fade-out", async () => {
    const { runtime } = createRuntime();
    runtime.registerSession(createSessionAdapter());
    await runtime.startVoice("server-1", "agent-1");
    runtime.onServerSpeechStateChanged("server-1", true, "speaking");
    expect(runtime.getSnapshot().phase).toBe("speaking");
    runtime.onServerSpeechStateChanged("server-1", false, "transcribing");
    expect(runtime.getSnapshot().phase).toBe("transcribing");
    runtime.onTranscriptionResult("server-1", "请检查刚才的改动");
    expect(runtime.getSnapshot().lastTranscript).toBe("请检查刚才的改动");
    runtime.onServerSpeechStateChanged("server-1", false, "recognition_failed");
    runtime.onTurnEvent("server-1", "agent-1", "turn_canceled");
    expect(runtime.getSnapshot().phase).toBe("recognition_failed");
    runtime.onServerSpeechStateChanged("server-1", true, "speaking");
    expect(runtime.getSnapshot().phase).toBe("speaking");
    runtime.updateSessionConnection("server-1", false);
    expect(runtime.getSnapshot().phase).toBe("reconnecting");
    runtime.updateSessionConnection("server-1", true);
    await vi.advanceTimersByTimeAsync(1);
    expect(runtime.getSnapshot().phase).toBe("listening");
    await runtime.stopVoice();
  });

  it("clears the previous transcript when recognition fails but keeps it when submission fails", async () => {
    const { runtime } = createRuntime();
    runtime.registerSession(createSessionAdapter());
    await runtime.startVoice("server-1", "agent-1");

    runtime.onTranscriptionResult("server-1", "第一句");
    runtime.onServerSpeechStateChanged("server-1", false, "no_speech");
    expect(runtime.getSnapshot()).toMatchObject({ phase: "no_speech", lastTranscript: "" });

    runtime.onTranscriptionResult("server-1", "第二句");
    runtime.onServerSpeechStateChanged("server-1", false, "recognition_failed");
    expect(runtime.getSnapshot()).toMatchObject({
      phase: "recognition_failed",
      lastTranscript: "",
    });

    runtime.onTranscriptionResult("server-1", "第三句");
    runtime.onServerSpeechStateChanged("server-1", false, "submission_failed");
    expect(runtime.getSnapshot()).toMatchObject({
      phase: "submission_failed",
      lastTranscript: "第三句",
    });
    await runtime.stopVoice();
  });

  it("fades input failures back to listening after a few seconds", async () => {
    const { runtime } = createRuntime();
    runtime.registerSession(createSessionAdapter());
    await runtime.startVoice("server-1", "agent-1");

    runtime.onServerSpeechStateChanged("server-1", false, "no_speech");
    await vi.advanceTimersByTimeAsync(3900);
    expect(runtime.getSnapshot().phase).toBe("no_speech");
    await vi.advanceTimersByTimeAsync(200);
    expect(runtime.getSnapshot().phase).toBe("listening");
    await runtime.stopVoice();
  });

  it("does not let a stale failure timer cut short a newer one or overwrite newer state", async () => {
    const { runtime } = createRuntime();
    runtime.registerSession(createSessionAdapter());
    await runtime.startVoice("server-1", "agent-1");

    runtime.onServerSpeechStateChanged("server-1", false, "no_speech");
    await vi.advanceTimersByTimeAsync(3000);
    runtime.onServerSpeechStateChanged("server-1", false, "recognition_failed");
    await vi.advanceTimersByTimeAsync(3000);
    expect(runtime.getSnapshot().phase).toBe("recognition_failed");

    runtime.onServerSpeechStateChanged("server-1", true, "speaking");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(runtime.getSnapshot().phase).toBe("speaking");
    await runtime.stopVoice();
  });

  it("keeps the agent turn marked in progress through input failures and fades back to waiting", async () => {
    const { runtime } = createRuntime();
    runtime.registerSession(createSessionAdapter());
    await runtime.startVoice("server-1", "agent-1");
    runtime.onTurnEvent("server-1", "agent-1", "turn_started");

    runtime.onServerSpeechStateChanged("server-1", true, "speaking");
    runtime.onServerSpeechStateChanged("server-1", false, "no_speech");
    expect(runtime.getSnapshot().phase).toBe("no_speech");
    await vi.advanceTimersByTimeAsync(4100);
    expect(runtime.getSnapshot().phase).toBe("waiting");

    runtime.onServerSpeechStateChanged("server-1", false, "submission_failed");
    await vi.advanceTimersByTimeAsync(4100);
    expect(runtime.getSnapshot().phase).toBe("waiting");

    runtime.onTurnEvent("server-1", "agent-1", "turn_completed");
    expect(runtime.getSnapshot().phase).toBe("listening");
    await runtime.stopVoice();
  });

  it("takes back an assumed turn when its own submission fails", async () => {
    const { runtime } = createRuntime();
    runtime.registerSession(createSessionAdapter());
    await runtime.startVoice("server-1", "agent-1");

    runtime.onTranscriptionResult("server-1", "开始干活");
    expect(runtime.getSnapshot().phase).toBe("submitting");
    runtime.onServerSpeechStateChanged("server-1", false, "submission_failed");
    await vi.advanceTimersByTimeAsync(4100);
    expect(runtime.getSnapshot().phase).toBe("listening");
    await runtime.stopVoice();
  });

  it("goes straight to waiting when speech is steered into a turn that is already running", async () => {
    const { runtime } = createRuntime();
    runtime.registerSession(createSessionAdapter());
    await runtime.startVoice("server-1", "agent-1");
    runtime.onTurnEvent("server-1", "agent-1", "turn_started");

    runtime.onServerSpeechStateChanged("server-1", true, "speaking");
    runtime.onServerSpeechStateChanged("server-1", false, "transcribing");
    runtime.onTranscriptionResult("server-1", "顺便看下日志");

    expect(runtime.getSnapshot()).toMatchObject({
      phase: "waiting",
      lastTranscript: "顺便看下日志",
    });
    await runtime.stopVoice();
  });

  it("ignores an empty transcript without dropping a running agent turn", async () => {
    const { runtime } = createRuntime();
    runtime.registerSession(createSessionAdapter());
    await runtime.startVoice("server-1", "agent-1");
    runtime.onTurnEvent("server-1", "agent-1", "turn_started");

    runtime.onServerSpeechStateChanged("server-1", true, "speaking");
    runtime.onServerSpeechStateChanged("server-1", false, "transcribing");
    runtime.onTranscriptionResult("server-1", "   ");
    expect(runtime.getSnapshot().phase).toBe("waiting");

    runtime.onTurnEvent("server-1", "agent-1", "turn_completed");
    expect(runtime.getSnapshot().phase).toBe("listening");
    await runtime.stopVoice();
  });

  it("leaves no failure timer behind after voice stops", async () => {
    const { runtime } = createRuntime();
    runtime.registerSession(createSessionAdapter());
    await runtime.startVoice("server-1", "agent-1");
    runtime.onServerSpeechStateChanged("server-1", false, "recognition_failed");
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    await runtime.stopVoice();

    expect(vi.getTimerCount()).toBe(0);
    expect(runtime.getSnapshot().phase).toBe("disabled");
  });

  it("does not play a waiting cue while the system has interrupted microphone access", async () => {
    const { runtime, engine } = createRuntime();
    runtime.registerSession(createSessionAdapter());
    await runtime.startVoice("server-1", "agent-1");
    runtime.onTurnEvent("server-1", "agent-1", "turn_started");
    runtime.onCaptureAvailabilityChange(false);
    await vi.advanceTimersByTimeAsync(THINKING_TONE_MIN_SILENCE_MS * 2);
    expect(engine.play).not.toHaveBeenCalled();
    runtime.onCaptureAvailabilityChange(true);
    await vi.advanceTimersByTimeAsync(THINKING_TONE_MIN_SILENCE_MS);
    expect(engine.play).toHaveBeenCalledTimes(1);
    await runtime.stopVoice();
  });

  it("shows an actionable error if reconnecting the voice session is rejected", async () => {
    const { runtime } = createRuntime();
    const adapter = createSessionAdapter();
    runtime.registerSession(adapter);
    await runtime.startVoice("server-1", "agent-1");
    runtime.updateSessionConnection("server-1", false);
    vi.mocked(adapter.setVoiceMode).mockRejectedValueOnce(new Error("Voice unavailable"));
    runtime.updateSessionConnection("server-1", true);
    await vi.advanceTimersByTimeAsync(1);
    expect(runtime.getSnapshot()).toMatchObject({
      phase: "connection_failed",
      isVoiceSwitching: false,
    });
    await runtime.stopVoice();
  });

  it("sends silence during assistant playback and its echo tail, then resumes user audio", async () => {
    const adapter = createSessionAdapter();
    const { runtime } = createRuntime();
    runtime.registerSession(adapter);
    await runtime.startVoice("server-1", "agent-1");
    const microphone = Uint8Array.from([10, 20, 30, 40]);
    runtime.onAssistantAudioStarted("server-1");
    runtime.onTranscriptionResult("server-1", "");
    expect(runtime.getSnapshot().phase).toBe("playing");
    runtime.handleCapturePcm(microphone);
    expect(adapter.sendVoiceAudioChunk).toHaveBeenLastCalledWith("AAAAAA==", CUE_MIME_TYPE);
    runtime.onAssistantAudioFinished("server-1");
    runtime.handleCapturePcm(microphone);
    expect(adapter.sendVoiceAudioChunk).toHaveBeenLastCalledWith("AAAAAA==", CUE_MIME_TYPE);
    await vi.advanceTimersByTimeAsync(500);
    runtime.handleCapturePcm(microphone);
    expect(adapter.sendVoiceAudioChunk).toHaveBeenLastCalledWith(
      Buffer.from(microphone).toString("base64"),
      CUE_MIME_TYPE,
    );
    await runtime.stopVoice();
  });

  it("releases playback capture protection after disconnect and reconnect", async () => {
    const adapter = createSessionAdapter();
    const { runtime, engine } = createRuntime();
    runtime.registerSession(adapter);
    await runtime.startVoice("server-1", "agent-1");
    runtime.onAssistantAudioStarted("server-1");
    runtime.updateSessionConnection("server-1", false);
    expect(engine.stop).toHaveBeenCalled();
    runtime.handleCapturePcm(Uint8Array.from([1, 2]));
    expect(adapter.sendVoiceAudioChunk).not.toHaveBeenCalled();
    runtime.updateSessionConnection("server-1", true);
    await vi.advanceTimersByTimeAsync(500);
    runtime.handleCapturePcm(Uint8Array.from([1, 2]));
    expect(adapter.sendVoiceAudioChunk).toHaveBeenLastCalledWith("AQI=", CUE_MIME_TYPE);
    await runtime.stopVoice();
  });

  it("starts voice when adapter is ready", async () => {
    const adapter = createSessionAdapter();
    const { runtime, engine } = createRuntime();
    runtime.registerSession(adapter);

    await runtime.startVoice("server-1", "agent-1");

    expect(engine.initialize).toHaveBeenCalled();
    expect(adapter.setVoiceMode).toHaveBeenCalledWith(true, "agent-1");
    expect(engine.startCapture).toHaveBeenCalled();
    expect(runtime.getSnapshot()).toMatchObject({
      phase: "listening",
      isVoiceMode: true,
      activeServerId: "server-1",
      activeAgentId: "agent-1",
    });
  });

  it("streams continuous PCM chunks and waits after receiving a transcript", async () => {
    const adapter = createSessionAdapter();
    const { runtime } = createRuntime();
    runtime.registerSession(adapter);

    await runtime.startVoice("server-1", "agent-1");
    runtime.handleCapturePcm(new Uint8Array(32000));
    expect(runtime.getSnapshot().phase).toBe("listening");

    expect(adapter.sendVoiceAudioChunk).toHaveBeenLastCalledWith(
      expect.any(String),
      "audio/pcm;rate=16000;bits=16",
    );

    runtime.onTranscriptionResult("server-1", "hello");
    expect(runtime.getSnapshot().phase).toBe("submitting");
  });

  it("moves from listening to playing on the first assistant audio", async () => {
    const adapter = createSessionAdapter();
    const { runtime, engine: _engine } = createRuntime();
    runtime.registerSession(adapter);

    await runtime.startVoice("server-1", "agent-1");
    runtime.onAssistantAudioStarted("server-1");

    expect(runtime.getSnapshot().phase).toBe("playing");
    expect(adapter.setAssistantAudioPlaying).toHaveBeenCalledWith(true);
  });

  it("starts playback on the first chunk before isLastChunk arrives", async () => {
    const adapter = createSessionAdapter();
    let resolvePlay!: (duration: number) => void;
    const engine = createAudioEngineMock();
    vi.mocked(engine.play).mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          resolvePlay = resolve;
        }),
    );
    const { runtime } = createRuntime({ engine });
    runtime.registerSession(adapter);

    await runtime.startVoice("server-1", "agent-1");
    runtime.onTurnEvent("server-1", "agent-1", "turn_started");
    vi.mocked(engine.play).mockClear();

    runtime.handleAudioOutput(
      "server-1",
      createAudioPayload({
        id: "chunk-0",
        groupId: "group-1",
        chunkIndex: 0,
        isLastChunk: false,
      }),
    );

    await vi.waitFor(() => {
      expect(engine.play).toHaveBeenCalledTimes(1);
      expect(runtime.getSnapshot().phase).toBe("playing");
      expect(adapter.audioPlayed).not.toHaveBeenCalled();
    });

    runtime.handleAudioOutput(
      "server-1",
      createAudioPayload({
        id: "chunk-1",
        groupId: "group-1",
        chunkIndex: 1,
        isLastChunk: true,
      }),
    );

    expect(engine.play).toHaveBeenCalledTimes(1);
    resolvePlay(0.1);

    await vi.waitFor(() => {
      expect(adapter.audioPlayed).toHaveBeenCalledWith("chunk-0");
      expect(engine.play).toHaveBeenCalledTimes(2);
    });
  });

  it("acknowledges chunks only after they are consumed and finishes after the final chunk", async () => {
    const adapter = createSessionAdapter();
    const playResolvers: Array<(duration: number) => void> = [];
    const engine = createAudioEngineMock();
    vi.mocked(engine.play).mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          playResolvers.push(resolve);
        }),
    );
    const { runtime } = createRuntime({ engine });
    runtime.registerSession(adapter);

    await runtime.startVoice("server-1", "agent-1");
    runtime.onTurnEvent("server-1", "agent-1", "turn_started");
    vi.mocked(engine.play).mockClear();
    playResolvers.length = 0;

    runtime.handleAudioOutput(
      "server-1",
      createAudioPayload({
        id: "chunk-0",
        groupId: "group-1",
        chunkIndex: 0,
        isLastChunk: false,
      }),
    );
    runtime.handleAudioOutput(
      "server-1",
      createAudioPayload({
        id: "chunk-1",
        groupId: "group-1",
        chunkIndex: 1,
        isLastChunk: true,
      }),
    );

    await vi.waitFor(() => {
      expect(engine.play).toHaveBeenCalledTimes(1);
    });
    expect(adapter.audioPlayed).not.toHaveBeenCalled();

    playResolvers.shift()!(0.1);
    await vi.waitFor(() => {
      expect(adapter.audioPlayed).toHaveBeenCalledWith("chunk-0");
      expect(engine.play).toHaveBeenCalledTimes(2);
    });

    playResolvers.shift()!(0.1);
    await vi.waitFor(() => {
      expect(adapter.audioPlayed).toHaveBeenCalledWith("chunk-1");
      expect(runtime.getSnapshot().phase).toBe("waiting");
    });
  });

  it("leaves playback phase unchanged after assistant playback while the turn is still active", async () => {
    const adapter = createSessionAdapter();
    const { runtime, engine } = createRuntime();
    runtime.registerSession(adapter);

    await runtime.startVoice("server-1", "agent-1");
    runtime.onTurnEvent("server-1", "agent-1", "turn_started");
    runtime.onAssistantAudioStarted("server-1");
    runtime.onAssistantAudioFinished("server-1");

    expect(runtime.getSnapshot().phase).toBe("waiting");
    await vi.advanceTimersByTimeAsync(THINKING_TONE_MIN_SILENCE_MS);
    expect(engine.play).toHaveBeenCalled();
  });

  it("starts the thinking tone once the wait for a reply outlasts an inter-segment gap", async () => {
    const adapter = createSessionAdapter();
    const { runtime, engine } = createRuntime();
    runtime.registerSession(adapter);

    await runtime.startVoice("server-1", "agent-1");
    runtime.onTurnEvent("server-1", "agent-1", "turn_started");

    expect(runtime.getSnapshot().phase).toBe("waiting");
    await vi.advanceTimersByTimeAsync(THINKING_TONE_MIN_SILENCE_MS - 1);
    expect(engine.play).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(engine.play).toHaveBeenCalled();
  });

  it("does not restart the thinking tone from local detection jitter while waiting", async () => {
    const adapter = createSessionAdapter();
    let resolvePlay!: (duration: number) => void;
    const engine = createAudioEngineMock();
    vi.mocked(engine.play).mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          resolvePlay = resolve;
        }),
    );
    const { runtime } = createRuntime({ engine });
    runtime.registerSession(adapter);

    await runtime.startVoice("server-1", "agent-1");
    runtime.onTurnEvent("server-1", "agent-1", "turn_started");

    expect(runtime.getSnapshot().phase).toBe("waiting");
    await vi.advanceTimersByTimeAsync(THINKING_TONE_MIN_SILENCE_MS);
    expect(engine.play).toHaveBeenCalledTimes(1);
    vi.mocked(engine.stop).mockClear();
    vi.mocked(engine.clearQueue).mockClear();

    runtime.handleCaptureVolume(REALTIME_VOICE_VAD_CONFIG.volumeThreshold + 0.05);
    runtime.handleCaptureVolume(0);

    expect(engine.stop).not.toHaveBeenCalled();
    expect(engine.clearQueue).not.toHaveBeenCalled();
    expect(engine.play).toHaveBeenCalledTimes(1);

    runtime.onServerSpeechStateChanged("server-1", true);

    expect(engine.stop).not.toHaveBeenCalled();
    expect(engine.clearQueue).not.toHaveBeenCalled();
    expect(vi.mocked(engine.play).mock.calls[0][1]?.aborted).toBe(true);

    resolvePlay(0.1);
  });

  it("does not play the thinking tone in the gap between two segments of one reply", async () => {
    const adapter = createSessionAdapter();
    const engine = createAudioEngineMock();
    const played: string[] = [];
    vi.mocked(engine.play).mockImplementation(async (source: { type: string }) => {
      played.push(source.type);
      return 0.1;
    });
    const { runtime } = createRuntime({ engine });
    runtime.registerSession(adapter);

    await runtime.startVoice("server-1", "agent-1");
    runtime.onTurnEvent("server-1", "agent-1", "turn_started");

    runtime.handleAudioOutput(
      "server-1",
      createAudioPayload({
        id: "seg-1-chunk-0",
        groupId: "seg-1",
        chunkIndex: 0,
        isLastChunk: true,
      }),
    );
    await vi.waitFor(() => {
      expect(runtime.getSnapshot().phase).toBe("waiting");
    });

    await vi.advanceTimersByTimeAsync(400);

    runtime.handleAudioOutput(
      "server-1",
      createAudioPayload({
        id: "seg-2-chunk-0",
        groupId: "seg-2",
        chunkIndex: 0,
        isLastChunk: true,
      }),
    );
    await vi.waitFor(() => {
      expect(played).toContain(SEGMENT_MIME_TYPE);
    });

    const replyStart = played.indexOf(SEGMENT_MIME_TYPE);
    expect(replyStart).toBeGreaterThanOrEqual(0);
    expect(played.slice(replyStart).filter((type) => type === CUE_MIME_TYPE)).toEqual([]);
  });

  it("returns to listening after assistant playback once the turn is complete", async () => {
    const adapter = createSessionAdapter();
    const { runtime, engine } = createRuntime();
    runtime.registerSession(adapter);

    await runtime.startVoice("server-1", "agent-1");
    runtime.onTurnEvent("server-1", "agent-1", "turn_started");
    await vi.advanceTimersByTimeAsync(THINKING_TONE_MIN_SILENCE_MS);
    runtime.onAssistantAudioStarted("server-1");
    runtime.onTurnEvent("server-1", "agent-1", "turn_completed");
    runtime.onAssistantAudioFinished("server-1");

    expect(runtime.getSnapshot().phase).toBe("listening");
    expect(engine.play).toHaveBeenCalled();
  });

  it("keeps local volume alone non-authoritative for playback interruption", async () => {
    const adapter = createSessionAdapter();
    const { runtime, engine } = createRuntime();
    runtime.registerSession(adapter);

    await runtime.startVoice("server-1", "agent-1");
    runtime.onTurnEvent("server-1", "agent-1", "turn_started");
    runtime.onAssistantAudioStarted("server-1");
    vi.mocked(engine.stop).mockClear();
    vi.mocked(engine.clearQueue).mockClear();

    runtime.handleCaptureVolume(0.5);
    expect(runtime.getTelemetrySnapshot().isSpeaking).toBe(false);
    expect(adapter.abortRequest).not.toHaveBeenCalled();
    expect(runtime.getSnapshot().phase).toBe("playing");
  });

  it("keeps the meter white state driven by server speech detection", async () => {
    const adapter = createSessionAdapter();
    const { runtime } = createRuntime();
    runtime.registerSession(adapter);

    await runtime.startVoice("server-1", "agent-1");
    runtime.handleCaptureVolume(0.7);

    expect(runtime.getTelemetrySnapshot()).toMatchObject({
      volume: expect.any(Number),
      isSpeaking: false,
    });

    runtime.onServerSpeechStateChanged("server-1", true);
    expect(runtime.getTelemetrySnapshot().isSpeaking).toBe(true);

    runtime.onServerSpeechStateChanged("server-1", false);
    expect(runtime.getTelemetrySnapshot().isSpeaking).toBe(false);
  });

  it("ignores server speech detection during speaker playback", async () => {
    const adapter = createSessionAdapter();
    const { runtime, engine } = createRuntime();
    runtime.registerSession(adapter);

    await runtime.startVoice("server-1", "agent-1");
    runtime.onAssistantAudioStarted("server-1");

    runtime.onServerSpeechStateChanged("server-1", true);

    expect(engine.stop).not.toHaveBeenCalled();
    expect(engine.clearQueue).not.toHaveBeenCalled();
    expect(runtime.getSnapshot().phase).toBe("playing");
    expect(runtime.getTelemetrySnapshot().isSpeaking).toBe(false);
  });

  it("explicit interruption stops playback and acknowledges late audio without playing it", async () => {
    const adapter = createSessionAdapter();
    const { runtime, engine } = createRuntime();
    runtime.registerSession(adapter);

    await runtime.startVoice("server-1", "agent-1");
    runtime.onTurnEvent("server-1", "agent-1", "turn_started");
    vi.mocked(engine.play).mockClear();

    runtime.handleAudioOutput(
      "server-1",
      createAudioPayload({
        id: "chunk-0",
        groupId: "group-1",
        chunkIndex: 0,
        isLastChunk: false,
      }),
    );
    await vi.waitFor(() => {
      expect(engine.play).toHaveBeenCalledTimes(1);
    });

    runtime.interruptReply();
    runtime.handleAudioOutput(
      "server-1",
      createAudioPayload({
        id: "chunk-1",
        groupId: "group-1",
        chunkIndex: 1,
        isLastChunk: true,
      }),
    );

    expect(engine.stop).toHaveBeenCalled();
    expect(engine.clearQueue).toHaveBeenCalled();
    expect(adapter.abortRequest).toHaveBeenCalledOnce();
    expect(engine.play).toHaveBeenCalledTimes(1);
    expect(vi.mocked(adapter.audioPlayed).mock.calls.flat()).toContain("chunk-1");
    await vi.advanceTimersByTimeAsync(500);
    runtime.handleCapturePcm(Uint8Array.from([1, 2]));
    expect(adapter.sendVoiceAudioChunk).toHaveBeenLastCalledWith("AQI=", CUE_MIME_TYPE);
    expect(runtime.getSnapshot().phase).toBe("listening");
  });

  it("authoritatively stops and suppresses later voice audio", async () => {
    const adapter = createSessionAdapter();
    const { runtime, engine } = createRuntime();
    runtime.registerSession(adapter);

    await runtime.startVoice("server-1", "agent-1");
    await runtime.stopVoice();

    expect(adapter.setVoiceMode).toHaveBeenLastCalledWith(false);
    expect(engine.stopCapture).toHaveBeenCalled();
    expect(runtime.getSnapshot().phase).toBe("disabled");
    expect(runtime.shouldPlayVoiceAudio("server-1")).toBe(false);
  });

  it("rolls daemon voice mode back when capture fails after enabling it", async () => {
    const adapter = createSessionAdapter();
    const engine = createAudioEngineMock();
    vi.mocked(engine.startCapture).mockRejectedValue(new Error("audio focus unavailable"));
    const { runtime } = createRuntime({ engine });
    runtime.registerSession(adapter);

    await expect(runtime.startVoice("server-1", "agent-1")).rejects.toThrow(
      "audio focus unavailable",
    );

    expect(adapter.setVoiceMode).toHaveBeenNthCalledWith(1, true, "agent-1");
    expect(adapter.setVoiceMode).toHaveBeenNthCalledWith(2, false);
    expect(runtime.getSnapshot().phase).toBe("disabled");
  });

  it("returns an explicit not-ready error when the adapter is missing", async () => {
    const { runtime } = createRuntime();
    await expect(runtime.startVoice("server-1", "agent-1")).rejects.toThrow(
      "Voice runtime is not ready for host server-1",
    );
  });

  it("resyncs voice mode after connection recovers", async () => {
    const adapter = createSessionAdapter();
    const { runtime } = createRuntime();
    runtime.registerSession(adapter);

    await runtime.startVoice("server-1", "agent-1");
    vi.mocked(adapter.setVoiceMode).mockClear();

    runtime.updateSessionConnection("server-1", false);
    runtime.updateSessionConnection("server-1", true);
    await Promise.resolve();

    expect(adapter.setVoiceMode).toHaveBeenCalledWith(true, "agent-1");
  });

  it("does not emit when the snapshot is unchanged", async () => {
    const adapter = createSessionAdapter();
    const { runtime } = createRuntime();
    runtime.registerSession(adapter);
    await runtime.startVoice("server-1", "agent-1");

    const listener = vi.fn();
    const unsubscribe = runtime.subscribe(listener);

    runtime.handleCaptureVolume(0);
    runtime.handleCaptureVolume(0);

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});

describe("Apple local input", () => {
  function createLocalRuntime(assistantEnabled = false) {
    let emit: (event: import("./local-input").LocalVoiceInputEvent) => void = () => {};
    const localInput: import("./local-input").LocalVoiceInput = {
      start: vi.fn(async (_id, _locale, listener) => {
        emit = listener;
      }),
      append: vi.fn(),
      suspend: vi.fn(),
      stop: vi.fn().mockResolvedValue(undefined),
    };
    const serverInfo = createServerInfo();
    serverInfo.features = {
      clientVoiceTranscription: true,
      voiceAssistant: true,
      voiceAssistantEnabled: assistantEnabled,
    };
    serverInfo.capabilities = {
      voice: {
        voice: { enabled: false, reason: "Server ASR missing" },
        dictation: { enabled: false, reason: "Server ASR missing" },
        clientTranscription: { enabled: true, reason: "" },
      },
    };
    const engine = createAudioEngineMock();
    const adapter = {
      ...createSessionAdapter(),
      submitVoiceTranscript: vi.fn().mockResolvedValue(undefined),
    };
    const runtime = createVoiceRuntime({
      engine,
      localInput,
      getServerInfo: () => serverInfo,
      activateKeepAwake: async () => {},
      deactivateKeepAwake: async () => {},
    });
    runtime.registerSession(adapter);
    return {
      runtime,
      localInput,
      adapter,
      engine,
      serverInfo,
      emit: (event: import("./local-input").LocalVoiceInputEvent) => emit(event),
    };
  }

  it("preserves Apple input when the host enables the independent assistant", async () => {
    const { runtime, localInput, adapter } = createLocalRuntime(true);
    await runtime.startVoice("server-1", "agent-1", { source: "apple", locale: "zh-CN" });
    expect(runtime.getSnapshot()).toMatchObject({ inputSource: "apple", isAssistant: false });
    expect(localInput.start).toHaveBeenCalled();
    expect(adapter.setVoiceMode).toHaveBeenCalledWith(true, "agent-1", {
      inputSource: "client",
      inputSessionId: expect.any(String),
    });
    await runtime.destroy();
  });

  it("uses duplex audio for an explicitly opened assistant despite Apple input preferences", async () => {
    const { runtime, localInput, adapter } = createLocalRuntime(true);
    await runtime.startVoice("server-1", "", { source: "apple", locale: "zh-CN" }, true);
    expect(runtime.getSnapshot()).toMatchObject({ inputSource: "server", isAssistant: true });
    expect(localInput.start).not.toHaveBeenCalled();
    expect(adapter.setVoiceMode).toHaveBeenCalledWith(true, "", undefined, true);
    await runtime.destroy();
  });

  it("keeps audio on device, shows partial words, and submits only a final transcript", async () => {
    const { runtime, localInput, adapter, emit } = createLocalRuntime();
    await runtime.startVoice("server-1", "agent-1", { source: "apple", locale: "zh-CN" });
    const pcm = new Uint8Array([1, 2, 3, 4]);
    runtime.handleCapturePcm(pcm);
    expect(localInput.append).toHaveBeenCalledWith(pcm);
    expect(adapter.sendVoiceAudioChunk).not.toHaveBeenCalled();
    emit({ type: "partial", text: "检查" });
    expect(runtime.getSnapshot().lastTranscript).toBe("检查");
    expect(adapter.submitVoiceTranscript).not.toHaveBeenCalled();
    emit({
      type: "final",
      text: "检查文件",
      firstPartialMs: 220,
      finalizationMs: 85,
      endpointMs: 650,
    });
    expect(adapter.submitVoiceTranscript).toHaveBeenCalledWith(expect.any(String), "检查文件");
    expect(runtime.getSnapshot()).toMatchObject({
      inputSource: "apple",
      firstPartialMs: 220,
      finalizationMs: 85,
      endpointMs: 650,
    });
    await runtime.destroy();
  });

  it("discards results while muted, disconnected, playing a reply, or stopped", async () => {
    const { runtime, localInput, adapter, emit, engine } = createLocalRuntime();
    await runtime.startVoice("server-1", "agent-1", { source: "apple", locale: "zh-CN" });
    const final = { type: "final", text: "不应发送", finalizationMs: 10 } as const;
    runtime.onAssistantAudioStarted("server-1");
    expect(localInput.suspend).toHaveBeenLastCalledWith(true);
    emit(final);
    runtime.onAssistantAudioFinished("server-1");
    emit(final); // echo tail
    runtime.toggleMute();
    emit(final);
    vi.mocked(engine.toggleMute).mockReturnValue(false);
    runtime.toggleMute();
    runtime.updateSessionConnection("server-1", false);
    emit(final);
    await runtime.stopVoice();
    emit(final);
    expect(adapter.submitVoiceTranscript).not.toHaveBeenCalled();
    expect(localInput.stop).toHaveBeenCalled();
    await runtime.destroy();
  });

  it("requires host capability and preserves the server audio path by default", async () => {
    const { runtime, engine } = createRuntime();
    const adapter = createSessionAdapter();
    runtime.registerSession(adapter);
    await expect(
      runtime.startVoice("server-1", "agent-1", { source: "apple", locale: "zh-CN" }),
    ).rejects.toThrow(i18n.t("speechSettings.appleUpdateHost"));
    expect(engine.startCapture).not.toHaveBeenCalled();
    await runtime.startVoice("server-1", "agent-1");
    runtime.handleCapturePcm(new Uint8Array(3200));
    expect(adapter.sendVoiceAudioChunk).toHaveBeenCalled();
    await runtime.destroy();
  });

  it("identifies an old host in Chinese even when Apple input is available on the phone", async () => {
    const language = i18n.language;
    const { runtime, engine, localInput, adapter, serverInfo } = createLocalRuntime();
    serverInfo.features = {};
    try {
      await i18n.changeLanguage("zh-CN");
      await expect(
        runtime.startVoice("server-1", "agent-1", { source: "apple", locale: "zh-CN" }),
      ).rejects.toThrow("请更新主机以使用 Apple 本地转写。");
      expect(localInput.start).not.toHaveBeenCalled();
      expect(engine.startCapture).not.toHaveBeenCalled();
      expect(adapter.setVoiceMode).not.toHaveBeenCalled();
    } finally {
      await runtime.destroy();
      await i18n.changeLanguage(language);
    }
  });

  it("reports device requirements when the host supports Apple transcripts", async () => {
    const serverInfo = createServerInfo();
    serverInfo.features = { clientVoiceTranscription: true };
    const { runtime, engine } = createRuntime({ getServerInfo: () => serverInfo });
    const adapter = createSessionAdapter();
    runtime.registerSession(adapter);
    try {
      await expect(
        runtime.startVoice("server-1", "agent-1", { source: "apple", locale: "zh-CN" }),
      ).rejects.toThrow(i18n.t("speechSettings.appleUnavailable"));
      expect(engine.startCapture).not.toHaveBeenCalled();
      expect(adapter.setVoiceMode).not.toHaveBeenCalled();
    } finally {
      await runtime.destroy();
    }
  });

  it("prepares local recognition during the echo tail without feeding speaker audio", async () => {
    const { runtime, localInput, emit, adapter } = createLocalRuntime();
    const clock = vi.spyOn(Date, "now").mockReturnValue(10000);
    try {
      await runtime.startVoice("server-1", "agent-1", { source: "apple", locale: "zh-CN" });
      runtime.onAssistantAudioStarted("server-1");
      expect(localInput.suspend).toHaveBeenLastCalledWith(true);
      runtime.onAssistantAudioFinished("server-1");
      expect(localInput.suspend).toHaveBeenLastCalledWith(false);
      const pcm = new Uint8Array(3200);
      runtime.handleCapturePcm(pcm);
      expect(localInput.suspend).toHaveBeenLastCalledWith(false);
      expect(localInput.append).not.toHaveBeenCalled();
      emit({ type: "final", text: "扬声器尾音", finalizationMs: 10 });
      expect(adapter.submitVoiceTranscript).not.toHaveBeenCalled();
      clock.mockReturnValue(10401);
      runtime.handleCapturePcm(pcm);
      expect(localInput.append).toHaveBeenCalledWith(pcm);
      runtime.onAssistantAudioStarted("server-1");
      runtime.interruptReply();
      expect(localInput.suspend).toHaveBeenLastCalledWith(false);
      runtime.toggleMute();
      runtime.onAssistantAudioFinished("server-1");
      expect(localInput.suspend).toHaveBeenLastCalledWith(true);
    } finally {
      clock.mockRestore();
      await runtime.destroy();
    }
  });

  it("cancels model preparation without enabling capture or submitting late results", async () => {
    const { runtime, localInput, adapter, engine } = createLocalRuntime();
    let finish = () => {};
    let late: (event: import("./local-input").LocalVoiceInputEvent) => void = () => {};
    vi.mocked(localInput.start).mockImplementation(async (_id, _locale, listener) => {
      late = listener;
      listener({ type: "preparing" });
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    const starting = runtime.startVoice("server-1", "agent-1", {
      source: "apple",
      locale: "zh-CN",
    });
    await vi.waitFor(() => expect(runtime.getSnapshot().preparingLocalInput).toBe(true));
    expect(runtime.isVoiceModeForAgent("server-1", "agent-1")).toBe(true);
    await runtime.stopVoice();
    late({ type: "final", text: "迟到的结果", finalizationMs: 20 });
    finish();
    await starting;
    expect(runtime.getSnapshot().phase).toBe("disabled");
    expect(engine.startCapture).not.toHaveBeenCalled();
    expect(adapter.setVoiceMode).not.toHaveBeenCalledWith(
      true,
      expect.anything(),
      expect.anything(),
    );
    expect(adapter.submitVoiceTranscript).not.toHaveBeenCalled();
    await runtime.destroy();
  });

  it("creates a fresh input session after reconnect and ignores the previous recognizer", async () => {
    const { runtime, localInput, adapter, emit } = createLocalRuntime();
    await runtime.startVoice("server-1", "agent-1", { source: "apple", locale: "zh-CN" });
    const [oldId, , oldListener] = vi.mocked(localInput.start).mock.calls[0];
    runtime.updateSessionConnection("server-1", false);
    runtime.updateSessionConnection("server-1", true);
    await vi.waitFor(() => expect(runtime.getSnapshot().isVoiceSwitching).toBe(false));
    const [newId] = vi.mocked(localInput.start).mock.calls[1];
    expect(newId).not.toBe(oldId);
    oldListener({ type: "error", message: "stale error" });
    oldListener({ type: "final", text: "旧识别", finalizationMs: 20 });
    expect(runtime.getSnapshot().inputError).toBeUndefined();
    expect(adapter.submitVoiceTranscript).not.toHaveBeenCalled();
    expect(adapter.setVoiceMode).toHaveBeenLastCalledWith(true, "agent-1", {
      inputSource: "client",
      inputSessionId: newId,
    });
    // Disconnection installs the normal speaker echo tail before capture resumes.
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 1000);
    emit({ type: "final", text: "新识别", finalizationMs: 10 });
    clock.mockRestore();
    expect(adapter.submitVoiceTranscript).toHaveBeenCalledWith(newId, "新识别");
    await runtime.destroy();
  });

  it("keeps a local recognizer error visible and blocks more audio until restart", async () => {
    const { runtime, localInput, emit } = createLocalRuntime();
    await runtime.startVoice("server-1", "agent-1", { source: "apple", locale: "zh-CN" });
    emit({ type: "error", message: "设备模型不可用" });
    runtime.handleCapturePcm(new Uint8Array(3200));
    expect(runtime.getSnapshot()).toMatchObject({
      phase: "recognition_failed",
      inputError: "设备模型不可用",
    });
    expect(localInput.append).not.toHaveBeenCalled();
    expect(localInput.suspend).toHaveBeenLastCalledWith(true);
    await runtime.destroy();
  });
});

describe("Apple turn boundaries and native lifecycle", () => {
  function pcm(milliseconds: number, amplitude = 0): Uint8Array {
    const data = new Uint8Array(milliseconds * 32);
    const view = new DataView(data.buffer);
    for (let index = 0; index < data.byteLength; index += 2) view.setInt16(index, amplitude, true);
    return data;
  }

  it("keeps a thought together across repeated thinking pauses with or without Apple VAD", async () => {
    const { createLocalTurnBoundary } = await import("./local-turn-boundary");
    for (const useDetector of [false, true]) {
      const boundary = createLocalTurnBoundary();
      const phrases = ["我想请你", "告诉我最新做的", "这个功能"];
      for (const [index, phrase] of phrases.entries()) {
        if (useDetector) boundary.activity(true);
        expect(boundary.append(pcm(400, 2000))).toBe(false);
        boundary.transcript(phrases.slice(0, index).join("") + phrase);
        if (useDetector) boundary.activity(false);
        expect(boundary.append(pcm(1500))).toBe(false);
      }
      expect(boundary.append(pcm(400))).toBe(false);
      expect(boundary.append(pcm(100))).toBe(true);
      expect(boundary.getEndpointMs()).toBe(2000);
    }
  });

  it("does not submit noise, tolerate a short pause, and finishes after real text and quiet", async () => {
    const { createLocalTurnBoundary } = await import("./local-turn-boundary");
    const boundary = createLocalTurnBoundary();
    expect(boundary.append(pcm(500, 2000))).toBe(false);
    expect(boundary.append(pcm(1000))).toBe(false);
    expect(boundary.append(pcm(200, 2000))).toBe(false);
    boundary.transcript("检查");
    expect(boundary.append(pcm(500))).toBe(false);
    expect(boundary.append(pcm(200, 2000))).toBe(false);
    boundary.transcript("检查文件");
    expect(boundary.append(pcm(1900))).toBe(false);
    expect(boundary.append(pcm(100))).toBe(true);
  });

  it("waits for revisions and does not let a long initial silence end a new utterance", async () => {
    const { createLocalTurnBoundary } = await import("./local-turn-boundary");
    const boundary = createLocalTurnBoundary();
    boundary.append(pcm(61000));
    boundary.transcript("第一句");
    expect(boundary.append(pcm(1900))).toBe(false);
    boundary.transcript("第一句修正");
    expect(boundary.append(pcm(100))).toBe(false);
    expect(boundary.append(pcm(150))).toBe(true);
    boundary.reset();
    expect(boundary.append(pcm(1000))).toBe(false);
  });

  it("uses Apple VAD to end through loud background noise and retain quiet speech", async () => {
    const { createLocalTurnBoundary } = await import("./local-turn-boundary");
    const boundary = createLocalTurnBoundary();
    boundary.activity(true);
    // Activity without recognized words cannot submit anything.
    expect(boundary.append(pcm(1000, 3000))).toBe(false);
    boundary.transcript("小声说的话");
    expect(boundary.append(pcm(1000, 10))).toBe(false);
    boundary.activity(false);
    expect(boundary.append(pcm(1900, 3000))).toBe(false);
    expect(boundary.append(pcm(100, 3000))).toBe(true);
    boundary.reset();
    boundary.activity(false);
    expect(boundary.append(pcm(1000, 3000))).toBe(false);
  });

  it("counts silence from Apple's audio timeline instead of restarting it on late text", async () => {
    const { createLocalTurnBoundary } = await import("./local-turn-boundary");
    const boundary = createLocalTurnBoundary();
    boundary.activity(true, 0);
    boundary.append(pcm(400, 1000));
    boundary.append(pcm(500));
    // The detector callback arrives late; speech actually ended at 400 ms.
    boundary.activity(false, 400);
    boundary.transcript("检查文件");
    expect(boundary.append(pcm(1400))).toBe(false);
    expect(boundary.append(pcm(100))).toBe(true);
    expect(boundary.getEndpointMs()).toBe(2000);
  });

  it("avoids adding another silence window when Apple supplies no detector events", async () => {
    const { createLocalTurnBoundary } = await import("./local-turn-boundary");
    const boundary = createLocalTurnBoundary();
    boundary.append(pcm(400, 1000));
    boundary.append(pcm(600));
    boundary.transcript("检查文件");
    expect(boundary.append(pcm(1300))).toBe(false);
    expect(boundary.append(pcm(100))).toBe(true);
    expect(boundary.getEndpointMs()).toBe(2000);
  });

  it("keeps short pauses open and ignores an out-of-order detector timestamp", async () => {
    const { createLocalTurnBoundary } = await import("./local-turn-boundary");
    const boundary = createLocalTurnBoundary();
    boundary.activity(true, 0);
    boundary.append(pcm(500, 1000));
    boundary.transcript("检查");
    boundary.activity(false, 500);
    expect(boundary.append(pcm(500))).toBe(false);
    boundary.activity(true, 1000);
    boundary.activity(false, 400);
    expect(boundary.append(pcm(800, 10))).toBe(false);
    boundary.transcript("检查第二个文件");
    boundary.activity(false, 1800);
    expect(boundary.append(pcm(1950))).toBe(false);
    expect(boundary.append(pcm(50))).toBe(true);
  });

  async function sessionHarness() {
    const { createAppleInputSession } = await import("./apple-input-session");
    let receive: (
      event: import("@getpaseo/expo-two-way-audio").AppleSpeechEvent,
    ) => void = () => {};
    const native = {
      startAppleSpeech: vi.fn().mockResolvedValue(undefined),
      appendAppleSpeechAudio: vi.fn(),
      suspendAppleSpeech: vi.fn().mockResolvedValue(undefined),
      stopAppleSpeech: vi.fn().mockResolvedValue(undefined),
      subscribeAppleSpeech: (listener: typeof receive) => {
        receive = listener;
        return { remove: vi.fn() };
      },
    };
    const session = createAppleInputSession(native);
    const events: import("./local-input").LocalVoiceInputEvent[] = [];
    await session.start("apple-1", "zh-CN", (event) => events.push(event));
    return {
      native,
      session,
      events,
      receive: (event: Parameters<typeof receive>[0]) => receive(event),
    };
  }

  it("finalizes one complete Apple utterance after the user resumes a thinking pause", async () => {
    const { session, native, receive, events } = await sessionHarness();
    receive({ type: "ready", sessionId: "apple-1" });
    receive({ type: "activity", sessionId: "apple-1", speechDetected: true });
    session.append(pcm(400, 2000));
    receive({ type: "partial", sessionId: "apple-1", text: "我想请你" });
    receive({ type: "activity", sessionId: "apple-1", speechDetected: false });
    session.append(pcm(1500));
    expect(native.appendAppleSpeechAudio).toHaveBeenLastCalledWith("apple-1", pcm(1500), false);
    receive({ type: "activity", sessionId: "apple-1", speechDetected: true });
    session.append(pcm(400, 2000));
    receive({ type: "partial", sessionId: "apple-1", text: "我想请你介绍最新的功能" });
    receive({ type: "activity", sessionId: "apple-1", speechDetected: false });
    session.append(pcm(1900));
    expect(native.appendAppleSpeechAudio).toHaveBeenLastCalledWith("apple-1", pcm(1900), false);
    session.append(pcm(100));
    expect(native.appendAppleSpeechAudio).toHaveBeenLastCalledWith("apple-1", pcm(100), true);
    receive({
      type: "final",
      sessionId: "apple-1",
      text: "我想请你介绍最新的功能。",
      finalizationMs: 20,
    });
    expect(events.filter((event) => event.type === "final")).toEqual([
      {
        type: "final",
        sessionId: "apple-1",
        text: "我想请你介绍最新的功能。",
        finalizationMs: 20,
        endpointMs: 2000,
      },
    ]);
    await session.stop();
  });

  it("marks an endpoint once and buffers the next utterance until the analyzer is ready", async () => {
    const { session, native, receive, events } = await sessionHarness();
    const start = pcm(100, 2000);
    session.append(start);
    expect(native.appendAppleSpeechAudio).not.toHaveBeenCalled();
    receive({ type: "ready", sessionId: "apple-1" });
    expect(native.appendAppleSpeechAudio).toHaveBeenLastCalledWith("apple-1", start, false);
    receive({ type: "partial", text: "检查文件", sessionId: "apple-1" });
    session.append(pcm(2000));
    expect(native.appendAppleSpeechAudio).toHaveBeenLastCalledWith("apple-1", pcm(2000), true);
    session.append(start);
    expect(native.appendAppleSpeechAudio).toHaveBeenCalledTimes(2);
    receive({ type: "final", text: "检查文件。", finalizationMs: 20, sessionId: "apple-1" });
    receive({ type: "ready", sessionId: "apple-1" });
    expect(native.appendAppleSpeechAudio).toHaveBeenCalledTimes(3);
    expect(native.appendAppleSpeechAudio).toHaveBeenLastCalledWith("apple-1", start, false);
    expect(events.filter((e) => e.type === "final")).toHaveLength(1);
    expect(events.find((e) => e.type === "final")).toMatchObject({ endpointMs: 2000 });
    await session.stop();
  });

  it("routes native VAD into endpointing without exposing detector noise as transcripts", async () => {
    const { session, native, receive, events } = await sessionHarness();
    receive({ type: "ready", sessionId: "apple-1" });
    receive({ type: "activity", sessionId: "apple-1", speechDetected: true });
    receive({ type: "partial", sessionId: "apple-1", text: "小声输入" });
    session.append(pcm(1000, 10));
    expect(native.appendAppleSpeechAudio).toHaveBeenLastCalledWith("apple-1", pcm(1000, 10), false);
    receive({ type: "activity", sessionId: "apple-1", speechDetected: false });
    session.append(pcm(2000, 3000));
    expect(native.appendAppleSpeechAudio).toHaveBeenLastCalledWith(
      "apple-1",
      pcm(2000, 3000),
      true,
    );
    expect(events.map((event) => event.type)).toEqual(["speech", "partial"]);
    await session.stop();
  });

  it("discards Apple transcripts when the detector only reports environmental noise", async () => {
    const { session, native, receive, events } = await sessionHarness();
    receive({ type: "ready", sessionId: "apple-1" });
    receive({ type: "activity", sessionId: "apple-1", speechDetected: false });
    session.append(pcm(200, 3000));
    receive({ type: "partial", sessionId: "apple-1", text: "噪声幻觉" });
    expect(events).toEqual([]);
    session.append(pcm(2000, 3000));
    expect(native.appendAppleSpeechAudio).toHaveBeenLastCalledWith(
      "apple-1",
      pcm(2000, 3000),
      true,
    );
    receive({ type: "final", sessionId: "apple-1", text: "噪声幻觉", finalizationMs: 10 });
    expect(events).toEqual([{ type: "idle" }]);
    await session.stop();
  });

  it("retains a quiet short phrase when Apple speech detection arrives after the text", async () => {
    const { session, receive, events } = await sessionHarness();
    receive({ type: "ready", sessionId: "apple-1" });
    receive({ type: "activity", sessionId: "apple-1", speechDetected: false });
    session.append(pcm(200, 10));
    receive({ type: "partial", sessionId: "apple-1", text: "好" });
    expect(events).toEqual([]);
    receive({ type: "activity", sessionId: "apple-1", speechDetected: true, audioTimeMs: 0 });
    expect(events).toEqual([
      { type: "speech" },
      { type: "partial", sessionId: "apple-1", text: "好" },
    ]);
    receive({ type: "activity", sessionId: "apple-1", speechDetected: false, audioTimeMs: 200 });
    session.append(pcm(2000));
    receive({ type: "final", sessionId: "apple-1", text: "好", finalizationMs: 10 });
    expect(events.at(-1)).toMatchObject({ type: "final", text: "好" });
    await session.stop();
  });

  it("accepts speech evidence drained during Apple finalization and resets it for the next turn", async () => {
    const { session, receive, events } = await sessionHarness();
    receive({ type: "ready", sessionId: "apple-1" });
    receive({ type: "activity", sessionId: "apple-1", speechDetected: false });
    receive({ type: "partial", sessionId: "apple-1", text: "继续" });
    session.append(pcm(2000));
    receive({ type: "activity", sessionId: "apple-1", speechDetected: true });
    receive({ type: "final", sessionId: "apple-1", text: "继续", finalizationMs: 10 });
    expect(events.at(-1)).toMatchObject({ type: "final", text: "继续" });
    receive({ type: "ready", sessionId: "apple-1" });
    receive({ type: "activity", sessionId: "apple-1", speechDetected: false });
    receive({ type: "partial", sessionId: "apple-1", text: "噪声幻觉" });
    session.append(pcm(2000));
    receive({ type: "final", sessionId: "apple-1", text: "噪声幻觉", finalizationMs: 10 });
    expect(events.filter((event) => event.type === "final")).toHaveLength(1);
    expect(events.at(-1)).toEqual({ type: "idle" });
    await session.stop();
  });

  it("clears pending words on mute, drops stale results and stops on excessive buffering", async () => {
    const { session, native, receive, events } = await sessionHarness();
    session.append(pcm(200));
    session.suspend(true);
    receive({ type: "final", sessionId: "apple-1", text: "扬声器声音", finalizationMs: 10 });
    session.suspend(false);
    receive({ type: "ready", sessionId: "apple-1" });
    expect(native.appendAppleSpeechAudio).not.toHaveBeenCalled();
    expect(events).toEqual([]);
    await session.stop();
    await session.start("apple-2", "zh-CN", (e) => events.push(e));
    receive({ type: "final", sessionId: "apple-1", text: "旧会话", finalizationMs: 10 });
    session.append(pcm(2001));
    expect(events).toEqual([{ type: "error", message: expect.stringContaining("keep up") }]);
    expect(native.stopAppleSpeech).toHaveBeenCalledWith("apple-2");
    await session.stop();
  });

  it("discards late native results while a rapid unmute is waiting for suspension", async () => {
    const { session, native, receive, events } = await sessionHarness();
    let suspended = () => {};
    vi.mocked(native.suspendAppleSpeech).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          suspended = resolve;
        }),
    );
    receive({ type: "ready", sessionId: "apple-1" });
    session.suspend(true);
    session.suspend(false);
    await vi.waitFor(() => expect(native.suspendAppleSpeech).toHaveBeenCalledWith("apple-1", true));
    receive({ type: "ready", sessionId: "apple-1" });
    receive({ type: "final", sessionId: "apple-1", text: "静音前的旧声音", finalizationMs: 10 });
    expect(events).toEqual([]);
    suspended();
    await vi.waitFor(() =>
      expect(native.suspendAppleSpeech).toHaveBeenLastCalledWith("apple-1", false),
    );
    receive({ type: "partial", sessionId: "apple-1", text: "准备完成前的旧结果" });
    expect(events).toEqual([]);
    receive({ type: "ready", sessionId: "apple-1" });
    receive({ type: "partial", sessionId: "apple-1", text: "新声音" });
    expect(events).toEqual([
      { type: "speech" },
      { type: "partial", sessionId: "apple-1", text: "新声音" },
    ]);
    await session.stop();
  });
});
