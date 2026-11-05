import { mkdtemp, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, expect, vi } from "vitest";
import { parseConnectionOfferFromUrl } from "@getpaseo/protocol/connection-offer";
import { resolveLocalPairingOffer } from "./pair.js";

test("offline pairing requires relay consent and saves it in the selected home", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "paseo-offline-pair-"));
  const home = path.join(root, "home");
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (String(url).includes("agent-relay.clawmuse")) throw new Error("unavailable");
      return Response.json({ status: "ready" });
    }),
  );
  try {
    expect(await resolveLocalPairingOffer({ paseoHome: home })).toMatchObject({
      relayEnabled: false,
      url: null,
    });
    expect(existsSync(home)).toBe(false);
    const offer = await resolveLocalPairingOffer({ paseoHome: home, enableRelay: true });
    expect(offer.relayEnabled).toBe(true);
    expect(offer.url).toContain("offer=");
    const savedRelay = JSON.parse(await readFile(path.join(home, "config.json"), "utf8")).daemon
      .relay;
    expect(savedRelay.enabled).toBe(true);
    expect(savedRelay.endpoint).toBe("agent-relay-cn.ppb.cn:443");
    expect(parseConnectionOfferFromUrl(offer.url!)?.relay.endpoint).toBe(savedRelay.endpoint);
    expect(existsSync(path.join(home, "server-id"))).toBe(true);
    expect(existsSync(path.join(home, "daemon-keypair.json"))).toBe(true);
  } finally {
    vi.unstubAllGlobals();
    await rm(root, { recursive: true, force: true });
  }
});
