import type pino from "pino";

import type { UsageReportEntry } from "@getpaseo/protocol/messages";
import type {
  ClawMuseStatusClient,
  ClawMuseStatusEnrollment,
  ClawMuseStatusHostSession,
  ClawMuseStatusSnapshotItem,
  ClawMuseStatusUsage,
} from "./client.js";
import { ClawMuseStatusDeliverySchedule } from "./delivery-schedule.js";
import type { ClawMuseGoalRunner } from "./goal-runner.js";
import { ClawMuseStatusHostSessionLease } from "./host-session.js";
import { ClawMuseStatusProjection, type ClawMuseStatusAgentSnapshot } from "./projection.js";
import { reportPendingRelaySelection } from "./relay-selection-report.js";
import { projectClawMuseStatusUsages } from "./usage-projection.js";

export interface ClawMuseStatusPublisherOptions {
  client: ClawMuseStatusClient;
  /** Where a first-run relay selection waits to be reported. */
  paseoHome: string;
  relayHostId: string;
  displayName: string;
  hostToken: string;
  listAgents: () => ClawMuseStatusAgentSnapshot[];
  listUsage: () => Promise<readonly UsageReportEntry[]>;
  logger: pino.Logger;
  /** Bound to the session once the server advertises goals; absent on hosts without a runner. */
  goals?: ClawMuseGoalRunner;
  projection?: ClawMuseStatusProjection;
  now?: () => number;
}

export interface ClawMuseStatusPublisherState {
  connected: boolean;
  lastPublishedAt: string | null;
  lastError: string | null;
}

interface PendingSnapshot {
  revision: number;
  signature: string;
  items: readonly ClawMuseStatusSnapshotItem[];
  usages: readonly ClawMuseStatusUsage[];
}

export class ClawMuseStatusNotConnectedError extends Error {
  constructor() {
    super("The ClawMuse Status host session is not established");
    this.name = "ClawMuseStatusNotConnectedError";
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Publishes the daemon's agent phases and quota to the status service. Change
 * driven: every publish comes from an agent event or a quota refresh, coalesced
 * through the delivery schedule, with one live host session lease at a time.
 */
export class ClawMuseStatusPublisher {
  private readonly schedule: ClawMuseStatusDeliverySchedule;
  private readonly lease: ClawMuseStatusHostSessionLease;
  private readonly projection: ClawMuseStatusProjection;
  private readonly now: () => number;
  private readonly logger: pino.Logger;
  private readonly activeOperations = new Set<Promise<unknown>>();
  private items: readonly ClawMuseStatusSnapshotItem[] = [];
  private usages: readonly ClawMuseStatusUsage[] = [];
  private desiredSignature = "";
  private acceptedSignature: string | null = null;
  private pending: PendingSnapshot | null = null;
  private drainPromise: Promise<void> | null = null;
  private nextRevision = 1;
  private started = false;
  private lifecycle = 0;
  private requestAbort = new AbortController();
  private lastPublishedAt: string | null = null;
  private lastError: string | null = null;

  constructor(private readonly options: ClawMuseStatusPublisherOptions) {
    this.now = options.now ?? Date.now;
    this.logger = options.logger.child({ module: "clawmuse-status-publisher" });
    this.projection = options.projection ?? new ClawMuseStatusProjection();
    this.schedule = new ClawMuseStatusDeliverySchedule({
      shouldRun: () => this.started,
      onHeartbeat: () => void this.sendHeartbeat(),
      onRetry: () => this.requestDrain(),
      onProjectionRefresh: () => this.refresh(),
    });
    this.lease = new ClawMuseStatusHostSessionLease({
      client: options.client,
      openSession: (signal) =>
        options.client.createHostSession({
          hostToken: options.hostToken,
          relayHostId: options.relayHostId,
          displayName: options.displayName,
          signal,
        }),
      getRequestSignal: () => this.requestAbort.signal,
      getLifecycle: () => this.lifecycle,
      isStarted: () => this.started,
      trackOperation: (operation) => this.trackOperation(operation),
      onOpened: (session) => this.onSessionOpened(session),
      onInvalidated: () => this.onSessionInvalidated(),
    });
  }

  get statusBaseUrl(): string {
    return this.options.client.baseUrl;
  }

  state(): ClawMuseStatusPublisherState {
    return {
      connected: this.lease.current !== null,
      lastPublishedAt: this.lastPublishedAt,
      lastError: this.lastError,
    };
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.requestAbort = new AbortController();
    this.lifecycle += 1;
    this.refresh();
    void this.refreshUsage();
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }
    const closing = this.lease.current;
    this.started = false;
    this.requestAbort.abort();
    this.lifecycle += 1;
    this.schedule.clearAll();
    this.lease.invalidate();
    await Promise.allSettled([
      ...(this.drainPromise ? [this.drainPromise] : []),
      ...this.activeOperations,
    ]);
    this.options.goals?.unbind();
    if (closing) {
      await this.lease.close(closing);
    }
  }

  markSeen(agentId: string, atMs: number): void {
    this.projection.markSeen(agentId, atMs);
    this.refresh();
  }

  /** Re-project from live agent state. Called from agent manager events. */
  refresh(): void {
    if (!this.started) {
      return;
    }
    const nowMs = this.now();
    const projected = this.projection.project(this.options.listAgents(), nowMs);
    this.items = projected.items;
    this.schedule.armProjectionRefresh(projected.nextRefreshAtMs, nowMs);
    this.updateDesiredSignature();
  }

  async createMobileEnrollment(pairedDeviceId: string): Promise<ClawMuseStatusEnrollment> {
    const session = await this.lease.ensure();
    if (!session) {
      throw new ClawMuseStatusNotConnectedError();
    }
    try {
      return await this.options.client.createMobileEnrollment({
        accessToken: session.accessToken,
        pairedDeviceId,
      });
    } catch (error) {
      this.lease.invalidateIfFenced(error);
      throw error;
    }
  }

  private onSessionOpened(session: ClawMuseStatusHostSession): void {
    this.nextRevision = 1;
    this.pending = null;
    this.acceptedSignature = null;
    this.lastError = null;
    this.schedule.scheduleHeartbeat(session.heartbeatInterval * 1_000);
    this.refresh();
    void this.trackOperation(
      reportPendingRelaySelection({
        paseoHome: this.options.paseoHome,
        session,
        client: this.options.client,
        signal: this.requestAbort.signal,
        logger: this.logger,
      }),
    );
    const goals = this.options.goals;
    if (goals) {
      if (session.goals) {
        goals.bind({
          client: this.options.client,
          request: (operation) => this.requestWithSession(operation),
        });
        void this.publishGoalRepos();
      } else {
        goals.unbind();
      }
    }
  }

  private onSessionInvalidated(): void {
    this.pending = null;
    this.acceptedSignature = null;
    this.nextRevision = 1;
    this.schedule.clearHeartbeat();
    this.options.goals?.unbind();
  }

  /** The runner's only path to the service: the current session, with fence handling. */
  private async requestWithSession<T>(
    operation: (accessToken: string, signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const session = await this.lease.ensure();
    if (!session || !this.started) {
      throw new ClawMuseStatusNotConnectedError();
    }
    try {
      return await this.trackOperation(operation(session.accessToken, this.requestAbort.signal));
    } catch (error) {
      this.lease.invalidateIfFenced(error);
      throw error;
    }
  }

  private async publishGoalRepos(): Promise<void> {
    try {
      await this.options.goals?.publishReposIfChanged();
    } catch (error) {
      this.logger.warn({ err: error }, "Failed to publish goal repositories");
    }
  }

  private updateDesiredSignature(): void {
    this.desiredSignature = JSON.stringify({ items: this.items, usages: this.usages });
    this.requestDrain();
  }

  private async refreshUsage(): Promise<void> {
    if (!this.started) {
      return;
    }
    try {
      const result = await this.trackOperation(this.options.listUsage());
      const usages = projectClawMuseStatusUsages(result, this.usages);
      if (usages === this.usages) {
        return;
      }
      this.usages = usages;
      this.updateDesiredSignature();
    } catch (error) {
      this.logger.debug({ err: error }, "Provider usage unavailable for the status snapshot");
    }
  }

  private requestDrain(): void {
    if (!this.started || this.drainPromise) {
      return;
    }
    this.drainPromise = this.drain()
      .catch((error) => {
        this.lastError = describeError(error);
        this.schedule.scheduleRetry();
      })
      .finally(() => {
        this.drainPromise = null;
        if (
          this.started &&
          !this.schedule.retryScheduled &&
          this.desiredSignature !== this.acceptedSignature
        ) {
          this.requestDrain();
        }
      });
  }

  private async drain(): Promise<void> {
    const session = await this.lease.ensure();
    if (!session || !this.started) {
      throw new ClawMuseStatusNotConnectedError();
    }
    if (!this.pending) {
      if (this.desiredSignature === this.acceptedSignature) {
        return;
      }
      this.pending = {
        revision: this.nextRevision,
        signature: this.desiredSignature,
        items: this.items,
        usages: this.usages,
      };
    }
    const pending = this.pending;
    try {
      await this.trackOperation(
        this.options.client.publishSnapshot({
          accessToken: session.accessToken,
          snapshot: pending,
          schemaVersion: session.snapshotSchemaVersion,
          signal: this.requestAbort.signal,
        }),
      );
    } catch (error) {
      this.lease.invalidateIfFenced(error);
      throw error;
    }
    if (this.lease.current !== session) {
      return;
    }
    this.acceptedSignature = pending.signature;
    this.nextRevision = pending.revision + 1;
    this.pending = null;
    this.lastPublishedAt = new Date(this.now()).toISOString();
    this.lastError = null;
    this.schedule.resetRetry();
    if (this.desiredSignature !== this.acceptedSignature) {
      await this.drain();
    }
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.started) {
      return;
    }
    const session = this.lease.current;
    if (!session) {
      this.requestDrain();
      this.schedule.scheduleHeartbeat();
      return;
    }
    try {
      const goals = session.goals ? this.options.goals : undefined;
      const result = await this.trackOperation(
        this.options.client.heartbeat(
          session.accessToken,
          this.requestAbort.signal,
          goals ? { goalRunIds: goals.activeRunIds() } : undefined,
        ),
      );
      this.schedule.resetRetry();
      this.requestDrain();
      if (goals) {
        // The inventory is cheap to compare, so it rides the heartbeat instead of
        // subscribing to project mutations from inside the publisher.
        void this.publishGoalRepos();
        if (result.goals) {
          goals.onHeartbeat(result.goals);
        }
      }
    } catch (error) {
      this.lastError = describeError(error);
      this.lease.invalidateIfFenced(error);
      this.schedule.scheduleRetry();
    } finally {
      this.schedule.scheduleHeartbeat(
        this.lease.current === session ? session.heartbeatInterval * 1_000 : undefined,
      );
      // The quota fetchers cache, so this rides the heartbeat instead of owning
      // a timer: no extra network unless the cache went stale.
      void this.refreshUsage();
    }
  }

  private trackOperation<T>(operation: Promise<T>): Promise<T> {
    this.activeOperations.add(operation);
    void operation.then(
      () => this.activeOperations.delete(operation),
      () => this.activeOperations.delete(operation),
    );
    return operation;
  }
}
