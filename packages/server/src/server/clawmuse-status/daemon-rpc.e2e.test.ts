import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DaemonClient } from "../test-utils/daemon-client.js";
import { createTestPaseoDaemon, type TestPaseoDaemon } from "../test-utils/paseo-daemon.js";

let daemon: TestPaseoDaemon;
let client: DaemonClient;

beforeAll(async () => {
  daemon = await createTestPaseoDaemon();
  client = new DaemonClient({
    url: `ws://127.0.0.1:${daemon.port}/ws`,
    appVersion: "0.8.0",
  });
  await client.connect();
  await client.fetchAgents({ subscribe: {} });
}, 60_000);

afterAll(async () => {
  await client.close();
  await daemon.close();
});

describe("clawmuse.status.get over the daemon WebSocket", () => {
  it("answers an unconfigured daemon and does not advertise the feature", async () => {
    const status = await client.getClawMuseStatus();

    expect(status).toMatchObject({
      configured: false,
      baseUrl: null,
      relayHostId: null,
      connected: false,
      lastPublishedAt: null,
      lastError: null,
      goals: {
        enabled: false,
        bound: false,
        activeRuns: 0,
        planner: "claude",
        executor: "claude",
      },
    });
    expect(client.getLastServerInfoMessage()?.features?.clawmuseStatus).toBeUndefined();
  });

  it("refuses to create an enrollment against a host that advertises nothing", async () => {
    await expect(client.createClawMuseStatusEnrollment()).rejects.toThrow(
      "not connected to ClawMuse Status",
    );
  });
});
