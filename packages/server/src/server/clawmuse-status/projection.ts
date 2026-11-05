import { randomUUID } from "node:crypto";

import type { ManagedAgent } from "../agent/agent-manager.js";
import type { ClawMuseStatusPhase, ClawMuseStatusSnapshotItem } from "./client.js";

/**
 * How long a finished agent stays on the lock screen when nobody has looked at
 * it. Ported from the Orca publisher; a failure dwells longer because it is the
 * one outcome worth walking back to the desk for.
 */
export const CLAWMUSE_STATUS_COMPLETED_DWELL_MS = 8_000;
export const CLAWMUSE_STATUS_FAILED_DWELL_MS = 12_000;

/** The daemon-side view of one agent the projection needs. */
export type ClawMuseStatusAgentSnapshot = Pick<
  ManagedAgent,
  | "id"
  | "lifecycle"
  | "internal"
  | "attention"
  | "pendingPermissions"
  | "activeTurnId"
  | "activeTurnStartedAt"
  | "lastUserMessageAt"
  | "updatedAt"
>;

interface AgentStatus {
  phase: ClawMuseStatusPhase;
  stateChangedAtMs: number;
  /** Pending requests survive attention acknowledgement and unrelated state updates. */
  permissionRequestIds?: string[];
}

interface PublishedAgentStatus {
  item: ClawMuseStatusSnapshotItem;
  permissionRequestIds?: string[];
}

export interface ClawMuseStatusProjectionResult {
  items: ClawMuseStatusSnapshotItem[];
  /** When the next unseen terminal item expires, so the caller can re-project then. */
  nextRefreshAtMs: number | null;
}

function dwellMs(phase: ClawMuseStatusPhase): number {
  return phase === "failed" ? CLAWMUSE_STATUS_FAILED_DWELL_MS : CLAWMUSE_STATUS_COMPLETED_DWELL_MS;
}

function isTerminalPhase(phase: ClawMuseStatusPhase): boolean {
  return phase === "completed" || phase === "failed";
}

function describeAgent(agent: ClawMuseStatusAgentSnapshot): AgentStatus | null {
  if (agent.internal === true || agent.lifecycle === "closed") {
    return null;
  }
  const attention = agent.attention;
  if (agent.pendingPermissions.size > 0) {
    const changedAt = attention.requiresAttention ? attention.attentionTimestamp : agent.updatedAt;
    return {
      phase: "needs_action",
      stateChangedAtMs: changedAt.getTime(),
      permissionRequestIds: [...agent.pendingPermissions.keys()],
    };
  }
  if (agent.lifecycle === "running" || agent.activeTurnId !== null) {
    const startedAt = agent.activeTurnStartedAt ?? agent.updatedAt;
    return { phase: "running", stateChangedAtMs: startedAt.getTime() };
  }
  if (!attention.requiresAttention) {
    return null;
  }
  const stateChangedAtMs = attention.attentionTimestamp.getTime();
  if (attention.attentionReason === "permission") {
    return { phase: "needs_action", stateChangedAtMs };
  }
  return {
    phase: attention.attentionReason === "error" ? "failed" : "completed",
    stateChangedAtMs,
  };
}

/**
 * Live agent state to snapshot items. Holds the two pieces of memory the
 * snapshot contract needs: when each agent was last seen by the user, and the
 * event id of the phase it is currently in, so a retry of the same snapshot
 * keeps its event id while a transition gets a fresh one.
 */
export class ClawMuseStatusProjection {
  private readonly seenAtMs = new Map<string, number>();
  private readonly lastUserMessageAtMs = new Map<string, number>();
  private published = new Map<string, PublishedAgentStatus>();
  private readonly createEventId: () => string;

  constructor(options: { createEventId?: () => string } = {}) {
    this.createEventId = options.createEventId ?? randomUUID;
  }

  /** An app-visible client focused on this agent, or the user prompting it. */
  markSeen(agentId: string, atMs: number): void {
    const previous = this.seenAtMs.get(agentId) ?? 0;
    if (atMs > previous) {
      this.seenAtMs.set(agentId, atMs);
    }
  }

  project(
    agents: readonly ClawMuseStatusAgentSnapshot[],
    nowMs: number,
  ): ClawMuseStatusProjectionResult {
    const items: ClawMuseStatusSnapshotItem[] = [];
    const nextPublished = new Map<string, PublishedAgentStatus>();
    const liveAgentIds = new Set<string>();
    let nextRefreshAtMs: number | null = null;

    for (const agent of agents) {
      liveAgentIds.add(agent.id);
      this.trackUserMessage(agent);
      const status = describeAgent(agent);
      if (!status) {
        continue;
      }
      if (isTerminalPhase(status.phase)) {
        if ((this.seenAtMs.get(agent.id) ?? 0) >= status.stateChangedAtMs) {
          continue;
        }
        const expiresAtMs = status.stateChangedAtMs + dwellMs(status.phase);
        if (expiresAtMs <= nowMs) {
          continue;
        }
        nextRefreshAtMs =
          nextRefreshAtMs === null ? expiresAtMs : Math.min(nextRefreshAtMs, expiresAtMs);
      }
      const published = this.itemFor(agent.id, status);
      nextPublished.set(agent.id, published);
      items.push(published.item);
    }

    this.published = nextPublished;
    this.forget(liveAgentIds);

    items.sort((left, right) => left.itemId.localeCompare(right.itemId));
    return { items, nextRefreshAtMs };
  }

  private itemFor(agentId: string, status: AgentStatus): PublishedAgentStatus {
    const stateChangedAt = new Date(status.stateChangedAtMs).toISOString();
    // The service alerts on a new eventId. updatedAt is not a permission event:
    // streaming output or a client clearing attention must not resend the alert.
    const previous = this.published.get(agentId);
    if (previous && previous.item.phase === status.phase) {
      const previousRequestIds = previous.permissionRequestIds;
      const sameEvent = status.permissionRequestIds
        ? previousRequestIds !== undefined &&
          status.permissionRequestIds.every((id) => previousRequestIds.includes(id))
        : previousRequestIds === undefined && previous.item.stateChangedAt === stateChangedAt;
      if (sameEvent) {
        return { item: previous.item, permissionRequestIds: status.permissionRequestIds };
      }
    }
    return {
      permissionRequestIds: status.permissionRequestIds,
      item: {
        itemId: agentId,
        eventId: this.createEventId(),
        phase: status.phase,
        stateChangedAt,
        observation: "live",
      },
    };
  }

  private trackUserMessage(agent: ClawMuseStatusAgentSnapshot): void {
    const sentAtMs = agent.lastUserMessageAt?.getTime() ?? null;
    if (sentAtMs === null) {
      return;
    }
    const previous = this.lastUserMessageAtMs.get(agent.id);
    this.lastUserMessageAtMs.set(agent.id, sentAtMs);
    if (previous !== undefined && sentAtMs > previous) {
      this.markSeen(agent.id, sentAtMs);
    }
  }

  private forget(liveAgentIds: ReadonlySet<string>): void {
    for (const agentId of this.seenAtMs.keys()) {
      if (!liveAgentIds.has(agentId)) {
        this.seenAtMs.delete(agentId);
      }
    }
    for (const agentId of this.lastUserMessageAtMs.keys()) {
      if (!liveAgentIds.has(agentId)) {
        this.lastUserMessageAtMs.delete(agentId);
      }
    }
  }
}
