import { app, ipcMain, safeStorage } from "electron";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assertTrustedRendererCaller } from "./trusted-renderer.js";

/**
 * The ClawMuse Status session (installation id + refresh token) and pending
 * enrollment attempts. The phone keeps these in the iOS Keychain; the desktop
 * keeps them encrypted with the OS keychain through safeStorage, in one file,
 * and refuses Linux's plaintext backend just like the account bridge.
 */
export const CLAWMUSE_STATUS_VAULT_KEYS: ReadonlySet<string> = new Set([
  "clawmuse.status.session.v1",
  "clawmuse.status.enrollment-attempts.v1",
]);

const MAX_VALUE_LENGTH = 64 * 1024;

export type ClawMuseStatusVaultRequest =
  | { op: "get"; key: string }
  | { op: "set"; key: string; value: string }
  | { op: "delete"; key: string };

export function parseClawMuseStatusVaultRequest(input: unknown): ClawMuseStatusVaultRequest {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid vault request");
  }
  const record = input as Record<string, unknown>;
  const key = record.key;
  if (typeof key !== "string" || !CLAWMUSE_STATUS_VAULT_KEYS.has(key)) {
    throw new Error("Invalid vault key");
  }
  switch (record.op) {
    case "get":
    case "delete":
      return { op: record.op, key };
    case "set": {
      const value = record.value;
      if (typeof value !== "string" || value.length > MAX_VALUE_LENGTH) {
        throw new Error("Invalid vault value");
      }
      return { op: "set", key, value };
    }
    default:
      throw new Error("Invalid vault operation");
  }
}

/** Applies one request to the decrypted map; returns the answer and the next map. */
export function applyClawMuseStatusVaultRequest(
  entries: Readonly<Record<string, string>>,
  request: ClawMuseStatusVaultRequest,
): { result: string | null; next: Record<string, string> | null } {
  switch (request.op) {
    case "get":
      return { result: entries[request.key] ?? null, next: null };
    case "set":
      return { result: null, next: { ...entries, [request.key]: request.value } };
    case "delete": {
      if (!(request.key in entries)) {
        return { result: null, next: null };
      }
      const { [request.key]: _removed, ...rest } = entries;
      return { result: null, next: rest };
    }
  }
}

function parseEntries(raw: string): Record<string, string> {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  const entries: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (CLAWMUSE_STATUS_VAULT_KEYS.has(key) && typeof value === "string") {
      entries[key] = value;
    }
  }
  return entries;
}

export function registerClawMuseStatusVault(devOrigin: string): void {
  const file = join(app.getPath("userData"), "clawmuse-status-vault.enc");
  let pending: Promise<unknown> = Promise.resolve();

  async function readEntries(): Promise<Record<string, string>> {
    try {
      return parseEntries(safeStorage.decryptString(await readFile(file)));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return {};
      }
      throw error;
    }
  }

  async function writeEntries(entries: Record<string, string>): Promise<void> {
    if (Object.keys(entries).length === 0) {
      await rm(file, { force: true });
      return;
    }
    await writeFile(`${file}.tmp`, safeStorage.encryptString(JSON.stringify(entries)), {
      mode: 0o600,
    });
    await rename(`${file}.tmp`, file);
  }

  ipcMain.handle("clawmuse:status-vault", (event, input: unknown) => {
    assertTrustedRendererCaller(event, devOrigin);
    const request = parseClawMuseStatusVaultRequest(input);
    const execute = async (): Promise<string | null> => {
      if (
        !safeStorage.isEncryptionAvailable() ||
        (process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text")
      ) {
        throw new Error("请先启用系统钥匙串，再关联 ClawMuse Status");
      }
      const { result, next } = applyClawMuseStatusVaultRequest(await readEntries(), request);
      if (next) {
        await writeEntries(next);
      }
      return result;
    };
    // Serialized so a read never observes a half-written file.
    const result = pending.then(execute);
    pending = result.catch(() => undefined);
    return result;
  });
}
