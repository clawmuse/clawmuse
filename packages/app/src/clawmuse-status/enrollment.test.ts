import { describe, expect, it } from "vitest";
import {
  readClawMuseStatusRelayHostId,
  requestClawMuseStatusEnrollment,
  type ClawMuseStatusRpcClient,
} from "./enrollment";

const CODE = "a".repeat(48);
const EXPIRES_AT = "2026-09-11T12:00:00.000Z";

function client(responses: { status?: unknown; enrollment?: unknown }): ClawMuseStatusRpcClient {
  return {
    getClawMuseStatus: async () => responses.status,
    createClawMuseStatusEnrollment: async () => responses.enrollment,
  };
}

describe("readClawMuseStatusRelayHostId", () => {
  it("returns the service's id for a configured host", async () => {
    const relayHostId = "AbCdEfGhIjKlMnOp";
    expect(
      await readClawMuseStatusRelayHostId(client({ status: { configured: true, relayHostId } })),
    ).toBe(relayHostId);
  });

  it("rejects an unconfigured host or a malformed id", async () => {
    expect(
      await readClawMuseStatusRelayHostId(
        client({ status: { configured: false, relayHostId: "AbCdEfGhIjKlMnOp" } }),
      ),
    ).toBeNull();
    expect(
      await readClawMuseStatusRelayHostId(
        client({ status: { configured: true, relayHostId: "short" } }),
      ),
    ).toBeNull();
    expect(await readClawMuseStatusRelayHostId(client({ status: null }))).toBeNull();
  });
});

describe("requestClawMuseStatusEnrollment", () => {
  it("normalizes the base URL the daemon reports", async () => {
    const enrollment = await requestClawMuseStatusEnrollment(
      client({
        enrollment: {
          enrollmentCode: CODE,
          expiresAt: EXPIRES_AT,
          statusBaseUrl: "https://status.example.com/",
        },
      }),
      false,
    );
    expect(enrollment).toEqual({
      enrollmentCode: CODE,
      expiresAt: EXPIRES_AT,
      statusBaseUrl: "https://status.example.com",
    });
  });

  it("refuses plain HTTP outside a development build", async () => {
    const responses = {
      enrollment: {
        enrollmentCode: CODE,
        expiresAt: EXPIRES_AT,
        statusBaseUrl: "http://127.0.0.1:8787",
      },
    };
    await expect(requestClawMuseStatusEnrollment(client(responses), false)).rejects.toThrow(
      "Invalid status enrollment response",
    );
    expect((await requestClawMuseStatusEnrollment(client(responses), true)).statusBaseUrl).toBe(
      "http://127.0.0.1:8787",
    );
  });

  it("rejects a short code, a bad expiry, and a missing payload", async () => {
    await expect(
      requestClawMuseStatusEnrollment(
        client({
          enrollment: {
            enrollmentCode: "short",
            expiresAt: EXPIRES_AT,
            statusBaseUrl: "https://status.example.com",
          },
        }),
        false,
      ),
    ).rejects.toThrow("Invalid status enrollment response");
    await expect(
      requestClawMuseStatusEnrollment(
        client({
          enrollment: {
            enrollmentCode: CODE,
            expiresAt: "not a date",
            statusBaseUrl: "https://status.example.com",
          },
        }),
        false,
      ),
    ).rejects.toThrow("Invalid status enrollment response");
    await expect(
      requestClawMuseStatusEnrollment(client({ enrollment: null }), false),
    ).rejects.toThrow("Invalid status enrollment response");
  });
});
