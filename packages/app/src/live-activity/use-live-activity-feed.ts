import { useCallback, useEffect, useMemo, useState } from "react";
import { useHostRuntimeConnectionStatuses, useHosts } from "@/runtime/host-runtime";
import { useSessionStore, type Agent, type SessionState } from "@/stores/session-store";
import {
  buildAgentLiveActivitySummary,
  nextAgentLiveActivityRefreshAt,
  type AgentLiveActivity,
  type AgentLiveActivitySummary,
} from "./agent-live-activity";
import {
  buildClawMuseLiveActivities,
  createAgentLiveActivityEventId,
  type LiveActivityAgentSnapshot,
} from "./session-store-feed";

const ACKNOWLEDGEMENT_LIMIT = 512;

export interface ClawMuseLiveActivityFeed {
  summary: AgentLiveActivitySummary;
  acknowledge: (activity: AgentLiveActivity) => void;
}

function appendAcknowledgement(previous: ReadonlySet<string>, eventId: string): Set<string> {
  const next = new Set(previous);
  next.delete(eventId);
  next.add(eventId);
  while (next.size > ACKNOWLEDGEMENT_LIMIT) {
    const oldest = next.values().next().value;
    if (oldest === undefined) {
      break;
    }
    next.delete(oldest);
  }
  return next;
}

function toSnapshot(agent: Agent, session: SessionState): LiveActivityAgentSnapshot {
  const workspace = agent.workspaceId ? session.workspaces.get(agent.workspaceId) : undefined;
  return {
    serverId: agent.serverId,
    agentId: agent.id,
    title: agent.title,
    providerLabel: agent.provider,
    workspaceLabel: workspace?.title?.trim() || workspace?.name || null,
    lifecycle: agent.status,
    turnOpen: agent.turn.phase === "open",
    pendingPermissionCount: agent.pendingPermissions.length,
    requiresAttention: agent.requiresAttention === true,
    attentionReason: agent.attentionReason ?? null,
    attentionAt: agent.attentionTimestamp?.getTime() ?? null,
    lastActivityAt: agent.lastActivityAt.getTime(),
    updatedAt: agent.updatedAt.getTime(),
    archived: agent.archivedAt != null,
  };
}

function collectAgentSnapshots(
  sessions: Readonly<Record<string, SessionState>>,
): LiveActivityAgentSnapshot[] {
  const snapshots: LiveActivityAgentSnapshot[] = [];
  for (const session of Object.values(sessions)) {
    for (const agent of session.agents.values()) {
      snapshots.push(toSnapshot(agent, session));
    }
  }
  return snapshots;
}

/**
 * The phone's own picture of its hosts, built from the session store. It drives
 * the local Live Activity fallback and the widget's task list; the status
 * service stays the authority for counts whenever a summary is available.
 */
export function useClawMuseLiveActivityFeed(): ClawMuseLiveActivityFeed {
  const sessions = useSessionStore((state) => state.sessions);
  const hosts = useHosts();
  const serverIds = useMemo(() => hosts.map((host) => host.serverId), [hosts]);
  const connectionStatuses = useHostRuntimeConnectionStatuses(serverIds);
  const [acknowledgedEventIds, setAcknowledgedEventIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [now, setNow] = useState(Date.now);

  const connectedServerIds = useMemo(() => {
    const connected = new Set<string>();
    for (const [serverId, status] of connectionStatuses) {
      if (status === "online") {
        connected.add(serverId);
      }
    }
    return connected;
  }, [connectionStatuses]);

  const hostNamesByServerId = useMemo(() => {
    if (hosts.length < 2) {
      return new Map<string, string>();
    }
    return new Map(hosts.map((host) => [host.serverId, host.label] as const));
  }, [hosts]);

  const activities = useMemo(
    () =>
      buildClawMuseLiveActivities({
        agents: collectAgentSnapshots(sessions),
        connectedServerIds,
        hostNamesByServerId,
        acknowledgedEventIds,
      }),
    [acknowledgedEventIds, connectedServerIds, hostNamesByServerId, sessions],
  );

  useEffect(() => setNow(Date.now()), [activities]);

  // Terminal phases leave the capsule on a dwell timer, not on an event.
  useEffect(() => {
    const refreshAt = nextAgentLiveActivityRefreshAt(activities, now);
    if (refreshAt === null) {
      return;
    }
    const timeout = setTimeout(() => setNow(Date.now()), Math.max(50, refreshAt - Date.now() + 1));
    return () => clearTimeout(timeout);
  }, [activities, now]);

  const summary = useMemo(() => buildAgentLiveActivitySummary(activities, now), [activities, now]);

  const acknowledge = useCallback((activity: AgentLiveActivity) => {
    setAcknowledgedEventIds((previous) =>
      appendAcknowledgement(previous, createAgentLiveActivityEventId(activity)),
    );
  }, []);

  return { summary, acknowledge };
}
