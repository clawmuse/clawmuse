import { deleteSecureItem, getSecureItem, setSecureItem } from "./secure-store";

const SESSION_KEY = "clawmuse.status.session.v1";

const RELAY_HOST_ID = /^[A-Za-z0-9_-]{16}$/;

/**
 * Ported from agent/mobile/src/status-saas/status-saas-session-store.ts, with
 * Orca's `boundHostIds: string[]` replaced by a Paseo `serverId -> relayHostId`
 * map: unbinding a host needs the relay id the service knows it by, and the
 * host may be gone from the registry by then.
 */
export interface ClawMuseStatusStoredSession {
  version: 1;
  accountId?: string;
  baseUrl: string;
  installationId: string;
  refreshToken: string;
  boundHosts: Record<string, string>;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function parseBoundHosts(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const boundHosts: Record<string, string> = {};
  for (const [serverId, relayHostId] of Object.entries(value)) {
    if (!isNonEmptyString(serverId) || typeof relayHostId !== "string") {
      return null;
    }
    if (!RELAY_HOST_ID.test(relayHostId)) {
      return null;
    }
    boundHosts[serverId] = relayHostId;
  }
  return boundHosts;
}

export function parseClawMuseStatusStoredSession(
  value: string,
): ClawMuseStatusStoredSession | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  const boundHosts = parseBoundHosts(record.boundHosts);
  if (
    (record.accountId !== undefined && !isNonEmptyString(record.accountId)) ||
    record.version !== 1 ||
    !isNonEmptyString(record.baseUrl) ||
    !isNonEmptyString(record.installationId) ||
    !isNonEmptyString(record.refreshToken) ||
    boundHosts === null
  ) {
    return null;
  }
  return {
    version: 1,
    ...(typeof record.accountId === "string" ? { accountId: record.accountId } : {}),
    baseUrl: record.baseUrl,
    installationId: record.installationId,
    refreshToken: record.refreshToken,
    boundHosts,
  };
}

export async function loadClawMuseStatusSession(): Promise<ClawMuseStatusStoredSession | null> {
  const raw = await getSecureItem(SESSION_KEY);
  return raw === null ? null : parseClawMuseStatusStoredSession(raw);
}

export function saveClawMuseStatusSession(session: ClawMuseStatusStoredSession): Promise<void> {
  return setSecureItem(SESSION_KEY, JSON.stringify(session));
}

export function deleteClawMuseStatusSession(): Promise<void> {
  return deleteSecureItem(SESSION_KEY);
}
