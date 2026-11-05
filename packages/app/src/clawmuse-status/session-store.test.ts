import { describe, expect, it } from "vitest";
import { parseClawMuseStatusStoredSession } from "./session-store";

const VALID = {
  version: 1,
  baseUrl: "https://status.example.com",
  installationId: "installation-1",
  refreshToken: "refresh-1",
  boundHosts: { "server-1": "AbCdEfGhIjKlMnOp" },
};

describe("parseClawMuseStatusStoredSession", () => {
  it("reads a complete session", () => {
    expect(parseClawMuseStatusStoredSession(JSON.stringify(VALID))).toEqual(VALID);
  });

  it("accepts a session with no hosts bound yet", () => {
    const session = { ...VALID, boundHosts: {} };
    expect(parseClawMuseStatusStoredSession(JSON.stringify(session))).toEqual(session);
  });

  it("rejects malformed JSON and the wrong version", () => {
    expect(parseClawMuseStatusStoredSession("{")).toBeNull();
    expect(parseClawMuseStatusStoredSession(JSON.stringify({ ...VALID, version: 2 }))).toBeNull();
  });

  it("rejects missing credentials", () => {
    for (const key of ["baseUrl", "installationId", "refreshToken"] as const) {
      expect(parseClawMuseStatusStoredSession(JSON.stringify({ ...VALID, [key]: "" }))).toBeNull();
    }
  });

  it("rejects a binding map that is not serverId to relay host id", () => {
    expect(
      parseClawMuseStatusStoredSession(
        JSON.stringify({ ...VALID, boundHosts: ["AbCdEfGhIjKlMnOp"] }),
      ),
    ).toBeNull();
    expect(
      parseClawMuseStatusStoredSession(
        JSON.stringify({ ...VALID, boundHosts: { "server-1": "nope" } }),
      ),
    ).toBeNull();
  });
  it("retains an account identity and rejects an invalid account identity", () => {
    const personal = { ...VALID, accountId: "person-A" };
    expect(parseClawMuseStatusStoredSession(JSON.stringify(personal))).toEqual(personal);
    expect(
      parseClawMuseStatusStoredSession(JSON.stringify({ ...VALID, accountId: "" })),
    ).toBeNull();
  });
});
