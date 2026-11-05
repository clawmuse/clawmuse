import pino from "pino";
import { afterEach, describe, expect, test, vi } from "vitest";

const { openAiConstructorOptionsMock, transcriptionsCreateMock } = vi.hoisted(() => ({
  openAiConstructorOptionsMock: vi.fn(),
  transcriptionsCreateMock: vi.fn(),
}));

vi.mock("openai", () => ({
  OpenAI: vi.fn(function OpenAI(options: unknown) {
    openAiConstructorOptionsMock(options);
    return {
      audio: {
        transcriptions: {
          create: transcriptionsCreateMock,
        },
      },
    };
  }),
}));

import { OpenAISTT } from "./stt.js";

describe("OpenAISTT", () => {
  test("keeps consecutive audio segments separate while transcription is in flight", async () => {
    const audio: Buffer[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let received: () => void = () => {};
    const captured = new Promise<void>((resolve) => {
      received = resolve;
    });
    transcriptionsCreateMock.mockImplementation(
      async (request: { file: AsyncIterable<Buffer> }) => {
        const chunks: Buffer[] = [];
        for await (const chunk of request.file) chunks.push(chunk);
        audio.push(Buffer.concat(chunks).subarray(44));
        if (audio.length === 2) received();
        await gate;
        return { text: "hello" };
      },
    );
    const provider = new OpenAISTT({ apiKey: "test" }, pino({ level: "silent" }));
    const session = provider.createSession({ logger: pino({ level: "silent" }) });
    const finals: string[] = [];
    const complete = new Promise<void>((resolve, reject) => {
      session.on("transcript", (event) => {
        if (event.isFinal) finals.push(event.transcript);
        if (finals.length === 2) resolve();
      });
      session.on("error", reject);
    });
    await session.connect();
    session.appendPcm16(Buffer.from([1, 0]));
    session.commit();
    session.appendPcm16(Buffer.from([2, 0]));
    session.commit();
    await captured;
    expect(audio).toEqual(expect.arrayContaining([Buffer.from([1, 0]), Buffer.from([2, 0])]));
    release();
    await complete;
    session.close();
  });
  afterEach(() => {
    openAiConstructorOptionsMock.mockReset();
    transcriptionsCreateMock.mockReset();
  });

  test("passes configured baseUrl to the OpenAI client", () => {
    const provider = new OpenAISTT(
      { apiKey: "sk-test", baseUrl: "https://speech.example.com/v1" },
      pino({ level: "silent" }),
    );

    expect(provider.id).toBe("openai");
    expect(openAiConstructorOptionsMock).toHaveBeenCalledWith({
      apiKey: "sk-test",
      baseURL: "https://speech.example.com/v1",
    });
  });

  test("passes transcription prompt to OpenAI REST STT", async () => {
    transcriptionsCreateMock.mockImplementation(
      async (request: { file: NodeJS.ReadableStream }) => {
        await new Promise<void>((resolve, reject) => {
          request.file.once("error", reject);
          request.file.once("end", resolve);
          request.file.resume();
        });
        return { text: "hello" };
      },
    );

    const provider = new OpenAISTT(
      { apiKey: "sk-test", model: "gpt-4o-transcribe" },
      pino({ level: "silent" }),
    );
    const session = provider.createSession({
      logger: pino({ level: "silent" }),
      language: "en",
      prompt: "Only transcribe the speaker.",
    });

    const transcript = new Promise<string>((resolve, reject) => {
      session.on("transcript", (event) => {
        if (event.isFinal) {
          resolve(event.transcript);
        }
      });
      session.on("error", (error) => {
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });

    await session.connect();
    session.appendPcm16(Buffer.from([0, 0, 0, 0]));
    session.commit();

    await expect(transcript).resolves.toBe("hello");
    expect(transcriptionsCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        language: "en",
        model: "gpt-4o-transcribe",
        prompt: "Only transcribe the speaker.",
        response_format: "json",
      }),
    );
  });
});
