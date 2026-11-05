import type { AgentWidgetSnapshot } from "@clawmuse/expo-agent-live-activity";
import type { ClawMuseStatusSummary } from "@/clawmuse-status/summary";
import type { ClawMuseProviderPlan } from "@/clawmuse-status/usage-windows";
import { identityColor, deriveIdentityColorName } from "@/styles/identity-colors";
import type { AgentLiveActivityPhase, AgentLiveActivitySummary } from "./agent-live-activity";
import { mergePlanUsages } from "./widget-plan-usages";

const WIDGET_TASK_LIMIT = 3;

const PHASE_ORDER: Record<AgentLiveActivityPhase, number> = {
  attention: 0,
  error: 0,
  completed: 1,
  working: 2,
  monitoring: 3,
  unverifiable: 4,
};

export interface BuildAgentWidgetSnapshotInput {
  activities: AgentLiveActivitySummary;
  status: ClawMuseStatusSummary | null;
  hostPlans: readonly ClawMuseProviderPlan[];
  now: number;
}

/**
 * Ported from agent/mobile/src/live-activity/widget-snapshot.ts.
 *
 * Counts and plans come from the status service — what the widget can refresh
 * by itself. Task titles come from the paired hosts, which only the app sees,
 * so they are cached alongside for the large widget.
 */
export function buildAgentWidgetSnapshot(
  input: BuildAgentWidgetSnapshotInput,
): AgentWidgetSnapshot {
  const status = input.status;
  const counts = status ?? {
    connectivity: input.activities.counts.unverifiable > 0 ? "unverifiable" : "live",
    runningCount: input.activities.counts.working + input.activities.counts.monitoring,
    needsActionCount: input.activities.counts.attention + input.activities.counts.error,
    completedUnreadCount: input.activities.counts.completed,
    unverifiableCount: input.activities.counts.unverifiable,
  };
  const tasks = [...input.activities.items]
    .sort((left, right) => PHASE_ORDER[left.phase] - PHASE_ORDER[right.phase])
    .slice(0, WIDGET_TASK_LIMIT)
    .map((activity) => {
      // Why: the feed appends " · <host>" to the workspace label; the widget's
      // narrow name column shows the workspace alone.
      const repo =
        (activity.workspaceLabel ?? activity.agentId).split(" · ")[0] ?? activity.agentId;
      return {
        repo,
        title: activity.title,
        phase: activity.phase,
        changedAt: Math.floor((activity.stateChangedAt || activity.updatedAt) / 1_000),
        color: identityColor(deriveIdentityColorName(repo)),
      };
    });
  return {
    updatedAt: Math.floor(input.now / 1_000),
    connectionState: counts.connectivity,
    runningCount: counts.runningCount,
    needsActionCount: counts.needsActionCount,
    completedUnreadCount: counts.completedUnreadCount,
    unverifiableCount: counts.unverifiableCount,
    usages: mergePlanUsages(input.hostPlans, status?.usages ?? []),
    tasks,
  };
}

/** Stable identity so an unchanged snapshot does not rewrite the App Group. */
export function widgetSnapshotFingerprint(snapshot: AgentWidgetSnapshot): string {
  const { updatedAt: _updatedAt, ...rest } = snapshot;
  return JSON.stringify(rest);
}
