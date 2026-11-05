// Ported from agent/mobile/src/status-saas/status-saas-config.ts.
// The phone never ships a base URL: it learns one from the daemon's enrollment
// response, so the value is validated as untrusted input every time.

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized === "localhost" || normalized === "::1") {
    return true;
  }
  const octets = normalized.split(".").map(Number);
  return (
    octets.length === 4 &&
    octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255) &&
    octets[0] === 127
  );
}

export function normalizeClawMuseStatusBaseUrl(
  value: string | null | undefined,
  development: boolean,
): string | null {
  const raw = value?.trim();
  if (!raw) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.username || url.password || url.search || url.hash) {
    return null;
  }
  const isDevelopmentLoopback =
    url.protocol === "http:" && development && isLoopbackHostname(url.hostname);
  if (url.protocol !== "https:" && !isDevelopmentLoopback) {
    return null;
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}
