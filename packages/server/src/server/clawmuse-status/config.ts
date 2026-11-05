import { hostname } from "node:os";

import { loadPersistedConfig, savePersistedConfig } from "../persisted-config.js";
import {
  CLAWMUSE_STATUS_HOST_TOKEN_MIN_LENGTH,
  readClawMuseStatusHostToken,
} from "./host-credential.js";

export class ClawMuseStatusUrlError extends Error {
  constructor(
    message: string,
    readonly url: string,
  ) {
    super(message);
    this.name = "ClawMuseStatusUrlError";
  }
}

export interface ClawMuseStatusRelationship {
  baseUrl: string;
  displayName: string | null;
}

export type ClawMuseStatusResolution =
  | { state: "disabled" }
  | { state: "error"; baseUrl: string | null; error: string }
  | { state: "ready"; baseUrl: string; displayName: string; hostToken: string };

function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

/**
 * The host token travels on every request to this origin, so a mistyped scheme
 * would leak it. Plain HTTP stays available for a service running on the same
 * machine during development.
 */
export function normalizeClawMuseStatusUrl(value: string): string {
  const trimmed = value.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new ClawMuseStatusUrlError("Enter the status service URL as an absolute URL", trimmed);
  }
  if (url.username || url.password) {
    throw new ClawMuseStatusUrlError("The status service URL cannot include credentials", trimmed);
  }
  if (url.search || url.hash) {
    throw new ClawMuseStatusUrlError(
      "The status service URL cannot include a query or fragment",
      trimmed,
    );
  }
  if (url.protocol === "http:" && !isLoopbackHost(url.hostname)) {
    throw new ClawMuseStatusUrlError(
      "The status service URL must use HTTPS unless it is on loopback",
      trimmed,
    );
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ClawMuseStatusUrlError("The status service URL must use HTTPS", trimmed);
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

/** Stored relationship plus environment overrides, before the token is read. */
export function readClawMuseStatusRelationship(
  paseoHome: string,
  env: NodeJS.ProcessEnv = process.env,
): ClawMuseStatusRelationship | null {
  const persisted = loadPersistedConfig(paseoHome).clawmuseStatus;
  const url = env.CLAWMUSE_STATUS_URL?.trim() || persisted?.url?.trim() || null;
  if (!url) {
    return null;
  }
  const displayName = env.CLAWMUSE_STATUS_DISPLAY_NAME?.trim() || persisted?.displayName || null;
  return { baseUrl: url, displayName };
}

export function saveClawMuseStatusRelationship(
  paseoHome: string,
  relationship: { url: string; displayName: string | null },
): void {
  const persisted = loadPersistedConfig(paseoHome);
  const goals = persisted.clawmuseStatus?.goals;
  savePersistedConfig(paseoHome, {
    ...persisted,
    clawmuseStatus: {
      url: relationship.url,
      ...(relationship.displayName ? { displayName: relationship.displayName } : {}),
      ...(goals ? { goals } : {}),
    },
  });
}

/** Removes the relationship; goal settings survive a disconnect/reconnect. */
export function clearClawMuseStatusRelationship(paseoHome: string): void {
  const persisted = loadPersistedConfig(paseoHome);
  const goals = persisted.clawmuseStatus?.goals;
  savePersistedConfig(paseoHome, {
    ...persisted,
    clawmuseStatus: goals ? { goals } : undefined,
  });
}

/**
 * The full publishing decision: a validated origin, a display name, and a host
 * token. Invalid configuration is reported rather than thrown so a bad value
 * cannot stop the daemon from starting; the publisher surfaces it as a status
 * error instead.
 */
export function resolveClawMuseStatusSettings(options: {
  paseoHome: string;
  env?: NodeJS.ProcessEnv;
  defaultDisplayName?: string;
}): ClawMuseStatusResolution {
  const env = options.env ?? process.env;
  const relationship = readClawMuseStatusRelationship(options.paseoHome, env);
  if (!relationship) {
    return { state: "disabled" };
  }
  let baseUrl: string;
  try {
    baseUrl = normalizeClawMuseStatusUrl(relationship.baseUrl);
  } catch (error) {
    return {
      state: "error",
      baseUrl: null,
      error: error instanceof Error ? error.message : "Invalid status service URL",
    };
  }
  const hostToken = readClawMuseStatusHostToken(options.paseoHome, env);
  if (!hostToken) {
    return { state: "error", baseUrl, error: "No status host token is stored for this daemon" };
  }
  if (hostToken.length < CLAWMUSE_STATUS_HOST_TOKEN_MIN_LENGTH) {
    return {
      state: "error",
      baseUrl,
      error: `The status host token must be at least ${CLAWMUSE_STATUS_HOST_TOKEN_MIN_LENGTH} characters`,
    };
  }
  return {
    state: "ready",
    baseUrl,
    displayName: relationship.displayName ?? options.defaultDisplayName ?? hostname(),
    hostToken,
  };
}
