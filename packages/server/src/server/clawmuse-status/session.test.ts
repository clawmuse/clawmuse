import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requiredPermissionForInbound } from "../authorization/operation-permissions.js";
import type { SessionOutboundMessage } from "../messages.js";
import { ClawMuseStatusClient, type ClawMuseStatusFetch } from "./client.js";
import { saveClawMuseStatusRelationship } from "./config.js";
import { writeClawMuseStatusHostToken } from "./host-credential.js";
import { deriveRelayHostId } from "./relay-host-id.js";
import { ClawMuseStatusService } from "./service.js";
import { handleClawMuseStatusRequest } from "./session.js";

const SERVER_ID = "srv_test_clawmuse";
const TOKEN = "clawmuse-status-host-token-0123456789";
const BASE_URL = "https://status.example";

const logger = pino({ level: "silent" });
let paseoHome: string;

function respondTo(url: string): Response {
  if (url.endsWith("/v1/host/sessions")) {
    return new Response(
      JSON.stringify({
        hostId: "00000000-0000-0000-0000-000000000000",
        epoch: "00000000-0000-0000-0000-000000000001",
        accessToken: "host-access-token",
        expiresIn: 600,
        heartbeatInterval: 20,
        snapshotSchemaVersion: 4,
        hostSessionClose: true,
      }),
      { status: 201 },
    );
  }
  if (url.endsWith("/v1/host/mobile-enrollments")) {
    return new Response(
      JSON.stringify({
        enrollmentCode: "single-use-code",
        expiresAt: "2026-09-11T12:05:00.000Z",
      }),
      { status: 201 },
    );
  }
  return new Response(JSON.stringify({ outcome: "accepted", revision: 1 }), { status: 200 });
}

const serviceFetch: ClawMuseStatusFetch = (url) => Promise.resolve(respondTo(url));

function createService(): ClawMuseStatusService {
  return new ClawMuseStatusService({
    paseoHome,
    serverId: SERVER_ID,
    logger,
    env: {},
    listAgents: () => [],
    listUsage: () => Promise.resolve([]),
    createClient: (baseUrl) => new ClawMuseStatusClient(baseUrl, serviceFetch),
    watchConfigFiles: false,
  });
}

function configureRelationship(): void {
  writeClawMuseStatusHostToken(paseoHome, TOKEN);
  saveClawMuseStatusRelationship(paseoHome, { url: BASE_URL, displayName: "workshop" });
}

function collector(): {
  emitted: SessionOutboundMessage[];
  emit: (m: SessionOutboundMessage) => void;
} {
  const emitted: SessionOutboundMessage[] = [];
  return { emitted, emit: (message) => emitted.push(message) };
}

beforeEach(() => {
  paseoHome = mkdtempSync(path.join(tmpdir(), "clawmuse-status-session-"));
});

afterEach(() => {
  rmSync(paseoHome, { recursive: true, force: true });
});

describe("clawmuse.status RPC handlers", () => {
  it("needs the same permission as reading daemon configuration", () => {
    const daemonConfigRead = requiredPermissionForInbound("get_daemon_config_request");

    expect(requiredPermissionForInbound("clawmuse.status.get.request")).toBe(daemonConfigRead);
    expect(requiredPermissionForInbound("clawmuse.status.create_mobile_enrollment.request")).toBe(
      daemonConfigRead,
    );
  });

  it("reports an unconfigured daemon without inventing a host id", async () => {
    const service = createService();
    service.start();
    const { emitted, emit } = collector();

    await handleClawMuseStatusRequest(
      { service, isHubSession: false, clientId: "client-1", emit, logger },
      { type: "clawmuse.status.get.request", requestId: "request-1" },
    );
    await service.stop();

    expect(emitted).toEqual([
      {
        type: "clawmuse.status.get.response",
        payload: {
          requestId: "request-1",
          configured: false,
          baseUrl: null,
          relayHostId: null,
          connected: false,
          lastPublishedAt: null,
          lastError: null,
          goals: null,
        },
      },
    ]);
  });

  it("reports the service, host id, and live session once configured", async () => {
    configureRelationship();
    const service = createService();
    service.start();
    await vi.waitFor(() => expect(service.report().connected).toBe(true));
    const { emitted, emit } = collector();

    await handleClawMuseStatusRequest(
      { service, isHubSession: false, clientId: "client-1", emit, logger },
      { type: "clawmuse.status.get.request", requestId: "request-1" },
    );
    await service.stop();

    expect(emitted[0]).toMatchObject({
      type: "clawmuse.status.get.response",
      payload: {
        requestId: "request-1",
        configured: true,
        baseUrl: BASE_URL,
        relayHostId: deriveRelayHostId(SERVER_ID),
        connected: true,
        lastError: null,
        goals: null,
      },
    });
  });

  it("hands the phone an enrollment code and the service URL it must redeem it against", async () => {
    configureRelationship();
    const service = createService();
    service.start();
    const { emitted, emit } = collector();

    await handleClawMuseStatusRequest(
      { service, isHubSession: false, clientId: "client-1", emit, logger },
      { type: "clawmuse.status.create_mobile_enrollment.request", requestId: "request-1" },
    );
    await service.stop();

    expect(emitted).toEqual([
      {
        type: "clawmuse.status.create_mobile_enrollment.response",
        payload: {
          requestId: "request-1",
          enrollmentCode: "single-use-code",
          expiresAt: "2026-09-11T12:05:00.000Z",
          statusBaseUrl: BASE_URL,
        },
      },
    ]);
  });

  it("fails enrollment with a typed error when no service is configured", async () => {
    const service = createService();
    service.start();
    const { emitted, emit } = collector();

    await handleClawMuseStatusRequest(
      { service, isHubSession: false, clientId: "client-1", emit, logger },
      { type: "clawmuse.status.create_mobile_enrollment.request", requestId: "request-1" },
    );
    await service.stop();

    expect(emitted).toEqual([
      {
        type: "rpc_error",
        payload: {
          requestId: "request-1",
          requestType: "clawmuse.status.create_mobile_enrollment.request",
          error: "The ClawMuse Status host session is not established",
          code: "clawmuse_status_not_connected",
        },
      },
    ]);
  });

  it("refuses both RPCs for a Hub session", async () => {
    configureRelationship();
    const service = createService();
    service.start();
    const { emitted, emit } = collector();

    await handleClawMuseStatusRequest(
      { service, isHubSession: true, clientId: "hub:1", emit, logger },
      { type: "clawmuse.status.get.request", requestId: "request-1" },
    );
    await handleClawMuseStatusRequest(
      { service, isHubSession: true, clientId: "hub:1", emit, logger },
      { type: "clawmuse.status.create_mobile_enrollment.request", requestId: "request-2" },
    );
    await service.stop();

    expect(emitted.map((message) => message.type)).toEqual(["rpc_error", "rpc_error"]);
    expect(emitted).toContainEqual({
      type: "rpc_error",
      payload: {
        requestId: "request-2",
        requestType: "clawmuse.status.create_mobile_enrollment.request",
        error: "ClawMuse Status is not available to Hub sessions",
        code: "hub_session_forbidden",
      },
    });
  });
});
