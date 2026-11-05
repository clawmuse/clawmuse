import { ClawMuseStatusRequestError } from "./client.js";
import type { ClawMuseStatusClient, ClawMuseStatusHostSession } from "./client.js";

const SESSION_CLOSE_TIMEOUT_MS = 3_000;

export interface ClawMuseStatusHostSessionOptions {
  client: ClawMuseStatusClient;
  openSession: (signal: AbortSignal) => Promise<ClawMuseStatusHostSession>;
  getRequestSignal: () => AbortSignal;
  getLifecycle: () => number;
  isStarted: () => boolean;
  trackOperation: <T>(operation: Promise<T>) => Promise<T>;
  onOpened: (session: ClawMuseStatusHostSession) => void;
  onInvalidated: () => void;
}

/**
 * Starting a session fences any older publisher for the same host, so 401, 403,
 * and 409 all mean "this lease is gone" rather than "retry this request".
 */
function isSessionFence(error: unknown): boolean {
  return (
    error instanceof ClawMuseStatusRequestError &&
    (error.statusCode === 401 || error.statusCode === 403 || error.statusCode === 409)
  );
}

/** Owns the single live `/v1/host/sessions` lease and its fencing rules. */
export class ClawMuseStatusHostSessionLease {
  private session: ClawMuseStatusHostSession | null = null;
  private opening: Promise<ClawMuseStatusHostSession | null> | null = null;

  constructor(private readonly options: ClawMuseStatusHostSessionOptions) {}

  get current(): ClawMuseStatusHostSession | null {
    return this.session;
  }

  async ensure(): Promise<ClawMuseStatusHostSession | null> {
    if (this.session) {
      return this.session;
    }
    if (this.opening) {
      return this.opening;
    }
    const lifecycle = this.options.getLifecycle();
    const opening = this.options
      .openSession(this.options.getRequestSignal())
      .then(async (session) => {
        if (!this.options.isStarted() || lifecycle !== this.options.getLifecycle()) {
          await this.close(session);
          return null;
        }
        this.session = session;
        this.options.onOpened(session);
        return session;
      });
    this.opening = opening;
    void this.options.trackOperation(opening);
    void opening.then(
      () => this.clearOpening(opening),
      () => this.clearOpening(opening),
    );
    return opening;
  }

  invalidateIfFenced(error: unknown): boolean {
    if (!isSessionFence(error)) {
      return false;
    }
    this.invalidate();
    return true;
  }

  invalidate(): void {
    this.session = null;
    this.options.onInvalidated();
  }

  async close(session: ClawMuseStatusHostSession): Promise<void> {
    if (!session.hostSessionClose) {
      return;
    }
    await this.options.client
      .closeHostSession(session.accessToken, AbortSignal.timeout(SESSION_CLOSE_TIMEOUT_MS))
      .catch(() => undefined);
  }

  private clearOpening(opening: Promise<ClawMuseStatusHostSession | null>): void {
    if (this.opening === opening) {
      this.opening = null;
    }
  }
}
