import { beforeEach, describe, expect, it, vi } from "vitest";

const secureStore = new Map<string, string>();
const androidNotifications = vi.hoisted(() => ({
  getPermissionsAsync: vi.fn(),
  getDevicePushTokenAsync: vi.fn(),
  setNotificationChannelAsync: vi.fn(),
}));
vi.mock("expo-notifications", () => ({
  ...androidNotifications,
  PermissionStatus: { GRANTED: "granted" },
  AndroidImportance: { DEFAULT: 3 },
}));

// The platform secure store (Keychain on the phone, the safeStorage vault on
// the desktop) is replaced by a map; the client only depends on this module.
vi.mock("./secure-store", () => ({
  secureStoreSupported: true,
  getSecureItem: async (key: string) => secureStore.get(key) ?? null,
  setSecureItem: async (key: string, value: string) => {
    secureStore.set(key, value);
  },
  deleteSecureItem: async (key: string) => {
    secureStore.delete(key);
  },
}));

let uuidCounter = 0;
vi.mock("expo-crypto", () => ({
  randomUUID: () => {
    uuidCounter += 1;
    return `00000000-0000-4000-8000-${String(uuidCounter).padStart(12, "0")}`;
  },
}));

const { ClawMuseStatusApiClient } = await import("./api");
const { parseClawMuseStatusStoredSession } = await import("./session-store");
const { readAndroidGoalPushToken } = await import("./android-push");

const BASE_URL = "https://status.example.com";
const CODE = "a".repeat(48);
const EXPIRES_AT = new Date(Date.now() + 600_000).toISOString();
const SESSION_KEY = "clawmuse.status.session.v1";

interface RecordedRequest {
  path: string;
  method: string;
  bearer: string | null;
  body: unknown;
}

type Responder = (request: RecordedRequest) => { status?: number; body: unknown };

function createFetch(responder: Responder) {
  const requests: RecordedRequest[] = [];
  const fetchImplementation = (async (url: string | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const authorization = headers.get("authorization");
    const request: RecordedRequest = {
      path: String(url).slice(BASE_URL.length),
      method: init?.method ?? "GET",
      bearer: authorization ? authorization.replace("Bearer ", "") : null,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
    };
    requests.push(request);
    const { status = 200, body } = responder(request);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetchImplementation, requests };
}

function storedSession() {
  const raw = secureStore.get(SESSION_KEY);
  return raw ? parseClawMuseStatusStoredSession(raw) : null;
}

beforeEach(() => {
  secureStore.clear();
  uuidCounter = 0;
});

describe("ClawMuseStatusApiClient.enroll", () => {
  it("sends execution-stop confirmation only after the caller explicitly supplies it", async () => {
    const goal = {
      id: "goal",
      repoKey: "remote:example.invalid/repo",
      repoDisplayName: "repo",
      title: "Resume",
      summary: "Resume safely",
      acceptance: "Checked",
      origin: "manual",
      status: "accepted",
      reviewReason: null,
      priority: 3,
      budgetRuns: 3,
      runsUsed: 1,
      expiresAt: null,
      decidedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      latestReport: null,
      currentRun: null,
    };
    const { fetchImplementation, requests } = createFetch((request) => ({
      body:
        request.path === "/v1/mobile/enrollments"
          ? {
              installationId: "installation-1",
              hostId: "host",
              accessToken: "access",
              refreshToken: "refresh",
              expiresIn: 900,
            }
          : { goal },
    }));
    const api = new ClawMuseStatusApiClient(BASE_URL, fetchImplementation);
    await api.enroll({ serverId: "server", relayHostId: "AbCdEfGhIjKlMnOp" }, CODE, EXPIRES_AT);
    await api.continueGoal("goal");
    await api.continueGoal("goal", { confirmExecutionStopped: true });
    expect(requests[1]?.body).toEqual({});
    expect(requests[2]?.body).toEqual({ confirmExecutionStopped: true });
    await api.close();
  });
  it("uses Android notification permission and creates a channel before requesting an FCM token", async () => {
    androidNotifications.getPermissionsAsync
      .mockResolvedValueOnce({ status: "denied" })
      .mockResolvedValueOnce({ status: "granted" });
    androidNotifications.getDevicePushTokenAsync.mockResolvedValueOnce({
      data: "AbCd:EfGh_IjKl-MnOp",
    });
    expect(await readAndroidGoalPushToken()).toBeNull();
    expect(androidNotifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
    expect(await readAndroidGoalPushToken()).toBe("AbCd:EfGh_IjKl-MnOp");
    expect(androidNotifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      "clawmuse-goals",
      { name: "ClawMuse Goals", importance: 3 },
    );
    expect(
      androidNotifications.setNotificationChannelAsync.mock.invocationCallOrder[0],
    ).toBeLessThan(androidNotifications.getDevicePushTokenAsync.mock.invocationCallOrder[0]!);
  });
  it("registers and revokes case-sensitive Android endpoints through the current session", async () => {
    const { fetchImplementation, requests } = createFetch((request) => {
      if (request.path === "/v1/mobile/enrollments") {
        return {
          body: {
            installationId: "installation-1",
            hostId: "host-1",
            accessToken: "access-1",
            refreshToken: "refresh-1",
            expiresIn: 900,
          },
        };
      }
      return { body: request.method === "DELETE" ? { removed: 1 } : { registered: true } };
    });
    const api = new ClawMuseStatusApiClient(BASE_URL, fetchImplementation);
    await api.enroll({ serverId: "server-1", relayHostId: "AbCdEfGhIjKlMnOp" }, CODE, EXPIRES_AT);
    await api.registerPushEndpoint({ kind: "fcm_alert", token: "AbCd:EfGh_IjKl-MnOp" });
    expect(await api.unregisterAlertPushEndpoint("fcm_alert")).toBe(1);
    expect(requests.slice(1)).toEqual([
      {
        path: "/v1/mobile/push-endpoints",
        method: "POST",
        bearer: "access-1",
        body: { kind: "fcm_alert", token: "AbCd:EfGh_IjKl-MnOp" },
      },
      {
        path: "/v1/mobile/push-endpoints/fcm_alert",
        method: "DELETE",
        bearer: "access-1",
        body: null,
      },
    ]);
    await api.close();
  });
  it("creates the installation without a bearer and stores the binding", async () => {
    const { fetchImplementation, requests } = createFetch(() => ({
      body: {
        installationId: "installation-1",
        hostId: "host-uuid",
        accessToken: "access-1",
        refreshToken: "refresh-1",
        expiresIn: 900,
      },
    }));
    const api = new ClawMuseStatusApiClient(BASE_URL, fetchImplementation);

    await api.enroll({ serverId: "server-1", relayHostId: "AbCdEfGhIjKlMnOp" }, CODE, EXPIRES_AT);

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      path: "/v1/mobile/enrollments",
      method: "POST",
      bearer: null,
    });
    expect(storedSession()).toEqual({
      version: 1,
      baseUrl: BASE_URL,
      installationId: "installation-1",
      refreshToken: "refresh-1",
      boundHosts: { "server-1": "AbCdEfGhIjKlMnOp" },
    });
    expect(await api.isHostBound("server-1")).toBe(true);
    expect(await api.isHostBound("server-2")).toBe(false);
  });

  it("binds a second host with a bearer and keeps the existing refresh token", async () => {
    const { fetchImplementation, requests } = createFetch((request) =>
      request.bearer === null
        ? {
            body: {
              installationId: "installation-1",
              hostId: "host-1",
              accessToken: "access-1",
              refreshToken: "refresh-1",
              expiresIn: 900,
            },
          }
        : {
            body: {
              installationId: "installation-1",
              hostId: "host-2",
              accessToken: "access-2",
              expiresIn: 900,
            },
          },
    );
    const api = new ClawMuseStatusApiClient(BASE_URL, fetchImplementation);

    await api.enroll({ serverId: "server-1", relayHostId: "AbCdEfGhIjKlMnOp" }, CODE, EXPIRES_AT);
    await api.enroll({ serverId: "server-2", relayHostId: "QrStUvWxYz012345" }, CODE, EXPIRES_AT);

    expect(requests[1]?.bearer).toBe("access-1");
    expect(storedSession()).toMatchObject({
      refreshToken: "refresh-1",
      boundHosts: { "server-1": "AbCdEfGhIjKlMnOp", "server-2": "QrStUvWxYz012345" },
    });
  });

  it("reuses the idempotency key when the exchange is retried", async () => {
    let failFirst = true;
    const { fetchImplementation, requests } = createFetch(() => {
      if (failFirst) {
        failFirst = false;
        return { status: 503, body: { error: "unavailable" } };
      }
      return {
        body: {
          installationId: "installation-1",
          hostId: "host-1",
          accessToken: "access-1",
          refreshToken: "refresh-1",
          expiresIn: 900,
        },
      };
    });
    const api = new ClawMuseStatusApiClient(BASE_URL, fetchImplementation);

    await expect(
      api.enroll({ serverId: "server-1", relayHostId: "AbCdEfGhIjKlMnOp" }, CODE, EXPIRES_AT),
    ).rejects.toThrow();
    await api.enroll({ serverId: "server-1", relayHostId: "AbCdEfGhIjKlMnOp" }, CODE, EXPIRES_AT);

    const keys = requests.map(
      (request) => (request.body as { idempotencyKey: string }).idempotencyKey,
    );
    expect(keys[0]).toBe(keys[1]);
  });

  it("refuses an expired enrollment", async () => {
    const { fetchImplementation } = createFetch(() => ({ body: {} }));
    const api = new ClawMuseStatusApiClient(BASE_URL, fetchImplementation);
    await expect(
      api.enroll(
        { serverId: "server-1", relayHostId: "AbCdEfGhIjKlMnOp" },
        CODE,
        new Date(Date.now() - 1_000).toISOString(),
      ),
    ).rejects.toThrow("Status enrollment has expired");
  });
});

describe("ClawMuseStatusApiClient requests", () => {
  async function enrolledClient(responder: Responder) {
    const { fetchImplementation, requests } = createFetch((request) => {
      if (request.path === "/v1/mobile/enrollments") {
        return {
          body: {
            installationId: "installation-1",
            hostId: "host-1",
            accessToken: "access-1",
            refreshToken: "refresh-1",
            expiresIn: 900,
          },
        };
      }
      return responder(request);
    });
    const api = new ClawMuseStatusApiClient(BASE_URL, fetchImplementation);
    await api.enroll({ serverId: "server-1", relayHostId: "AbCdEfGhIjKlMnOp" }, CODE, EXPIRES_AT);
    requests.length = 0;
    return { api, requests };
  }

  it("parses the summary", async () => {
    const { api } = await enrolledClient(() => ({
      body: {
        connectivity: "live",
        runningCount: 3,
        needsActionCount: 2,
        completedUnreadCount: 1,
        unverifiableCount: 0,
        observedAt: "2026-08-30T12:00:20.000Z",
        usages: [],
        hosts: [],
      },
    }));
    expect((await api.getSummary()).runningCount).toBe(3);
  });

  it("refreshes the access token once on 401 and retries", async () => {
    let rejectedOnce = false;
    const { api, requests } = await enrolledClient((request) => {
      if (request.path === "/v1/mobile/sessions") {
        return {
          body: {
            installationId: "installation-1",
            accessToken: "access-2",
            refreshToken: "refresh-2",
            expiresIn: 900,
          },
        };
      }
      if (!rejectedOnce) {
        rejectedOnce = true;
        return { status: 401, body: { error: "token_expired" } };
      }
      return { body: { accessToken: "widget-token", expiresIn: 2_592_000 } };
    });

    expect(await api.issueWidgetToken()).toEqual({
      accessToken: "widget-token",
      expiresIn: 2_592_000,
    });
    expect(requests.map((request) => request.path)).toEqual([
      "/v1/mobile/widget-tokens",
      "/v1/mobile/sessions",
      "/v1/mobile/widget-tokens",
    ]);
    expect(storedSession()?.refreshToken).toBe("refresh-2");
  });

  it("drops the local binding after unbinding a host", async () => {
    const { api, requests } = await enrolledClient(() => ({ body: { revoked: 1 } }));
    expect(await api.unbindHost("AbCdEfGhIjKlMnOp", "server-1")).toBe(1);
    expect(requests[0]).toMatchObject({
      path: "/v1/mobile/hosts/AbCdEfGhIjKlMnOp",
      method: "DELETE",
    });
    expect(await api.getBoundHosts()).toEqual({});
    expect(storedSession()?.boundHosts).toEqual({});
  });

  it("reports how many activities the service ended", async () => {
    const { api } = await enrolledClient(() => ({ body: { cleared: 2 } }));
    expect(await api.resetLiveActivity()).toBe(2);
  });

  it("clears the session when the refresh token is rejected", async () => {
    const { api } = await enrolledClient((request) =>
      request.path === "/v1/mobile/sessions"
        ? { status: 401, body: { error: "refresh_token_revoked" } }
        : { status: 401, body: { error: "token_expired" } },
    );
    await expect(api.getSummary()).rejects.toThrow();
    expect(storedSession()).toBeNull();
    expect(await api.hasSession()).toBe(false);
  });
  it("clears the session on account change and refuses further network requests from the old client", async () => {
    secureStore.set(
      SESSION_KEY,
      JSON.stringify({
        version: 1,
        baseUrl: BASE_URL,
        installationId: "installation-one",
        refreshToken: "old-refresh-token",
        boundHosts: {},
      }),
    );
    const { fetchImplementation, requests } = createFetch(() => ({ body: {} }));
    const client = new ClawMuseStatusApiClient(BASE_URL, fetchImplementation);
    expect(await client.hasSession()).toBe(true);
    await client.close();
    expect(await client.hasSession()).toBe(false);
    expect(secureStore.has(SESSION_KEY)).toBe(false);
    await expect(client.listGoals("needs_review")).rejects.toThrow();
    expect(requests).toEqual([]);
  });

  it("binds a Status session to one personal account while allowing that account to reuse it", async () => {
    secureStore.set(
      SESSION_KEY,
      JSON.stringify({
        version: 1,
        baseUrl: BASE_URL,
        accountId: "A",
        installationId: "installation-A",
        refreshToken: "refresh-A",
        boundHosts: {},
      }),
    );
    const { fetchImplementation, requests } = createFetch(() => ({ body: {} }));
    const original = new ClawMuseStatusApiClient(BASE_URL, fetchImplementation, Date.now, "A");
    const different = new ClawMuseStatusApiClient(BASE_URL, fetchImplementation, Date.now, "B");
    const selfHosted = new ClawMuseStatusApiClient(BASE_URL, fetchImplementation, Date.now, null);
    expect(await original.hasSession()).toBe(true);
    expect(await different.hasSession()).toBe(false);
    expect(await selfHosted.hasSession()).toBe(false);
    expect(requests).toEqual([]);
  });

  it("rebuilds the task board from status filters a service without `all` still serves", async () => {
    const goal = {
      id: "goal-1",
      repoKey: "remote:example.invalid/repo",
      repoDisplayName: "repo",
      title: "Title",
      summary: "Summary",
      acceptance: "Done",
      origin: "manual",
      status: "needs_review",
      reviewReason: "completed",
      priority: 3,
      budgetRuns: 3,
      runsUsed: 1,
      expiresAt: null,
      decidedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      latestReport: null,
      currentRun: null,
    };
    const { api, requests } = await enrolledClient((request) => {
      const filter = new URLSearchParams(request.path.split("?")[1] ?? "").get("filter");
      if (filter === "all") {
        return { status: 422, body: { error: "invalid_request" } };
      }
      return { body: { goals: filter === "needs_review" ? [goal] : [] } };
    });

    const goals = await api.listGoals("all");

    expect(goals.map((entry) => entry.id)).toEqual(["goal-1"]);
    expect(
      requests.map((request) =>
        new URLSearchParams(request.path.split("?")[1] ?? "").get("filter"),
      ),
    ).toEqual(["all", "suggested", "active", "needs_review", "closed"]);
  });
});
