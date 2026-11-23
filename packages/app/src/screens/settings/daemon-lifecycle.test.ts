import {
  applyMobileUpdate,
  checkAndDownloadMobileUpdate,
  formatMobileUpdateError,
} from "./updates/mobile-update-actions";
import { updateStatus } from "./updates/mobile-updates-view";
import { expect, test } from "vitest";
import { restartDaemonFromSettings, updateDaemonFromSettings } from "./daemon-lifecycle";

test("settings restart completes when a replacement worker is observed without a sampled disconnect", async () => {
  let pid = 10;
  await restartDaemonFromSettings("daemon", "settings", {
    getStatus: async () => ({ pid, version: "1.0.0", serverId: "daemon" }),
    restartServer: async () => {
      pid = 11;
    },
  });
  expect(pid).toBe(11);
});

test("settings restart keeps terminals by default and closes them only when asked", async () => {
  let pid = 10;
  const requests: Array<{ killTerminals: boolean }> = [];
  const deps = {
    getStatus: async () => ({ pid, version: "1.0.0", serverId: "daemon" }),
    restartServer: async (_reason: string, options: { killTerminals: boolean }) => {
      requests.push(options);
      pid += 1;
    },
  };
  await restartDaemonFromSettings("daemon", "settings", deps);
  await restartDaemonFromSettings("daemon", "settings", deps, { killTerminals: true });
  expect(requests).toEqual([{ killTerminals: false }, { killTerminals: true }]);
});

test("a close-terminals restart completes when the replacement reports every terminal closed", async () => {
  let pid = 10;
  await restartDaemonFromSettings(
    "daemon",
    "settings",
    {
      getStatus: async () => ({
        pid,
        version: "1.0.0",
        serverId: "daemon",
        terminalCleanupUnconfirmed: [],
      }),
      restartServer: async () => {
        pid = 11;
      },
    },
    { killTerminals: true },
  );
  expect(pid).toBe(11);
});

test("a close-terminals restart fails with the processes the replacement could not confirm closed", async () => {
  let pid = 10;
  const leftover = {
    pid: 4242,
    role: "terminal program",
    reason: "still alive",
    detail: "survived SIGKILL",
  };
  const deps = {
    getStatus: async () => ({
      pid,
      version: "1.0.0",
      serverId: "daemon",
      terminalCleanupUnconfirmed: pid === 10 ? [] : [leftover],
    }),
    restartServer: async () => {
      pid += 1;
    },
  };

  await expect(
    restartDaemonFromSettings("daemon", "settings", deps, { killTerminals: true }),
  ).rejects.toThrow("pid 4242 (terminal program): still alive (survived SIGKILL)");
  // Keeping terminals asks nothing of the cleanup, so a leftover does not fail it.
  await restartDaemonFromSettings("daemon", "settings", deps);
});

test("a status permission failure prevents the restart request", async () => {
  let restarted = false;
  await expect(
    restartDaemonFromSettings("daemon", "settings", {
      getStatus: async () => {
        throw new Error("Permission denied");
      },
      restartServer: async () => {
        restarted = true;
      },
    }),
  ).rejects.toThrow("Permission denied");
  expect(restarted).toBe(false);
});

test("a different responder fails confirmation immediately", async () => {
  let serverId = "daemon";
  await expect(
    restartDaemonFromSettings("daemon", "settings", {
      getStatus: async () => ({ pid: 10, version: "1.0.0", serverId }),
      restartServer: async () => {
        serverId = "other";
      },
    }),
  ).rejects.toThrow("identity changed");
});

test("a lost restart acknowledgment can still confirm the replacement", async () => {
  let pid = 10;
  await restartDaemonFromSettings("daemon", "settings", {
    getStatus: async () => ({ pid, version: "1.0.0", serverId: "daemon" }),
    restartServer: async () => {
      pid = 11;
      throw Object.assign(new Error("Connection lost"), { code: "DAEMON_CONNECTION_LOST" });
    },
  });
  expect(pid).toBe(11);
});

test("installation and worker version confirmation are separate outcomes", async () => {
  let pid = 10;
  await expect(
    updateDaemonFromSettings("daemon", {
      getStatus: async () => ({ pid, version: "1.0.0", serverId: "daemon" }),
      updateDaemon: async () => {
        pid = 11;
        return { success: true, error: null, newVersion: "2.0.0" };
      },
    }),
  ).rejects.toThrow("Package installed; replacement worker version was not confirmed");
});

test("an installed version is confirmed only in its replacement worker", async () => {
  let pid = 10,
    version = "1.0.0";
  await expect(
    updateDaemonFromSettings("daemon", {
      getStatus: async () => ({ pid, version, serverId: "daemon" }),
      updateDaemon: async () => {
        pid = 11;
        version = "2.0.0";
        return { success: true, error: null, newVersion: version };
      },
    }),
  ).resolves.toEqual({ workerVersion: "2.0.0" });
});

test("RPC errors mentioning transport are not retried", async () => {
  let requested = false;
  await expect(
    restartDaemonFromSettings("daemon", "settings", {
      getStatus: async () => {
        if (requested)
          throw Object.assign(new Error("Connection policy denied by plugin"), {
            code: "permission_denied",
          });
        return { pid: 10, version: "1.0.0", serverId: "daemon" };
      },
      restartServer: async () => {
        requested = true;
      },
    }),
  ).rejects.toThrow("Connection policy denied by plugin");
});

test("a mobile update downloads without restarting the app", async () => {
  const calls: string[] = [];
  const result = await checkAndDownloadMobileUpdate(
    {
      checkForUpdateAsync: async () => {
        calls.push("check");
        return { isAvailable: true, isRollBackToEmbedded: false };
      },
      fetchUpdateAsync: async () => {
        calls.push("download");
        return { isNew: true, isRollBackToEmbedded: false };
      },
    },
    "Download failed",
  );
  expect(result).toBe("downloaded");
  expect(calls).toEqual(["check", "download"]);
});

test("a current mobile build does not download again", async () => {
  await expect(
    checkAndDownloadMobileUpdate(
      {
        checkForUpdateAsync: async () => ({ isAvailable: false, isRollBackToEmbedded: false }),
        fetchUpdateAsync: async () => {
          throw new Error("Unexpected download");
        },
      },
      "Download failed",
    ),
  ).resolves.toBe("current");
});

test("a failed mobile download cannot be shown as ready to apply", async () => {
  await expect(
    checkAndDownloadMobileUpdate(
      {
        checkForUpdateAsync: async () => ({ isAvailable: true, isRollBackToEmbedded: false }),
        fetchUpdateAsync: async () => ({ isNew: false, isRollBackToEmbedded: false }),
      },
      "Download failed",
    ),
  ).rejects.toThrow("Download failed");
});

test("mobile updates can honor a server rollback to the embedded bundle", async () => {
  await expect(
    checkAndDownloadMobileUpdate(
      {
        checkForUpdateAsync: async () => ({ isAvailable: false, isRollBackToEmbedded: true }),
        fetchUpdateAsync: async () => ({ isNew: false, isRollBackToEmbedded: true }),
      },
      "Download failed",
    ),
  ).resolves.toBe("downloaded");
});

test("applying a mobile update restarts only after confirmation", async () => {
  let restarted = 0;
  const reload = async () => {
    restarted++;
  };
  await applyMobileUpdate({ confirm: async () => false, reload });
  expect(restarted).toBe(0);
  await applyMobileUpdate({ confirm: async () => true, reload });
  expect(restarted).toBe(1);
});

test("checkAndDownloadMobileUpdate retries fetchUpdateAsync once on transient failure", async () => {
  let fetchAttempts = 0;
  const result = await checkAndDownloadMobileUpdate(
    {
      checkForUpdateAsync: async () => ({ isAvailable: true, isRollBackToEmbedded: false }),
      fetchUpdateAsync: async () => {
        fetchAttempts++;
        if (fetchAttempts === 1) {
          throw new Error(
            "ERR_UPDATES_FETCH: Failed to load all assets (at ExpoModulesCore/Promise.swift:65)",
          );
        }
        return { isNew: true, isRollBackToEmbedded: false };
      },
    },
    "Download failed",
  );
  expect(result).toBe("downloaded");
  expect(fetchAttempts).toBe(2);
});

test("checkAndDownloadMobileUpdate rejects if retry fetch also fails", async () => {
  let fetchAttempts = 0;
  await expect(
    checkAndDownloadMobileUpdate(
      {
        checkForUpdateAsync: async () => ({ isAvailable: true, isRollBackToEmbedded: false }),
        fetchUpdateAsync: async () => {
          fetchAttempts++;
          throw new Error("ERR_UPDATES_FETCH: Failed to load all assets");
        },
      },
      "Download failed",
    ),
  ).rejects.toThrow("ERR_UPDATES_FETCH: Failed to load all assets");
  expect(fetchAttempts).toBe(2);
});

test("formatMobileUpdateError strips raw Expo error code and Swift source location", () => {
  expect(formatMobileUpdateError(undefined)).toBeUndefined();
  expect(formatMobileUpdateError("   ")).toBeUndefined();
  expect(
    formatMobileUpdateError(
      "ERR_UPDATES_FETCH: Failed to load all assets (at ExpoModulesCore/Promise.swift:65)",
    ),
  ).toBe("Failed to load all assets");
  expect(formatMobileUpdateError("Plain error message")).toBe("Plain error message");
});

test("updateStatus prefers error, available, and checked over idle", () => {
  const t = ((key: string) => key) as Parameters<typeof updateStatus>[1];
  expect(
    updateStatus(
      {
        buildNumber: "1006000001",
        enabled: true,
        error: "Failed to load all assets",
        lastChecked: new Date(),
      },
      t,
    ),
  ).toBe("mobileUpdates.errorStatus");
  expect(updateStatus({ buildNumber: "1006000001", enabled: true, available: true }, t)).toBe(
    "mobileUpdates.available",
  );
  expect(updateStatus({ buildNumber: "1006000001", enabled: true, checked: true }, t)).toBe(
    "mobileUpdates.current",
  );
  expect(
    updateStatus(
      {
        buildNumber: "1006000001",
        enabled: true,
        pending: true,
        error: "Failed earlier",
      },
      t,
    ),
  ).toBe("mobileUpdates.ready");
});
