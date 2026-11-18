import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  userData: "",
  handler: null as ((event: unknown, input: unknown) => Promise<unknown>) | null,
  encryptionAvailable: true,
}));

vi.mock("electron", () => ({
  app: { getPath: () => state.userData, isPackaged: false },
  ipcMain: {
    handle: (_channel: string, fn: (event: unknown, input: unknown) => Promise<unknown>) => {
      state.handler = fn;
    },
  },
  safeStorage: {
    isEncryptionAvailable: () => state.encryptionAvailable,
    getSelectedStorageBackend: () => "kwallet6",
    encryptString: (value: string) => Buffer.from(`enc:${value}`, "utf8"),
    decryptString: (value: Buffer) => value.toString("utf8").replace(/^enc:/, ""),
  },
}));

vi.mock("./trusted-renderer.js", () => ({
  assertTrustedRendererCaller: () => {},
}));

vi.mock("../daemon/remote-access-policy.js", () => ({
  readControlledOnlyPolicy: () => false,
}));

const { registerClawMuseAccount } = await import("./clawmuse-account.js");

describe("desktop ClawMuse account IPC", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    state.userData = mkdtempSync(join(tmpdir(), "clawmuse-account-test-"));
    state.encryptionAvailable = true;
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    registerClawMuseAccount("http://localhost:8081");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(state.userData, { recursive: true, force: true });
  });

  it("returns null session without network or keychain access when signed out", async () => {
    state.encryptionAvailable = false;
    const result = await state.handler!({}, { path: "/get-session" });
    expect(result).toEqual({ status: 200, data: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("verifies a stored session against the Hub and handles non-JSON gateway failures", async () => {
    writeFileSync(join(state.userData, "clawmuse-session.enc"), "enc:stored-token");
    fetchMock.mockResolvedValueOnce(
      new Response("<html>504 Gateway Time-out</html>", {
        status: 504,
        headers: { "content-type": "text/html" },
      }),
    );
    const failed = await state.handler!({}, { path: "/get-session" });
    expect(failed).toEqual({ status: 504, data: null });
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("authorization")).toBe(
      "Bearer stored-token",
    );
  });
});
