/**
 * What Settings shows for each host. Published by the feature root, which owns
 * the only status-service session, and read through `useSyncExternalStore` so
 * the settings screen never holds a second copy of it.
 */
export type ClawMuseStatusHostBinding =
  | { kind: "bound"; relayHostId: string }
  | { kind: "unbound" }
  | { kind: "unsupported" }
  | { kind: "offline" }
  | { kind: "base_url_mismatch"; hostBaseUrl: string }
  | { kind: "error"; message: string };

export interface ClawMuseStatusBindingSnapshot {
  /** This client holds a status-service session: iOS with the native module, or Electron. */
  supported: boolean;
  /** The lock-screen capsule and widget exist here (iOS only). */
  liveActivity: boolean;
  baseUrl: string | null;
  installationId: string | null;
  hosts: Readonly<Record<string, ClawMuseStatusHostBinding>>;
}

const EMPTY_SNAPSHOT: ClawMuseStatusBindingSnapshot = {
  supported: false,
  liveActivity: false,
  baseUrl: null,
  installationId: null,
  hosts: {},
};

let snapshot: ClawMuseStatusBindingSnapshot = EMPTY_SNAPSHOT;
const listeners = new Set<() => void>();

export function publishClawMuseStatusBindings(next: ClawMuseStatusBindingSnapshot): void {
  if (JSON.stringify(next) === JSON.stringify(snapshot)) {
    return;
  }
  snapshot = next;
  for (const listener of listeners) {
    listener();
  }
}

export function resetClawMuseStatusBindings(): void {
  publishClawMuseStatusBindings(EMPTY_SNAPSHOT);
}

export function getClawMuseStatusBindingSnapshot(): ClawMuseStatusBindingSnapshot {
  return snapshot;
}

export function subscribeClawMuseStatusBindings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
