import { describe, expect, it, vi } from "vitest";
import {
  ensureClawMuseStatusWidgetCredentials,
  parseClawMuseStatusWidgetToken,
  widgetTokenNeedsRenewal,
  type WidgetCredentialStorage,
} from "./widget-credentials";

const DAY_MS = 24 * 60 * 60_000;

function createStorage(initial: Record<string, string> = {}): WidgetCredentialStorage & {
  values: Map<string, string>;
} {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
    removeItem: async (key) => {
      values.delete(key);
    },
  };
}

describe("parseClawMuseStatusWidgetToken", () => {
  it("rejects anything that is not a complete token", () => {
    expect(parseClawMuseStatusWidgetToken(null)).toBeNull();
    expect(parseClawMuseStatusWidgetToken("{")).toBeNull();
    expect(parseClawMuseStatusWidgetToken(JSON.stringify({ token: "t" }))).toBeNull();
  });

  it("reads a stored token", () => {
    const stored = { installationId: "i", token: "t", expiresAt: 10 };
    expect(parseClawMuseStatusWidgetToken(JSON.stringify(stored))).toEqual(stored);
  });
});

describe("widgetTokenNeedsRenewal", () => {
  it("renews a missing token, another installation's token, and one near expiry", () => {
    expect(widgetTokenNeedsRenewal(null, "i", 0)).toBe(true);
    expect(
      widgetTokenNeedsRenewal(
        { installationId: "other", token: "t", expiresAt: 30 * DAY_MS },
        "i",
        0,
      ),
    ).toBe(true);
    expect(
      widgetTokenNeedsRenewal({ installationId: "i", token: "t", expiresAt: 6 * DAY_MS }, "i", 0),
    ).toBe(true);
    expect(
      widgetTokenNeedsRenewal({ installationId: "i", token: "t", expiresAt: 30 * DAY_MS }, "i", 0),
    ).toBe(false);
  });
});

describe("ensureClawMuseStatusWidgetCredentials", () => {
  it("issues and publishes a token on first run", async () => {
    const storage = createStorage();
    const publish = vi.fn(async () => {});
    await ensureClawMuseStatusWidgetCredentials({
      baseUrl: "https://status.example",
      installationId: "i",
      issueToken: async () => ({ accessToken: "widget-token", expiresIn: 2_592_000 }),
      storage,
      publish,
      now: () => 0,
    });
    expect(publish).toHaveBeenCalledWith({
      baseUrl: "https://status.example",
      token: "widget-token",
    });
    expect(storage.values.size).toBe(1);
  });

  it("republishes the stored token without issuing another", async () => {
    const storage = createStorage();
    const issueToken = vi.fn(async () => ({ accessToken: "widget-token", expiresIn: 2_592_000 }));
    const publish = vi.fn(async () => {});
    const input = {
      baseUrl: "https://status.example",
      installationId: "i",
      issueToken,
      storage,
      publish,
      now: () => 0,
    };
    await ensureClawMuseStatusWidgetCredentials(input);
    await ensureClawMuseStatusWidgetCredentials(input);
    expect(issueToken).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it("clears the credentials when the installation is gone", async () => {
    const storage = createStorage({
      "@paseo:clawmuse-status-widget-token": JSON.stringify({
        installationId: "i",
        token: "t",
        expiresAt: 30 * DAY_MS,
      }),
    });
    const publish = vi.fn(async () => {});
    await ensureClawMuseStatusWidgetCredentials({
      baseUrl: "https://status.example",
      installationId: null,
      issueToken: async () => {
        throw new Error("must not issue");
      },
      storage,
      publish,
      now: () => 0,
    });
    expect(publish).toHaveBeenCalledWith(null);
    expect(storage.values.size).toBe(0);
  });
});
