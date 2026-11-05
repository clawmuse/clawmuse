import { afterEach, describe, expect, it, vi } from "vitest";

const vault = vi.fn();
let host: { clawmuseStatusVault?: typeof vault } | null = null;

vi.mock("@/desktop/host", () => ({
  getDesktopHost: () => host,
}));
vi.mock("@/constants/platform", () => ({ isWeb: true, getIsElectron: () => !!host }));

async function load() {
  vi.resetModules();
  return import("./secure-store.web");
}

afterEach(() => {
  vault.mockReset();
  host = null;
  vi.unstubAllGlobals();
});

describe("desktop secure store", () => {
  it("rejects a browser without a secure context", async () => {
    const store = await load();
    expect(store.secureStoreSupported).toBe(false);
    await expect(Promise.resolve().then(() => store.getSecureItem("k"))).rejects.toThrow(
      /桌面端或手机 App/,
    );
  });

  it("keeps secure-browser sessions in memory, loses them on reload, and clears on sign-out", async () => {
    const diskRead = vi.fn(() => {
      throw new Error("disk access forbidden");
    });
    vi.stubGlobal("window", { isSecureContext: true });
    vi.stubGlobal("localStorage", { getItem: diskRead, setItem: diskRead });
    vi.stubGlobal("sessionStorage", { getItem: diskRead, setItem: diskRead });
    vi.stubGlobal("indexedDB", { open: diskRead });
    const store = await load();
    expect(store.secureStoreSupported).toBe(true);
    expect(store.statusSessionIsEphemeral).toBe(true);
    await store.setSecureItem("session", "refresh-token");
    expect(await store.getSecureItem("session")).toBe("refresh-token");
    const reloaded = await load();
    expect(await reloaded.getSecureItem("session")).toBeNull();
    await store.deleteSecureItem("session");
    expect(await store.getSecureItem("session")).toBeNull();
    expect(diskRead).not.toHaveBeenCalled();
  });

  it("never falls back to memory when an Electron bridge lacks its vault", async () => {
    host = {};
    vi.stubGlobal("window", { isSecureContext: true });
    const store = await load();
    expect(store.secureStoreSupported).toBe(false);
    await expect(store.setSecureItem("session", "token")).rejects.toThrow();
  });

  it("routes reads, writes, and deletes to the Electron vault", async () => {
    host = { clawmuseStatusVault: vault };
    vault.mockResolvedValueOnce("stored").mockResolvedValue(null);
    const store = await load();
    expect(store.secureStoreSupported).toBe(true);
    expect(await store.getSecureItem("clawmuse.status.session.v1")).toBe("stored");
    await store.setSecureItem("clawmuse.status.session.v1", "{}");
    await store.deleteSecureItem("clawmuse.status.session.v1");
    expect(vault.mock.calls).toEqual([
      [{ op: "get", key: "clawmuse.status.session.v1" }],
      [{ op: "set", key: "clawmuse.status.session.v1", value: "{}" }],
      [{ op: "delete", key: "clawmuse.status.session.v1" }],
    ]);
  });
  it("does not fall back to browser storage when the OS vault rejects a read", async () => {
    host = { clawmuseStatusVault: vault };
    vault.mockRejectedValue(new Error("OS credential store locked"));
    const browserRead = vi.fn();
    vi.stubGlobal("localStorage", { getItem: browserRead });
    try {
      const store = await load();
      await expect(store.getSecureItem("clawmuse.status.session.v1")).rejects.toThrow(
        "OS credential store locked",
      );
      expect(browserRead).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
