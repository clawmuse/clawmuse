import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => "/unused", isPackaged: true },
  ipcMain: { handle: vi.fn() },
  safeStorage: {},
  BrowserWindow: { fromWebContents: () => null },
}));

const { applyClawMuseStatusVaultRequest, parseClawMuseStatusVaultRequest } =
  await import("./clawmuse-status-vault.js");

const SESSION = "clawmuse.status.session.v1";

describe("ClawMuse Status vault requests", () => {
  it("accepts only the fixed keys and operations", () => {
    expect(parseClawMuseStatusVaultRequest({ op: "get", key: SESSION })).toEqual({
      op: "get",
      key: SESSION,
    });
    expect(() => parseClawMuseStatusVaultRequest({ op: "get", key: "clawmuse-session" })).toThrow(
      /key/,
    );
    expect(() => parseClawMuseStatusVaultRequest({ op: "list", key: SESSION })).toThrow(
      /operation/,
    );
    expect(() => parseClawMuseStatusVaultRequest({ op: "set", key: SESSION, value: 1 })).toThrow(
      /value/,
    );
    expect(() =>
      parseClawMuseStatusVaultRequest({ op: "set", key: SESSION, value: "x".repeat(70_000) }),
    ).toThrow(/value/);
    expect(() => parseClawMuseStatusVaultRequest(null)).toThrow(/request/);
  });

  it("reads, writes, and deletes against the decrypted map", () => {
    const empty = {};
    expect(applyClawMuseStatusVaultRequest(empty, { op: "get", key: SESSION })).toEqual({
      result: null,
      next: null,
    });
    const written = applyClawMuseStatusVaultRequest(empty, {
      op: "set",
      key: SESSION,
      value: "{}",
    });
    expect(written).toEqual({ result: null, next: { [SESSION]: "{}" } });
    const stored = written.next ?? {};
    expect(applyClawMuseStatusVaultRequest(stored, { op: "get", key: SESSION }).result).toBe("{}");
    expect(applyClawMuseStatusVaultRequest(stored, { op: "delete", key: SESSION })).toEqual({
      result: null,
      next: {},
    });
    // Deleting a missing key does not rewrite the file.
    expect(applyClawMuseStatusVaultRequest(empty, { op: "delete", key: SESSION }).next).toBeNull();
  });
});
