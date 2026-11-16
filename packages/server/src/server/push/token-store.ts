import type pino from "pino";
import { existsSync, readFileSync } from "node:fs";
import type { PushNotificationPreferences } from "@getpaseo/protocol/messages";

import { ensurePrivateFile, writePrivateFileAtomicSync } from "../private-files.js";

export interface StoredPushSubscription {
  token: string;
  expiresAt: number;
  preferences?: PushNotificationPreferences;
}

interface InternalSubscriptionEntry {
  expiresAt: number;
  preferences?: PushNotificationPreferences;
}

function normalizePreferences(value: unknown): PushNotificationPreferences | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  const normalized: PushNotificationPreferences = {};
  let hasAny = false;
  for (const key of [
    "permission",
    "finished",
    "error",
    "running",
    "showPreview",
    "suppressWhenActive",
  ] as const) {
    if (typeof candidate[key] === "boolean") {
      normalized[key] = candidate[key];
      hasAny = true;
    }
  }
  return hasAny ? normalized : {};
}

function arePreferencesEqual(
  left: PushNotificationPreferences | undefined,
  right: PushNotificationPreferences | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.permission === right.permission &&
    left.finished === right.finished &&
    left.error === right.error &&
    left.running === right.running &&
    left.showPreview === right.showPreview &&
    left.suppressWhenActive === right.suppressWhenActive
  );
}

/**
 * Store for Expo push tokens.
 *
 * Tokens are persisted to disk so pushes still work after daemon restarts.
 */
export class PushTokenStore {
  private readonly logger: pino.Logger;
  private subscriptions = new Map<string, InternalSubscriptionEntry>();
  private readonly filePath: string;
  private readonly now: () => number;
  private readonly leaseMs: number;
  private readonly write: typeof writePrivateFileAtomicSync;

  constructor(
    logger: pino.Logger,
    filePath: string,
    now: () => number,
    leaseMs: number,
    write: typeof writePrivateFileAtomicSync = writePrivateFileAtomicSync,
  ) {
    this.logger = logger.child({ component: "token-store" });
    this.filePath = filePath;
    this.now = now;
    this.leaseMs = leaseMs;
    this.write = write;
    this.loadFromDisk();
  }

  renewToken(token: string, preferences?: PushNotificationPreferences): void {
    const normalized = token.trim();
    if (!normalized) return;
    const now = this.now();
    const current = this.subscriptions.get(normalized);
    const nextPreferences =
      preferences !== undefined ? normalizePreferences(preferences) : current?.preferences;
    const preferencesChanged =
      preferences !== undefined && !arePreferencesEqual(current?.preferences, nextPreferences);
    if (
      current !== undefined &&
      !preferencesChanged &&
      current.expiresAt - now > this.leaseMs / 2
    ) {
      return;
    }
    const next = new Map(this.subscriptions);
    next.set(normalized, {
      expiresAt: now + this.leaseMs,
      ...(nextPreferences !== undefined ? { preferences: nextPreferences } : {}),
    });
    this.persist(next);
    this.subscriptions = next;
    this.logger.debug({ total: this.subscriptions.size }, "Renewed token");
  }

  revokeToken(token: string): void {
    const normalized = token.trim();
    if (!normalized) return;
    if (!this.subscriptions.has(normalized)) return;
    const next = new Map(this.subscriptions);
    next.delete(normalized);
    this.persist(next);
    this.subscriptions = next;
    this.logger.debug({ total: this.subscriptions.size }, "Revoked token");
  }

  getActiveSubscriptions(): StoredPushSubscription[] {
    const now = this.now();
    const active = new Map(this.subscriptions);
    for (const [token, entry] of this.subscriptions) {
      if (entry.expiresAt <= now) {
        active.delete(token);
      }
    }
    if (active.size !== this.subscriptions.size) {
      try {
        this.persist(active);
        this.subscriptions = active;
      } catch {
        // Keep the previous state so a later send retries pruning. Expired tokens
        // are still excluded from this delivery.
      }
    }
    return Array.from(active, ([token, entry]) => ({
      token,
      expiresAt: entry.expiresAt,
      ...(entry.preferences !== undefined ? { preferences: entry.preferences } : {}),
    }));
  }

  getActiveTokens(): string[] {
    return this.getActiveSubscriptions().map((entry) => entry.token);
  }

  private loadFromDisk(): void {
    try {
      if (!existsSync(this.filePath)) {
        return;
      }
      ensurePrivateFile(this.filePath);
      const raw = readFileSync(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as { subscriptions?: unknown; tokens?: unknown };
      const loaded = new Map<string, InternalSubscriptionEntry>();
      const subscriptions = Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [];
      for (const value of subscriptions) {
        if (!value || typeof value !== "object") continue;
        const candidate = value as {
          token?: unknown;
          expiresAt?: unknown;
          preferences?: unknown;
        };
        if (typeof candidate.token !== "string" || typeof candidate.expiresAt !== "string")
          continue;
        const token = candidate.token.trim();
        const expiresAt = Date.parse(candidate.expiresAt);
        if (token && Number.isFinite(expiresAt)) {
          const preferences = normalizePreferences(candidate.preferences);
          loaded.set(token, {
            expiresAt,
            ...(preferences !== undefined ? { preferences } : {}),
          });
        }
      }
      this.subscriptions = loaded;

      const legacyTokens = Array.isArray(parsed.tokens)
        ? parsed.tokens.filter((token): token is string => typeof token === "string")
        : [];
      if (legacyTokens.length > 0) {
        const migrated = new Map(loaded);
        const expiresAt = this.now() + this.leaseMs;
        for (const token of legacyTokens) {
          const normalized = token.trim();
          if (normalized) migrated.set(normalized, { expiresAt });
        }
        this.persist(migrated);
        this.subscriptions = migrated;
      }
      this.logger.info({ total: this.subscriptions.size }, "Loaded push tokens");
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.warn({ err }, "Failed to load push tokens");
    }
  }

  private persist(subscriptions: ReadonlyMap<string, InternalSubscriptionEntry>): void {
    try {
      const payload =
        JSON.stringify(
          {
            subscriptions: Array.from(subscriptions, ([token, entry]) => ({
              token,
              expiresAt: new Date(entry.expiresAt).toISOString(),
              ...(entry.preferences !== undefined ? { preferences: entry.preferences } : {}),
            })),
          },
          null,
          2,
        ) + "\n";
      this.write(this.filePath, payload);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.warn({ err }, "Failed to persist push tokens");
      throw err;
    }
  }
}
