import type { AgentLiveActivityUsage } from "@clawmuse/expo-agent-live-activity";
import type { AgentLiveActivityPhase, AgentLiveActivitySummary } from "./agent-live-activity";

// Ported from agent/mobile/src/live-activity/mobile-system-live-activity.ts.
export const CLAWMUSE_LIVE_ACTIVITY_REFRESH_MS = 60_000;
export const CLAWMUSE_LIVE_ACTIVITY_ID = "clawmuse-agent-live-activity";
export const CLAWMUSE_LIVE_ACTIVITY_DEEP_LINK = "clawmuse://home?focus=agent-activity";

export interface ClawMuseLiveActivityPayload {
  id: string;
  phase: AgentLiveActivityPhase;
  title: string;
  status: string;
  compact: string;
  detail?: string;
  workspace?: string;
  activeCount: number;
  attentionCount: number;
  runningCount: number;
  needsActionCount: number;
  completedUnreadCount: number;
  unverifiableCount: number;
  connectionState: "live" | "unverifiable";
  revision: number;
  updatedAt: number;
  deepLink: string;
  usages?: AgentLiveActivityUsage[];
}

export interface ClawMuseLiveActivityCopy {
  phase: Record<AgentLiveActivityPhase, string>;
  compactCount: (status: string, count: number) => string;
}

export interface ClawMuseLiveActivityCoordinationState {
  hadRuntimeActivity: boolean;
  lastPayloadFingerprint: string | null;
  lastSyncedAt: number | null;
}

export type ClawMuseLiveActivityAction =
  | { type: "none" }
  | { type: "sync"; payload: ClawMuseLiveActivityPayload };

export const INITIAL_CLAWMUSE_LIVE_ACTIVITY_STATE: ClawMuseLiveActivityCoordinationState = {
  hadRuntimeActivity: false,
  lastPayloadFingerprint: null,
  lastSyncedAt: null,
};

export function buildClawMuseLiveActivityPayload(
  summary: AgentLiveActivitySummary,
  copy: ClawMuseLiveActivityCopy,
  usages: readonly AgentLiveActivityUsage[] = [],
): ClawMuseLiveActivityPayload | null {
  const primary = summary.primary;
  if (!primary) {
    return null;
  }
  const status = copy.phase[primary.phase];
  return {
    id: CLAWMUSE_LIVE_ACTIVITY_ID,
    phase: primary.phase,
    title: primary.title,
    status,
    compact: summary.total > 1 ? copy.compactCount(status, summary.total) : status,
    ...(primary.detail ? { detail: primary.detail } : {}),
    ...(primary.workspaceLabel ? { workspace: primary.workspaceLabel } : {}),
    activeCount: summary.total,
    attentionCount: summary.counts.attention + summary.counts.error,
    runningCount: summary.counts.working + summary.counts.monitoring,
    needsActionCount: summary.counts.attention + summary.counts.error,
    completedUnreadCount: summary.counts.completed,
    unverifiableCount: summary.counts.unverifiable,
    connectionState: summary.counts.unverifiable > 0 ? "unverifiable" : "live",
    revision: 0,
    updatedAt: Math.max(primary.updatedAt, primary.stateChangedAt),
    deepLink: CLAWMUSE_LIVE_ACTIVITY_DEEP_LINK,
    ...(usages.length > 0 ? { usages: [...usages] } : {}),
  };
}

export interface ClawMuseLiveActivityPlan {
  state: ClawMuseLiveActivityCoordinationState;
  action: ClawMuseLiveActivityAction;
}

/** Renew unchanged local snapshots before their native 120-second stale deadline. */
export function planClawMuseLiveActivityAction(
  state: ClawMuseLiveActivityCoordinationState,
  summary: AgentLiveActivitySummary,
  copy: ClawMuseLiveActivityCopy,
  usages: readonly AgentLiveActivityUsage[] = [],
  now = Date.now(),
): ClawMuseLiveActivityPlan {
  const payload: ClawMuseLiveActivityPayload | null =
    buildClawMuseLiveActivityPayload(summary, copy, usages) ??
    (state.hadRuntimeActivity
      ? {
          id: CLAWMUSE_LIVE_ACTIVITY_ID,
          phase: "monitoring",
          title: "ClawMuse",
          status: copy.phase.monitoring,
          compact: copy.phase.monitoring,
          activeCount: 0,
          attentionCount: 0,
          runningCount: 0,
          needsActionCount: 0,
          completedUnreadCount: 0,
          unverifiableCount: 0,
          connectionState: "live",
          revision: 0,
          updatedAt: 0,
          deepLink: CLAWMUSE_LIVE_ACTIVITY_DEEP_LINK,
        }
      : null);
  if (!payload) {
    return { state, action: { type: "none" } };
  }
  const fingerprint = JSON.stringify(payload);
  const refreshDue =
    state.lastSyncedAt === null || now - state.lastSyncedAt >= CLAWMUSE_LIVE_ACTIVITY_REFRESH_MS;
  if (state.lastPayloadFingerprint === fingerprint && !refreshDue) {
    return { state, action: { type: "none" } };
  }
  return {
    state: {
      hadRuntimeActivity: true,
      lastPayloadFingerprint: fingerprint,
      lastSyncedAt: now,
    },
    action: { type: "sync", payload: { ...payload, updatedAt: now } },
  };
}
