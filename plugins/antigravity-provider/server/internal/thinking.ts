import { open } from "node:fs/promises";
import { StringDecoder } from "node:string_decoder";
import { clearInterval, setInterval } from "node:timers";
import { recordSchema } from "./history.js";

interface ThinkingOptions {
  paths: string[];
  afterStep: number;
  onThinking(step: number, text: string): void;
  onError(): void;
}

// agy 1.5.3 omits thoughts from stream-json, but appends them to its transcript
// when each planner step finishes, before the turn's tools and final answer finish.
export class LiveThinking {
  private readonly timer: ReturnType<typeof setInterval>;
  private pending: Promise<void> | null = null;
  private stopped = false;
  private identity: string | null = null;
  private offset = 0;
  private decoder = new StringDecoder("utf8");
  private partial = "";
  private readonly delivered = new Map<number, string>();

  constructor(private readonly options: ThinkingOptions) {
    this.timer = setInterval(() => void this.refresh(), 500);
    void this.refresh();
  }

  async flush(): Promise<void> {
    await this.pending;
    await this.refresh();
  }

  stop(): void {
    this.stopped = true;
    clearInterval(this.timer);
  }

  private refresh(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.pending) return this.pending;
    this.pending = this.read()
      .catch(() => {
        if (!this.stopped) {
          this.stop();
          this.options.onError();
        }
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }

  private async read(): Promise<void> {
    for (const filename of this.options.paths) {
      let file;
      try {
        file = await open(filename, "r");
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
        throw error;
      }
      try {
        const stat = await file.stat();
        if (this.stopped) return;
        const identity = `${filename}:${stat.dev}:${stat.ino}`;
        if (identity !== this.identity || stat.size < this.offset) {
          this.identity = identity;
          this.offset = 0;
          this.partial = "";
          this.decoder = new StringDecoder("utf8");
        }
        if (this.offset === stat.size) return;
        const buffer = Buffer.alloc(64 * 1024);
        while (!this.stopped && this.offset < stat.size) {
          const { bytesRead } = await file.read(
            buffer,
            0,
            Math.min(buffer.length, stat.size - this.offset),
            this.offset,
          );
          if (this.stopped || bytesRead === 0) return;
          this.offset += bytesRead;
          this.partial += this.decoder.write(buffer.subarray(0, bytesRead));
          this.drainLines();
        }
      } finally {
        await file.close();
      }
      return;
    }
  }

  private drainLines(): void {
    let newline: number;
    while (!this.stopped && (newline = this.partial.indexOf("\n")) !== -1) {
      const line = this.partial.slice(0, newline);
      this.partial = this.partial.slice(newline + 1);
      if (!line.trim()) continue;
      const record = recordSchema.parse(JSON.parse(line));
      if (
        record.step_index <= this.options.afterStep ||
        record.type !== "PLANNER_RESPONSE" ||
        !record.thinking
      )
        continue;
      if (this.delivered.get(record.step_index) === record.thinking) continue;
      this.delivered.set(record.step_index, record.thinking);
      this.options.onThinking(record.step_index, record.thinking);
    }
  }
}
