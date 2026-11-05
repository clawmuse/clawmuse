import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClawMuseStatusClient, ClawMuseStatusRequestError } from "./client.js";
import type { ClawMuseStatusFetch, ClawMuseStatusHostSession } from "./client.js";
import { saveClawMuseStatusRelationship } from "./config.js";
import { writeClawMuseStatusHostToken } from "./host-credential.js";
import {
  reportPendingRelaySelection,
  savePendingRelaySelection,
  type RelaySelectionReport,
} from "./relay-selection-report.js";
import { ClawMuseStatusService } from "./service.js";
import type { RegionalRelaySelection } from "../regional-relay.js";

const logger = pino({ level: "silent" });
const NOW = new Date("2026-11-04T09:00:00.000Z");
const PENDING_FILE = "clawmuse-status-relay-selection.json";
const SELECTION: RegionalRelaySelection = {
  selected: "agent-relay-cn.ppb.cn:443",
  probes: [
    { endpoint: "agent-relay.clawmuse.com:443", ok: false, ms: null },
    { endpoint: "agent-relay-cn.ppb.cn:443", ok: true, ms: 87 },
  ],
};

function hostSession(relaySelectionTelemetry: boolean): ClawMuseStatusHostSession {
  return {
    hostId: "00000000-0000-0000-0000-000000000000",
    epoch: "00000000-0000-0000-0000-000000000001",
    accessToken: "host-access-token",
    expiresIn: 600,
    heartbeatInterval: 20,
    snapshotSchemaVersion: 4,
    hostSessionClose: false,
    goals: false,
    relaySelectionTelemetry,
  };
}

class RecordingReporter {
  readonly reports: RelaySelectionReport[] = [];
  failWith: Error | null = null;

  async reportRelaySelection(args: { report: RelaySelectionReport }): Promise<void> {
    this.reports.push(args.report);
    if (this.failWith) throw this.failWith;
  }
}

let paseoHome: string;

beforeEach(() => {
  paseoHome = mkdtempSync(path.join(tmpdir(), "clawmuse-relay-selection-"));
});

afterEach(() => {
  rmSync(paseoHome, { recursive: true, force: true });
});

function report(input: {
  client: RecordingReporter;
  relaySelectionTelemetry?: boolean;
  now?: Date;
}): Promise<void> {
  return reportPendingRelaySelection({
    paseoHome,
    session: hostSession(input.relaySelectionTelemetry ?? true),
    client: input.client,
    signal: new AbortController().signal,
    logger,
    now: input.now ?? NOW,
  });
}

describe("relay selection reporting", () => {
  it("reports a pending selection once and removes it", async () => {
    savePendingRelaySelection(paseoHome, SELECTION, NOW);
    const client = new RecordingReporter();

    await report({ client });
    await report({ client });

    expect(client.reports).toEqual([
      {
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        selected: SELECTION.selected,
        probes: SELECTION.probes,
        selectedAt: NOW.toISOString(),
      },
    ]);
    expect(existsSync(path.join(paseoHome, PENDING_FILE))).toBe(false);
  });

  it("keeps the selection pending for a server that does not store it", async () => {
    savePendingRelaySelection(paseoHome, SELECTION, NOW);
    const client = new RecordingReporter();

    await report({ client, relaySelectionTelemetry: false });

    expect(client.reports).toEqual([]);
    expect(existsSync(path.join(paseoHome, PENDING_FILE))).toBe(true);
  });

  it("swallows a failed report without retrying it", async () => {
    savePendingRelaySelection(paseoHome, SELECTION, NOW);
    const client = new RecordingReporter();
    client.failWith = new ClawMuseStatusRequestError(503, "telemetry_unavailable");

    await expect(report({ client })).resolves.toBeUndefined();
    await report({ client });

    expect(client.reports).toHaveLength(1);
  });

  it("discards a selection the service would reject as stale", async () => {
    savePendingRelaySelection(paseoHome, SELECTION, NOW);
    const client = new RecordingReporter();

    await report({ client, now: new Date(NOW.getTime() + 31 * 86_400_000) });

    expect(client.reports).toEqual([]);
    expect(existsSync(path.join(paseoHome, PENDING_FILE))).toBe(false);
  });

  it("discards a corrupt pending file", async () => {
    savePendingRelaySelection(paseoHome, { selected: "x", probes: [] }, NOW);
    const client = new RecordingReporter();

    await report({ client });

    expect(client.reports).toEqual([]);
    expect(existsSync(path.join(paseoHome, PENDING_FILE))).toBe(false);
  });

  it("is sent by the status publisher once its host session opens", async () => {
    const bodies = new Map<string, unknown>();
    const serviceFetch: ClawMuseStatusFetch = (url, init) => {
      bodies.set(url, typeof init.body === "string" ? JSON.parse(init.body) : null);
      if (url.endsWith("/v1/host/sessions")) {
        return Promise.resolve(
          Response.json({ ...hostSession(true), relaySelectionTelemetry: true }, { status: 201 }),
        );
      }
      if (url.endsWith("/v1/host/telemetry/relay-selections")) {
        return Promise.resolve(Response.json({ accepted: 1 }, { status: 202 }));
      }
      return Promise.resolve(Response.json({ outcome: "accepted", revision: 1 }));
    };
    writeClawMuseStatusHostToken(paseoHome, "clawmuse-status-host-token-0123456789");
    saveClawMuseStatusRelationship(paseoHome, { url: "https://status.example", displayName: null });
    savePendingRelaySelection(paseoHome, SELECTION, new Date());
    const pending = JSON.parse(readFileSync(path.join(paseoHome, PENDING_FILE), "utf8"));
    const service = new ClawMuseStatusService({
      paseoHome,
      serverId: "srv_test_clawmuse",
      logger,
      env: {},
      listAgents: () => [],
      listUsage: () => Promise.resolve([]),
      createClient: (baseUrl) => new ClawMuseStatusClient(baseUrl, serviceFetch),
      watchConfigFiles: false,
    });
    try {
      service.start();
      await vi.waitFor(() =>
        expect(bodies.get("https://status.example/v1/host/telemetry/relay-selections")).toEqual(
          pending,
        ),
      );
      expect(existsSync(path.join(paseoHome, PENDING_FILE))).toBe(false);
    } finally {
      await service.stop();
    }
  });
});
