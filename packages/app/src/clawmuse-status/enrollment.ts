import { normalizeClawMuseStatusBaseUrl } from "./base-url";

const RELAY_HOST_ID = /^[A-Za-z0-9_-]{16}$/;
const MIN_ENROLLMENT_CODE_LENGTH = 32;

/**
 * The two daemon RPCs this feature needs. Narrowed to `unknown` results on
 * purpose: the SDK methods do not carry a payload type, so the shapes are
 * validated here the same way any other network boundary is.
 */
export interface ClawMuseStatusRpcClient {
  getClawMuseStatus: () => Promise<unknown>;
  createClawMuseStatusEnrollment: () => Promise<unknown>;
}

export interface ClawMuseStatusEnrollment {
  enrollmentCode: string;
  expiresAt: string;
  statusBaseUrl: string;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** The service's own id for this daemon; the phone needs it to unbind later. */
export async function readClawMuseStatusRelayHostId(
  client: ClawMuseStatusRpcClient,
): Promise<string | null> {
  const record = readRecord(await client.getClawMuseStatus());
  const relayHostId = record?.relayHostId;
  if (record?.configured !== true || typeof relayHostId !== "string") {
    return null;
  }
  return RELAY_HOST_ID.test(relayHostId) ? relayHostId : null;
}

export async function requestClawMuseStatusEnrollment(
  client: ClawMuseStatusRpcClient,
  development: boolean,
): Promise<ClawMuseStatusEnrollment> {
  const record = readRecord(await client.createClawMuseStatusEnrollment());
  const enrollmentCode = record?.enrollmentCode;
  const expiresAt = record?.expiresAt;
  const statusBaseUrl =
    typeof record?.statusBaseUrl === "string"
      ? normalizeClawMuseStatusBaseUrl(record.statusBaseUrl, development)
      : null;
  if (
    typeof enrollmentCode !== "string" ||
    enrollmentCode.length < MIN_ENROLLMENT_CODE_LENGTH ||
    typeof expiresAt !== "string" ||
    !Number.isFinite(Date.parse(expiresAt)) ||
    statusBaseUrl === null
  ) {
    throw new Error("Invalid status enrollment response");
  }
  return { enrollmentCode, expiresAt, statusBaseUrl };
}
