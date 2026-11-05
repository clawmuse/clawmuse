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

/** An aggregate alert from the status service, as opposed to a per-agent push. */
export function isClawMuseStatusHomeNotification(data: unknown): boolean {
  if (!data || typeof data !== "object") {
    return false;
  }
  const status = (data as { status?: unknown }).status;
  if (!status || typeof status !== "object") {
    return false;
  }
  const deepLink = (status as { deepLink?: unknown }).deepLink;
  return typeof deepLink === "string" && isClawMuseStatusHomeDeepLink(deepLink);
}
