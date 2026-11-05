import type { AgentLifecycleStatus } from "@getpaseo/protocol/agent-lifecycle";
import {
  createAgentLiveActivityId,
  type AgentLiveActivity,
  type AgentLiveActivityPhase,
} from "./agent-live-activity";

/**
 * One agent, flattened out of the session store. Orca built this from its
 * session-tab streams; Paseo already tracks lifecycle, turn liveness, attention
 * and pending permissions per agent, so the feed reads those instead.
 */
export interface LiveActivityAgentSnapshot {
  serverId: string;
  agentId: string;
  title: string | null;
  providerLabel: string;
  workspaceLabel: string | null;
  lifecycle: AgentLifecycleStatus;
  turnOpen: boolean;
  pendingPermissionCount: number;
  requiresAttention: boolean;
  attentionReason: "finished" | "error" | "permission" | null;
  attentionAt: number | null;
  lastActivityAt: number;
  updatedAt: number;
  archived: boolean;
}

/**
 * An agent with nothing to report is not an item. A waiting permission outranks
 * everything: it is the only state where the run is blocked on the user.
 */
export function resolveAgentLiveActivityPhase(
  agent: LiveActivityAgentSnapshot,
): AgentLiveActivityPhase | null {
  if (agent.archived || agent.lifecycle === "closed") {
    return null;
  }
  if (agent.pendingPermissionCount > 0 || agent.attentionReason === "permission") {
    return "attention";
  }
  if (agent.attentionReason === "error" || agent.lifecycle === "error") {
    return "error";
  }
  if (agent.attentionReason === "finished") {
    return "completed";
  }
  if (agent.turnOpen || agent.lifecycle === "running") {
    return "working";
  }
  return null;
}

function stateChangedAt(agent: LiveActivityAgentSnapshot): number {
  return agent.attentionAt ?? agent.lastActivityAt ?? agent.updatedAt;
}

function workspaceLabelWithHost(
  agent: LiveActivityAgentSnapshot,
  hostName: string | null,
): string | null {
  if (!hostName) {
    return agent.workspaceLabel;
  }
  return agent.workspaceLabel ? `${agent.workspaceLabel} · ${hostName}` : hostName;
}

export interface BuildClawMuseLiveActivitiesInput {
  agents: readonly LiveActivityAgentSnapshot[];
  connectedServerIds: ReadonlySet<string>;
  /** Only set when more than one host is present, matching the widget's name column. */
  hostNamesByServerId: ReadonlyMap<string, string>;
  acknowledgedEventIds: ReadonlySet<string>;
}

export function createAgentLiveActivityEventId(activity: AgentLiveActivity): string {
  return `${activity.id}@${activity.stateChangedAt}`;
}

/**
 * A host the phone cannot reach cannot vouch for a running agent, so anything
 * still in flight becomes `unverifiable`. Terminal phases are facts the phone
 * already observed and stay as they are.
 */
export function buildClawMuseLiveActivities(
  input: BuildClawMuseLiveActivitiesInput,
): AgentLiveActivity[] {
  const activities: AgentLiveActivity[] = [];
  for (const agent of input.agents) {
    const phase = resolveAgentLiveActivityPhase(agent);
    if (phase === null) {
      continue;
    }
    const connected = input.connectedServerIds.has(agent.serverId);
    const isTerminal = phase === "completed" || phase === "error";
    const id = createAgentLiveActivityId(agent.serverId, agent.agentId);
    const changedAt = stateChangedAt(agent);
    const acknowledged = input.acknowledgedEventIds.has(`${id}@${changedAt}`);
    activities.push({
      id,
      serverId: agent.serverId,
      agentId: agent.agentId,
      phase: connected || isTerminal ? phase : "unverifiable",
      title: agent.title?.trim() || agent.providerLabel,
      detail: agent.title?.trim() ? agent.providerLabel : null,
      workspaceLabel: workspaceLabelWithHost(
        agent,
        input.hostNamesByServerId.get(agent.serverId) ?? null,
      ),
      startedAt: agent.lastActivityAt,
      stateChangedAt: changedAt,
      updatedAt: agent.updatedAt,
      unseen: agent.requiresAttention && !acknowledged,
    });
  }
  return activities;
}
