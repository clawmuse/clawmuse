import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClawMuseStatusClient, type ClawMuseStatusFetch } from "./client.js";
import { clearClawMuseStatusRelationship, saveClawMuseStatusRelationship } from "./config.js";
import { removeClawMuseStatusHostToken, writeClawMuseStatusHostToken } from "./host-credential.js";
import type { ClawMuseStatusAgentSnapshot } from "./projection.js";
import { ClawMuseStatusService } from "./service.js";
import { ClawMuseStatusPublisher } from "./snapshot-publisher.js";

const SERVER_ID = "srv_test_clawmuse";
const TOKEN = "clawmuse-status-host-token-0123456789";
const logger = pino({ level: "silent" });

let paseoHome: string;
let requestedUrls: string[];

const serviceFetch: ClawMuseStatusFetch = (url) => {
  requestedUrls.push(url);
  if (url.endsWith("/v1/host/sessions")) {
    return Promise.resolve(
      new Response(
        JSON.stringify({
          hostId: "00000000-0000-0000-0000-000000000000",
          epoch: "00000000-0000-0000-0000-000000000001",
          accessToken: "host-access-token",
          expiresIn: 600,
          heartbeatInterval: 20,
          snapshotSchemaVersion: 4,
          hostSessionClose: false,
        }),
        { status: 201 },
      ),
    );
  }
  return Promise.resolve(
    new Response(JSON.stringify({ outcome: "accepted", revision: 1 }), { status: 200 }),
  );
};

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

beforeEach(() => {
  paseoHome = mkdtempSync(path.join(tmpdir(), "clawmuse-status-service-"));
  requestedUrls = [];
});

afterEach(() => {
  rmSync(paseoHome, { recursive: true, force: true });
});

describe("ClawMuseStatusService", () => {
  it("keeps the current publisher and reports malformed config until a valid reload", async () => {
    writeClawMuseStatusHostToken(paseoHome, TOKEN);
    saveClawMuseStatusRelationship(paseoHome, { url: "https://status.example", displayName: null });
    const configPath = path.join(paseoHome, "config.json");
    const original = readFileSync(configPath, "utf8");
    const service = createService();
    try {
      service.start();
      await vi.waitFor(() => expect(service.report().connected).toBe(true));
      writeFileSync(configPath, "{invalid json\n");
      expect(() => service.reload()).not.toThrow();
      expect(service.report()).toMatchObject({
        configured: true,
        connected: true,
        lastError: expect.stringContaining("Invalid JSON"),
      });
      writeFileSync(configPath, original);
      service.reload();
      expect(service.report().lastError).toBeNull();
      expect(requestedUrls.filter((url) => url.endsWith("/v1/host/sessions"))).toHaveLength(1);
    } finally {
      await service.stop();
    }
  });

  it("stays idle and advertises nothing while no service is configured", async () => {
    const service = createService();

    service.start();
    await service.stop();

    expect(service.isConfigured).toBe(false);
    expect(requestedUrls).toEqual([]);
  });

  it("starts publishing when a relationship appears, without a restart", async () => {
    const service = createService();
    service.start();
    expect(service.isConfigured).toBe(false);

    writeClawMuseStatusHostToken(paseoHome, TOKEN);
    saveClawMuseStatusRelationship(paseoHome, {
      url: "https://status.example",
      displayName: "workshop",
    });
    service.reload();

    expect(service.isConfigured).toBe(true);
    await vi.waitFor(() => expect(service.report().connected).toBe(true));
    await vi.waitFor(() =>
      expect(requestedUrls).toContain("https://status.example/v1/host/status-snapshots"),
    );
    expect(requestedUrls[0]).toBe("https://status.example/v1/host/sessions");
    expect(service.report().lastPublishedAt).not.toBeNull();
    await service.stop();
  });

  it("stops publishing when the relationship is removed", async () => {
    writeClawMuseStatusHostToken(paseoHome, TOKEN);
    saveClawMuseStatusRelationship(paseoHome, { url: "https://status.example", displayName: null });
    const service = createService();
    service.start();
    await vi.waitFor(() => expect(service.report().connected).toBe(true));

    clearClawMuseStatusRelationship(paseoHome);
    removeClawMuseStatusHostToken(paseoHome);
    service.reload();

    expect(service.report()).toEqual({
      configured: false,
      baseUrl: null,
      relayHostId: null,
      connected: false,
      lastPublishedAt: null,
      lastError: null,
      goals: null,
    });
    await service.stop();
  });

  it("keeps one publisher alive across a reload that changes nothing", async () => {
    writeClawMuseStatusHostToken(paseoHome, TOKEN);
    saveClawMuseStatusRelationship(paseoHome, { url: "https://status.example", displayName: null });
    const service = createService();
    service.start();
    await vi.waitFor(() => expect(service.report().connected).toBe(true));

    service.reload();
    service.reload();

    expect(requestedUrls.filter((url) => url.endsWith("/v1/host/sessions"))).toHaveLength(1);
    await service.stop();
  });

  it("surfaces a configured service whose token is missing", async () => {
    saveClawMuseStatusRelationship(paseoHome, { url: "https://status.example", displayName: null });
    const service = createService();

    service.start();

    expect(service.report()).toMatchObject({
      configured: false,
      baseUrl: "https://status.example",
      connected: false,
      lastError: "No status host token is stored for this daemon",
      goals: null,
    });
    await service.stop();
  });

  it("coalesces sub-debounce running turns so short completions never cold-start a capsule", async () => {
    const publishedItems: Array<Array<{ itemId: string; phase: string }>> = [];
    let agents: ClawMuseStatusAgentSnapshot[] = [];
    const customFetch: ClawMuseStatusFetch = async (url, init) => {
      if (url.endsWith("/v1/host/sessions")) {
        return new Response(
          JSON.stringify({
            hostId: "00000000-0000-0000-0000-000000000000",
            epoch: "00000000-0000-0000-0000-000000000001",
            accessToken: "host-access-token",
            expiresIn: 600,
            heartbeatInterval: 20,
            snapshotSchemaVersion: 5,
            hostSessionClose: true,
          }),
          { status: 201 },
        );
      }
      if (url.endsWith("/v1/host/status-snapshots") && typeof init?.body === "string") {
        const parsed = JSON.parse(init.body) as {
          items: Array<{ itemId: string; phase: string }>;
        };
        publishedItems.push(parsed.items);
      }
      return new Response(JSON.stringify({ outcome: "accepted", revision: 1 }), { status: 200 });
    };

    const publisher = new ClawMuseStatusPublisher({
      client: new ClawMuseStatusClient("https://status.example", customFetch),
      paseoHome,
      relayHostId: "abcdefghijklmnop",
      displayName: "workshop",
      hostToken: TOKEN,
      listAgents: () => agents,
      listUsage: () => Promise.resolve([]),
      hasTerminalPushSubscriber: () => true,
      coldStartRunningDebounceMs: 120,
      logger,
    });

    try {
      publisher.start();
      await vi.waitFor(() => expect(publishedItems).toHaveLength(1));
      expect(publishedItems[0]).toEqual([]);

      // Short turn starts and finishes within 120ms while completion pushes are active:
      // no running snapshot should be sent to Status.
      const now = Date.now();
      agents = [
        {
          id: "agent-fast",
          lifecycle: "running",
          attention: { requiresAttention: false },
          pendingPermissions: new Map(),
          activeTurnId: "turn-fast",
          activeTurnStartedAt: new Date(now),
          lastUserMessageAt: null,
          updatedAt: new Date(now),
        },
      ];
      publisher.refresh();
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(publishedItems).toHaveLength(1);

      agents = [
        {
          id: "agent-fast",
          lifecycle: "idle",
          attention: {
            requiresAttention: true,
            attentionReason: "finished",
            attentionTimestamp: new Date(now + 30),
          },
          pendingPermissions: new Map(),
          activeTurnId: null,
          activeTurnStartedAt: null,
          lastUserMessageAt: null,
          updatedAt: new Date(now + 30),
        },
      ];
      publisher.refresh();
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(publishedItems).toHaveLength(1);

      // Longer running turn exceeds debounce and publishes cleanly.
      agents = [
        {
          id: "agent-long",
          lifecycle: "running",
          attention: { requiresAttention: false },
          pendingPermissions: new Map(),
          activeTurnId: "turn-long",
          activeTurnStartedAt: new Date(now + 200),
          lastUserMessageAt: null,
          updatedAt: new Date(now + 200),
        },
      ];
      publisher.refresh();
      await vi.waitFor(() => expect(publishedItems).toHaveLength(2));
      expect(publishedItems[1]).toEqual([
        expect.objectContaining({ itemId: "agent-long", phase: "running" }),
      ]);
    } finally {
      await publisher.stop();
    }
  });
});
