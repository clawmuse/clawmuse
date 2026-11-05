import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { deriveRelayHostId } from "./relay-host-id.js";

describe("deriveRelayHostId", () => {
  it("is the first 16 base64url characters of sha256(serverId)", () => {
    const serverId = "srv_Ab3dEfGhIjKl";
    const expected = createHash("sha256").update(serverId, "utf8").digest("base64url").slice(0, 16);

    expect(deriveRelayHostId(serverId)).toBe(expected);
    expect(deriveRelayHostId(serverId)).toMatch(/^[A-Za-z0-9_-]{16}$/);
  });

  it("is stable for one server id and distinct across daemons", () => {
    expect(deriveRelayHostId("srv_one")).toBe(deriveRelayHostId("srv_one"));
    expect(deriveRelayHostId("srv_one")).not.toBe(deriveRelayHostId("srv_two"));
  });

  it("does not leak the server id it was derived from", () => {
    expect(deriveRelayHostId("srv_secret-home-name")).not.toContain("secret");
  });
});
