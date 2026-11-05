import { createServer, type ServerResponse } from "node:http";
import { once } from "node:events";
import pino from "pino";
import { afterEach, describe, expect, test } from "vitest";
import { StepSTT } from "./stt.js";
import type { StreamingTranscriptionEvent } from "../../speech-provider.js";

const logger = pino({ level: "silent" });
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function serve(handler: (body: unknown, path: string, response: ServerResponse) => void) {
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    handler(JSON.parse(Buffer.concat(chunks).toString()), request.url ?? "", response);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test server address");
  cleanups.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return new StepSTT({
    apiKey: "test-key",
    baseUrl: `http://127.0.0.1:${address.port}/step_plan/v1/`,
    model: "stepaudio-2.5-asr",
  });
}

function frame(event: unknown) {
  return `data: ${JSON.stringify(event)}\r\n\r\n`;
}

describe("STEP Plan speech recognition", () => {
  test("sends PCM to the Plan endpoint and publishes Chinese text before the final result", async () => {
    let complete: () => void = () => {};
    let requestBody: unknown;
    let requestPath = "";
    const provider = await serve((body, path, response) => {
      requestBody = body;
      requestPath = path;
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      const bytes = Buffer.from(
        ": ping\r\n\r\n" + frame({ type: "transcript.text.delta", delta: "你好" }),
      );
      for (const byte of bytes) response.write(Buffer.from([byte]));
      complete = () => response.end(frame({ type: "transcript.text.done", text: "你好，世界。" }));
    });
    const session = provider.createSession({ logger, language: "zh" });
    const events: StreamingTranscriptionEvent[] = [];
    let first: () => void = () => {};
    const partial = new Promise<void>((resolve) => {
      first = resolve;
    });
    const final = new Promise<string>((resolve, reject) => {
      session.on("transcript", (event) => {
        events.push(event);
        if (event.isFinal) resolve(event.transcript);
        else first();
      });
      session.on("error", reject);
    });
    await session.connect();
    const pcm = Buffer.from([1, 0, 2, 0]);
    session.appendPcm16(pcm);
    session.commit();
    await partial;
    expect(events.map((e) => [e.transcript, e.isFinal])).toEqual([["你好", false]]);
    expect(requestPath).toBe("/step_plan/v1/audio/asr/sse");
    expect(requestBody).toEqual({
      audio: {
        data: pcm.toString("base64"),
        input: {
          transcription: { model: "stepaudio-2.5-asr", language: "zh", enable_itn: true },
          format: { type: "pcm", codec: "pcm_s16le", rate: 16000, bits: 16, channel: 1 },
        },
      },
    });
    complete();
    await expect(final).resolves.toBe("你好，世界。");
    expect(events.map((e) => [e.transcript, e.isFinal])).toEqual([
      ["你好", false],
      ["你好，世界。", true],
    ]);
    session.close();
  });

  test.each([
    { name: "HTTP failures", status: 503, data: "", error: "HTTP 503" },
    {
      name: "SSE errors",
      status: 200,
      data: frame({ type: "error", message: "Model unavailable" }),
      error: "Model unavailable",
    },
    {
      name: "truncated streams",
      status: 200,
      data: frame({ type: "transcript.text.delta", delta: "partial" }),
      error: "before the final transcript",
    },
  ])("reports $name without committing a partial result", async ({ status, data, error }) => {
    const provider = await serve((_body, _path, response) => {
      response.writeHead(status);
      response.end(data);
    });
    const session = provider.createSession({ logger, language: "zh" });
    const finals: string[] = [];
    const failure = new Promise<unknown>((resolve) => session.on("error", resolve));
    session.on("transcript", (e) => {
      if (e.isFinal) finals.push(e.transcript);
    });
    await session.connect();
    session.appendPcm16(Buffer.from([0, 1]));
    session.commit();
    await expect(failure).resolves.toMatchObject({ message: expect.stringContaining(error) });
    expect(finals).toEqual([]);
    session.close();
  });

  test("retries a disconnected request with the same audio on a new connection", async () => {
    const bodies: unknown[] = [];
    const ports: number[] = [];
    const provider = await serve((body, _path, response) => {
      bodies.push(body);
      ports.push(response.socket!.remotePort!);
      if (bodies.length === 1) response.destroy();
      else response.end(frame({ type: "transcript.text.done", text: "没有丢掉的话" }));
    });
    const session = provider.createSession({ logger });
    const result = new Promise<string>((resolve, reject) => {
      session.on("transcript", (event) => {
        if (event.isFinal) resolve(event.transcript);
      });
      session.on("error", reject);
    });
    await session.connect();
    session.appendPcm16(Buffer.from([1, 2, 3, 4]));
    session.commit();
    await expect(result).resolves.toBe("没有丢掉的话");
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toEqual(bodies[0]);
    expect(ports[1]).not.toBe(ports[0]);
    session.close();
  });

  test.each([400, 401, 429])("does not retry HTTP %s", async (status) => {
    let requests = 0;
    const provider = await serve((_body, _path, response) => {
      requests += 1;
      response.writeHead(status).end();
    });
    const session = provider.createSession({ logger });
    const failure = new Promise<unknown>((resolve) => session.on("error", resolve));
    await session.connect();
    session.appendPcm16(Buffer.from([1, 2]));
    session.commit();
    await expect(failure).resolves.toMatchObject({ status });
    expect(requests).toBe(1);
    session.close();
  });

  test("reports one terminal error after both network attempts fail", async () => {
    let requests = 0;
    const provider = await serve((_body, _path, response) => {
      requests += 1;
      response.destroy();
    });
    const session = provider.createSession({ logger });
    const finals: string[] = [];
    const failure = new Promise<unknown>((resolve) => session.on("error", resolve));
    session.on("transcript", (event) => {
      if (event.isFinal) finals.push(event.transcript);
    });
    await session.connect();
    session.appendPcm16(Buffer.from([1, 2]));
    session.commit();
    await expect(failure).resolves.toMatchObject({ message: "fetch failed" });
    expect(requests).toBe(2);
    expect(finals).toEqual([]);
    session.close();
  });

  test("clearing silent audio preserves already committed segments and their order", async () => {
    const seen: unknown[] = [];
    const provider = await serve((body, _path, response) => {
      seen.push(body);
      response.end(frame({ type: "transcript.text.done", text: String(seen.length) }));
    });
    const session = provider.createSession({ logger });
    const events: StreamingTranscriptionEvent[] = [];
    const complete = new Promise<void>((resolve, reject) => {
      session.on("transcript", (e) => {
        events.push(e);
        if (events.length === 2) resolve();
      });
      session.on("error", reject);
    });
    await session.connect();
    session.appendPcm16(Buffer.from([1, 0]));
    session.commit();
    session.appendPcm16(Buffer.from([0, 0]));
    session.clear();
    session.appendPcm16(Buffer.from([2, 0]));
    session.commit();
    await complete;
    expect(events.map((e) => e.transcript)).toEqual(["1", "2"]);
    expect(seen).toHaveLength(2);
    session.close();
  });
});
