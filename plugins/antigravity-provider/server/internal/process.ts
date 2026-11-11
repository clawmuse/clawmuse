import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawnProcess } from "@getpaseo/plugin/server";
import { signalProcess } from "./signals.js";
import { createInterface } from "node:readline";
import type { ProviderLaunch, ProviderSessionConfig } from "@getpaseo/plugin/server/provider";
import {
  AntigravityError,
  createFrameDecoder,
  diagnostic,
  encodePrompt,
  type Frame,
  type Init,
} from "./wire.js";

interface DriverOptions {
  launch: ProviderLaunch;
  config: ProviderSessionConfig;
  conversationId: string | null;
  onFrame(frame: Frame): void | Promise<void>;
  onExit(error: AntigravityError): void;
}

export interface Driver {
  ready: Promise<Init>;
  selection: string;
  prompt(text: string): Promise<void>;
  stop(reason: "interrupt" | "close"): Promise<void>;
}

export function selection(config: ProviderSessionConfig): string {
  return JSON.stringify([config.model, config.mode]);
}

function driverArgs(options: DriverOptions): string[] {
  const { config, conversationId } = options;
  const args = [
    ...options.launch.args,
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--add-dir",
    config.cwd,
    "--disable-slash-commands",
    "--dangerously-skip-permissions",
  ];
  if (config.model) args.push("--model", config.model);
  if (conversationId) args.push("--conversation", conversationId);
  return args;
}

export function startDriver(options: DriverOptions): Driver {
  const child = spawnProcess(options.launch.command, driverArgs(options), {
    cwd: options.config.cwd,
    env: { ...options.launch.env, ...options.config.env },
    detached: process.platform !== "win32",
    stdio: "pipe",
  });
  const lines = createInterface({ input: child.stdout });
  const decodeFrame = createFrameDecoder();
  let cleanup: Promise<void> | null = null;
  let stderr = "";
  let frames = Promise.resolve();
  let state: "starting" | "ready" | "stopping" | "exited" = "starting";
  let resolveReady: (init: Init) => void;
  let rejectReady: (error: Error) => void;
  const ready = new Promise<Init>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  let resolveExit: () => void;
  const exited = new Promise<void>((resolve) => {
    resolveExit = resolve;
  });
  const startupDeadline = setTimeout(
    () =>
      fail(
        new AntigravityError("Antigravity did not initialize within 30 seconds", "STARTUP_TIMEOUT"),
      ),
    30_000,
  );
  child.stderr.on("data", (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-8192);
  });
  child.stdin.on("error", (error: Error) =>
    fail(new AntigravityError(error.message, "STDIN_ERROR")),
  );
  child.on("error", (error: Error) => fail(new AntigravityError(error.message, "SPAWN_ERROR")));
  child.on("close", (code, signal) => {
    clearTimeout(startupDeadline);
    lines.close();
    const error = new AntigravityError(
      diagnostic(stderr.trim() || `Antigravity exited (${signal || code})`),
      "PROCESS_EXIT",
    );
    if (state === "starting") rejectReady(error);
    // A final frame may still be draining transcript-backed thinking when stdout closes.
    void frames.then(() => {
      if (state === "ready") options.onExit(error);
      state = "exited";
      resolveExit();
      return undefined;
    });
  });
  lines.on("line", (line) => {
    if (!line.trim() || state === "exited" || state === "stopping") return;
    let decoded: Frame;
    try {
      decoded = decodeFrame(line);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      fail(new AntigravityError(`Invalid Antigravity output: ${message}`, "INVALID_FRAME"));
      return;
    }
    if (state === "starting") {
      if (decoded.event === "init") {
        clearTimeout(startupDeadline);
        state = "ready";
        resolveReady(decoded);
      } else if (decoded.event === "result") {
        fail(new AntigravityError(diagnostic(decoded.result.error), "STARTUP_ERROR"));
      }
      return;
    }
    frames = frames
      .then(() => {
        if (state === "ready") return options.onFrame(decoded);
        return undefined;
      })
      .catch((error: unknown) => {
        fail(
          new AntigravityError(
            error instanceof Error ? error.message : String(error),
            "FRAME_ERROR",
          ),
        );
      });
  });

  function fail(failure: AntigravityError): void {
    clearTimeout(startupDeadline);
    if (state === "starting") rejectReady(failure);
    if (state === "ready") options.onExit(failure);
    if (state === "exited" || state === "stopping") return;
    void stop("interrupt", true).catch((error: unknown) => {
      console.warn("Antigravity cleanup failed after", failure.code, error);
    });
  }

  async function waitForExit(timeoutMs: number): Promise<boolean> {
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        exited.then(() => true),
        new Promise<false>((resolve) => {
          deadline = setTimeout(() => resolve(false), timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(deadline);
    }
  }

  function stop(reason: "interrupt" | "close", force = false): Promise<void> {
    if (cleanup) return cleanup;
    cleanup = stopDriver(reason, force);
    // Retain one teardown while it is running. A denied live-process signal can
    // be retried later without leaving a permanently rejected cleanup promise.
    void cleanup.catch(() => {
      cleanup = null;
    });
    return cleanup;
  }

  async function stopDriver(reason: "interrupt" | "close", force: boolean): Promise<void> {
    if (state === "exited") return;
    if (state === "starting") rejectReady(new AntigravityError("Antigravity startup canceled"));
    clearTimeout(startupDeadline);
    state = "stopping";
    if (process.platform === "win32" || force) {
      await signalGroup(child, "SIGKILL");
    } else {
      if (reason === "close") child.stdin.end();
      else await signalGroup(child, "SIGINT");
      if (!(await waitForExit(1000))) {
        await signalGroup(child, "SIGTERM");
        if (!(await waitForExit(1000))) await signalGroup(child, "SIGKILL");
      }
    }
    if (!(await waitForExit(1000)))
      throw new AntigravityError(
        "Antigravity process did not exit after termination",
        "STOP_TIMEOUT",
      );
    // A tool can keep running after its CLI leader exits. taskkill already owns
    // the Windows tree and must not target a PID again after its leader exits.
    if (process.platform !== "win32") await signalGroup(child, "SIGKILL");
  }

  return {
    ready,
    selection: selection(options.config),
    prompt(text) {
      if (state !== "ready")
        return Promise.reject(new AntigravityError("Antigravity is not ready"));
      return new Promise<void>((resolve, reject) => {
        child.stdin.write(encodePrompt(text), (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
    stop,
  };
}

async function signalGroup(
  child: ChildProcessWithoutNullStreams,
  signal: NodeJS.Signals,
): Promise<void> {
  if (!child.pid) return;
  try {
    await signalProcess({ platform: process.platform, pid: child.pid, signal });
  } catch (error) {
    // A final group sweep can race the reaping of the CLI. Never let that sweep
    // turn a confirmed exit into a failed turn; permission failures for live CLIs still fail.
    if (
      (child.exitCode !== null || child.signalCode !== null) &&
      error instanceof Error &&
      "code" in error &&
      error.code === "EPERM"
    )
      return;
    throw error;
  }
}

interface ProbeOptions {
  launch: ProviderLaunch;
  args: string[];
  cwd?: string;
}
export function probe(options: ProbeOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(options.launch.command, [...options.launch.args, ...options.args], {
      env: options.launch.env,
      cwd: options.cwd,
      stdio: "pipe",
      detached: process.platform !== "win32",
    });
    let stdout = "";
    let stderr = "";
    const deadline = setTimeout(() => {
      const termination = Promise.resolve(signalGroup(child, "SIGKILL"));
      void termination.then(() => {
        reject(new AntigravityError("Antigravity discovery timed out", "PROBE_TIMEOUT"));
        return undefined;
      }, reject);
    }, 10_000);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-8192);
    });
    child.on("error", (error: Error) => {
      clearTimeout(deadline);
      reject(new AntigravityError(error.message, "SPAWN_ERROR"));
    });
    child.on("close", (code) => {
      clearTimeout(deadline);
      if (code === 0) resolve(stdout);
      else
        reject(
          new AntigravityError(
            diagnostic(stderr.trim() || `agy exited with code ${code}`),
            "PROBE_ERROR",
          ),
        );
    });
  });
}
