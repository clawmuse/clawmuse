import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Logger } from "pino";
import type { SpeechToTextProvider, StreamingTranscriptionSession } from "../../speech-provider.js";

class StepSttTransportError extends Error {}

const StepEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("transcript.text.delta"), delta: z.string() }),
  z.object({ type: z.literal("transcript.text.done"), text: z.string() }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);

export interface StepSttConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export class StepSttError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "StepSttError";
  }
}

export class StepSTT implements SpeechToTextProvider {
  readonly id = "stepfun";

  constructor(private readonly config: StepSttConfig) {}

  createSession(params: { logger: Logger; language?: string }): StreamingTranscriptionSession {
    const emitter = new EventEmitter();
    const requiredSampleRate = 16000;
    const controllers = new Set<AbortController>();
    let connected = false;
    let generation = 0;
    let segmentId = randomUUID();
    let previousSegmentId: string | null = null;
    let chunks: Buffer[] = [];
    let pending = Promise.resolve();
    const language = params.language ?? "zh";

    const reset = () => {
      generation += 1;
      chunks = [];
      segmentId = randomUUID();
      previousSegmentId = null;
      for (const controller of controllers) controller.abort();
      controllers.clear();
    };

    return {
      requiredSampleRate,
      async connect() {
        connected = true;
      },
      appendPcm16(chunk) {
        if (!connected) {
          emitter.emit("error", new StepSttError("STEP speech session is not connected"));
          return;
        }
        chunks.push(Buffer.from(chunk));
      },
      commit: () => {
        if (!connected) {
          emitter.emit("error", new StepSttError("STEP speech session is not connected"));
          return;
        }
        const audio = Buffer.concat(chunks);
        const committedId = segmentId;
        const currentGeneration = generation;
        chunks = [];
        segmentId = randomUUID();
        emitter.emit("committed", { segmentId: committedId, previousSegmentId });
        previousSegmentId = committedId;
        const publish = (transcript: string, isFinal: boolean) => {
          if (!connected || currentGeneration !== generation) return undefined;
          emitter.emit("transcript", { segmentId: committedId, transcript, isFinal, language });
        };
        const previous = pending;
        pending = (async () => {
          await previous;
          if (!connected || currentGeneration !== generation) return;
          if (audio.length === 0) {
            publish("", true);
            return;
          }
          const controller = new AbortController();
          controllers.add(controller);
          try {
            const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]);
            for (let attempt = 1; attempt <= 2; attempt += 1) {
              try {
                await this.transcribe(audio, language, signal, publish);
                break;
              } catch (error) {
                const transportFailure =
                  error instanceof TypeError || error instanceof StepSttTransportError;
                if (!transportFailure || signal.aborted || attempt === 2) throw error;
                params.logger.warn(
                  { err: error, segmentId: committedId, attempt },
                  "step_stt.retrying_audio",
                );
              }
            }
          } catch (error) {
            if (!controller.signal.aborted && connected && currentGeneration === generation) {
              emitter.emit("error", error);
            }
          } finally {
            controllers.delete(controller);
          }
        })();
      },
      clear() {
        chunks = [];
        segmentId = randomUUID();
      },
      close() {
        connected = false;
        reset();
      },
      on(event: string, handler: (...args: never[]) => void) {
        emitter.on(event, handler as (...args: unknown[]) => void);
      },
    };
  }

  private async transcribe(
    audio: Buffer,
    language: string,
    signal: AbortSignal,
    publish: (text: string, isFinal: boolean) => void,
  ): Promise<void> {
    const response = await fetch(`${this.config.baseUrl.replace(/\/+$/, "")}/audio/asr/sse`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        // These infrequent POSTs must not reuse a socket the upstream has idled out.
        Connection: "close",
      },
      signal,
      body: JSON.stringify({
        audio: {
          data: audio.toString("base64"),
          input: {
            transcription: { model: this.config.model, language, enable_itn: true },
            format: { type: "pcm", codec: "pcm_s16le", rate: 16000, bits: 16, channel: 1 },
          },
        },
      }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new StepSttError(
        `STEP speech recognition failed (HTTP ${response.status})`,
        response.status,
      );
    }
    if (!response.body) throw new StepSttError("STEP speech recognition returned no stream");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let transcript = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        buffer += done ? decoder.decode() + "\n\n" : decoder.decode(value, { stream: true });
        let boundary: RegExpExecArray | null;
        while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
          const frame = buffer.slice(0, boundary.index);
          buffer = buffer.slice(boundary.index + boundary[0].length);
          const data = frame
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
          if (!data || data === "[DONE]") continue;
          const event = StepEventSchema.parse(JSON.parse(data));
          if (event.type === "error") throw new StepSttError(event.message);
          if (event.type === "transcript.text.done") {
            publish(event.text, true);
            return;
          }
          transcript += event.delta;
          publish(transcript, false);
        }
        if (done)
          throw new StepSttTransportError("STEP speech stream ended before the final transcript");
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
  }
}
