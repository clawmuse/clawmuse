import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import pino from "pino";

import type {
  SpeechToTextProvider,
  StreamingTranscriptionCommittedEvent,
  StreamingTranscriptionEvent,
  StreamingTranscriptionSession,
} from "../../speech/speech-provider.js";
import type {
  TurnDetectionProvider,
  TurnDetectionSession,
} from "../../speech/turn-detection-provider.js";
import { createVoiceTurnController } from "./voice-turn-controller.js";

class FakeTurnDetectionSession extends EventEmitter implements TurnDetectionSession {
  public readonly requiredSampleRate = 16000;
  public readonly appendedChunks: Buffer[] = [];

  async connect(): Promise<void> {}

  appendPcm16(chunk: Buffer): void {
    this.appendedChunks.push(chunk);
  }

  flush(): void {}
  reset(): void {}
  close(): void {}
}

class FakeSttSession extends EventEmitter implements StreamingTranscriptionSession {
  public readonly requiredSampleRate: number;
  public readonly appendedChunks: Buffer[] = [];
  public connectCount = 0;
  public closeCount = 0;
  public commitCount = 0;

  constructor(requiredSampleRate = 16000) {
    super();
    this.requiredSampleRate = requiredSampleRate;
  }

  async connect(): Promise<void> {
    this.connectCount += 1;
  }

  appendPcm16(chunk: Buffer): void {
    this.appendedChunks.push(chunk);
  }

  commit(): void {
    this.commitCount += 1;
  }

  clear(): void {}

  close(): void {
    this.closeCount += 1;
  }

  emitTranscript(event: StreamingTranscriptionEvent): void {
    this.emit("transcript", event);
  }

  emitCommitted(event: StreamingTranscriptionCommittedEvent): void {
    this.emit("committed", event);
  }

  emitError(error: unknown): void {
    this.emit("error", error);
  }
}

function createFakeTurnDetectionProvider(session: FakeTurnDetectionSession): TurnDetectionProvider {
  return {
    id: "local",
    createSession() {
      return session;
    },
  };
}

function createFakeSttProvider(
  sessions: FakeSttSession[],
  captureLanguage?: (language: string | undefined) => void,
): SpeechToTextProvider {
  return {
    id: "local",
    createSession(params) {
      captureLanguage?.(params.language);
      const session = new FakeSttSession();
      sessions.push(session);
      return session;
    },
  };
}

async function settleSerialQueue(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function createControllerHarness(options?: { sttLanguage?: string }) {
  const detector = new FakeTurnDetectionSession();
  const sttSessions: FakeSttSession[] = [];
  let lastSttLanguage: string | undefined;
  const stt = createFakeSttProvider(sttSessions, (language) => {
    lastSttLanguage = language;
  });
  const onSpeechStarted = vi.fn(async () => {});
  const onSpeechStopped = vi.fn(async () => {});
  const onPartialTranscript = vi.fn(
    async (_input: { segmentId: string; transcript: string }) => {},
  );
  const onFinalTranscript = vi.fn(
    async (_input: {
      segmentId: string;
      transcript: string;
      language?: string;
      avgLogprob?: number;
      isLowConfidence?: boolean;
      durationMs: number;
    }) => {},
  );
  const onError = vi.fn();

  const controller = createVoiceTurnController({
    logger: pino({ level: "silent" }),
    turnDetection: createFakeTurnDetectionProvider(detector),
    stt,
    sttLanguage: options?.sttLanguage,
    callbacks: {
      onSpeechStarted,
      onSpeechStopped,
      onPartialTranscript,
      onFinalTranscript,
      onError,
    },
  });

  return {
    controller,
    detector,
    sttSessions,
    getLastSttLanguage: () => lastSttLanguage,
    onSpeechStarted,
    onSpeechStopped,
    onPartialTranscript,
    onFinalTranscript,
    onError,
  };
}

describe("voice turn controller", () => {
  it("passes configured language to streaming STT", async () => {
    const harness = createControllerHarness({ sttLanguage: "pt" });

    await harness.controller.start();
    harness.detector.emit("speech_started");
    await settleSerialQueue();

    expect(harness.getLastSttLanguage()).toBe("pt");
  });

  it("forwards audio to the detector and streaming STT without submitting buffered utterances", async () => {
    const harness = createControllerHarness();

    await harness.controller.start();
    await harness.controller.appendClientChunk({
      audioBase64: Buffer.from([1, 2, 3, 4]).toString("base64"),
      format: "audio/pcm;rate=16000;bits=16",
    });
    harness.detector.emit("speech_started");
    await settleSerialQueue();
    await harness.controller.appendClientChunk({
      audioBase64: Buffer.from([5, 6, 7, 8]).toString("base64"),
      format: "audio/pcm;rate=16000;bits=16",
    });
    harness.detector.emit("speech_stopped");
    await settleSerialQueue();

    expect(harness.detector.appendedChunks).toEqual([
      Buffer.from([1, 2, 3, 4]),
      Buffer.from([5, 6, 7, 8]),
    ]);
    expect(harness.sttSessions[0]?.appendedChunks).toEqual([
      Buffer.from([1, 2, 3, 4]),
      Buffer.from([5, 6, 7, 8]),
    ]);
    expect(harness.onSpeechStarted).toHaveBeenCalledTimes(1);
    expect(harness.onSpeechStopped).toHaveBeenCalledTimes(1);
    expect(harness.onFinalTranscript).not.toHaveBeenCalled();
    expect(harness.onError).not.toHaveBeenCalled();
  });

  it("does not barge in on silence-only chunks", async () => {
    const harness = createControllerHarness();

    await harness.controller.start();
    await harness.controller.appendClientChunk({
      audioBase64: Buffer.from([0, 0, 0, 0]).toString("base64"),
      format: "audio/pcm;rate=16000;bits=16",
    });
    await harness.controller.appendClientChunk({
      audioBase64: Buffer.from([0, 0, 0, 0]).toString("base64"),
      format: "audio/pcm;rate=16000;bits=16",
    });
    await settleSerialQueue();

    expect(harness.detector.appendedChunks).toEqual([
      Buffer.from([0, 0, 0, 0]),
      Buffer.from([0, 0, 0, 0]),
    ]);
    expect(harness.onSpeechStarted).not.toHaveBeenCalled();
    expect(harness.onSpeechStopped).not.toHaveBeenCalled();
    expect(harness.onFinalTranscript).not.toHaveBeenCalled();
    expect(harness.onError).not.toHaveBeenCalled();
  });

  it("fires onPartialTranscript exactly once for the first non-empty partial in a turn", async () => {
    const harness = createControllerHarness();

    await harness.controller.start();
    harness.detector.emit("speech_started");
    await settleSerialQueue();

    harness.sttSessions[0]?.emitTranscript({
      segmentId: "segment-1",
      transcript: "hello",
      isFinal: false,
    });
    await settleSerialQueue();
    harness.sttSessions[0]?.emitTranscript({
      segmentId: "segment-1",
      transcript: "hello again",
      isFinal: false,
    });
    await settleSerialQueue();

    expect(harness.onPartialTranscript).toHaveBeenCalledTimes(1);
    expect(harness.onPartialTranscript).toHaveBeenCalledWith({
      segmentId: "segment-1",
      transcript: "hello",
    });
  });

  it("does not fire onPartialTranscript for filler-only partials, but fires once the partial grows past the filler", async () => {
    const harness = createControllerHarness();

    await harness.controller.start();
    harness.detector.emit("speech_started");
    await settleSerialQueue();

    for (const transcript of ["uh", "uh,", "Um", "uh um", "hmm"]) {
      harness.sttSessions[0]?.emitTranscript({
        segmentId: "segment-1",
        transcript,
        isFinal: false,
      });
      await settleSerialQueue();
    }

    expect(harness.onPartialTranscript).not.toHaveBeenCalled();

    harness.sttSessions[0]?.emitTranscript({
      segmentId: "segment-1",
      transcript: "uh hello",
      isFinal: false,
    });
    await settleSerialQueue();

    expect(harness.onPartialTranscript).toHaveBeenCalledTimes(1);
    expect(harness.onPartialTranscript).toHaveBeenCalledWith({
      segmentId: "segment-1",
      transcript: "uh hello",
    });
  });

  it("does not fire onPartialTranscript for empty or whitespace-only partials", async () => {
    const harness = createControllerHarness();

    await harness.controller.start();
    harness.detector.emit("speech_started");
    await settleSerialQueue();

    harness.sttSessions[0]?.emitTranscript({
      segmentId: "segment-1",
      transcript: "",
      isFinal: false,
    });
    harness.sttSessions[0]?.emitTranscript({
      segmentId: "segment-1",
      transcript: "   ",
      isFinal: false,
    });
    harness.sttSessions[0]?.emitTranscript({
      segmentId: "segment-1",
      transcript: "ignored final",
      isFinal: true,
    });
    await settleSerialQueue();

    expect(harness.onPartialTranscript).not.toHaveBeenCalled();
  });

  it("does not fire onPartialTranscript from VAD speech_started alone", async () => {
    vi.useFakeTimers();
    try {
      const harness = createControllerHarness();

      await harness.controller.start();
      harness.detector.emit("speech_started");
      await settleSerialQueue();

      await vi.advanceTimersByTimeAsync(5_000);
      await settleSerialQueue();

      expect(harness.onSpeechStarted).toHaveBeenCalledTimes(1);
      expect(harness.onPartialTranscript).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("commits the streaming STT segment when speech stops", async () => {
    const harness = createControllerHarness();

    await harness.controller.start();
    harness.detector.emit("speech_started");
    await settleSerialQueue();
    harness.detector.emit("speech_stopped");
    await settleSerialQueue();

    expect(harness.sttSessions[0]?.commitCount).toBe(1);
  });

  it("fires onFinalTranscript after speech stop, commit, and final transcript", async () => {
    const harness = createControllerHarness();

    await harness.controller.start();
    harness.detector.emit("speech_started");
    await settleSerialQueue();
    harness.detector.emit("speech_stopped");
    await settleSerialQueue();

    harness.sttSessions[0]?.emitCommitted({ segmentId: "segment-1", previousSegmentId: null });
    harness.sttSessions[0]?.emitTranscript({
      segmentId: "segment-1",
      transcript: "  hello there  ",
      isFinal: true,
      language: "en",
      avgLogprob: -0.2,
      isLowConfidence: false,
    });
    await settleSerialQueue();

    expect(harness.onFinalTranscript).toHaveBeenCalledTimes(1);
    expect(harness.onFinalTranscript).toHaveBeenCalledWith(
      expect.objectContaining({
        segmentId: "segment-1",
        transcript: "hello there",
        language: "en",
        avgLogprob: -0.2,
        durationMs: expect.any(Number),
      }),
    );
  });

  it("assembles multiple committed final transcripts in commit order", async () => {
    const harness = createControllerHarness();

    await harness.controller.start();
    harness.detector.emit("speech_started");
    await settleSerialQueue();
    harness.detector.emit("speech_stopped");
    await settleSerialQueue();

    harness.sttSessions[0]?.emitCommitted({ segmentId: "segment-1", previousSegmentId: null });
    harness.sttSessions[0]?.emitCommitted({
      segmentId: "segment-2",
      previousSegmentId: "segment-1",
    });
    harness.sttSessions[0]?.emitTranscript({
      segmentId: "segment-2",
      transcript: " world ",
      isFinal: true,
    });
    harness.sttSessions[0]?.emitTranscript({
      segmentId: "segment-1",
      transcript: " hello ",
      isFinal: true,
    });
    await settleSerialQueue();

    expect(harness.onFinalTranscript).toHaveBeenCalledTimes(1);
    expect(harness.onFinalTranscript).toHaveBeenCalledWith(
      expect.objectContaining({
        segmentId: "segment-1",
        transcript: "hello world",
      }),
    );
  });

  it("excludes low-confidence noise from a turn while retaining segments without confidence metadata", async () => {
    const harness = createControllerHarness();
    await harness.controller.start();
    harness.detector.emit("speech_started");
    await settleSerialQueue();
    harness.detector.emit("speech_stopped");
    await settleSerialQueue();
    const stt = harness.sttSessions[0];
    stt?.emitCommitted({ segmentId: "speech", previousSegmentId: null });
    stt?.emitCommitted({ segmentId: "noise", previousSegmentId: "speech" });
    stt?.emitCommitted({ segmentId: "quiet", previousSegmentId: "noise" });
    stt?.emitTranscript({
      segmentId: "noise",
      transcript: "感谢观看",
      isFinal: true,
      isLowConfidence: true,
    });
    stt?.emitTranscript({
      segmentId: "speech",
      transcript: "检查",
      isFinal: true,
      isLowConfidence: false,
    });
    stt?.emitTranscript({ segmentId: "quiet", transcript: "文件", isFinal: true });
    await settleSerialQueue();
    expect(harness.onFinalTranscript).toHaveBeenCalledWith(
      expect.objectContaining({ transcript: "检查文件" }),
    );
    expect(harness.onFinalTranscript.mock.calls[0]?.[0].isLowConfidence).not.toBe(true);
    await harness.controller.stop();
  });

  it("returns an empty low-confidence turn when every segment is rejected", async () => {
    const harness = createControllerHarness();
    await harness.controller.start();
    harness.detector.emit("speech_started");
    await settleSerialQueue();
    harness.detector.emit("speech_stopped");
    await settleSerialQueue();
    const stt = harness.sttSessions[0];
    stt?.emitCommitted({ segmentId: "noise", previousSegmentId: null });
    stt?.emitTranscript({
      segmentId: "noise",
      transcript: "感谢观看",
      isFinal: true,
      isLowConfidence: true,
    });
    await settleSerialQueue();
    expect(harness.onFinalTranscript).toHaveBeenCalledWith(
      expect.objectContaining({ transcript: "", isLowConfidence: true }),
    );
    await harness.controller.stop();
  });

  it("keeps earlier sentences when speech resumes before their transcript arrives", async () => {
    const harness = createControllerHarness();
    const stt = () => harness.sttSessions[0];

    await harness.controller.start();
    // 第一句：说完停顿，提交识别
    harness.detector.emit("speech_started");
    await settleSerialQueue();
    harness.detector.emit("speech_stopped");
    await settleSerialQueue();
    stt()?.emitCommitted({ segmentId: "segment-1", previousSegmentId: null });

    // 识别结果还没回来，人又接着说了
    harness.detector.emit("speech_started");
    await settleSerialQueue();
    stt()?.emitTranscript({ segmentId: "segment-1", transcript: "第一句。", isFinal: true });
    await settleSerialQueue();
    // 还在说话，不能先把半截发出去
    expect(harness.onFinalTranscript).not.toHaveBeenCalled();

    harness.detector.emit("speech_stopped");
    await settleSerialQueue();
    stt()?.emitCommitted({ segmentId: "segment-2", previousSegmentId: "segment-1" });

    harness.detector.emit("speech_started");
    await settleSerialQueue();
    harness.detector.emit("speech_stopped");
    await settleSerialQueue();
    stt()?.emitCommitted({ segmentId: "segment-3", previousSegmentId: "segment-2" });

    stt()?.emitTranscript({ segmentId: "segment-3", transcript: "最后一句。", isFinal: true });
    stt()?.emitTranscript({ segmentId: "segment-2", transcript: "第二句，", isFinal: true });
    await settleSerialQueue();

    expect(harness.onFinalTranscript).toHaveBeenCalledTimes(1);
    expect(harness.onFinalTranscript).toHaveBeenCalledWith(
      expect.objectContaining({ segmentId: "segment-1", transcript: "第一句。第二句，最后一句。" }),
    );
  });

  it("re-arms the finalization timeout only after the resumed speech stops", async () => {
    vi.useFakeTimers();
    try {
      const harness = createControllerHarness();

      await harness.controller.start();
      harness.detector.emit("speech_started");
      await settleSerialQueue();
      harness.detector.emit("speech_stopped");
      await settleSerialQueue();
      harness.sttSessions[0]?.emitCommitted({ segmentId: "segment-1", previousSegmentId: null });

      harness.detector.emit("speech_started");
      await settleSerialQueue();
      // 一句话说了很久：上一句的识别超时不能在说话中途把它发出去
      await vi.advanceTimersByTimeAsync(70_000);
      expect(harness.onFinalTranscript).not.toHaveBeenCalled();

      harness.detector.emit("speech_stopped");
      await settleSerialQueue();
      harness.sttSessions[0]?.emitCommitted({
        segmentId: "segment-2",
        previousSegmentId: "segment-1",
      });
      harness.sttSessions[0]?.emitTranscript({
        segmentId: "segment-2",
        transcript: "后半句",
        isFinal: true,
      });
      await vi.advanceTimersByTimeAsync(65_000);
      await settleSerialQueue();

      expect(harness.onFinalTranscript).not.toHaveBeenCalled();
      expect(harness.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Speech recognition timed out before all segments completed",
        }),
      );
      await harness.controller.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("separates latin segments with a space and keeps CJK segments tight", async () => {
    const harness = createControllerHarness();

    await harness.controller.start();
    harness.detector.emit("speech_started");
    await settleSerialQueue();
    harness.detector.emit("speech_stopped");
    await settleSerialQueue();
    const stt = harness.sttSessions[0];
    stt?.emitCommitted({ segmentId: "s1", previousSegmentId: null });
    stt?.emitCommitted({ segmentId: "s2", previousSegmentId: "s1" });
    stt?.emitCommitted({ segmentId: "s3", previousSegmentId: "s2" });
    stt?.emitTranscript({ segmentId: "s1", transcript: "部署到 Dokploy", isFinal: true });
    stt?.emitTranscript({ segmentId: "s2", transcript: "then check", isFinal: true });
    stt?.emitTranscript({ segmentId: "s3", transcript: "状态", isFinal: true });
    await settleSerialQueue();

    expect(harness.onFinalTranscript).toHaveBeenCalledWith(
      expect.objectContaining({ transcript: "部署到 Dokploy then check状态" }),
    );
  });

  it("reports a timeout instead of submitting an incomplete utterance", async () => {
    vi.useFakeTimers();
    try {
      const harness = createControllerHarness();

      await harness.controller.start();
      harness.detector.emit("speech_started");
      await settleSerialQueue();
      harness.detector.emit("speech_stopped");
      await settleSerialQueue();

      harness.sttSessions[0]?.emitCommitted({ segmentId: "segment-1", previousSegmentId: null });
      harness.sttSessions[0]?.emitCommitted({
        segmentId: "segment-2",
        previousSegmentId: "segment-1",
      });
      harness.sttSessions[0]?.emitTranscript({
        segmentId: "segment-1",
        transcript: "hello",
        isFinal: true,
      });

      await vi.advanceTimersByTimeAsync(65_000);
      await settleSerialQueue();

      expect(harness.onFinalTranscript).not.toHaveBeenCalled();
      expect(harness.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Speech recognition timed out before all segments completed",
        }),
      );
      await harness.controller.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not include stale uncommitted finals once committed segments are known", async () => {
    vi.useFakeTimers();
    try {
      const harness = createControllerHarness();

      await harness.controller.start();
      harness.detector.emit("speech_started");
      await settleSerialQueue();
      harness.detector.emit("speech_stopped");
      await settleSerialQueue();

      harness.sttSessions[0]?.emitTranscript({
        segmentId: "stale-segment",
        transcript: "stale text",
        isFinal: true,
      });
      harness.sttSessions[0]?.emitCommitted({ segmentId: "segment-1", previousSegmentId: null });
      harness.sttSessions[0]?.emitCommitted({
        segmentId: "segment-2",
        previousSegmentId: "segment-1",
      });
      harness.sttSessions[0]?.emitTranscript({
        segmentId: "segment-1",
        transcript: "fresh text",
        isFinal: true,
      });

      harness.sttSessions[0]?.emitTranscript({
        segmentId: "segment-2",
        transcript: "only",
        isFinal: true,
      });
      await settleSerialQueue();

      expect(harness.onFinalTranscript).toHaveBeenCalledWith(
        expect.objectContaining({ transcript: "fresh text only" }),
      );
      expect(harness.onError).not.toHaveBeenCalled();
      await harness.controller.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a timeout instead of silently dropping a partial-only utterance", async () => {
    vi.useFakeTimers();
    try {
      const harness = createControllerHarness();

      await harness.controller.start();
      harness.detector.emit("speech_started");
      await settleSerialQueue();
      harness.sttSessions[0]?.emitTranscript({
        segmentId: "segment-1",
        transcript: "hello",
        isFinal: false,
      });
      await settleSerialQueue();
      harness.detector.emit("speech_stopped");
      await settleSerialQueue();
      harness.sttSessions[0]?.emitCommitted({ segmentId: "segment-1", previousSegmentId: null });

      await vi.advanceTimersByTimeAsync(65_000);
      await settleSerialQueue();

      expect(harness.onFinalTranscript).not.toHaveBeenCalled();
      expect(harness.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Speech recognition timed out before all segments completed",
        }),
      );
      await harness.controller.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports STT errors and attempts one reconnect", async () => {
    const harness = createControllerHarness();

    await harness.controller.start();
    const firstSession = harness.sttSessions[0];
    firstSession?.emitError(new Error("stream failed"));
    await settleSerialQueue();

    expect(harness.onError).toHaveBeenCalledTimes(1);
    expect(harness.onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "stream failed" }),
    );
    expect(firstSession?.closeCount).toBe(1);
    expect(harness.sttSessions).toHaveLength(2);
    expect(harness.sttSessions[1]?.connectCount).toBe(1);
  });
});
