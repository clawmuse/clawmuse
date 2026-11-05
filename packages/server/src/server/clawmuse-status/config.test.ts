import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearClawMuseStatusRelationship,
  normalizeClawMuseStatusUrl,
  readClawMuseStatusRelationship,
  resolveClawMuseStatusSettings,
  saveClawMuseStatusRelationship,
} from "./config.js";
import {
  getClawMuseStatusHostTokenPath,
  readClawMuseStatusHostToken,
  removeClawMuseStatusHostToken,
  writeClawMuseStatusHostToken,
} from "./host-credential.js";

const TOKEN = "clawmuse-status-host-token-0123456789";
let paseoHome: string;

beforeEach(() => {
  paseoHome = mkdtempSync(path.join(tmpdir(), "clawmuse-status-config-"));
});

afterEach(() => {
  rmSync(paseoHome, { recursive: true, force: true });
});

describe("normalizeClawMuseStatusUrl", () => {
  it("keeps a base path and strips trailing slashes", () => {
    expect(normalizeClawMuseStatusUrl("https://status.example/api///")).toBe(
      "https://status.example/api",
    );
  });

  it("allows plain HTTP only on loopback", () => {
    expect(normalizeClawMuseStatusUrl("http://127.0.0.1:8787")).toBe("http://127.0.0.1:8787");
    expect(() => normalizeClawMuseStatusUrl("http://status.example")).toThrow("HTTPS");
  });

  it("rejects a URL carrying credentials, a query, or a fragment", () => {
    expect(() => normalizeClawMuseStatusUrl("https://user:pass@status.example")).toThrow(
      "credentials",
    );
    expect(() => normalizeClawMuseStatusUrl("https://status.example?token=x")).toThrow("query");
    expect(() => normalizeClawMuseStatusUrl("status.example")).toThrow("absolute URL");
  });
});

describe("ClawMuse Status relationship storage", () => {
  it("round-trips through the daemon config file and clears again", () => {
    saveClawMuseStatusRelationship(paseoHome, {
      url: "https://status.example",
      displayName: "workshop",
    });

    expect(readClawMuseStatusRelationship(paseoHome, {})).toEqual({
      baseUrl: "https://status.example",
      displayName: "workshop",
    });

    clearClawMuseStatusRelationship(paseoHome);
    expect(readClawMuseStatusRelationship(paseoHome, {})).toBeNull();
  });

  it("keeps the host token out of the config file and private on disk", () => {
    writeClawMuseStatusHostToken(paseoHome, TOKEN);
    saveClawMuseStatusRelationship(paseoHome, { url: "https://status.example", displayName: null });

    const config = readFileSync(path.join(paseoHome, "config.json"), "utf8");
    expect(config).not.toContain(TOKEN);
    expect(readClawMuseStatusHostToken(paseoHome, {})).toBe(TOKEN);
    expect(statSync(getClawMuseStatusHostTokenPath(paseoHome)).mode & 0o777).toBe(0o600);

    removeClawMuseStatusHostToken(paseoHome);
    expect(readClawMuseStatusHostToken(paseoHome, {})).toBeNull();
  });

  it("lets the environment override the stored service and name", () => {
    saveClawMuseStatusRelationship(paseoHome, { url: "https://stored.example", displayName: "a" });

    expect(
      readClawMuseStatusRelationship(paseoHome, {
        CLAWMUSE_STATUS_URL: "https://env.example",
        CLAWMUSE_STATUS_DISPLAY_NAME: "b",
      }),
    ).toEqual({ baseUrl: "https://env.example", displayName: "b" });
  });
});

describe("resolveClawMuseStatusSettings", () => {
  it("is disabled until a service is configured", () => {
    expect(resolveClawMuseStatusSettings({ paseoHome, env: {} })).toEqual({ state: "disabled" });
  });

  it("reports a configured service that has no host token", () => {
    saveClawMuseStatusRelationship(paseoHome, { url: "https://status.example", displayName: null });

    expect(resolveClawMuseStatusSettings({ paseoHome, env: {} })).toEqual({
      state: "error",
      baseUrl: "https://status.example",
      error: "No status host token is stored for this daemon",
    });
  });

  it("reports a token that is shorter than the service accepts", () => {
    saveClawMuseStatusRelationship(paseoHome, { url: "https://status.example", displayName: null });
    writeClawMuseStatusHostToken(paseoHome, "too-short");

    expect(resolveClawMuseStatusSettings({ paseoHome, env: {} })).toMatchObject({
      state: "error",
      error: "The status host token must be at least 32 characters",
    });
  });

  it("reports an unusable URL instead of throwing at daemon startup", () => {
    expect(
      resolveClawMuseStatusSettings({
        paseoHome,
        env: { CLAWMUSE_STATUS_URL: "http://status.example", CLAWMUSE_STATUS_HOST_TOKEN: TOKEN },
      }),
    ).toEqual({
      state: "error",
      baseUrl: null,
      error: "The status service URL must use HTTPS unless it is on loopback",
    });
  });

  it("falls back to the machine hostname when no display name is stored", () => {
    saveClawMuseStatusRelationship(paseoHome, {
      url: "https://status.example/",
      displayName: null,
    });
    writeClawMuseStatusHostToken(paseoHome, TOKEN);

    expect(
      resolveClawMuseStatusSettings({ paseoHome, env: {}, defaultDisplayName: "fallback-host" }),
    ).toEqual({
      state: "ready",
      baseUrl: "https://status.example",
      displayName: "fallback-host",
      hostToken: TOKEN,
    });
  });
});
