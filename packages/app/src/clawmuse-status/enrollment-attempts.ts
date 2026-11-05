import * as ExpoCrypto from "expo-crypto";
import { getSecureItem, setSecureItem } from "./secure-store";

const ATTEMPTS_KEY = "clawmuse.status.enrollment-attempts.v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Ported from agent/mobile/src/status-saas/status-saas-enrollment-attempt*.ts.
 * The idempotency key survives a crash between the POST and the Keychain write,
 * so a retry rejoins the same exchange instead of burning the single-use code.
 */
export interface ClawMuseStatusEnrollmentAttempt {
  baseUrl: string;
  serverId: string;
  enrollmentCode: string;
  idempotencyKey: string;
  expiresAt: string;
}

function parseAttempt(value: unknown): ClawMuseStatusEnrollmentAttempt | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.baseUrl !== "string" ||
    !record.baseUrl ||
    typeof record.serverId !== "string" ||
    !record.serverId ||
    typeof record.enrollmentCode !== "string" ||
    record.enrollmentCode.length < 32 ||
    typeof record.idempotencyKey !== "string" ||
    !UUID.test(record.idempotencyKey) ||
    typeof record.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(record.expiresAt))
  ) {
    return null;
  }
  return {
    baseUrl: record.baseUrl,
    serverId: record.serverId,
    enrollmentCode: record.enrollmentCode,
    idempotencyKey: record.idempotencyKey,
    expiresAt: record.expiresAt,
  };
}

export function parseClawMuseStatusEnrollmentAttempts(
  value: string,
): ClawMuseStatusEnrollmentAttempt[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") {
    return [];
  }
  const record = parsed as Record<string, unknown>;
  if (record.version !== 1 || !Array.isArray(record.attempts)) {
    return [];
  }
  return record.attempts.flatMap((attempt) => {
    const parsedAttempt = parseAttempt(attempt);
    return parsedAttempt ? [parsedAttempt] : [];
  });
}

async function loadAttempts(): Promise<ClawMuseStatusEnrollmentAttempt[]> {
  const raw = await getSecureItem(ATTEMPTS_KEY);
  return raw === null ? [] : parseClawMuseStatusEnrollmentAttempts(raw);
}

function saveAttempts(attempts: readonly ClawMuseStatusEnrollmentAttempt[]): Promise<void> {
  return setSecureItem(ATTEMPTS_KEY, JSON.stringify({ version: 1, attempts }));
}

export interface ClawMuseStatusEnrollmentAttemptInput {
  baseUrl: string;
  enrollmentCode: string;
  serverId: string;
  expiresAt: string;
  now: number;
}

export async function getOrCreateClawMuseStatusEnrollmentAttempt(
  input: ClawMuseStatusEnrollmentAttemptInput,
): Promise<ClawMuseStatusEnrollmentAttempt> {
  const attempts = await loadAttempts();
  const current = attempts.filter((attempt) => Date.parse(attempt.expiresAt) > input.now);
  const existing = current.find(
    (attempt) => attempt.baseUrl === input.baseUrl && attempt.serverId === input.serverId,
  );
  if (existing) {
    if (current.length !== attempts.length) {
      await saveAttempts(current);
    }
    return existing;
  }
  const expiresAt = Date.parse(input.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= input.now) {
    throw new Error("Status enrollment has expired");
  }
  const attempt: ClawMuseStatusEnrollmentAttempt = {
    baseUrl: input.baseUrl,
    serverId: input.serverId,
    enrollmentCode: input.enrollmentCode,
    idempotencyKey: ExpoCrypto.randomUUID(),
    expiresAt: input.expiresAt,
  };
  await saveAttempts([...current, attempt]);
  return attempt;
}

export async function removeClawMuseStatusEnrollmentAttempt(
  attempt: ClawMuseStatusEnrollmentAttempt,
): Promise<void> {
  const attempts = await loadAttempts();
  await saveAttempts(
    attempts.filter((candidate) => candidate.idempotencyKey !== attempt.idempotencyKey),
  );
}
