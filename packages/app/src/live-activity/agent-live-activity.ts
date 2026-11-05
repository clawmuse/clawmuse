/**
 * Ported from agent/mobile/src/live-activity/agent-live-activity.ts.
 *
 * The phone's own view of what its hosts are doing. The status service is the
 * authority for counts when a summary is available; this model exists for the
 * two places that need per-task text the service never sees: the local Live
 * Activity fallback and the home-screen widget's task list.
 */
export const AGENT_LIVE_ACTIVITY_COMPLETED_DWELL_MS = 8_000;
export const AGENT_LIVE_ACTIVITY_ERROR_DWELL_MS = 12_000;
export const AGENT_LIVE_ACTIVITY_MAX_ITEMS = 5;

export type AgentLiveActivityPhase =
  | "attention"
  | "error"
  | "completed"
  | "working"
  | "monitoring"
  | "unverifiable";

export interface AgentLiveActivity {
  id: string;
  serverId: string;
  agentId: string;
  phase: AgentLiveActivityPhase;
  title: string;
  detail: string | null;
  workspaceLabel: string | null;
  startedAt: number;
  stateChangedAt: number;
  updatedAt: number;
  unseen: boolean;
}

export type AgentLiveActivityCounts = Record<AgentLiveActivityPhase, number>;

export interface AgentLiveActivitySummary {
  primary: AgentLiveActivity | null;
  items: AgentLiveActivity[];
  counts: AgentLiveActivityCounts;
  total: number;
  overflowCount: number;
}

const PHASE_PRIORITY: Record<AgentLiveActivityPhase, number> = {
  attention: 0,
  error: 0,
  completed: 1,
  working: 2,
  monitoring: 3,
  unverifiable: 4,
};

const EMPTY_COUNTS: AgentLiveActivityCounts = {
  attention: 0,
  error: 0,
  completed: 0,
  working: 0,
  monitoring: 0,
  unverifiable: 0,
};

export function createAgentLiveActivityId(serverId: string, agentId: string): string {
  return `${encodeURIComponent(serverId)}/${encodeURIComponent(agentId)}`;
}

/** A finished or failed turn is news only until it is seen or the dwell runs out. */
function terminalPhaseIsVisible(activity: AgentLiveActivity, now: number): boolean {
  if (!activity.unseen) {
    return false;
  }
  const age = Math.max(0, now - (activity.stateChangedAt || activity.updatedAt));
  const dwell =
    activity.phase === "completed"
      ? AGENT_LIVE_ACTIVITY_COMPLETED_DWELL_MS
      : AGENT_LIVE_ACTIVITY_ERROR_DWELL_MS;
  return age <= dwell;
}

function activityIsVisible(activity: AgentLiveActivity, now: number): boolean {
  if (activity.phase === "completed" || activity.phase === "error") {
    return terminalPhaseIsVisible(activity, now);
  }
  return true;
}

function compareActivities(left: AgentLiveActivity, right: AgentLiveActivity): number {
  const priority = PHASE_PRIORITY[left.phase] - PHASE_PRIORITY[right.phase];
  if (priority !== 0) {
    return priority;
  }
  const recency =
    (right.stateChangedAt || right.updatedAt) - (left.stateChangedAt || left.updatedAt);
  return recency === 0 ? left.id.localeCompare(right.id) : recency;
}

export function buildAgentLiveActivitySummary(
  activities: readonly AgentLiveActivity[],
  now: number,
  maxItems = AGENT_LIVE_ACTIVITY_MAX_ITEMS,
): AgentLiveActivitySummary {
  const visible = activities
    .filter((activity) => activityIsVisible(activity, now))
    .sort(compareActivities);
  const counts = { ...EMPTY_COUNTS };
  for (const activity of visible) {
    counts[activity.phase] += 1;
  }
  const items = visible.slice(0, Math.max(1, maxItems));
  return {
    primary: items[0] ?? null,
    items,
    counts,
    total: visible.length,
    overflowCount: Math.max(0, visible.length - items.length),
  };
}

/** The next moment a dwell expires, so the caller can re-evaluate then. */
export function nextAgentLiveActivityRefreshAt(
  activities: readonly AgentLiveActivity[],
  now: number,
): number | null {
  let earliest: number | null = null;
  for (const activity of activities) {
    if (!activity.unseen) {
      continue;
    }
    if (activity.phase !== "completed" && activity.phase !== "error") {
      continue;
    }
    const dwell =
      activity.phase === "completed"
        ? AGENT_LIVE_ACTIVITY_COMPLETED_DWELL_MS
        : AGENT_LIVE_ACTIVITY_ERROR_DWELL_MS;
    const expiresAt = (activity.stateChangedAt || activity.updatedAt) + dwell;
    if (expiresAt > now && (earliest === null || expiresAt < earliest)) {
      earliest = expiresAt;
    }
  }
  return earliest;
}
