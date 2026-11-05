const DEFAULT_HEARTBEAT_INTERVAL_MS = 20_000;
const MIN_HEARTBEAT_INTERVAL_MS = 1_000;
const INITIAL_RETRY_DELAY_MS = 1_000;
const MAX_RETRY_DELAY_MS = 60_000;

export interface ClawMuseStatusDeliveryScheduleOptions {
  shouldRun: () => boolean;
  onHeartbeat: () => void;
  onRetry: () => void;
  onProjectionRefresh: () => void;
}

function unrefTimer(timer: ReturnType<typeof setTimeout>): void {
  if (typeof timer === "object" && "unref" in timer) {
    timer.unref();
  }
}

/**
 * Every timer the publisher owns: the service-supplied heartbeat, exponential
 * retry backoff, and the wake-up that drops a finished item once its dwell
 * expires. Timers are unref'd so a configured publisher never holds the daemon
 * process open.
 */
export class ClawMuseStatusDeliverySchedule {
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private projectionRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelayMs = INITIAL_RETRY_DELAY_MS;

  constructor(private readonly options: ClawMuseStatusDeliveryScheduleOptions) {}

  get retryScheduled(): boolean {
    return this.retryTimer !== null;
  }

  scheduleHeartbeat(delayMs = DEFAULT_HEARTBEAT_INTERVAL_MS): void {
    this.clearHeartbeat();
    if (!this.options.shouldRun()) {
      return;
    }
    this.heartbeatTimer = setTimeout(
      () => {
        this.heartbeatTimer = null;
        this.options.onHeartbeat();
      },
      Math.max(MIN_HEARTBEAT_INTERVAL_MS, delayMs),
    );
    unrefTimer(this.heartbeatTimer);
  }

  scheduleRetry(): void {
    if (!this.options.shouldRun() || this.retryTimer) {
      return;
    }
    const delayMs = this.retryDelayMs;
    this.retryDelayMs = Math.min(MAX_RETRY_DELAY_MS, this.retryDelayMs * 2);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.options.onRetry();
    }, delayMs);
    unrefTimer(this.retryTimer);
  }

  resetRetry(): void {
    this.retryDelayMs = INITIAL_RETRY_DELAY_MS;
    this.clearRetry();
  }

  armProjectionRefresh(refreshAtMs: number | null, nowMs: number): void {
    this.clearProjectionRefresh();
    if (!this.options.shouldRun() || refreshAtMs === null) {
      return;
    }
    this.projectionRefreshTimer = setTimeout(
      () => {
        this.projectionRefreshTimer = null;
        this.options.onProjectionRefresh();
      },
      Math.max(1, refreshAtMs - nowMs + 1),
    );
    unrefTimer(this.projectionRefreshTimer);
  }

  clearAll(): void {
    this.clearRetry();
    this.clearHeartbeat();
    this.clearProjectionRefresh();
  }

  clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  clearProjectionRefresh(): void {
    if (this.projectionRefreshTimer) {
      clearTimeout(this.projectionRefreshTimer);
      this.projectionRefreshTimer = null;
    }
  }

  private clearRetry(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }
}
