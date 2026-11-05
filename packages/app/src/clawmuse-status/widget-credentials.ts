const STORAGE_KEY = "@paseo:clawmuse-status-widget-token";
// Why: renew well before expiry so a phone that stays in a pocket for a week
// keeps a working widget; tokens last 30 days by default.
const RENEW_BEFORE_MS = 7 * 24 * 60 * 60_000;

// Ported from agent/mobile/src/status-saas/status-saas-widget-credentials.ts.
export interface ClawMuseStatusWidgetToken {
  installationId: string;
  token: string;
  expiresAt: number;
}

export function parseClawMuseStatusWidgetToken(
  raw: string | null,
): ClawMuseStatusWidgetToken | null {
  if (!raw) {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.installationId !== "string" ||
    typeof record.token !== "string" ||
    typeof record.expiresAt !== "number"
  ) {
    return null;
  }
  return {
    installationId: record.installationId,
    token: record.token,
    expiresAt: record.expiresAt,
  };
}

export function widgetTokenNeedsRenewal(
  current: ClawMuseStatusWidgetToken | null,
  installationId: string,
  now: number,
): boolean {
  return (
    !current ||
    current.installationId !== installationId ||
    current.expiresAt - RENEW_BEFORE_MS <= now
  );
}

export interface WidgetCredentialStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

export interface EnsureClawMuseStatusWidgetCredentialsInput {
  baseUrl: string;
  installationId: string | null;
  issueToken: () => Promise<{ accessToken: string; expiresIn: number }>;
  storage: WidgetCredentialStorage;
  publish: (credentials: { baseUrl: string; token: string } | null) => Promise<void>;
  now?: () => number;
}

/**
 * Keeps the widget's summary-only token fresh and mirrored into the App Group.
 * Idempotent: returns quietly when the stored token is still good.
 *
 * Why storage and the native bridge are injected: this stays a pure module so
 * it can run under vitest, where react-native cannot load.
 */
export async function ensureClawMuseStatusWidgetCredentials(
  input: EnsureClawMuseStatusWidgetCredentialsInput,
): Promise<void> {
  const now = (input.now ?? Date.now)();
  const current = parseClawMuseStatusWidgetToken(await input.storage.getItem(STORAGE_KEY));
  if (!input.installationId) {
    if (current) {
      await input.storage.removeItem(STORAGE_KEY);
    }
    await input.publish(null);
    return;
  }
  if (current && !widgetTokenNeedsRenewal(current, input.installationId, now)) {
    await input.publish({ baseUrl: input.baseUrl, token: current.token });
    return;
  }
  const issued = await input.issueToken();
  const next: ClawMuseStatusWidgetToken = {
    installationId: input.installationId,
    token: issued.accessToken,
    expiresAt: now + issued.expiresIn * 1_000,
  };
  await input.storage.setItem(STORAGE_KEY, JSON.stringify(next));
  await input.publish({ baseUrl: input.baseUrl, token: next.token });
}
