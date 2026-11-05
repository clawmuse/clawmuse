import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/desktop/host", () => ({ getDesktopHost: () => null }));

const { accountRequest, accountSupported } = await import("./transport.web");

describe("browser account transport", () => {
  const storage = new Map<string, string>();
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    storage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function respond(status: number, data: unknown, token?: string) {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(data), {
        status,
        headers: token ? { "set-auth-token": token } : {},
      }),
    );
  }

  it("keeps a bearer session without sending cookies", async () => {
    expect(accountSupported).toBe(true);
    respond(200, { user: {} }, "signed-token");
    await accountRequest("/sign-in/email", { email: "a@example.test", password: "secret" });
    const [, signIn] = fetchMock.mock.calls[0]!;
    expect(signIn?.credentials).toBe("omit");
    expect(new Headers(signIn?.headers).has("authorization")).toBe(false);

    respond(200, { account: null, devices: [] });
    const result = await accountRequest("/clawmuse/devices");
    expect(result.status).toBe(200);
    const [url, discover] = fetchMock.mock.calls[1]!;
    expect(String(url)).toMatch(/\/api\/auth\/clawmuse\/devices$/);
    expect(new Headers(discover?.headers).get("authorization")).toBe("Bearer signed-token");
  });

  it("forgets the session when the Hub rejects it or the user signs out", async () => {
    storage.set("clawmuse.account.session", "expired");
    respond(401, { error: "unauthorized" });
    await accountRequest("/get-session");
    expect(storage.size).toBe(0);

    storage.set("clawmuse.account.session", "active");
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    await expect(accountRequest("/sign-out", {})).rejects.toThrow("offline");
    expect(storage.size).toBe(0);
  });
});
