const EDITING_IDLE_TIMEOUT_MS = 60_000;

interface EditingKeepAwakePort {
  activate(): Promise<void>;
  deactivate(): Promise<void>;
  subscribeToForeground(listener: () => void): () => void;
  onError(error: unknown): void;
}

/** Keyboard dictation changes text without touch events that reset the system idle timer. */
export class EditingKeepAwake {
  private eligible = false;
  private disposed = false;
  private desired = false;
  private applied = false;
  private operation: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeRetry: (() => void) | null = null;

  constructor(
    private readonly port: EditingKeepAwakePort,
    private readonly idleTimeoutMs: number | null = EDITING_IDLE_TIMEOUT_MS,
  ) {}

  setEligible(eligible: boolean): Promise<void> {
    if (this.disposed || this.eligible === eligible) return this.operation;
    this.eligible = eligible;
    return eligible ? this.recordActivity() : this.finish();
  }

  recordActivity(): Promise<void> {
    if (!this.eligible || this.disposed) return this.operation;
    this.clearTimer();
    if (this.idleTimeoutMs !== null) {
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.setAwake(false);
      }, this.idleTimeoutMs);
    }
    return this.setAwake(true);
  }

  finish(): Promise<void> {
    this.clearTimer();
    return this.setAwake(false);
  }

  dispose(): Promise<void> {
    this.disposed = true;
    this.eligible = false;
    return this.finish();
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private setAwake(awake: boolean): Promise<void> {
    if (this.desired === awake && this.applied === awake && !this.unsubscribeRetry) {
      return this.operation;
    }
    this.desired = awake;
    return this.enqueueReconcile();
  }

  private enqueueReconcile(): Promise<void> {
    // A release must wait for an in-flight native activation, including during unmount.
    this.operation = this.operation.then(() => this.reconcile());
    return this.operation;
  }

  private async reconcile(): Promise<void> {
    const desired = this.desired;
    try {
      if (this.applied !== desired) {
        await (desired ? this.port.activate() : this.port.deactivate());
        this.applied = desired;
      }
      this.unsubscribeRetry?.();
      this.unsubscribeRetry = null;
    } catch (error) {
      if (desired && this.desired) this.desired = false;
      if (!desired && !this.unsubscribeRetry) {
        // Android cannot release without an Activity. Keep cleanup alive after unmount,
        // then retry when the app returns instead of polling in the background.
        this.unsubscribeRetry = this.port.subscribeToForeground(() => {
          void this.enqueueReconcile();
        });
      }
      this.port.onError(error);
    }
  }
}
