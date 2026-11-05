import { describe, expect, it } from "vitest";

import {
  ClawMuseStatusClient,
  ClawMuseStatusRequestError,
  type ClawMuseStatusFetch,
  type ClawMuseStatusSnapshot,
} from "./client.js";

const BASE_URL = "https://status.example";
const HOST_SESSION = {
  hostId: "00000000-0000-0000-0000-000000000000",
  epoch: "00000000-0000-0000-0000-000000000001",
  accessToken: "host-access-token",
  expiresIn: 600,
  heartbeatInterval: 20,
  snapshotSchemaVersion: 4,
  hostSessionClose: true,
  goals: false,
  relaySelectionTelemetry: false,
};

interface RecordedRequest {
  url: string;
  init: RequestInit;
}

function recordingFetch(responses: Response[]): {
  fetch: ClawMuseStatusFetch;
  calls: RecordedRequest[];
} {
  const calls: RecordedRequest[] = [];
  const queue = [...responses];
  return {
    calls,
    fetch: (url, init) => {
      calls.push({ url, init });
      const response = queue.shift();
      if (!response) {
        throw new Error(`unexpected request to ${url}`);
      }
      return Promise.resolve(response);
    },
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requestBody(call: RecordedRequest): unknown {
  return JSON.parse(String(call.init.body));
}

const SNAPSHOT: ClawMuseStatusSnapshot = {
  revision: 7,
  items: [
    {
      itemId: "5f4d3c2b-1a09-4877-8665-544332211000",
      eventId: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
      phase: "running",
      stateChangedAt: "2026-09-11T12:00:00.000Z",
      observation: "live",
    },
  ],
  usages: [
    {
      provider: "claude",
      label: "Max 20x",
      session: { usedPercent: 37, windowMinutes: 300, resetsAt: null },
      weekly: null,
      updatedAt: "2026-09-11T12:00:00.000Z",
    },
    {
      provider: "codex",
      session: null,
      weekly: { usedPercent: 12, windowMinutes: 10_080, resetsAt: null },
      updatedAt: "2026-09-11T11:00:00.000Z",
    },
  ],
};

describe("ClawMuseStatusClient", () => {
  it("starts a host session with the bearer token and the derived host id", async () => {
    const { fetch, calls } = recordingFetch([json(HOST_SESSION, 201)]);

    const session = await new ClawMuseStatusClient(BASE_URL, fetch).createHostSession({
      hostToken: "host-token",
      relayHostId: "AbCdEfGhIjKlMnOp",
      displayName: "workshop",
    });

    expect(session).toEqual(HOST_SESSION);
    expect(calls[0]?.url).toBe(`${BASE_URL}/v1/host/sessions`);
    expect(calls[0]?.init.headers).toMatchObject({ authorization: "Bearer host-token" });
    expect(requestBody(calls[0]!)).toEqual({
      relayHostId: "AbCdEfGhIjKlMnOp",
      displayName: "workshop",
    });
  });

  it("reads the relay selection telemetry flag and posts selections with the access token", async () => {
    const report = {
      id: "6a1c3c2e-6f7b-4b8e-9d55-2f1f6f0e8a11",
      selected: "agent-relay-cn.ppb.cn:443",
      probes: [{ endpoint: "agent-relay-cn.ppb.cn:443", ms: 87, ok: true }],
      selectedAt: "2026-11-04T09:00:00.000Z",
    };
    const { fetch, calls } = recordingFetch([
      json({ ...HOST_SESSION, relaySelectionTelemetry: true }, 201),
      json({ accepted: 1 }, 202),
    ]);
    const client = new ClawMuseStatusClient(BASE_URL, fetch);

    const session = await client.createHostSession({
      hostToken: "host-token",
      relayHostId: "AbCdEfGhIjKlMnOp",
      displayName: "workshop",
    });
    await client.reportRelaySelection({ accessToken: "access", report });

    expect(session.relaySelectionTelemetry).toBe(true);
    expect(calls[1]?.url).toBe(`${BASE_URL}/v1/host/telemetry/relay-selections`);
    expect(calls[1]?.init.headers).toMatchObject({ authorization: "Bearer access" });
    expect(requestBody(calls[1]!)).toEqual(report);
  });

  it.each([undefined, 1])(
    "gates attachment leases and evidence on service task version %s",
    async (tasksVersion) => {
      const { fetch, calls } = recordingFetch([
        json({ ...HOST_SESSION, goals: true, ...(tasksVersion ? { tasksVersion } : {}) }),
        json({ run: null }),
        json({ ok: true }),
      ]);
      const client = new ClawMuseStatusClient(BASE_URL, fetch);
      await client.createHostSession({ hostToken: "host-token", relayHostId: "AbCdEfGhIjKlMnOp" });
      expect(client.supportsTasks()).toBe(tasksVersion === 1);
      await client.leaseGoalRun({ accessToken: "access", activeRunIds: [] });
      const evidence = {
        revision: "abc123",
        checks: [{ name: "Tests", result: "passed" as const }],
        artifacts: [],
      };
      await client.reportGoalRun({
        accessToken: "access",
        runId: "run",
        kind: "done",
        message: "Verified",
        prUrl: null,
        evidence,
      });
      expect(requestBody(calls[1]!)).toEqual({
        activeRunIds: [],
        ...(tasksVersion ? { supportsAttachedAgents: true } : {}),
      });
      expect(requestBody(calls[2]!)).toEqual({
        kind: "done",
        message: "Verified",
        ...(tasksVersion ? { evidence } : {}),
      });
    },
  );

  it("sends every provider usage to a schema v4 service", async () => {
    const { fetch, calls } = recordingFetch([json({ outcome: "accepted", revision: 7 })]);

    await new ClawMuseStatusClient(BASE_URL, fetch).publishSnapshot({
      accessToken: "host-access-token",
      snapshot: SNAPSHOT,
      schemaVersion: 4,
    });

    expect(requestBody(calls[0]!)).toEqual({
      revision: 7,
      items: SNAPSHOT.items,
      usages: SNAPSHOT.usages,
    });
  });

  it("degrades to the newest single usage on a schema v3 service", async () => {
    const { fetch, calls } = recordingFetch([json({ outcome: "accepted", revision: 7 })]);

    await new ClawMuseStatusClient(BASE_URL, fetch).publishSnapshot({
      accessToken: "host-access-token",
      snapshot: SNAPSHOT,
      schemaVersion: 3,
    });

    expect(requestBody(calls[0]!)).toEqual({
      revision: 7,
      items: SNAPSHOT.items,
      usage: SNAPSHOT.usages[0],
    });
  });

  it("omits usage entirely for a service that predates the usage schema", async () => {
    const { fetch, calls } = recordingFetch([json({ outcome: "accepted", revision: 7 })]);

    await new ClawMuseStatusClient(BASE_URL, fetch).publishSnapshot({
      accessToken: "host-access-token",
      snapshot: SNAPSHOT,
      schemaVersion: 2,
    });

    expect(requestBody(calls[0]!)).toEqual({ revision: 7, items: SNAPSHOT.items });
  });

  it("reports the fence code a stale publisher gets back", async () => {
    const { fetch } = recordingFetch([json({ error: "host_session_fenced" }, 409)]);

    const failure = new ClawMuseStatusClient(BASE_URL, fetch)
      .heartbeat("host-access-token")
      .catch((error: unknown) => error);

    await expect(failure).resolves.toBeInstanceOf(ClawMuseStatusRequestError);
    await expect(failure).resolves.toMatchObject({
      statusCode: 409,
      errorCode: "host_session_fenced",
    });
  });

  it("rejects a host session response that is missing its access token", async () => {
    const { fetch } = recordingFetch([json({ ...HOST_SESSION, accessToken: "" }, 201)]);

    await expect(
      new ClawMuseStatusClient(BASE_URL, fetch).createHostSession({
        hostToken: "host-token",
        relayHostId: "AbCdEfGhIjKlMnOp",
        displayName: "workshop",
      }),
    ).rejects.toThrow("invalid_clawmuse_status_accessToken");
  });

  it("creates a mobile enrollment bound to the calling client", async () => {
    const { fetch, calls } = recordingFetch([
      json({ enrollmentCode: "single-use-code", expiresAt: "2026-09-11T12:05:00.000Z" }, 201),
    ]);

    const enrollment = await new ClawMuseStatusClient(BASE_URL, fetch).createMobileEnrollment({
      accessToken: "host-access-token",
      pairedDeviceId: "client-1",
    });

    expect(enrollment).toEqual({
      enrollmentCode: "single-use-code",
      expiresAt: "2026-09-11T12:05:00.000Z",
    });
    expect(calls[0]?.url).toBe(`${BASE_URL}/v1/host/mobile-enrollments`);
    expect(requestBody(calls[0]!)).toEqual({ pairedDeviceId: "client-1" });
  });
});
