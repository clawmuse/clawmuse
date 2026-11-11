import { Worker } from "node:worker_threads";
import { z } from "zod";

const EntrySchema = z.object({
  name: z.string(),
  kind: z.enum(["file", "directory", "symlink", "other"]),
});
const StatSchema = z.object({
  kind: EntrySchema.shape.kind,
  mtimeMs: z.number(),
  ctimeMs: z.number(),
});
const ReplySchema = z.union([
  z.object({ result: z.union([z.array(EntrySchema), StatSchema, z.string()]) }),
  z.object({ error: z.object({ message: z.string(), code: z.string().optional() }) }),
]);
type Operation = "readdir" | "stat" | "realpath";
type Result = z.infer<typeof EntrySchema>[] | z.infer<typeof StatSchema> | string;

// Async fs in a Worker still uses the daemon's libuv pool. Synchronous fs here
// blocks only this isolate, including while macOS waits for a TCC answer.
const SOURCE = `
const fs = require('node:fs');
const { parentPort } = require('node:worker_threads');
function kind(entry) {
  return entry.isDirectory() ? 'directory' : entry.isFile() ? 'file'
    : entry.isSymbolicLink() ? 'symlink' : 'other';
}
parentPort.on('message', ({ operation, path }) => {
  try {
    let result;
    if (operation === 'readdir') {
      result = fs.readdirSync(path, { withFileTypes: true }).map(entry => ({ name: entry.name, kind: kind(entry) }));
    } else if (operation === 'stat') {
      const entry = fs.statSync(path);
      result = { kind: kind(entry), mtimeMs: entry.mtimeMs, ctimeMs: entry.ctimeMs };
    } else {
      result = fs.realpathSync(path);
    }
    parentPort.postMessage({ result });
  } catch (error) {
    parentPort.postMessage({ error: { message: error.message, code: error.code } });
  }
});
`;

interface Job {
  key: string;
  operation: Operation;
  path: string;
  resolve(value: Result): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}
interface Slot {
  worker: Worker;
  job: Job | null;
  idle: NodeJS.Timeout | null;
  retiring: boolean;
}

export interface DirectoryEntry {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
}
export interface DirectoryStat {
  mtimeMs: number;
  ctimeMs: number;
  isDirectory(): boolean;
  isFile(): boolean;
}

export class IsolatedDirectory {
  private readonly slots = new Set<Slot>();
  private readonly queue: Job[] = [];
  private readonly pending = new Map<string, Promise<Result>>();

  constructor(
    private readonly options: {
      timeoutMs?: number;
      createWorker?: (source: string) => Worker;
    } = {},
  ) {}

  async readdir(path: string): Promise<DirectoryEntry[]> {
    const entries = z.array(EntrySchema).parse(await this.run("readdir", path));
    return entries.map((entry) => ({
      name: entry.name,
      isDirectory: () => entry.kind === "directory",
      isFile: () => entry.kind === "file",
      isSymbolicLink: () => entry.kind === "symlink",
    }));
  }

  async stat(path: string): Promise<DirectoryStat> {
    const entry = StatSchema.parse(await this.run("stat", path));
    return {
      mtimeMs: entry.mtimeMs,
      ctimeMs: entry.ctimeMs,
      isDirectory: () => entry.kind === "directory",
      isFile: () => entry.kind === "file",
    };
  }

  async realpath(path: string): Promise<string> {
    return z.string().parse(await this.run("realpath", path));
  }

  private run(operation: Operation, path: string): Promise<Result> {
    const key = `${operation}:${path}`;
    const existing = this.pending.get(key);
    if (existing) return existing;
    if (this.pending.size >= 512) {
      return Promise.reject(
        Object.assign(new Error("Directory inspection queue full"), { code: "EBUSY" }),
      );
    }
    const result = new Promise<Result>((resolve, reject) => {
      const job: Job = {
        key,
        operation,
        path,
        resolve,
        reject,
        timer: setTimeout(() => {
          reject(
            Object.assign(new Error(`Directory ${operation} timed out: ${path}`), {
              code: "ETIMEDOUT",
            }),
          );
          const index = this.queue.indexOf(job);
          if (index !== -1) {
            this.queue.splice(index, 1);
            this.pending.delete(key);
          }
          // A blocked syscall cannot be cancelled. Keep its worker and pending
          // entry until the OS returns; never grow a new worker on each timeout.
        }, this.options.timeoutMs ?? 5_000),
      };
      this.queue.push(job);
    });
    this.pending.set(key, result);
    this.drain();
    return result;
  }

  private drain(): void {
    while (this.queue.length) {
      let slot = [...this.slots].find((candidate) => !candidate.job && !candidate.retiring);
      if (!slot) {
        if (this.slots.size === 2) return;
        try {
          slot = this.start();
        } catch (error) {
          const job = this.queue.shift()!;
          this.finish(job, error instanceof Error ? error : new Error(String(error)));
          continue;
        }
      }
      if (slot.idle) clearTimeout(slot.idle);
      slot.idle = null;
      slot.job = this.queue.shift()!;
      slot.worker.postMessage({ operation: slot.job.operation, path: slot.job.path }, []);
    }
  }

  private start(): Slot {
    const worker =
      this.options.createWorker?.(SOURCE) ?? new Worker(SOURCE, { eval: true, execArgv: [] });
    const slot: Slot = { worker, job: null, idle: null, retiring: false };
    this.slots.add(slot);
    worker.on("message", (message: unknown) => {
      const job = slot.job;
      if (!job) return;
      try {
        const reply = ReplySchema.parse(message);
        if ("error" in reply)
          this.finish(job, Object.assign(new Error(reply.error.message), reply.error));
        else {
          this.finish(job);
          job.resolve(reply.result);
        }
      } catch (error) {
        this.finish(job, error instanceof Error ? error : new Error(String(error)));
      }
      slot.job = null;
      slot.idle = setTimeout(() => {
        slot.retiring = true;
        void worker.terminate();
      }, 1_000);
      slot.idle.unref();
      this.drain();
    });
    worker.on("error", (error) => {
      slot.retiring = true;
      if (slot.job) this.finish(slot.job, error);
      slot.job = null;
    });
    worker.on("exit", () => {
      if (slot.job) this.finish(slot.job, new Error("Directory worker exited"));
      if (slot.idle) clearTimeout(slot.idle);
      this.slots.delete(slot);
      this.drain();
    });
    worker.unref();
    return slot;
  }

  private finish(job: Job, error?: Error): void {
    clearTimeout(job.timer);
    this.pending.delete(job.key);
    if (error) job.reject(error);
  }
}

export const isolatedDirectory = new IsolatedDirectory();
