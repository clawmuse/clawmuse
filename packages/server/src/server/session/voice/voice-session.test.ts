import { Readable } from "node:stream";
import type { VoiceSpeakHandler } from "../../voice-types.js";
import { EventEmitter } from "node:events";
import pino from "pino";
import { describe, expect, test, vi } from "vitest";

import { VoiceSession, type VoiceSessionHost } from "./voice-session.js";
import type { ManagedAgent } from "../../agent/agent-manager.js";
import type { SessionOutboundMessage } from "../../messages.js";
import type {
  SpeechToTextProvider,
  TextToSpeechProvider,
  StreamingTranscriptionCommittedEvent,
  StreamingTranscriptionEvent,
  StreamingTranscriptionSession,
} from "../../speech/speech-provider.js";
import type {
  TurnDetectionProvider,
  TurnDetectionSession,
} from "../../speech/turn-detection-provider.js";

const VOICE_AGENT_ID = "11111111-1111-4111-8111-111111111111";

class FakeVoiceTurnDetectionSession extends EventEmitter implements TurnDetectionSession {
  public readonly requiredSampleRate = 16000;

  async connect(): Promise<void> {}

  appendPcm16(_chunk: Buffer): void {}

  flush(): void {}
  reset(): void {}
  close(): void {}
}

class FakeVoiceSttSession extends EventEmitter implements StreamingTranscriptionSession {
  public readonly requiredSampleRate = 16000;
  public commitCount = 0;

  async connect(): Promise<void> {}

  appendPcm16(_pcm16le: Buffer): void {}

  commit(): void {
    this.commitCount += 1;
  }

  clear(): void {}
  close(): void {}

  emitCommitted(event: StreamingTranscriptionCommittedEvent): void {
    this.emit("committed", event);
  }

  emitTranscript(event: StreamingTranscriptionEvent): void {
    this.emit("transcript", event);
  }
}

interface FakeVoiceHost extends VoiceSessionHost {
  readonly emitted: SessionOutboundMessage[];
  readonly spokenInput: Array<{ agentId: string; text: string }>;
}

function createFakeHost(): FakeVoiceHost {
  const emitted: SessionOutboundMessage[] = [];
  const spokenInput: Array<{ agentId: string; text: string }> = [];
  return {
    emitted,
    spokenInput,
    emit: (msg) => {
      emitted.push(msg);
    },
    loadAgent: async (agentId) =>
      ({ id: agentId, config: { systemPrompt: undefined } }) as unknown as ManagedAgent,
    reloadAgentSession: async (agentId) => ({ id: agentId }) as unknown as ManagedAgent,
    sendSpokenInput: async (agentId, text) => {
      spokenInput.push({ agentId, text });
    },
    interruptAgentIfRunning: async () => {},
    hasActiveAgentRun: () => false,
  };
}

function createVoiceSession(tts: TextToSpeechProvider | null = null) {
  let speakHandler: VoiceSpeakHandler | undefined;
  const detector = new FakeVoiceTurnDetectionSession();
  const sttSession = new FakeVoiceSttSession();
  const stt: SpeechToTextProvider = {
    id: "local",
    createSession: vi.fn(() => sttSession),
  };
  const turnDetection: TurnDetectionProvider = {
    id: "local",
    createSession: vi.fn(() => detector),
  };
  const host = createFakeHost();
  const voiceSession = new VoiceSession({
    host,
    logger: pino({ level: "silent" }),
    sessionId: "voice-session-test",
    sttLanguage: "en",
    tts,
    voiceBridge: {
      registerVoiceSpeakHandler: (_id, handler) => {
        speakHandler = handler;
      },
    },
    stt,
    voice: { turnDetection },
  });
  return {
    voiceSession,
    detector,
    sttSession,
    host,
    speak: (args: Parameters<VoiceSpeakHandler>[0]) => {
      if (!speakHandler) throw new Error("Voice speak handler not registered");
      return speakHandler(args);
    },
  };
}

function isAudioOutput(message: SessionOutboundMessage): boolean {
  return message.type === "audio_output";
}

async function waitForAudioOutput(host: FakeVoiceHost): Promise<void> {
  await vi.waitFor(() => expect(host.emitted.filter(isAudioOutput)).toHaveLength(1));
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("VoiceSession streaming transcription", () => {
  test("publishes an actionable failure instead of silently sending an empty turn", async () => {
    const { voiceSession, detector, sttSession, host } = createVoiceSession();
    await voiceSession.handleSetVoiceMode(true, VOICE_AGENT_ID);
    detector.emit("speech_started");
    await settle();
    detector.emit("speech_stopped");
    await settle();
    sttSession.emitCommitted({ segmentId: "failed", previousSegmentId: null });
    sttSession.emit("error", new TypeError("fetch failed"));
    await settle();
    expect(host.emitted).toContainEqual({
      type: "voice_input_state",
      payload: { isSpeaking: false, status: "recognition_failed" },
    });
    expect(host.spokenInput).toEqual([]);
    expect(host.emitted.filter((message) => message.type === "transcription_result")).toEqual([]);
    await voiceSession.cleanup();
  });

  test("keeps the agent running when speech is detected but no words are known yet", async () => {
    const tts: TextToSpeechProvider = {
      async synthesizeSpeech() {
        return { stream: Readable.from([Buffer.from("audio")]), format: "pcm;rate=24000" };
      },
    };
    const { voiceSession, detector, host, speak } = createVoiceSession(tts);
    const interrupted: string[] = [];
    async function recordInterruption(agentId: string) {
      interrupted.push(agentId);
    }
    host.interruptAgentIfRunning = recordInterruption;
    await voiceSession.handleSetVoiceMode(true, VOICE_AGENT_ID);
    const playback = speak({ text: "A spoken response." });
    try {
      await waitForAudioOutput(host);
      detector.emit("speech_started");
      await settle();
      expect(host.emitted).toContainEqual({
        type: "voice_input_state",
        payload: { isSpeaking: true, status: "speaking" },
      });
      expect(interrupted).toEqual([]);
      // Playback is not cut short either: it finishes once the client reports it played.
      const audio = host.emitted.find(isAudioOutput);
      if (audio?.type !== "audio_output") throw new Error("audio_output was not emitted");
      voiceSession.handleAudioPlayed(audio.payload.id);
      await playback;
      expect(interrupted).toEqual([]);
    } finally {
      await voiceSession.cleanup();
      await playback.catch(() => {});
    }
  });

  test("session abort stops later audio even when the speak tool supplies its own signal", async () => {
    const tts: TextToSpeechProvider = {
      async synthesizeSpeech() {
        return { stream: Readable.from([Buffer.from("audio")]), format: "pcm;rate=24000" };
      },
    };
    const { voiceSession, host, speak } = createVoiceSession(tts);
    const external = new AbortController();
    let abortRequested = false;
    const emit = host.emit;
    function acknowledgeLaterAudio(message: SessionOutboundMessage) {
      emit(message);
      if (message.type === "audio_output" && abortRequested)
        voiceSession.handleAudioPlayed(message.payload.id);
    }
    host.emit = acknowledgeLaterAudio;
    await voiceSession.handleSetVoiceMode(true, VOICE_AGENT_ID);
    const playback = speak({
      text: "First sentence. Second sentence. Third sentence.",
      signal: external.signal,
    });
    try {
      await waitForAudioOutput(host);
      abortRequested = true;
      await voiceSession.handleAbort();
      await playback;
      expect(host.emitted.filter(isAudioOutput)).toHaveLength(1);
      expect(external.signal.aborted).toBe(false);
    } finally {
      external.abort();
      await voiceSession.cleanup();
      await playback.catch(() => {});
    }
  });

  test("surfaces a refused voice-mode agent interruption", async () => {
    const { voiceSession, host } = createVoiceSession();
    host.interruptAgentIfRunning = vi.fn(async () => {
      throw new Error("active run cancellation was not acknowledged");
    });

    await voiceSession.handleSetVoiceMode(true, VOICE_AGENT_ID);

    await expect(voiceSession.handleAbort()).rejects.toThrow(
      "active run cancellation was not acknowledged",
    );
    expect(host.interruptAgentIfRunning).toHaveBeenCalledWith(VOICE_AGENT_ID);
    expect(host.emitted).toContainEqual(
      expect.objectContaining({
        type: "activity_log",
        payload: expect.objectContaining({
          type: "error",
          content: "Voice interruption failed: active run cancellation was not acknowledged",
          metadata: { voiceAbortFailed: true },
        }),
      }),
    );

    await voiceSession.cleanup();
  });

  test("keeps the selected agent and model while delivering the final transcript exactly once", async () => {
    const { voiceSession, detector, sttSession, host } = createVoiceSession();
    const interrupt = vi.fn(async () => {});
    host.interruptAgentIfRunning = interrupt;
    const reload = vi.spyOn(host, "reloadAgentSession");

    await voiceSession.handleSetVoiceMode(true, VOICE_AGENT_ID);
    expect(reload).toHaveBeenCalledExactlyOnceWith(VOICE_AGENT_ID, {
      systemPrompt: expect.stringContaining("<paseo_voice_mode>"),
    });
    detector.emit("speech_started");
    await settle();
    detector.emit("speech_stopped");
    await settle();
    sttSession.emitCommitted({ segmentId: "segment-1", previousSegmentId: null });
    sttSession.emitTranscript({
      segmentId: "segment-1",
      transcript: "请使用当前模型继续回答",
      isFinal: true,
      language: "zh",
      avgLogprob: -0.1,
      isLowConfidence: false,
    });
    await settle();

    expect(sttSession.commitCount).toBe(1);
    expect(host.spokenInput).toEqual([{ agentId: VOICE_AGENT_ID, text: "请使用当前模型继续回答" }]);
    expect(interrupt).not.toHaveBeenCalled();
    expect(host.emitted).toContainEqual(
      expect.objectContaining({
        type: "transcription_result",
        payload: expect.objectContaining({
          text: "请使用当前模型继续回答",
          language: "zh",
          avgLogprob: -0.1,
        }),
      }),
    );

    await voiceSession.cleanup();
  });

  test("cancels the agent run on a spoken stop command and still delivers the words", async () => {
    const { voiceSession, detector, sttSession, host } = createVoiceSession();
    const interrupt = vi.fn(async () => {});
    host.interruptAgentIfRunning = interrupt;

    await voiceSession.handleSetVoiceMode(true, VOICE_AGENT_ID);
    detector.emit("speech_started");
    await settle();
    expect(interrupt).not.toHaveBeenCalled();
    detector.emit("speech_stopped");
    await settle();
    sttSession.emitCommitted({ segmentId: "segment-1", previousSegmentId: null });
    sttSession.emitTranscript({
      segmentId: "segment-1",
      transcript: "停下。",
      isFinal: true,
      language: "zh",
      avgLogprob: -0.1,
      isLowConfidence: false,
    });
    await settle();

    expect(interrupt).toHaveBeenCalledWith(VOICE_AGENT_ID);
    expect(host.spokenInput).toEqual([{ agentId: VOICE_AGENT_ID, text: "停下。" }]);

    await voiceSession.cleanup();
  });

  test("still delivers a stop command when the cancellation is refused", async () => {
    const { voiceSession, detector, sttSession, host } = createVoiceSession();
    host.interruptAgentIfRunning = vi.fn(async () => {
      throw new Error("active run cancellation was not acknowledged");
    });

    await voiceSession.handleSetVoiceMode(true, VOICE_AGENT_ID);
    detector.emit("speech_started");
    await settle();
    detector.emit("speech_stopped");
    await settle();
    sttSession.emitCommitted({ segmentId: "segment-1", previousSegmentId: null });
    sttSession.emitTranscript({
      segmentId: "segment-1",
      transcript: "stop",
      isFinal: true,
      language: "en",
      avgLogprob: -0.1,
      isLowConfidence: false,
    });
    await settle();

    expect(host.spokenInput).toEqual([{ agentId: VOICE_AGENT_ID, text: "stop" }]);

    await voiceSession.cleanup();
  });

  test("shows a recognition failure on finalization timeout without submitting to the agent", async () => {
    vi.useFakeTimers();
    try {
      const { voiceSession, detector, sttSession, host } = createVoiceSession();

      await voiceSession.handleSetVoiceMode(true, VOICE_AGENT_ID);
      detector.emit("speech_started");
      await settle();
      detector.emit("speech_stopped");
      await settle();
      sttSession.emitCommitted({ segmentId: "segment-1", previousSegmentId: null });

      await vi.advanceTimersByTimeAsync(65_000);
      await settle();

      expect(host.spokenInput).toEqual([]);
      expect(host.emitted).toContainEqual(
        expect.objectContaining({
          type: "voice_input_state",
          payload: { isSpeaking: false, status: "recognition_failed" },
        }),
      );

      await voiceSession.cleanup();
    } finally {
      vi.useRealTimers();
    }
  });

  test("filters a low-confidence streaming final without submitting to the agent", async () => {
    const { voiceSession, detector, sttSession, host } = createVoiceSession();
    const interrupt = vi.fn(async () => {});
    host.interruptAgentIfRunning = interrupt;

    await voiceSession.handleSetVoiceMode(true, VOICE_AGENT_ID);
    detector.emit("speech_started");
    await settle();
    detector.emit("speech_stopped");
    await settle();
    sttSession.emitCommitted({ segmentId: "segment-1", previousSegmentId: null });
    sttSession.emitTranscript({
      segmentId: "segment-1",
      transcript: "background noise",
      isFinal: true,
      avgLogprob: -2.5,
      isLowConfidence: true,
    });
    await settle();

    expect(host.spokenInput).toEqual([]);
    expect(interrupt).not.toHaveBeenCalled();
    expect(host.emitted).toContainEqual(
      expect.objectContaining({
        type: "transcription_result",
        payload: expect.objectContaining({
          text: "",
          avgLogprob: -2.5,
          isLowConfidence: true,
        }),
      }),
    );

    await voiceSession.cleanup();
  });
});

describe("client-side voice transcription", () => {
  function createClientVoice() {
    const host = createFakeHost();
    const voice = new VoiceSession({
      host,
      logger: pino({ level: "silent" }),
      sessionId: "client-voice",
      stt: null,
      tts: null,
    });
    const message = {
      type: "voice.input.submit_transcript.request" as const,
      requestId: "turn-1",
      inputSessionId: "apple-1",
      text: "检查这个文件",
    };
    return { host, voice, message };
  }

  test("submits spoken input without server STT or VAD and deduplicates concurrent deliveries", async () => {
    const { host, voice, message } = createClientVoice();
    await voice.handleSetVoiceMode(true, VOICE_AGENT_ID, "start", "client", "apple-1");
    await Promise.all([
      voice.handleClientTranscript(message),
      voice.handleClientTranscript(message),
    ]);
    expect(host.spokenInput).toEqual([{ agentId: VOICE_AGENT_ID, text: message.text }]);
    expect(host.emitted.filter((m) => m.type === "voice.input.submit_transcript.response")).toEqual(
      [
        {
          type: "voice.input.submit_transcript.response",
          payload: { requestId: "turn-1", accepted: true, error: null },
        },
        {
          type: "voice.input.submit_transcript.response",
          payload: { requestId: "turn-1", accepted: true, error: null },
        },
      ],
    );
    await voice.cleanup();
  });

  test("rejects transcripts before enable, from an old session, and after disable", async () => {
    const { host, voice, message } = createClientVoice();
    await voice.handleClientTranscript(message);
    await voice.handleSetVoiceMode(true, VOICE_AGENT_ID, "start", "client", "apple-2");
    await voice.handleClientTranscript(message);
    await voice.handleSetVoiceMode(false);
    await voice.handleClientTranscript({ ...message, inputSessionId: "apple-2" });
    expect(host.spokenInput).toEqual([]);
    const responses = host.emitted.filter(
      (m) => m.type === "voice.input.submit_transcript.response",
    );
    expect(responses).toHaveLength(3);
    expect(responses.every((m) => !m.payload.accepted)).toBe(true);
    await voice.cleanup();
  });

  test("returns failed submission instead of acknowledging success or retrying it", async () => {
    const { host, voice, message } = createClientVoice();
    host.sendSpokenInput = vi.fn().mockRejectedValue(new Error("Agent unavailable"));
    await voice.handleSetVoiceMode(true, VOICE_AGENT_ID, "start", "client", "apple-1");
    await voice.handleClientTranscript(message);
    await voice.handleClientTranscript(message);
    expect(host.sendSpokenInput).toHaveBeenCalledTimes(1);
    expect(host.emitted.at(-1)).toEqual({
      type: "voice.input.submit_transcript.response",
      payload: { requestId: "turn-1", accepted: false, error: "Agent unavailable" },
    });
    await voice.cleanup();
  });
});
