import { mkdtemp, readFile, rm, mkdir, writeFile, chmod, access } from "node:fs/promises";
import os from "node:os";
import { spawnSync } from "node:child_process";
import {
  macAppPath,
  MAC_BUNDLE_INSTALL_SCRIPT,
  prepareMacBundleInstallation,
} from "./mac-bundle-install.js";
import path from "node:path";
import { UUID } from "builder-util-runtime";
import log from "electron-log/main";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { brandMock } = vi.hoisted(() => ({
  brandMock: { name: "ClawMuse", automaticUpdates: true },
}));
vi.mock("../brand.generated.js", () => ({ brand: brandMock }));

const { autoUpdaterMock, nativeUpdaterMock } = await vi.hoisted(async () => {
  const { EventEmitter } = await import("node:events");
  return {
    nativeUpdaterMock: new EventEmitter(),
    autoUpdaterMock: Object.assign(new EventEmitter(), {
      logger: {
        debug: vi.fn(),
        error: vi.fn((message: unknown) => console.error(message)),
        info: vi.fn(),
        warn: vi.fn(),
      },
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      quitAndInstall: vi.fn(),
    }),
  };
});

vi.mock("electron", () => ({
  autoUpdater: nativeUpdaterMock,
  app: {
    getPath: vi.fn(),
    isPackaged: true,
  },
}));

vi.mock("./mac-bundle-updater.js", () => ({
  MacBundleUpdater: vi.fn(function () {
    return autoUpdaterMock;
  }),
}));

vi.mock("electron-updater", () => ({
  autoUpdater: autoUpdaterMock,
}));

import {
  bucketFromStagingUserId,
  checkForAppUpdate,
  createAppUpdateLifecycleLogger,
  downloadAndInstallUpdate,
  resolveStagingUserId,
  rolloutManifestSchema,
  shouldAdmitToRollout,
  shouldInstallAppUpdateOnQuit,
} from "./auto-updater";

describe("manual installation handoff", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  beforeEach(() => {
    brandMock.automaticUpdates = true;
    autoUpdaterMock.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo: { version: "1.2.4" },
    });
    autoUpdaterMock.downloadUpdate.mockResolvedValue([]);
    autoUpdaterMock.quitAndInstall.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("waits for native handoff evidence before reporting success", async () => {
    let requestInstall!: () => void;
    const requested = new Promise<void>((resolve) => {
      requestInstall = resolve;
    });
    autoUpdaterMock.quitAndInstall.mockImplementationOnce(requestInstall);
    let settled = false;
    const installing = downloadAndInstallUpdate({
      currentVersion: "1.2.3",
      releaseChannel: "stable",
    }).finally(() => {
      settled = true;
    });
    await requested;
    expect(settled).toBe(false);
    nativeUpdaterMock.emit("before-quit-for-update");
    await expect(installing).resolves.toMatchObject({ installed: true, version: "1.2.4" });
    expect(nativeUpdaterMock.listenerCount("before-quit-for-update")).toBe(0);
    expect(autoUpdaterMock.listenerCount("error")).toBe(1);
  });

  it("rejects an asynchronous installer error and can retry successfully", async () => {
    const emitInstallError = () => autoUpdaterMock.emit("error", new Error("Permission denied"));
    autoUpdaterMock.quitAndInstall.mockImplementationOnce(() => {
      queueMicrotask(emitInstallError);
    });
    await expect(
      downloadAndInstallUpdate({ currentVersion: "1.2.3", releaseChannel: "stable" }),
    ).rejects.toThrow("Permission denied");
    expect(nativeUpdaterMock.listenerCount("before-quit-for-update")).toBe(0);
    expect(autoUpdaterMock.listenerCount("error")).toBe(1);

    autoUpdaterMock.quitAndInstall.mockImplementationOnce(() => {
      nativeUpdaterMock.emit("before-quit-for-update");
    });
    await expect(
      downloadAndInstallUpdate({ currentVersion: "1.2.3", releaseChannel: "stable" }),
    ).resolves.toMatchObject({ installed: true });
  });

  it("does not expire the handoff deadline while a synchronous installer waits for the user", async () => {
    vi.useFakeTimers();
    const handoff = () => nativeUpdaterMock.emit("before-quit-for-update");
    autoUpdaterMock.quitAndInstall.mockImplementationOnce(() => {
      vi.advanceTimersByTime(60_000);
      queueMicrotask(handoff);
    });
    const installing = downloadAndInstallUpdate({
      currentVersion: "1.2.3",
      releaseChannel: "stable",
    });
    await vi.advanceTimersByTimeAsync(0);
    await expect(installing).resolves.toMatchObject({ installed: true });
    expect(nativeUpdaterMock.listenerCount("before-quit-for-update")).toBe(0);
  });

  it("rejects a silent no-op instead of leaving the daemon stopped forever", async () => {
    vi.useFakeTimers();
    const installing = downloadAndInstallUpdate({
      currentVersion: "1.2.3",
      releaseChannel: "stable",
    });
    const rejected = expect(installing).rejects.toThrow("The update installer did not start.");
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
    expect(nativeUpdaterMock.listenerCount("before-quit-for-update")).toBe(0);
    expect(autoUpdaterMock.listenerCount("error")).toBe(1);
  });

  it("cleans up handoff listeners when the installer throws", async () => {
    autoUpdaterMock.quitAndInstall.mockImplementationOnce(() => {
      throw new Error("Installer missing");
    });
    await expect(
      downloadAndInstallUpdate({ currentVersion: "1.2.3", releaseChannel: "stable" }),
    ).rejects.toThrow("Installer missing");
    expect(nativeUpdaterMock.listenerCount("before-quit-for-update")).toBe(0);
    expect(autoUpdaterMock.listenerCount("error")).toBe(1);
  });

  it("rejects when the installer emits an error instead of throwing", async () => {
    const error = new Error("No authentication agent found.");
    autoUpdaterMock.quitAndInstall.mockImplementationOnce(() => {
      autoUpdaterMock.emit("error", error);
    });

    await expect(
      downloadAndInstallUpdate({
        currentVersion: "1.2.3",
        releaseChannel: "stable",
      }),
    ).rejects.toThrow("No authentication agent found.");
  });

  it("retains installer stderr before the generic exit-code error", async () => {
    const errorLog = vi.spyOn(log, "error").mockImplementation(() => undefined);
    autoUpdaterMock.quitAndInstall.mockImplementationOnce(() => {
      autoUpdaterMock.logger.error(
        "Error executing command as another user: No authentication agent found.",
      );
      autoUpdaterMock.emit("error", new Error("Command pkexec exited with code 127"));
    });
    await expect(
      downloadAndInstallUpdate({ currentVersion: "1.2.3", releaseChannel: "stable" }),
    ).rejects.toThrow("Command pkexec exited with code 127");
    expect(errorLog).toHaveBeenCalledWith(
      "[auto-updater] installer diagnostic",
      "Error executing command as another user: No authentication agent found.",
    );
  });
});

describe("checkForAppUpdate", () => {
  beforeEach(() => {
    brandMock.automaticUpdates = true;
    autoUpdaterMock.checkForUpdates.mockReset();
  });

  it("explains manual updates without contacting the upstream release channel", async () => {
    brandMock.automaticUpdates = false;
    const result = await checkForAppUpdate({
      currentVersion: "1.2.3",
      releaseChannel: "stable",
      intent: "manual",
    });
    expect(result).toEqual({
      hasUpdate: false,
      readyToInstall: false,
      downloadProgress: null,
      currentVersion: "1.2.3",
      latestVersion: "1.2.3",
      body: null,
      date: null,
      errorMessage: "ClawMuse uses manual updates until a dedicated release channel is configured.",
    });
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled();
  });

  it("treats an unpublished channel manifest as an unavailable update", async () => {
    const error = Object.assign(new Error("Cannot find latest-mac.yml"), {
      code: "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND",
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    autoUpdaterMock.checkForUpdates.mockImplementationOnce(async () => {
      autoUpdaterMock.logger.error(error);
      autoUpdaterMock.emit("error", error);
      throw error;
    });

    const result = await checkForAppUpdate({
      currentVersion: "1.2.3",
      releaseChannel: "stable",
      intent: "manual",
    });

    expect(result).toEqual({
      hasUpdate: false,
      readyToInstall: false,
      downloadProgress: null,
      currentVersion: "1.2.3",
      latestVersion: "1.2.3",
      body: null,
      date: null,
      errorMessage: null,
    });
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("keeps genuine updater failures visible", async () => {
    const error = new Error("network down");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    autoUpdaterMock.checkForUpdates.mockImplementationOnce(async () => {
      autoUpdaterMock.logger.error(error);
      autoUpdaterMock.emit("error", error);
      throw error;
    });

    const result = await checkForAppUpdate({
      currentVersion: "1.2.3",
      releaseChannel: "stable",
      intent: "manual",
    });

    expect(result.errorMessage).toBe("network down");
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("logs the update handoff with current and selected target versions", () => {
    const info = vi.fn();
    const lifecycleLog = createAppUpdateLifecycleLogger({ info });

    lifecycleLog.checkStarted({
      currentVersion: "1.2.3",
      releaseChannel: "stable",
      intent: "manual",
    });
    lifecycleLog.checkCompleted({
      currentVersion: "1.2.3",
      targetVersion: "1.2.5",
      releaseChannel: "stable",
      intent: "manual",
      hasUpdate: true,
      readyToInstall: true,
      errorMessage: null,
    });
    lifecycleLog.updateDownloaded("1.2.4");
    lifecycleLog.downloadRequested("1.2.5");
    lifecycleLog.quitAndInstallRequested({
      targetVersion: "1.2.5",
      isSilent: false,
      isForceRunAfter: true,
    });

    expect(info).toHaveBeenCalledWith("[auto-updater] check started", {
      currentVersion: "1.2.3",
      releaseChannel: "stable",
      intent: "manual",
    });
    expect(info).toHaveBeenCalledWith("[auto-updater] update downloaded", {
      targetVersion: "1.2.4",
    });
    expect(info).toHaveBeenCalledWith("[auto-updater] download requested", {
      targetVersion: "1.2.5",
    });
    expect(info).toHaveBeenCalledWith("[auto-updater] quitAndInstall requested", {
      targetVersion: "1.2.5",
      isSilent: false,
      isForceRunAfter: true,
    });
  });
});

describe("shouldInstallAppUpdateOnQuit", () => {
  it("keeps Linux AppImage updates on the manual install path", () => {
    expect(shouldInstallAppUpdateOnQuit({ platform: "linux", isAppImage: true })).toBe(false);
    expect(shouldInstallAppUpdateOnQuit({ platform: "linux", isAppImage: false })).toBe(true);
    expect(shouldInstallAppUpdateOnQuit({ platform: "darwin", isAppImage: false })).toBe(true);
    expect(shouldInstallAppUpdateOnQuit({ platform: "win32", isAppImage: false })).toBe(true);
  });
});

describe("shouldAdmitToRollout", () => {
  it("admits beta, missing rollout hours, zero-hour rollout, and missing release date", () => {
    expect(
      shouldAdmitToRollout({
        channel: "beta",
        rolloutHours: 24,
        releaseDate: "2026-04-28T00:00:00.000Z",
        now: Date.parse("2026-04-28T01:00:00.000Z"),
        bucket: 0.99,
      }),
    ).toBe(true);
    expect(
      shouldAdmitToRollout({
        channel: "stable",
        rolloutHours: undefined,
        releaseDate: "2026-04-28T00:00:00.000Z",
        now: Date.parse("2026-04-28T01:00:00.000Z"),
        bucket: 0.99,
      }),
    ).toBe(true);
    expect(
      shouldAdmitToRollout({
        channel: "stable",
        rolloutHours: 0,
        releaseDate: "2026-04-28T00:00:00.000Z",
        now: Date.parse("2026-04-28T01:00:00.000Z"),
        bucket: 0.99,
      }),
    ).toBe(true);
    expect(
      shouldAdmitToRollout({
        channel: "stable",
        rolloutHours: 24,
        releaseDate: undefined,
        now: Date.parse("2026-04-28T01:00:00.000Z"),
        bucket: 0.99,
      }),
    ).toBe(true);
  });

  it("blocks future releases and respects the linear threshold mid-rollout", () => {
    expect(
      shouldAdmitToRollout({
        channel: "stable",
        rolloutHours: 24,
        releaseDate: "2026-04-28T02:00:00.000Z",
        now: Date.parse("2026-04-28T01:00:00.000Z"),
        bucket: 0,
      }),
    ).toBe(false);
    expect(
      shouldAdmitToRollout({
        channel: "stable",
        rolloutHours: 24,
        releaseDate: "2026-04-28T00:00:00.000Z",
        now: Date.parse("2026-04-28T12:00:00.000Z"),
        bucket: 0.49,
      }),
    ).toBe(true);
    expect(
      shouldAdmitToRollout({
        channel: "stable",
        rolloutHours: 24,
        releaseDate: "2026-04-28T00:00:00.000Z",
        now: Date.parse("2026-04-28T12:00:00.000Z"),
        bucket: 0.51,
      }),
    ).toBe(false);
  });

  it("blocks the bucket-zero client at exact release time, admits as soon as time advances", () => {
    expect(
      shouldAdmitToRollout({
        channel: "stable",
        rolloutHours: 24,
        releaseDate: "2026-04-28T00:00:00.000Z",
        now: Date.parse("2026-04-28T00:00:00.000Z"),
        bucket: 0,
      }),
    ).toBe(false);
    expect(
      shouldAdmitToRollout({
        channel: "stable",
        rolloutHours: 24,
        releaseDate: "2026-04-28T00:00:00.000Z",
        now: Date.parse("2026-04-28T00:00:00.001Z"),
        bucket: 0,
      }),
    ).toBe(true);
  });

  it("admits the highest-bucket client at and past the rollout end", () => {
    const maxBucket = (0x100000000 - 1) / 0x100000000;
    expect(
      shouldAdmitToRollout({
        channel: "stable",
        rolloutHours: 24,
        releaseDate: "2026-04-28T00:00:00.000Z",
        now: Date.parse("2026-04-29T00:00:00.000Z"),
        bucket: maxBucket,
      }),
    ).toBe(true);
    expect(
      shouldAdmitToRollout({
        channel: "stable",
        rolloutHours: 24,
        releaseDate: "2026-04-28T00:00:00.000Z",
        now: Date.parse("2027-04-28T00:00:00.000Z"),
        bucket: maxBucket,
      }),
    ).toBe(true);
  });

  it("admits when releaseDate is unparseable", () => {
    expect(
      shouldAdmitToRollout({
        channel: "stable",
        rolloutHours: 24,
        releaseDate: "not a date",
        now: Date.parse("2026-04-28T12:00:00.000Z"),
        bucket: 0.99,
      }),
    ).toBe(true);
  });

  it("treats garbage manifest rollout fields as missing and admits", () => {
    const parsed = rolloutManifestSchema.parse({
      rolloutHours: "not a number",
      releaseDate: 12345,
    });

    expect(
      shouldAdmitToRollout({
        channel: "stable",
        rolloutHours: parsed.rolloutHours,
        releaseDate: parsed.releaseDate,
        now: Date.parse("2026-04-28T12:00:00.000Z"),
        bucket: 0.99,
      }),
    ).toBe(true);
  });

  it("maps the maximum 32-bit slot to a bucket strictly less than 1", () => {
    const allOnes = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    const allZeros = "00000000-0000-0000-0000-000000000000";
    expect(bucketFromStagingUserId(allOnes)).toBeLessThan(1);
    expect(bucketFromStagingUserId(allOnes)).toBeGreaterThan(0.999);
    expect(bucketFromStagingUserId(allZeros)).toBe(0);
  });

  it("creates and then reuses the on-disk staging user id", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "paseo-updater-id-"));
    const filePath = path.join(tempDir, ".updaterId");

    try {
      const first = await resolveStagingUserId(filePath);
      const stored = (await readFile(filePath, "utf8")).trim();
      const second = await resolveStagingUserId(filePath);

      expect(UUID.check(stored)).toBeTruthy();
      expect(second).toBe(first);
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  });
});

describe("Mac bundle replacement", () => {
  it("resolves the installed app and rejects translocated launches", () => {
    expect(macAppPath("/Applications/ClawMuse.app/Contents/MacOS/ClawMuse")).toBe(
      "/Applications/ClawMuse.app",
    );
    expect(() => macAppPath("/AppTranslocation/id/ClawMuse.app/Contents/MacOS/ClawMuse")).toThrow(
      "Applications",
    );
    expect(() => macAppPath("/usr/bin/node")).toThrow("Applications");
  });

  it.runIf(process.platform !== "win32")(
    "swaps complete bundles using literal paths after the app exits",
    async () => {
      const fixture = await createMacBundleFixture();
      try {
        const result = spawnSync(
          "/bin/bash",
          [
            fixture.script,
            fixture.staging,
            fixture.target,
            "2147483647",
            "0",
            "0",
            "^/not-a-running-clawmuse/",
          ],
          { encoding: "utf8" },
        );
        expect(result.status, result.stderr).toBe(0);
        expect(await readFile(path.join(fixture.target, "Contents", "version"), "utf8")).toBe(
          "new",
        );
        await expect(access(fixture.staging)).rejects.toMatchObject({ code: "ENOENT" });
      } finally {
        await rm(fixture.root, { recursive: true, force: true });
      }
    },
  );

  it.runIf(process.platform !== "win32")(
    "keeps the installed app when it has not exited",
    async () => {
      const fixture = await createMacBundleFixture();
      try {
        const result = spawnSync(
          "/bin/bash",
          [
            fixture.script,
            fixture.staging,
            fixture.target,
            String(process.pid),
            "0",
            "0",
            "^/not-a-running-clawmuse/",
          ],
          { encoding: "utf8" },
        );
        expect(result.status).not.toBe(0);
        expect(await readFile(path.join(fixture.target, "Contents", "version"), "utf8")).toBe(
          "old",
        );
      } finally {
        await rm(fixture.root, { recursive: true, force: true });
      }
    },
  );

  it.runIf(process.platform !== "win32")(
    "restores the previous bundle if the replacement move fails",
    async () => {
      const fixture = await createMacBundleFixture();
      try {
        const bin = path.join(fixture.root, "bin");
        await mkdir(bin);
        const mv = path.join(bin, "mv");
        // Inject a failed second rename while all successful moves use the real filesystem.
        await writeFile(
          mv,
          '#!/usr/bin/env bash\nif [ "$1" = "$FAIL_MOVE_SOURCE" ]; then exit 1; fi\nexec /bin/mv "$@"\n',
        );
        await chmod(mv, 0o700);
        const result = spawnSync(
          "/bin/bash",
          [
            fixture.script,
            fixture.staging,
            fixture.target,
            "2147483647",
            "0",
            "0",
            "^/not-a-running-clawmuse/",
          ],
          {
            encoding: "utf8",
            env: {
              ...process.env,
              PATH: `${bin}:${process.env.PATH}`,
              FAIL_MOVE_SOURCE: path.join(fixture.staging, path.basename(fixture.target)),
            },
          },
        );
        expect(result.status).not.toBe(0);
        expect(await readFile(path.join(fixture.target, "Contents", "version"), "utf8")).toBe(
          "old",
        );
      } finally {
        await rm(fixture.root, { recursive: true, force: true });
      }
    },
  );
});

async function createMacBundleFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "clawmuse-bundle-test-"));
  const target = path.join(root, "ClawMuse '$ test.app");
  const staging = path.join(root, "staging");
  const candidate = path.join(staging, path.basename(target));
  await mkdir(path.join(target, "Contents"), { recursive: true });
  await mkdir(path.join(candidate, "Contents"), { recursive: true });
  await writeFile(path.join(target, "Contents", "version"), "old");
  await writeFile(path.join(candidate, "Contents", "version"), "new");
  const script = path.join(root, "install.sh");
  await writeFile(script, MAC_BUNDLE_INSTALL_SCRIPT);
  return { root, target, staging, script };
}

describe.runIf(process.platform === "darwin")("Mac archive preparation", () => {
  it("checks the exact date build identity separately from the native marketing version", async () => {
    const fixture = await createMacArchiveFixture("1.5.5+1108");
    try {
      const input = {
        zipPath: fixture.zip,
        executable: fixture.executable,
        bundleId: "sh.paseo.desktop",
        version: "1.5.5+1108",
      };
      expect((await prepareMacBundleInstallation(input)).version).toBe("1.5.5+1108");
      await expect(
        prepareMacBundleInstallation({ ...input, version: "1.5.5+1109" }),
      ).rejects.toThrow("does not match");
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });
  it("extracts and checks a real ZIP without a Developer ID identity", async () => {
    const fixture = await createMacArchiveFixture();
    try {
      const installation = await prepareMacBundleInstallation({
        zipPath: fixture.zip,
        executable: fixture.executable,
        bundleId: "sh.paseo.desktop",
        version: "0.13.0-beta.5",
      });
      expect(installation.appPath).toBe(fixture.target);
      expect(installation.version).toBe("0.13.0-beta.5");
      const result = spawnSync(
        "/bin/bash",
        [
          fixture.script,
          installation.staging,
          installation.appPath,
          "2147483647",
          "0",
          "0",
          "^/not-a-running-clawmuse/",
        ],
        { encoding: "utf8" },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(await readFile(path.join(fixture.target, "Contents", "version"), "utf8")).toBe("new");
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects an archive with another application identity or version", async () => {
    const fixture = await createMacArchiveFixture();
    try {
      for (const [bundleId, version] of [
        ["another.app", "0.13.0-beta.5"],
        ["sh.paseo.desktop", "0.13.0-beta.6"],
      ]) {
        await expect(
          prepareMacBundleInstallation({
            zipPath: fixture.zip,
            executable: fixture.executable,
            bundleId,
            version,
          }),
        ).rejects.toThrow("does not match");
        expect(await readFile(path.join(fixture.target, "Contents", "version"), "utf8")).toBe(
          "old",
        );
      }
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });
});

async function createMacArchiveFixture(version = "0.13.0-beta.5") {
  const fixture = await createMacBundleFixture();
  const contents = path.join(fixture.staging, path.basename(fixture.target), "Contents");
  await writeFile(
    path.join(contents, "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>sh.paseo.desktop</string><key>CFBundleShortVersionString</key><string>${version.split("+")[0]}</string><key>ClawMuseReleaseVersion</key><string>${version}</string></dict></plist>`,
  );
  await mkdir(path.join(contents, "MacOS"));
  const binary = path.join(contents, "MacOS", "ClawMuse");
  await writeFile(binary, "#!/bin/sh\nexit 0\n");
  await chmod(binary, 0o700);
  const zip = path.join(fixture.root, "ClawMuse.zip");
  const compressed = spawnSync(
    "/usr/bin/ditto",
    ["-c", "-k", "--keepParent", path.dirname(contents), zip],
    { encoding: "utf8" },
  );
  expect(compressed.status, compressed.stderr).toBe(0);
  return {
    ...fixture,
    zip,
    executable: path.join(fixture.target, "Contents", "MacOS", "ClawMuse"),
  };
}
