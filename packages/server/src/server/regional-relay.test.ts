import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "./config.js";
import { readPersistedConfig } from "./persisted-config.js";
import { resolveRegionalRelayConfig, selectRegionalRelay } from "./regional-relay.js";

const endpoints = ["agent-relay.clawmuse.com:443", "agent-relay-cn.ppb.cn:443"];
const PENDING_SELECTION = "clawmuse-status-relay-selection.json";
describe("regional relay selection", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("preserves the overseas origin for an existing device with legacy offers", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "clawmuse-legacy-region-"));
    const request = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", request);
    try {
      await writeFile(path.join(home, "server-id"), "existing-device");
      const upgraded = await resolveRegionalRelayConfig(loadConfig(home, { env: {} }));
      expect(upgraded.relayEndpoint).toBe(endpoints[0]);
      expect(upgraded.relayPublicEndpoint).toBe("agent-relay.ppb.cn:443");
      expect(readPersistedConfig(home).daemon?.relay?.endpoint).toBe(endpoints[0]);
      expect(request).not.toHaveBeenCalled();
      expect(existsSync(path.join(home, PENDING_SELECTION))).toBe(false);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("keeps the selected origin on disk and after restart without probing again", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "clawmuse-region-"));
    const request = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (String(url).includes("agent-relay.clawmuse")) throw new Error("unavailable");
      return Response.json({ status: "ready" });
    });
    vi.stubGlobal("fetch", request);
    try {
      const first = await resolveRegionalRelayConfig(loadConfig(home, { env: {} }));
      expect(first.relayPublicEndpoint).toBe(endpoints[1]);
      expect(readPersistedConfig(home).daemon?.relay?.endpoint).toBe(endpoints[1]);
      expect(first.configReload?.startupPersisted?.daemon?.relay?.endpoint).toBe(endpoints[1]);
      const pending = JSON.parse(await readFile(path.join(home, PENDING_SELECTION), "utf8"));
      expect(pending).toMatchObject({
        selected: endpoints[1],
        probes: [
          { endpoint: endpoints[0], ok: false, ms: null },
          { endpoint: endpoints[1], ok: true, ms: expect.any(Number) },
        ],
      });
      request.mockClear();
      const restarted = await resolveRegionalRelayConfig(loadConfig(home, { env: {} }));
      expect(restarted.relayEndpoint).toBe(endpoints[1]);
      expect(restarted.relayPublicEndpoint).toBe(endpoints[1]);
      expect(request).not.toHaveBeenCalled();
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("selects a ready origin with lower latency without rewriting the offer to an ingress IP", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (String(url).includes("agent-relay.clawmuse"))
        await new Promise((resolve) => setTimeout(resolve, 30));
      return Response.json({ status: "ready" });
    });
    const selection = await selectRegionalRelay(endpoints, endpoints[0]!, request);
    expect(selection.selected).toBe(endpoints[1]);
    expect(selection.probes).toEqual([
      { endpoint: endpoints[0], ok: true, ms: expect.any(Number) },
      { endpoint: endpoints[1], ok: true, ms: expect.any(Number) },
    ]);
    expect(selection.probes[0]!.ms).toBeGreaterThan(selection.probes[1]!.ms!);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0]![1]?.redirect).toBe("error");
  });
  it("ignores a fast but unready or invalid origin", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ status: "ready" }))
      .mockResolvedValueOnce(Response.json({ status: "draining" }));
    const selection = await selectRegionalRelay(endpoints, endpoints[0]!, request);
    expect(selection.selected).toBe(endpoints[0]);
    expect(selection.probes[1]).toEqual({ endpoint: endpoints[1], ok: false, ms: null });
  });
  it("retains the public fallback when probes fail", async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    expect(await selectRegionalRelay(endpoints, endpoints[0]!, request)).toEqual({
      selected: endpoints[0],
      probes: endpoints.map((endpoint) => ({ endpoint, ok: false, ms: null })),
    });
  });
});
