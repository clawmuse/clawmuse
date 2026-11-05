import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import { z } from "zod";

export interface RealtimeTool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}
export interface StepRealtimeOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  voice: string;
  instructions: string;
  tools: RealtimeTool[];
  modalities?: Array<"text" | "audio">;
  onEvent(event: StepRealtimeEvent): void;
  onError(error: Error): void;
}
const ItemSchema = z.object({
  id: z.string().optional(),
  type: z.string(),
  role: z.string().optional(),
  status: z.string().optional(),
  name: z.string().optional(),
  call_id: z.string().optional(),
  arguments: z.string().optional(),
  content: z
    .array(z.object({ transcript: z.string().optional(), text: z.string().optional() }))
    .optional(),
});
const EventSchema = z.object({
  type: z.string(),
  response_id: z.string().optional(),
  item_id: z.string().optional(),
  delta: z.string().optional(),
  transcript: z.string().optional(),
  item: ItemSchema.optional(),
  response: z
    .object({
      id: z.string(),
      status: z.string(),
      output: z.array(ItemSchema).optional(),
      usage: z
        .object({ input_tokens: z.number().optional(), output_tokens: z.number().optional() })
        .optional(),
    })
    .optional(),
  error: z.object({ message: z.string(), code: z.string().optional() }).optional(),
});
export type StepRealtimeEvent = z.infer<typeof EventSchema>;

/** The API uses nested function definitions, not the flattened OpenAI Realtime shape. */
export class StepRealtime {
  private socket: WebSocket | null = null;
  private ready = false;
  private closed = false;
  private rejectConnect?: (error: Error) => void;
  constructor(private readonly options: StepRealtimeOptions) {}

  async connect(): Promise<void> {
    if (this.socket || this.closed) throw new Error("Create a new realtime session to reconnect");
    const url = new URL(this.options.baseUrl);
    if (
      url.protocol !== "wss:" &&
      !(url.protocol === "ws:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
    ) {
      throw new Error("Realtime endpoint must use WSS (WS is allowed only on localhost)");
    }
    if (url.username || url.password) throw new Error("Realtime URL must not contain credentials");
    url.searchParams.set("model", this.options.model);
    const socket = new WebSocket(url, {
      headers: { Authorization: `Bearer ${this.options.apiKey}` },
      handshakeTimeout: 15_000,
      maxPayload: 4 * 1024 * 1024,
    });
    this.socket = socket;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => this.fail(new Error("Realtime session configuration timed out")),
        15_000,
      );
      this.rejectConnect = (error) => {
        clearTimeout(timer);
        reject(error);
      };
      socket.on("unexpected-response", (_request, response) => {
        response.resume();
        this.fail(new Error(`STEP Realtime HTTP ${response.statusCode}`));
      });
      socket.on("error", (error) => this.fail(error));
      socket.on("close", () => {
        if (!this.closed)
          this.fail(new Error("STEP Realtime connection closed. Reopen voice mode to reconnect."));
      });
      socket.on("message", (raw) => {
        if (this.closed) return;
        try {
          const event = EventSchema.parse(JSON.parse(raw.toString()));
          if (event.type === "error") {
            const reason = event.error?.message || "Realtime service rejected the request";
            const code = event.error?.code ?? "unknown";
            throw new Error(`STEP Realtime ${code}: ${reason}`);
          }
          if (event.type === "session.created") {
            this.send({
              type: "session.update",
              session: {
                modalities: this.options.modalities ?? ["text", "audio"],
                instructions: this.options.instructions,
                voice: this.options.voice,
                input_audio_format: "pcm16",
                output_audio_format: "pcm16",
                turn_detection: {
                  type: "server_vad",
                  prefix_padding_ms: 500,
                  silence_duration_ms: 400,
                },
                tools: this.options.tools,
              },
            });
          } else if (event.type === "session.updated" && !this.ready) {
            this.ready = true;
            clearTimeout(timer);
            this.rejectConnect = undefined;
            resolve();
          } else if (this.ready) this.options.onEvent(event);
        } catch (error) {
          this.fail(error instanceof Error ? error : new Error("Invalid realtime event"));
        }
      });
    });
  }

  send(event: Record<string, unknown>): void {
    if (this.closed || this.socket?.readyState !== WebSocket.OPEN)
      throw new Error("Realtime session is not connected");
    if (this.socket.bufferedAmount > 1024 * 1024) {
      const error = new Error("Realtime connection is too slow; reopen voice mode");
      this.fail(error);
      throw error;
    }
    this.socket.send(JSON.stringify({ event_id: randomUUID(), ...event }));
  }

  appendAudio(pcm: Buffer): void {
    if (!this.ready) throw new Error("Realtime session is not ready for audio");
    if (pcm.byteLength % 2 !== 0) throw new Error("Expected PCM16 audio");
    if (pcm.byteLength)
      this.send({ type: "input_audio_buffer.append", audio: pcm.toString("base64") });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.ready = false;
    this.rejectConnect?.(new Error("Realtime session closed"));
    this.rejectConnect = undefined;
    this.socket?.terminate();
  }

  private fail(error: Error): void {
    if (this.closed) return;
    // Provider errors can echo request data; never expose the credential.
    const message =
      error.message.trim() || "STEP Realtime connection failed. Reopen voice to retry.";
    const sanitized = new Error(
      this.options.apiKey ? message.replaceAll(this.options.apiKey, "[REDACTED]") : message,
    );
    this.rejectConnect?.(sanitized);
    this.rejectConnect = undefined;
    this.close();
    this.options.onError(sanitized);
  }
}
