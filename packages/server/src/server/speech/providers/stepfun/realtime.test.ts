import { once } from "node:events";
import { WebSocketServer } from "ws";
import { afterEach, expect, test, vi } from "vitest";
import { StepRealtime, type StepRealtimeEvent, type StepRealtimeOptions } from "./realtime.js";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});

const textModalities: StepRealtimeOptions["modalities"] = ["text"];
test.each([
  { modalities: undefined, expected: ["text", "audio"] },
  { modalities: textModalities, expected: ["text"] },
])(
  "waits for session.updated and configures $expected before streaming",
  async ({ modalities, expected }) => {
    const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    await once(server, "listening");
    const address = server.address();
    if (typeof address === "string" || !address) throw new Error("No address");
    const errors: Error[] = [];
    const events: StepRealtimeEvent[] = [];
    const client = new StepRealtime({
      apiKey: "test",
      baseUrl: `ws://127.0.0.1:${address.port}/v1/realtime`,
      model: "test",
      voice: "test",
      instructions: "assistant",
      tools: [],
      modalities,
      onEvent: (event) => events.push(event),
      onError: (e) => errors.push(e),
    });
    cleanup.push(async () => {
      client.close();
      await new Promise<void>((r) => server.close(() => r()));
    });
    const accepted = once(server, "connection");
    let ready = false;
    const connect = client.connect().then(() => {
      ready = true;
      return undefined;
    });
    const [socket] = await accepted;
    const update = once(socket, "message");
    socket.send(JSON.stringify({ type: "session.created" }));
    expect(JSON.parse((await update)[0].toString())).toMatchObject({
      type: "session.update",
      session: {
        modalities: expected,
        turn_detection: { type: "server_vad" },
        input_audio_format: "pcm16",
        tools: [],
      },
    });
    expect(ready).toBe(false);
    socket.send(JSON.stringify({ type: "session.updated" }));
    await connect;
    const audio = once(socket, "message");
    client.appendAudio(Buffer.from([0, 1, 0, 2]));
    expect(JSON.parse((await audio)[0].toString())).toMatchObject({
      type: "input_audio_buffer.append",
      audio: "AAEAAg==",
    });
    expect(errors).toEqual([]);
    socket.send(
      JSON.stringify({
        type: "conversation.item.created",
        item: { id: "provider-assigned-id", type: "message", role: "user" },
      }),
    );
    await vi.waitFor(() =>
      expect(events).toContainEqual({
        type: "conversation.item.created",
        item: { id: "provider-assigned-id", type: "message", role: "user" },
      }),
    );
    socket.send(
      JSON.stringify({
        type: "error",
        error: { code: "invalid_request", message: modalities ? "Rejected key test" : "" },
      }),
    );
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(errors[0]?.message).toBe(
      modalities
        ? "STEP Realtime invalid_request: Rejected key [REDACTED]"
        : "STEP Realtime invalid_request: Realtime service rejected the request",
    );
  },
);
