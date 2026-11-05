import type { ClawMuseStatusApiClient } from "./api";

/**
 * The feature root owns the one API client (it knows the base URL and the
 * enrollment). Screens that talk to the service directly, such as goals, read
 * it from here instead of constructing a second client.
 */
let current: ClawMuseStatusApiClient | null = null;
const listeners = new Set<() => void>();

export function publishClawMuseStatusApiClient(client: ClawMuseStatusApiClient | null): void {
  if (client === current) {
    return;
  }
  current = client;
  for (const listener of listeners) {
    listener();
  }
}

export function getClawMuseStatusApiClient(): ClawMuseStatusApiClient | null {
  return current;
}

export function subscribeClawMuseStatusApiClient(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
