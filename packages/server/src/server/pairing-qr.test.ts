import { describe, expect, it } from "vitest";
import * as QRCode from "qrcode";
import { renderPairingQr } from "./pairing-qr.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateLocalPairingOffer } from "./pairing-offer.js";
import { parseConnectionOfferFromUrl } from "@getpaseo/protocol/connection-offer";

const ESCAPE = String.fromCharCode(0x1b);
const ANSI_PATTERN = new RegExp(`${ESCAPE}\\[[0-9;]*m`, "g");

describe("renderPairingQr", () => {
  it("renders a theme-independent QR code with a four-module quiet zone", async () => {
    const url = "https://app.paseo.sh/#offer=test-pairing-offer";
    const qr = await renderPairingQr(url);
    const styledLines = qr.split("\n");
    const visibleLines = qr.replace(ANSI_PATTERN, "").split("\n");
    const moduleCount = QRCode.create(url).modules.size;

    expect(
      styledLines.every(
        (line) => line.startsWith(`${ESCAPE}[47m${ESCAPE}[30m`) && line.endsWith(`${ESCAPE}[0m`),
      ),
    ).toBe(true);
    expect(visibleLines.every((line) => line.length === moduleCount + 8)).toBe(true);
    expect(visibleLines.slice(0, 2).every((line) => line.trim() === "")).toBe(true);
    expect(visibleLines.slice(-2).every((line) => line.trim() === "")).toBe(true);
    expect(visibleLines.every((line) => line.startsWith("    ") && line.endsWith("    "))).toBe(
      true,
    );
  });
});

describe("relay pairing URLs", () => {
  it.each([
    [undefined, "agent-relay.ppb.cn:443"],
    ["agent-relay-cn.ppb.cn:443", "agent-relay-cn.ppb.cn:443"],
  ])(
    "uses ClawMuse web without changing the selected relay (%s)",
    async (endpoint, publicEndpoint) => {
      const home = await mkdtemp(join(tmpdir(), "clawmuse-pairing-origin-"));
      try {
        const pairing = await generateLocalPairingOffer({
          paseoHome: home,
          relayEndpoint: endpoint,
          relayUseTls: true,
          includeQr: false,
        });
        const url = new URL(pairing.url!);
        expect(url.origin + url.pathname).toBe("https://app.clawmuse.com/");
        expect(parseConnectionOfferFromUrl(pairing.url!)?.relay.endpoint).toBe(publicEndpoint);
      } finally {
        await rm(home, { recursive: true, force: true });
      }
    },
  );

  it("preserves a custom web entrance and an independent relay transport", async () => {
    const home = await mkdtemp(join(tmpdir(), "clawmuse-pairing-custom-"));
    try {
      const pairing = await generateLocalPairingOffer({
        paseoHome: home,
        relayEndpoint: "127.0.0.1:4000",
        relayUseTls: false,
        appBaseUrl: "https://custom.example/app",
        includeQr: false,
      });
      expect(pairing.url).toMatch(/^https:\/\/custom\.example\/app\/#offer=/);
      expect(parseConnectionOfferFromUrl(pairing.url!)?.relay).toEqual({
        endpoint: "127.0.0.1:4000",
        useTls: false,
      });
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
