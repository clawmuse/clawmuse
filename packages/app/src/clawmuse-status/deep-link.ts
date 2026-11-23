// Ported from agent/mobile/src/status-saas/status-saas-deep-link.ts.
// The app registers `clawmuse` next to `paseo`, and the service accepts both.
const HOME_SCHEMES = new Set(["clawmuse:", "paseo:"]);

export function isClawMuseStatusHomeDeepLink(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    HOME_SCHEMES.has(url.protocol) &&
    url.hostname === "home" &&
    (url.pathname === "" || url.pathname === "/") &&
    url.searchParams.get("focus") === "agent-activity"
  );
}

function extractStatusEnvelope(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  const record = data as { status?: unknown; body?: unknown };
  if (record.status && typeof record.status === "object" && !Array.isArray(record.status)) {
    return record.status as Record<string, unknown>;
  }
  if (record.body && typeof record.body === "object" && !Array.isArray(record.body)) {
    const nested = (record.body as { status?: unknown }).status;
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      return nested as Record<string, unknown>;
    }
  }
  return null;
}

/** An aggregate alert from the status service, as opposed to a per-agent push. */
export function isClawMuseStatusHomeNotification(data: unknown): boolean {
  const status = extractStatusEnvelope(data);
  if (!status) {
    return false;
  }
  const deepLink = status.deepLink;
  return typeof deepLink === "string" && isClawMuseStatusHomeDeepLink(deepLink);
}

export interface ClawMuseStatusLiveActivityReconcileSignal {
  staleGeneration?: string;
  endIdleActivities: boolean;
}

export function parseClawMuseStatusLiveActivityReconcile(
  data: unknown,
): ClawMuseStatusLiveActivityReconcileSignal | null {
  const status = extractStatusEnvelope(data);
  if (!status || status.reconcileLiveActivity !== true) {
    return null;
  }
  const staleGeneration =
    typeof status.staleGeneration === "string" && status.staleGeneration.length > 0
      ? status.staleGeneration
      : undefined;
  return {
    ...(staleGeneration ? { staleGeneration } : {}),
    endIdleActivities: status.endIdleActivities === true,
  };
}
