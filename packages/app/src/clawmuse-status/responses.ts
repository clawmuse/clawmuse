// Ported from agent/mobile/src/status-saas/status-saas-mobile-responses.ts.
export interface MobileSessionResponse {
  installationId: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface EnrollmentRedemptionResponse {
  installationId: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  hostId: string;
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid status service response: ${key}`);
  }
  return value;
}

function requiredExpiresIn(record: Record<string, unknown>): number {
  const expiresIn = record.expiresIn;
  if (typeof expiresIn !== "number" || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error("Invalid status service response: expiresIn");
  }
  return expiresIn;
}

export function parseMobileSessionResponse(value: unknown): MobileSessionResponse {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid status service session response");
  }
  const record = value as Record<string, unknown>;
  return {
    installationId: requiredString(record, "installationId"),
    accessToken: requiredString(record, "accessToken"),
    refreshToken: requiredString(record, "refreshToken"),
    expiresIn: requiredExpiresIn(record),
  };
}

export function parseEnrollmentRedemptionResponse(value: unknown): EnrollmentRedemptionResponse {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid status service enrollment response");
  }
  const record = value as Record<string, unknown>;
  const refreshToken = record.refreshToken;
  if (refreshToken !== undefined && (typeof refreshToken !== "string" || !refreshToken)) {
    throw new Error("Invalid status service response: refreshToken");
  }
  return {
    installationId: requiredString(record, "installationId"),
    accessToken: requiredString(record, "accessToken"),
    ...(typeof refreshToken === "string" ? { refreshToken } : {}),
    expiresIn: requiredExpiresIn(record),
    hostId: requiredString(record, "hostId"),
  };
}

export function parseRemovedPushEndpoints(value: unknown): number {
  const removed =
    value && typeof value === "object" ? (value as { removed?: unknown }).removed : null;
  if (typeof removed !== "number" || !Number.isInteger(removed) || removed < 0) {
    throw new Error("Invalid status service response: removed");
  }
  return removed;
}

export function parseRevokedHostBindings(value: unknown): number {
  const revoked =
    value && typeof value === "object" ? (value as { revoked?: unknown }).revoked : null;
  if (typeof revoked !== "number" || !Number.isInteger(revoked) || revoked < 0) {
    throw new Error("Invalid status service response: revoked");
  }
  return revoked;
}

export interface WidgetTokenResponse {
  accessToken: string;
  expiresIn: number;
}

export function parseWidgetTokenResponse(value: unknown): WidgetTokenResponse {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid status service widget token response");
  }
  const record = value as Record<string, unknown>;
  return {
    accessToken: requiredString(record, "accessToken"),
    expiresIn: requiredExpiresIn(record),
  };
}

export function parseClearedLiveActivities(value: unknown): number {
  const cleared =
    value && typeof value === "object" ? (value as { cleared?: unknown }).cleared : null;
  return typeof cleared === "number" && Number.isInteger(cleared) && cleared >= 0 ? cleared : 0;
}
