import { describe, expect, it } from "vitest";
import { normalizeClawMuseStatusBaseUrl } from "./base-url";

describe("normalizeClawMuseStatusBaseUrl", () => {
  it("accepts HTTPS and removes only trailing slashes", () => {
    expect(normalizeClawMuseStatusBaseUrl(" https://status.example.com/api/ ", false)).toBe(
      "https://status.example.com/api",
    );
  });

  it("allows development HTTP only on loopback hosts", () => {
    expect(normalizeClawMuseStatusBaseUrl("http://localhost:8787", true)).toBe(
      "http://localhost:8787",
    );
    expect(normalizeClawMuseStatusBaseUrl("http://127.0.0.42:8787/", true)).toBe(
      "http://127.0.0.42:8787",
    );
    expect(normalizeClawMuseStatusBaseUrl("http://192.168.1.10:8787", true)).toBeNull();
    expect(normalizeClawMuseStatusBaseUrl("http://localhost:8787", false)).toBeNull();
  });

  it("rejects credentials, queries, fragments, and non-HTTP schemes", () => {
    expect(normalizeClawMuseStatusBaseUrl("https://user:pass@example.com", false)).toBeNull();
    expect(normalizeClawMuseStatusBaseUrl("https://example.com?tenant=a", false)).toBeNull();
    expect(normalizeClawMuseStatusBaseUrl("https://example.com#status", false)).toBeNull();
    expect(normalizeClawMuseStatusBaseUrl("ftp://example.com", true)).toBeNull();
    expect(normalizeClawMuseStatusBaseUrl(null, true)).toBeNull();
  });
});
