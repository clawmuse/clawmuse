import {
  deleteClawMuseStatusSession,
  loadClawMuseStatusSession,
  saveClawMuseStatusSession,
  type ClawMuseStatusStoredSession,
} from "./session-store";

/**
 * Ported from agent/mobile/src/status-saas/status-saas-mobile-session.ts.
 * Reads the Keychain once, serializes every write, and discards a stored
 * session that belongs to a different status service than this client talks to.
 */
export class ClawMuseStatusMobileSession {
  private value: ClawMuseStatusStoredSession | null = null;
  private loaded = false;
  private dirty = false;
  private loadPromise: Promise<void> | null = null;
  private storeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly baseUrl: string,
    private readonly accountId?: string | null,
  ) {}

  get current(): ClawMuseStatusStoredSession | null {
    return this.value;
  }

  async read(): Promise<ClawMuseStatusStoredSession | null> {
    await this.load();
    await this.persist();
    return this.value;
  }

  replace(value: ClawMuseStatusStoredSession): void {
    this.value = value;
    this.dirty = true;
  }

  async clear(): Promise<void> {
    this.loaded = true;
    this.value = null;
    this.dirty = false;
    await this.enqueue(deleteClawMuseStatusSession);
  }

  async persist(): Promise<void> {
    if (!this.dirty || !this.value) {
      return;
    }
    const value = this.value;
    await this.enqueue(() => saveClawMuseStatusSession(value));
    if (this.value === value) {
      this.dirty = false;
    }
  }

  private async load(): Promise<void> {
    if (this.loaded) {
      return;
    }
    if (!this.loadPromise) {
      this.loadPromise = loadClawMuseStatusSession()
        .then((stored) => {
          if (!this.loaded) {
            const accountMatches =
              this.accountId === undefined || (stored?.accountId ?? null) === this.accountId;
            this.value = stored?.baseUrl === this.baseUrl && accountMatches ? stored : null;
            this.loaded = true;
          }
          return;
        })
        .finally(() => {
          this.loadPromise = null;
        });
    }
    await this.loadPromise;
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.storeQueue.then(operation, operation);
    this.storeQueue = result.catch(() => {});
    return result;
  }
}
