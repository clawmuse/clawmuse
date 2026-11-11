import { readFileSync, unlinkSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_DESKTOP_SETTINGS } from "../settings/desktop-settings";
import { ExternalCliCommandError } from "./cli/external";
import { DaemonInstanceError } from "@getpaseo/server/daemon-control";
import {
  createDaemonCommandHandlers,
  keepsTerminalsOnStop,
  stopCapturedDaemon,
  type DesktopDaemonStopReason,
} from "./daemon-manager";

const mocks = vi.hoisted(() => ({
  paseoHome: "",
  isPackaged: true,
  settings: {
    releaseChannel: "stable",
    daemon: {
      manageBuiltInDaemon: true,
      keepRunningAfterQuit: true,
    },
  },
  runExternalCliJsonCommand: vi.fn(),
  runExternalCliTextCommand: vi.fn(),
  createNodeEntrypointInvocation: vi.fn(() => ({
    command: "node",
    args: [],
    env: {},
  })),
  spawnProcess: vi.fn(),
  startDaemonInstance:
    vi.fn<typeof import("@getpaseo/server/daemon-control").startDaemonInstance>(),
  stopDaemonInstance: vi.fn<typeof import("@getpaseo/server/daemon-control").stopDaemonInstance>(),
  downloadAndInstallUpdate:
    vi.fn<typeof import("../features/auto-updater.js").downloadAndInstallUpdate>(),
  logInfo: vi.fn(),
  logError: vi.fn(),
  appLogPath: "",
  getElectronLogFile: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => mocks.paseoHome),
    getVersion: vi.fn(() => "1.2.3"),
    get isPackaged() {
      return mocks.isPackaged;
    },
  },
  ipcMain: { handle: vi.fn() },
  powerMonitor: { getSystemIdleTime: vi.fn(() => 0) },
}));

vi.mock("electron-log/main", () => ({
  default: {
    info: mocks.logInfo,
    error: mocks.logError,
    transports: {
      file: {
        getFile: mocks.getElectronLogFile,
      },
    },
  },
}));

// Daemon command tests run outside Electron; updater behavior has its own suite.
vi.mock("../features/auto-updater.js", () => ({
  checkForAppUpdate: vi.fn(),
  downloadAndInstallUpdate: mocks.downloadAndInstallUpdate,
}));

vi.mock("@getpaseo/server/daemon-control", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolvePaseoHome: () => mocks.paseoHome,
  spawnProcess: mocks.spawnProcess,
  startDaemonInstance: mocks.startDaemonInstance,
  stopDaemonInstance: mocks.stopDaemonInstance,
}));

vi.mock("../settings/desktop-settings-electron.js", () => ({
  getDesktopSettingsStore: () => ({
    get: async () => mocks.settings,
    patch: vi.fn(),
    migrateLegacyRendererSettings: vi.fn(),
  }),
}));

vi.mock("./runtime-paths.js", () => ({
  createNodeEntrypointInvocation: mocks.createNodeEntrypointInvocation,
  resolveDaemonRunnerEntrypoint: vi.fn(() => ({
    entryPath: path.join(mocks.paseoHome, "daemon.js"),
    execArgv: [],
  })),
}));

vi.mock("./cli/external.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  runExternalCliJsonCommand: mocks.runExternalCliJsonCommand,
  runExternalCliTextCommand: mocks.runExternalCliTextCommand,
}));

describe("daemon-manager commands", () => {
  let fixtureRoot: string;

  it("reports persisted controlled-only policy while the daemon is stopped", async () => {
    mkdirSync(mocks.paseoHome, { recursive: true });
    writeFileSync(
      path.join(mocks.paseoHome, "remote-access.json"),
      JSON.stringify({ controlledOnly: true }),
    );
    writeFileSync(path.join(mocks.paseoHome, "server-id"), "srv_controlled");
    const status = await createDaemonCommandHandlers().desktop_daemon_status();
    expect(status).toMatchObject({
      controlledOnly: true,
      serverId: "srv_controlled",
      status: "stopped",
    });
  });

  beforeEach(() => {
    fixtureRoot = mkdtempSync(path.join(tmpdir(), "paseo daemon manager "));
    mocks.paseoHome = path.join(fixtureRoot, "home");
    mocks.isPackaged = true;
    mocks.appLogPath = path.join(fixtureRoot, "main.log");
    mocks.settings = DEFAULT_DESKTOP_SETTINGS;
    mocks.runExternalCliJsonCommand.mockReset();
    mocks.runExternalCliTextCommand.mockReset();
    mocks.createNodeEntrypointInvocation.mockReset();
    mocks.createNodeEntrypointInvocation.mockReturnValue({ command: "node", args: [], env: {} });
    mocks.spawnProcess.mockReset();
    mocks.downloadAndInstallUpdate.mockReset();
    mocks.startDaemonInstance.mockReset();
    mocks.stopDaemonInstance.mockReset();
    mocks.logInfo.mockReset();
    mocks.logError.mockReset();
    mocks.getElectronLogFile.mockReset();
    mocks.getElectronLogFile.mockReturnValue({ path: mocks.appLogPath });
  });

  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  function setupUpdateDaemon() {
    let generation = 0;
    const lockPath = path.join(mocks.paseoHome, "paseo.pid");
    mkdirSync(mocks.paseoHome, { recursive: true });
    mocks.startDaemonInstance.mockImplementation(async (input) => {
      const instance = {
        pid: process.pid,
        // A fresh CI VM rejects locks stamped before its current boot.
        startedAt: new Date(Date.now() + generation++).toISOString(),
        hostname: hostname(),
        uid: process.getuid?.() ?? 0,
        listen: "127.0.0.1:6799",
        desktopManaged: true,
      };
      writeFileSync(lockPath, JSON.stringify(instance));
      input.onAcquired?.(instance);
      return { instance, spawned: true };
    });
    mocks.stopDaemonInstance.mockImplementation(async () => {
      unlinkSync(lockPath);
      return { action: "stopped", pid: process.pid, forced: false, usedLifecycleRpc: false };
    });
    mocks.runExternalCliJsonCommand.mockImplementation(async () => {
      const instance = JSON.parse(readFileSync(lockPath, "utf8"));
      return {
        ...instance,
        localDaemon: "running",
        daemonVersion: "1.2.3",
        serverId: "srv_update",
      };
    });
    return createDaemonCommandHandlers();
  }

  it("creates a stable working directory for a downloaded desktop daemon", async () => {
    const commands = setupUpdateDaemon();
    rmSync(mocks.paseoHome, { recursive: true });
    await commands.start_desktop_daemon();
    expect(mocks.startDaemonInstance).toHaveBeenCalledWith(
      expect.objectContaining({ home: mocks.paseoHome, cwd: mocks.paseoHome }),
    );
    expect(await commands.desktop_daemon_status()).toMatchObject({ status: "running" });
  });

  it("preserves source-mode loader resolution from the checkout", async () => {
    mocks.isPackaged = false;
    const commands = setupUpdateDaemon();
    await commands.start_desktop_daemon();
    expect(mocks.startDaemonInstance).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: undefined }),
    );
  });

  it("preserves a readiness failure instead of returning an incomplete connection", async () => {
    const commands = setupUpdateDaemon();
    const failure = new DaemonInstanceError("DAEMON_NOT_READY", "Supervisor is still starting");
    mocks.startDaemonInstance.mockRejectedValueOnce(failure);
    await expect(commands.start_desktop_daemon()).rejects.toBe(failure);
  });

  it("waits for an already starting supervisor before returning its connection", async () => {
    const commands = setupUpdateDaemon();
    await mocks.startDaemonInstance({
      home: mocks.paseoHome,
      command: "node",
      args: [],
      env: {},
      mode: "managed",
    });
    const lockPath = path.join(mocks.paseoHome, "paseo.pid");
    const ready = JSON.parse(readFileSync(lockPath, "utf8"));
    const starting = { ...ready, listen: null };
    writeFileSync(lockPath, JSON.stringify(starting));
    mocks.runExternalCliJsonCommand.mockResolvedValueOnce({
      ...starting,
      localDaemon: "not_ready",
    });
    mocks.startDaemonInstance.mockImplementationOnce(async () => {
      writeFileSync(lockPath, JSON.stringify(ready));
      return { instance: starting, spawned: false };
    });

    expect(await commands.start_desktop_daemon()).toMatchObject({
      status: "running",
      serverId: "srv_update",
      listen: ready.listen,
    });
    expect(mocks.stopDaemonInstance).not.toHaveBeenCalled();
  });

  it("restores the owned daemon before returning an installer failure, and permits a retry", async () => {
    const commands = setupUpdateDaemon();
    await commands.start_desktop_daemon();
    mocks.downloadAndInstallUpdate.mockImplementation(async (_input, beforeQuit) => {
      await beforeQuit?.();
      expect(await commands.desktop_daemon_status()).toMatchObject({ status: "stopped" });
      throw new Error("No authentication agent found.");
    });

    await expect(commands.install_app_update()).rejects.toThrow("No authentication agent found.");
    expect(await commands.desktop_daemon_status()).toMatchObject({
      status: "running",
      serverId: "srv_update",
      ownedByDesktop: true,
    });
    expect(mocks.startDaemonInstance).toHaveBeenCalledTimes(2);

    mocks.downloadAndInstallUpdate.mockImplementationOnce(async (_input, beforeQuit) => {
      await beforeQuit?.();
      return { installed: true, version: "1.2.4", message: "Restarting" };
    });
    expect(await commands.install_app_update()).toMatchObject({ installed: true });
    expect(mocks.startDaemonInstance).toHaveBeenCalledTimes(2);
    expect(await commands.desktop_daemon_status()).toMatchObject({ status: "stopped" });
  });

  it("restores a daemon even when shutdown reports failure after the process exits", async () => {
    const commands = setupUpdateDaemon();
    await commands.start_desktop_daemon();
    mocks.stopDaemonInstance.mockImplementationOnce(async () => {
      unlinkSync(path.join(mocks.paseoHome, "paseo.pid"));
      throw new Error("Shutdown confirmation failed");
    });
    mocks.downloadAndInstallUpdate.mockImplementation(async (_input, beforeQuit) => {
      await beforeQuit?.();
      throw new Error("Installer should not be reached");
    });
    await expect(commands.install_app_update()).rejects.toThrow("Shutdown confirmation failed");
    expect(await commands.desktop_daemon_status()).toMatchObject({
      status: "running",
      ownedByDesktop: true,
    });
    expect(mocks.startDaemonInstance).toHaveBeenCalledTimes(2);
  });

  it("does not start a previously stopped daemon when installation fails", async () => {
    const commands = setupUpdateDaemon();
    mocks.downloadAndInstallUpdate.mockImplementation(async (_input, beforeQuit) => {
      await beforeQuit?.();
      throw new Error("Installer failed");
    });
    await expect(commands.install_app_update()).rejects.toThrow("Installer failed");
    expect(mocks.startDaemonInstance).not.toHaveBeenCalled();
    expect(mocks.stopDaemonInstance).not.toHaveBeenCalled();
  });

  it("leaves attached daemons running on update failure", async () => {
    const commands = setupUpdateDaemon();
    await mocks.startDaemonInstance({
      home: mocks.paseoHome,
      command: "node",
      args: [],
      env: {},
      mode: "managed",
    });
    mocks.downloadAndInstallUpdate.mockImplementation(async (_input, beforeQuit) => {
      await beforeQuit?.();
      throw new Error("Installer failed");
    });
    await expect(commands.install_app_update()).rejects.toThrow("Installer failed");
    expect(mocks.stopDaemonInstance).not.toHaveBeenCalled();
    expect(mocks.startDaemonInstance).toHaveBeenCalledTimes(1);
    expect(await commands.desktop_daemon_status()).toMatchObject({
      status: "running",
      ownedByDesktop: false,
    });
  });

  it("reports both installation and recovery errors if the daemon cannot restart", async () => {
    const commands = setupUpdateDaemon();
    await commands.start_desktop_daemon();
    mocks.startDaemonInstance.mockRejectedValueOnce(new Error("Disk full"));
    mocks.downloadAndInstallUpdate.mockImplementation(async (_input, beforeQuit) => {
      await beforeQuit?.();
      throw new Error("Permission denied");
    });
    await expect(commands.install_app_update()).rejects.toThrow(
      /Permission denied.*Local daemon recovery failed: Error: Disk full/,
    );
  });

  it("shares overlapping install requests until recovery finishes", async () => {
    const commands = setupUpdateDaemon();
    await commands.start_desktop_daemon();
    let requestInstall!: () => void;
    const requested = new Promise<void>((resolve) => {
      requestInstall = resolve;
    });
    let rejectInstall!: (error: Error) => void;
    const install = new Promise<never>((_resolve, reject) => {
      rejectInstall = reject;
    });
    mocks.downloadAndInstallUpdate.mockImplementation(async (_input, beforeQuit) => {
      await beforeQuit?.();
      requestInstall();
      return install;
    });
    const first = commands.install_app_update();
    const second = commands.install_app_update();
    const settled = Promise.allSettled([first, second]);
    await requested;
    rejectInstall(new Error("Permission denied"));
    expect(await settled).toEqual([
      { status: "rejected", reason: new Error("Permission denied") },
      { status: "rejected", reason: new Error("Permission denied") },
    ]);
    expect(mocks.downloadAndInstallUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.startDaemonInstance).toHaveBeenCalledTimes(2);
    expect(await commands.desktop_daemon_status()).toMatchObject({ status: "running" });
  });

  it("reads the control policy without starting a CLI status probe", async () => {
    expect(await createDaemonCommandHandlers().desktop_daemon_status({ policyOnly: true })).toEqual(
      { controlledOnly: false },
    );
    expect(mocks.runExternalCliJsonCommand).not.toHaveBeenCalled();
  });

  it("returns the Electron main-process log tail from electron-log", () => {
    writeFileSync(
      mocks.appLogPath,
      Array.from({ length: 105 }, (_value, index) => `main log line ${index + 1}`).join("\n"),
    );
    const handlers = createDaemonCommandHandlers();

    expect(handlers.desktop_app_logs()).toEqual({
      logPath: mocks.appLogPath,
      contents: Array.from({ length: 100 }, (_value, index) => `main log line ${index + 6}`).join(
        "\n",
      ),
    });
  });

  it("exposes updater diagnostics through the desktop command boundary", () => {
    const diagnostics = createDaemonCommandHandlers().desktop_update_diagnostics();

    expect(diagnostics).toMatchObject({
      platform: process.platform,
      currentVersion: "1.2.3",
    });
  });

  it("reports a stopped daemon without launching the CLI when no local daemon runs", async () => {
    mkdirSync(mocks.paseoHome);
    writeFileSync(path.join(mocks.paseoHome, "server-id"), "srv_existing\n");
    mocks.runExternalCliJsonCommand.mockResolvedValue({
      home: mocks.paseoHome,
      pid: null,
      startedAt: null,
      listen: null,
      hostname: null,
      localDaemon: "stopped",
      desktopManaged: false,
      connectedDaemon: "not_probed",
    });

    const status = await createDaemonCommandHandlers().desktop_daemon_status();

    expect(status).toMatchObject({ serverId: "", status: "stopped", pid: null });
    expect(mocks.runExternalCliJsonCommand).not.toHaveBeenCalled();
  });

  it("reports an errored daemon when the local daemon state cannot be read", async () => {
    mkdirSync(mocks.paseoHome);
    writeFileSync(path.join(mocks.paseoHome, "paseo.pid"), "garbage");

    const status = await createDaemonCommandHandlers().desktop_daemon_status();

    expect(status).toMatchObject({ serverId: "", status: "errored", pid: null });
    expect(status.error).toBeTruthy();
  });

  it("returns a local credential only for its live managed daemon listen", async () => {
    mkdirSync(mocks.paseoHome);
    const token = "a".repeat(43);
    writeFileSync(path.join(mocks.paseoHome, "local-credential"), `${token}\n`, { mode: 0o600 });
    const lock = {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      hostname: hostname(),
      uid: process.getuid?.() ?? 0,
      listen: "127.0.0.1:6799",
      desktopManaged: true,
    };
    const lockPath = path.join(mocks.paseoHome, "paseo.pid");
    writeFileSync(lockPath, JSON.stringify(lock));
    const handler = createDaemonCommandHandlers().desktop_local_credential;
    expect(await handler({ listen: "localhost:6799" })).toBe(token);
    expect(await handler({ listen: "remote:6799" })).toBeNull();
    writeFileSync(lockPath, JSON.stringify({ ...lock, desktopManaged: false }));
    expect(await handler({ listen: "localhost:6799" })).toBeNull();
  });
});

describe("desktop stops and terminals", () => {
  const reasons: DesktopDaemonStopReason[] = [
    "manual_ipc",
    "settings",
    "host_remove",
    "quit",
    "app_update",
    "version_mismatch",
    "restart",
  ];

  it("keeps terminals only for an app update or version-mismatch restart, never on Windows", () => {
    for (const platform of ["darwin", "linux"] as const) {
      expect(reasons.filter((reason) => keepsTerminalsOnStop(reason, platform))).toEqual([
        "app_update",
        "version_mismatch",
      ]);
    }
    expect(reasons.filter((reason) => keepsTerminalsOnStop(reason, "win32"))).toEqual([]);
  });

  function stopHarness(runCliJson: (args: string[]) => Promise<unknown>) {
    const stops: Array<{ keepTerminals: boolean | undefined }> = [];
    const logged: string[] = [];
    const instance = {
      pid: 4242,
      startedAt: "2026-10-21T00:00:00.000Z",
      hostname: "host",
      uid: 501,
      listen: "127.0.0.1:6799",
    };
    const stopInstance = (async (
      _home: string,
      options: {
        keepTerminals?: boolean;
        requestShutdown?: (ready: { listen: string }) => Promise<void>;
      },
    ) => {
      stops.push({ keepTerminals: options.keepTerminals });
      await options.requestShutdown?.({ listen: instance.listen });
      return { action: "stopped", pid: instance.pid, forced: false, usedLifecycleRpc: true };
    }) as unknown as NonNullable<Parameters<typeof stopCapturedDaemon>[0]["stopInstance"]>;
    return {
      stops,
      logged,
      input: {
        home: "/tmp/paseo-home",
        instance,
        stopInstance,
        runCliJson,
        log: (message: string) => logged.push(message),
      } as Omit<Parameters<typeof stopCapturedDaemon>[0], "reason" | "keepTerminals">,
    };
  }

  it("asks the daemon to keep its terminals on an app update", async () => {
    const calls: string[][] = [];
    const harness = stopHarness(async (args) => {
      calls.push(args);
      return { action: "shutdown_requested" };
    });

    await stopCapturedDaemon({ ...harness.input, reason: "app_update", keepTerminals: true });

    expect(harness.stops).toEqual([{ keepTerminals: true }]);
    expect(calls).toEqual([
      ["daemon", "stop", "--host", "127.0.0.1:6799", "--keep-terminals", "--json"],
    ]);
  });

  it("stops a daemon without the capability with its terminals closed, and says so", async () => {
    const calls: string[][] = [];
    const harness = stopHarness(async (args) => {
      calls.push(args);
      if (args.includes("--keep-terminals")) {
        throw new ExternalCliCommandError("refused", {
          code: "TERMINALS_KEEP_UNSUPPORTED",
          version: "0.11.0",
        });
      }
      return { action: "shutdown_requested" };
    });

    await stopCapturedDaemon({ ...harness.input, reason: "app_update", keepTerminals: true });

    expect(harness.stops).toEqual([{ keepTerminals: true }, { keepTerminals: false }]);
    expect(calls[1]).toEqual(["daemon", "stop", "--host", "127.0.0.1:6799", "--json"]);
    expect(harness.logged).toContain(
      "daemon v0.11.0 cannot keep terminals; stopping it and closing them",
    );
  });

  it("does not retry a keep stop that failed for another reason", async () => {
    const harness = stopHarness(async () => {
      throw new ExternalCliCommandError("unreachable", { code: "DAEMON_UNREACHABLE" });
    });

    await expect(
      stopCapturedDaemon({ ...harness.input, reason: "app_update", keepTerminals: true }),
    ).rejects.toThrow("unreachable");
    expect(harness.stops).toEqual([{ keepTerminals: true }]);
  });
});
