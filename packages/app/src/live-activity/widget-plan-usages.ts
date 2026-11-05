import type {
  AgentLiveActivityUsage,
  AgentLiveActivityUsageWindow,
} from "@clawmuse/expo-agent-live-activity";
import type { ClawMuseStatusUsage, ClawMuseStatusUsageWindow } from "@/clawmuse-status/summary";
import type {
  ClawMuseProviderPlan,
  ClawMuseProviderPlanWindow,
} from "@/clawmuse-status/usage-windows";

// Ported from agent/mobile/src/live-activity/widget-plan-usages.ts.
// The native payloads carry epoch seconds; everything above this line is ms.
function toNativeWindow(
  window: ClawMuseProviderPlanWindow | ClawMuseStatusUsageWindow | null,
): AgentLiveActivityUsageWindow | null {
  if (!window) {
    return null;
  }
  return {
    usedPercent: window.usedPercent,
    windowMinutes: window.windowMinutes,
    resetsAt: window.resetsAt === null ? null : Math.floor(window.resetsAt / 1_000),
    ...(window.unlimited ? { unlimited: true } : {}),
  };
}

export function hostPlanUsage(plan: ClawMuseProviderPlan): AgentLiveActivityUsage {
  // The capsule has one line for the whole plan, so the tier wins over the
  // provider name when there is one — the card is where both fit.
  const label = plan.planLabel ?? plan.name;
  return {
    provider: plan.provider,
    ...(label ? { label } : {}),
    session: toNativeWindow(plan.session),
    weekly: toNativeWindow(plan.weekly),
  };
}

export function serviceUsageForWidget(usage: ClawMuseStatusUsage): AgentLiveActivityUsage {
  return {
    provider: usage.provider,
    ...(usage.label ? { label: usage.label } : {}),
    session: toNativeWindow(usage.session),
    weekly: toNativeWindow(usage.weekly),
  };
}

/**
 * Host plans first, then the third-party plans the status service polls. A
 * service entry for a provider a host already reported is dropped, so an
 * up-to-date host is never listed twice.
 */
export function mergePlanUsages(
  hostPlans: readonly ClawMuseProviderPlan[],
  serviceUsages: readonly ClawMuseStatusUsage[],
): AgentLiveActivityUsage[] {
  const hostProviders = new Set(hostPlans.map((plan) => plan.provider));
  return [
    ...hostPlans.map(hostPlanUsage),
    ...serviceUsages
      .filter((usage) => !hostProviders.has(usage.provider))
      .filter((usage) => usage.session !== null || usage.weekly !== null)
      .map(serviceUsageForWidget),
  ];
}
