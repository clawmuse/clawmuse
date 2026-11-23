import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type pino from "pino";
import { afterEach, describe, expect, test } from "vitest";

import { createPushNotifications } from "./index.js";
import { PushService } from "./push-service.js";

function createLogger(): pino.Logger {
  const logger = {
    child: () => logger,
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
  return logger as unknown as pino.Logger;
}

describe("push notifications", () => {
  const homes: string[] = [];

  afterEach(() => {
    for (const home of homes.splice(0)) {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("an offline device stops receiving notifications after 48 hours", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "paseo-push-notifications-"));
    homes.push(home);
    const filePath = path.join(home, "push-tokens.json");
    let now = Date.parse("2026-08-10T00:00:00.000Z");
    const deliveries: string[][] = [];
    const pushNotifications = createPushNotifications({
      logger: createLogger(),
      filePath,
      now: () => now,
      deliver: async (tokens) => deliveries.push(tokens),
    });

    pushNotifications.renew("ExponentPushToken[offline-device]");
    now += 48 * 60 * 60 * 1000;
    await pushNotifications.send({ title: "Agent finished", body: "Done" });

    expect(deliveries).toEqual([]);
    expect(JSON.parse(readFileSync(filePath, "utf8"))).toEqual({ subscriptions: [] });
  });

  test("online revocation stops notifications immediately", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "paseo-push-notifications-"));
    homes.push(home);
    const deliveries: string[][] = [];
    const pushNotifications = createPushNotifications({
      logger: createLogger(),
      filePath: path.join(home, "push-tokens.json"),
      now: () => Date.parse("2026-08-10T00:00:00.000Z"),
      deliver: async (tokens) => deliveries.push(tokens),
    });

    pushNotifications.renew("ExponentPushToken[online-device]");
    pushNotifications.revoke("ExponentPushToken[online-device]");
    await pushNotifications.send({ title: "Agent finished", body: "Done" });

    expect(deliveries).toEqual([]);
  });

  test("filters agent events by per-token event, presence, and preview preferences", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "paseo-push-notifications-"));
    homes.push(home);
    const deliveries: Array<{ tokens: string[]; body: string }> = [];
    const pushNotifications = createPushNotifications({
      logger: createLogger(),
      filePath: path.join(home, "push-tokens.json"),
      now: () => Date.parse("2026-08-10T00:00:00.000Z"),
      deliver: async (tokens, payload) => {
        deliveries.push({ tokens, body: payload.body });
      },
    });

    pushNotifications.renew("ExponentPushToken[default]");
    pushNotifications.renew("ExponentPushToken[running-preview]", {
      running: true,
      suppressWhenActive: false,
      showPreview: true,
    });
    pushNotifications.renew("ExponentPushToken[running-private]", {
      running: true,
      suppressWhenActive: false,
      showPreview: false,
    });

    await pushNotifications.sendAgentEvent({
      reason: "running",
      hasPresentClient: true,
      focusedOnTarget: false,
      withPreviewPayload: {
        title: "Agent started",
        body: "Fix CI pipeline",
        data: { serverId: "srv", agentId: "a1", reason: "running" },
      },
      withoutPreviewPayload: {
        title: "Agent started",
        body: "Started working.",
        data: { serverId: "srv", agentId: "a1", reason: "running" },
      },
    });

    expect(deliveries).toEqual([
      { tokens: ["ExponentPushToken[running-preview]"], body: "Fix CI pipeline" },
      { tokens: ["ExponentPushToken[running-private]"], body: "Started working." },
    ]);
  });

  test("forwards _contentAvailable on terminal Expo push messages for iOS Live Activity cleanup", async () => {
    const sentBodies: unknown[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      sentBodies.push(JSON.parse(String(init?.body ?? "[]")));
      return new Response(JSON.stringify({ data: [{ status: "ok", id: "ticket-1" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const service = new PushService(createLogger(), () => undefined);
      await service.sendPush(["ExponentPushToken[ios-device]"], {
        title: "Task finished",
        body: "All checks passed",
        data: { serverId: "srv", agentId: "a1", reason: "finished" },
        contentAvailable: true,
      });

      expect(sentBodies).toEqual([
        [
          {
            to: "ExponentPushToken[ios-device]",
            title: "Task finished",
            body: "All checks passed",
            data: { serverId: "srv", agentId: "a1", reason: "finished" },
            sound: "default",
            _contentAvailable: true,
          },
        ],
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
