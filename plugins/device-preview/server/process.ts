import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

export interface CommandOptions {
  signal: AbortSignal;
  timeoutMs?: number;
  maxBytes?: number;
}

export class PreviewCommandError extends Error {
  constructor() {
    super("设备命令未完成，请检查工具和模拟器状态后重试");
  }
}

function signalGroup(pid: number, signal: NodeJS.Signals) {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
  }
}

async function terminateTree(pid: number) {
  if (process.platform === "win32") {
    await new Promise<void>((resolve, reject) => {
      const killer = spawn(
        `${process.env.SystemRoot || "C:\\Windows"}\\System32\\taskkill.exe`,
        ["/pid", String(pid), "/t", "/f"],
        { windowsHide: true, stdio: "ignore" },
      );
      killer.once("error", reject);
      killer.once("close", () => resolve());
    });
    return;
  }
  signalGroup(pid, "SIGTERM");
  await delay(150);
  signalGroup(pid, "SIGKILL");
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      process.kill(-pid, 0);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ESRCH") return;
      throw error;
    }
    await delay(20);
  }
  throw new PreviewCommandError();
}

export class CommandRunner {
  private readonly tasks = new Set<Promise<Buffer>>();
  private readonly shutdown = new AbortController();

  run(file: string, args: string[], options: CommandOptions): Promise<Buffer> {
    const task = this.execute(file, args, options);
    this.tasks.add(task);
    void task.finally(() => this.tasks.delete(task)).catch(() => {});
    return task;
  }

  private async execute(file: string, args: string[], options: CommandOptions): Promise<Buffer> {
    const signal = AbortSignal.any([options.signal, this.shutdown.signal]);
    if (signal.aborted) throw new PreviewCommandError();
    const child = spawn(file, args, {
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      shell: false,
    });
    let failed = false;
    let bytes = 0;
    const chunks: Buffer[] = [];
    let termination: Promise<void> | null = null;
    function cancel() {
      failed = true;
      if (child.pid && !termination) termination = terminateTree(child.pid);
      void termination?.catch(() => {});
    }
    const timeout = setTimeout(cancel, options.timeoutMs ?? 10_000);
    signal.addEventListener("abort", cancel, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > (options.maxBytes ?? 1024 * 1024)) cancel();
      else chunks.push(chunk);
    });
    let errorBytes = 0;
    child.stderr.on("data", (chunk: Buffer) => {
      errorBytes += chunk.length;
      if (errorBytes > 64 * 1024) cancel();
    });
    try {
      const code = await new Promise<number | null>((resolve, reject) => {
        child.once("error", () => reject(new PreviewCommandError()));
        child.once("close", resolve);
      });
      if (termination) await termination;
      if (failed || code !== 0 || signal.aborted) throw new PreviewCommandError();
      return Buffer.concat(chunks);
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", cancel);
    }
  }

  async close() {
    this.shutdown.abort();
    await Promise.allSettled(this.tasks);
  }
}

export async function launchEmulator(file: string, id: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(file, ["-avd", id, "-no-snapshot-save", "-no-boot-anim"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      shell: false,
    });
    child.once("error", () => reject(new PreviewCommandError()));
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}
