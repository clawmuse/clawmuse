/**
 * The seam between host removal and the status service.
 *
 * `host-runtime` must not depend on SecureStore, AsyncStorage, or the status
 * API — it runs in plain node tests — so it calls through this registry and
 * does nothing when the feature root is not mounted (Android, web, and any
 * device without the native module).
 */
export interface ClawMuseStatusHostUnbindRunner {
  prepare: (serverId: string) => Promise<void>;
  commit: (serverId: string) => Promise<void>;
  flush: () => Promise<void>;
}

let runner: ClawMuseStatusHostUnbindRunner | null = null;
let activeFlush: Promise<void> | null = null;

export function registerClawMuseStatusHostUnbindRunner(
  next: ClawMuseStatusHostUnbindRunner,
): () => void {
  runner = next;
  return () => {
    if (runner === next) {
      runner = null;
    }
  };
}

/** Records the binding before the host leaves the registry, while it is still readable. */
export async function prepareClawMuseStatusHostUnbind(serverId: string): Promise<void> {
  await runner?.prepare(serverId);
}

/** The host is gone: the intent is now safe to act on. */
export async function commitClawMuseStatusHostUnbind(serverId: string): Promise<void> {
  await runner?.commit(serverId);
}

export function flushClawMuseStatusHostUnbinds(): Promise<void> {
  if (!runner) {
    return Promise.resolve();
  }
  if (!activeFlush) {
    activeFlush = runner.flush().finally(() => {
      activeFlush = null;
    });
  }
  return activeFlush;
}
