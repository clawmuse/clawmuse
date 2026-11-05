import { watch, type FSWatcher } from "node:fs";
import path from "node:path";
import type pino from "pino";

import type { UsageReportEntry } from "@getpaseo/protocol/messages";
import { ClawMuseStatusClient, type ClawMuseStatusEnrollment } from "./client.js";
import { resolveClawMuseStatusSettings, type ClawMuseStatusResolution } from "./config.js";
import type { ClawMuseGoalRunner, ClawMuseGoalRunnerState } from "./goal-runner.js";
import { getClawMuseStatusHostTokenPath } from "./host-credential.js";
import type { ClawMuseStatusAgentSnapshot } from "./projection.js";
import { deriveRelayHostId } from "./relay-host-id.js";
import { ClawMuseStatusNotConnectedError, ClawMuseStatusPublisher } from "./snapshot-publisher.js";

const CONFIG_RELOAD_DEBOUNCE_MS = 250;

export interface ClawMuseStatusServiceOptions {
  paseoHome: string;
  serverId: string;
  logger: pino.Logger;
  listAgents: () => ClawMuseStatusAgentSnapshot[];
  listUsage: () => Promise<readonly UsageReportEntry[]>;
  /** Present when this daemon can execute goal runs. */
  goals?: ClawMuseGoalRunner;
  env?: NodeJS.ProcessEnv;
  createClient?: (baseUrl: string) => ClawMuseStatusClient;
  watchConfigFiles?: boolean;
}

export interface ClawMuseStatusReport {
  configured: boolean;
  baseUrl: string | null;
  relayHostId: string | null;
  connected: boolean;
  lastPublishedAt: string | null;
  lastError: string | null;
  goals: ClawMuseGoalRunnerState | null;
}

/**
 * Owns the daemon's relationship with the ClawMuse Status service: resolving it
 * from configuration, keeping one publisher alive for the current settings, and
 * swapping that publisher when the relationship changes. `clawmuse status
 * connect` writes the config file directly, so the files are watched rather
 * than waiting for a config RPC or a daemon restart.
 */
export class ClawMuseStatusService {
  private readonly logger: pino.Logger;
  private readonly relayHostId: string;
  private publisher: ClawMuseStatusPublisher | null = null;
  private resolution: ClawMuseStatusResolution = { state: "disabled" };
  private configReadError: string | null = null;
  private watchers: FSWatcher[] = [];
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;

  constructor(private readonly options: ClawMuseStatusServiceOptions) {
    this.logger = options.logger.child({ module: "clawmuse-status" });
    this.relayHostId = deriveRelayHostId(options.serverId);
  }

  get isConfigured(): boolean {
    return this.resolution.state === "ready";
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.applyResolution();
    if (this.options.watchConfigFiles !== false) {
      this.watchConfigFiles();
    }
  }

  async stop(): Promise<void> {
    this.started = false;
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
    const publisher = this.publisher;
    this.publisher = null;
    await publisher?.stop();
  }

  /** Re-read configuration and swap the publisher when the relationship changed. */
  reload(): void {
    if (!this.started) {
      return;
    }
    this.applyResolution();
  }

  report(): ClawMuseStatusReport {
    const publisherState = this.publisher?.state();
    const baseUrl = this.resolution.state === "disabled" ? null : this.resolution.baseUrl;
    return {
      configured: this.resolution.state === "ready",
      baseUrl,
      relayHostId: baseUrl === null ? null : this.relayHostId,
      connected: publisherState?.connected ?? false,
      lastPublishedAt: publisherState?.lastPublishedAt ?? null,
      lastError:
        this.configReadError ??
        (this.resolution.state === "error"
          ? this.resolution.error
          : (publisherState?.lastError ?? null)),
      goals: this.options.goals?.state() ?? null,
    };
  }

  markAgentSeen(agentId: string, atMs: number): void {
    this.publisher?.markSeen(agentId, atMs);
  }

  refresh(): void {
    this.publisher?.refresh();
  }

  async createMobileEnrollment(
    pairedDeviceId: string,
  ): Promise<ClawMuseStatusEnrollment & { statusBaseUrl: string }> {
    const publisher = this.publisher;
    if (!publisher) {
      throw new ClawMuseStatusNotConnectedError();
    }
    const enrollment = await publisher.createMobileEnrollment(pairedDeviceId);
    return { ...enrollment, statusBaseUrl: publisher.statusBaseUrl };
  }

  private applyResolution(): void {
    let next: ClawMuseStatusResolution;
    try {
      next = resolveClawMuseStatusSettings({
        paseoHome: this.options.paseoHome,
        env: this.options.env,
      });
      this.configReadError = null;
    } catch (error) {
      // Editors can leave a partial file between writes. Keep the current relationship
      // until a later watch event supplies valid config; a timer must not crash the daemon.
      this.configReadError = error instanceof Error ? error.message : String(error);
      this.logger.warn({ err: error }, "Could not reload ClawMuse Status configuration");
      return;
    }
    if (this.isSameRelationship(next)) {
      this.resolution = next;
      return;
    }
    const previous = this.publisher;
    this.publisher = null;
    void previous?.stop().catch((error) => {
      this.logger.warn({ err: error }, "Failed to stop the previous status publisher");
    });
    this.resolution = next;
    if (next.state !== "ready") {
      if (next.state === "error") {
        this.logger.warn({ error: next.error }, "ClawMuse Status is configured but unusable");
      }
      return;
    }
    const client = this.options.createClient
      ? this.options.createClient(next.baseUrl)
      : new ClawMuseStatusClient(next.baseUrl);
    const publisher = new ClawMuseStatusPublisher({
      client,
      paseoHome: this.options.paseoHome,
      relayHostId: this.relayHostId,
      displayName: next.displayName,
      hostToken: next.hostToken,
      listAgents: this.options.listAgents,
      listUsage: this.options.listUsage,
      ...(this.options.goals ? { goals: this.options.goals } : {}),
      logger: this.logger,
    });
    this.publisher = publisher;
    publisher.start();
    this.logger.info(
      { baseUrl: next.baseUrl, relayHostId: this.relayHostId },
      "ClawMuse Status publishing started",
    );
  }

  private isSameRelationship(next: ClawMuseStatusResolution): boolean {
    const current = this.resolution;
    if (current.state !== next.state) {
      return false;
    }
    if (current.state === "disabled" || next.state === "disabled") {
      return true;
    }
    if (current.state === "error" && next.state === "error") {
      return current.baseUrl === next.baseUrl && current.error === next.error;
    }
    if (current.state === "ready" && next.state === "ready") {
      return (
        current.baseUrl === next.baseUrl &&
        current.displayName === next.displayName &&
        current.hostToken === next.hostToken &&
        this.publisher !== null
      );
    }
    return false;
  }

  private watchConfigFiles(): void {
    const watched = new Set([
      path.basename(getClawMuseStatusHostTokenPath(this.options.paseoHome)),
      "config.json",
    ]);
    try {
      const watcher = watch(this.options.paseoHome, (_event, filename) => {
        if (filename !== null && !watched.has(path.basename(filename.toString()))) {
          return;
        }
        this.scheduleReload();
      });
      watcher.on("error", (error) => {
        this.logger.warn({ err: error }, "Stopped watching ClawMuse Status configuration");
      });
      watcher.unref();
      this.watchers = [watcher];
    } catch (error) {
      this.logger.warn(
        { err: error },
        "ClawMuse Status configuration changes need a daemon config reload on this platform",
      );
    }
  }

  private scheduleReload(): void {
    if (this.reloadTimer) {
      return;
    }
    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = null;
      this.reload();
    }, CONFIG_RELOAD_DEBOUNCE_MS);
    this.reloadTimer.unref?.();
  }
}
