import { afterEach, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  prepareControllerCredential,
  assertOutboundControlAllowed,
} from "./controller-credentials.js";

const homes: string[] = [];
afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});
it("resumes one pairing after a lost response, persists its credential and pins the host key", async () => {
  const home = await mkdtemp(join(tmpdir(), "cli-controller-"));
  homes.push(home);
  const offer = {
    v: 2 as const,
    serverId: "srv_remote",
    daemonPublicKeyB64: "paired-key",
    relay: { endpoint: "relay.example:443", useTls: true },
    requiresAuthorization: true,
    pairing: { token: "x".repeat(43), expiresAt: "2026-10-26T01:00:00Z" },
  };
  const first = await prepareControllerCredential(home, offer);
  const retry = await prepareControllerCredential(home, offer);
  expect(retry?.credential).toEqual(first?.credential);
  await retry!.accept();
  const saved = await prepareControllerCredential(home, offer);
  expect(saved?.credential).toEqual({ token: first!.credential.token });
  const replacement = await prepareControllerCredential(home, {
    ...offer,
    daemonPublicKeyB64: "replacement-key",
    pairing: undefined,
  });
  expect(replacement).toBeNull();
});
it("refuses outbound connections from a controlled-only installation", async () => {
  const home = await mkdtemp(join(tmpdir(), "cli-controlled-"));
  homes.push(home);
  await writeFile(join(home, "remote-access.json"), JSON.stringify({ controlledOnly: true }));
  await expect(assertOutboundControlAllowed(home, false)).rejects.toThrow("controlled-only");
  await expect(assertOutboundControlAllowed(home, true)).resolves.toBeUndefined();
});
