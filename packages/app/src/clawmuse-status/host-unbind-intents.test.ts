import { describe, expect, it } from "vitest";
import { parseClawMuseStatusHostUnbindIntents } from "./host-unbind-intents";

const INTENT = {
  baseUrl: "https://status.example.com",
  installationId: "installation-1",
  serverId: "server-1",
  relayHostId: "AbCdEfGhIjKlMnOp",
  ready: false,
};

describe("parseClawMuseStatusHostUnbindIntents", () => {
  it("reads a stored list", () => {
    expect(
      parseClawMuseStatusHostUnbindIntents(JSON.stringify({ version: 1, intents: [INTENT] })),
    ).toEqual([INTENT]);
  });

  it("returns nothing for absent, malformed, or versioned-out storage", () => {
    expect(parseClawMuseStatusHostUnbindIntents(null)).toEqual([]);
    expect(parseClawMuseStatusHostUnbindIntents("{")).toEqual([]);
    expect(
      parseClawMuseStatusHostUnbindIntents(JSON.stringify({ version: 2, intents: [INTENT] })),
    ).toEqual([]);
  });

  it("drops entries that could not identify a binding", () => {
    const intents = [
      INTENT,
      { ...INTENT, relayHostId: "too-short" },
      { ...INTENT, installationId: "" },
      { ...INTENT, ready: "yes" },
      null,
    ];
    expect(parseClawMuseStatusHostUnbindIntents(JSON.stringify({ version: 1, intents }))).toEqual([
      INTENT,
    ]);
  });
});
