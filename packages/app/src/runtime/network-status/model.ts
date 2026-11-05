export type NetworkType = "wifi" | "cellular" | "ethernet" | "other" | "none" | "unknown";

export interface NetworkStatus {
  online: boolean;
  type: NetworkType;
}

/** Device network reachability as the platform reports it. Emits the current status on subscribe. */
export interface NetworkStatusSource {
  subscribe(listener: (status: NetworkStatus) => void): () => void;
}

export interface WatchNetworkRecoveryInput {
  source: NetworkStatusSource;
  /** Every reported status, undebounced. */
  onStatus: (status: NetworkStatus) => void;
  /** The network came back or switched interfaces and has stayed that way for `debounceMs`. */
  onRecover: (status: NetworkStatus) => void;
  debounceMs?: number;
}

const DEFAULT_RECOVERY_DEBOUNCE_MS = 500;

/**
 * Reconnect backoff keeps growing while the device is offline, so the first retry
 * after the network returns can be up to 30s away. This turns offline→online and
 * Wi-Fi↔cellular switches into one recovery signal. Interfaces flap while a phone
 * leaves an elevator or roams; the debounce waits for the network to settle.
 */
export function watchNetworkRecovery(input: WatchNetworkRecoveryInput): () => void {
  const debounceMs = input.debounceMs ?? DEFAULT_RECOVERY_DEBOUNCE_MS;
  let previous: NetworkStatus | null = null;
  let pending: ReturnType<typeof setTimeout> | null = null;

  function cancelPending(): void {
    if (pending === null) return;
    clearTimeout(pending);
    pending = null;
  }

  const unsubscribe = input.source.subscribe((status) => {
    const last = previous;
    previous = status;
    input.onStatus(status);
    if (!status.online) {
      cancelPending();
      return;
    }
    if (!last) return;
    const cameOnline = !last.online;
    const switchedInterface = last.type !== status.type;
    if (!cameOnline && !switchedInterface) return;
    cancelPending();
    pending = setTimeout(() => {
      pending = null;
      input.onRecover(status);
    }, debounceMs);
  });

  return () => {
    cancelPending();
    unsubscribe();
  };
}

type Listener = () => void;

let currentStatus: NetworkStatus = { online: true, type: "unknown" };
const listeners = new Set<Listener>();

export function getNetworkStatus(): NetworkStatus {
  return currentStatus;
}

export function setNetworkStatus(status: NetworkStatus): void {
  if (status.online === currentStatus.online && status.type === currentStatus.type) return;
  currentStatus = status;
  for (const listener of listeners) listener();
}

export function subscribeNetworkStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
