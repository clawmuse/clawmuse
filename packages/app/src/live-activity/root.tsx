import {
  endLegacyAgentLiveActivities,
  getAgentLiveActivityRemoteStatusCapability,
  syncAgentLiveActivity,
  updateAgentWidgetSnapshot,
} from "@clawmuse/expo-agent-live-activity";
import { useEffect, useMemo, useReducer, useRef, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { AppState, Platform } from "react-native";
import { ClawMuseHostUsageCollector } from "@/clawmuse-status/host-usage-collector";
import { useHostUsagePlans } from "@/clawmuse-status/host-usage-plans";
import { useClawMuseStatusSummary } from "@/clawmuse-status/use-summary";
import {
  getClawMuseStatusBindingSnapshot,
  subscribeClawMuseStatusBindings,
} from "@/clawmuse-status/binding-state";
import type { AgentLiveActivityPhase } from "./agent-live-activity";
import {
  supportsClawMuseLiveActivity,
  supportsRemoteStatusLiveActivity,
} from "./remote-status-capability";
import {
  CLAWMUSE_LIVE_ACTIVITY_REFRESH_MS,
  INITIAL_CLAWMUSE_LIVE_ACTIVITY_STATE,
  planClawMuseLiveActivityAction,
  type ClawMuseLiveActivityCopy,
} from "./system-live-activity";
import { useClawMuseLiveActivityFeed } from "./use-live-activity-feed";
import { mergePlanUsages } from "./widget-plan-usages";
import { buildAgentWidgetSnapshot, widgetSnapshotFingerprint } from "./widget-snapshot";
import { UsageWidgetBridge } from "@/widgets/UsageWidgetBridge";

const NATIVE_RETRY_DELAY_MS = 1_500;

const PHASE_LABEL_KEYS: Record<AgentLiveActivityPhase, string> = {
  attention: "clawmuseStatus.liveActivity.phase.attention",
  error: "clawmuseStatus.liveActivity.phase.error",
  completed: "clawmuseStatus.liveActivity.phase.completed",
  working: "clawmuseStatus.liveActivity.phase.working",
  monitoring: "clawmuseStatus.liveActivity.phase.monitoring",
  unverifiable: "clawmuseStatus.liveActivity.phase.unverifiable",
};

/**
 * The Live Activity and the home-screen widget.
 *
 * The service drives the capsule by push on devices that support
 * push-to-start; older ones run it locally from the same feed. The widget
 * always needs this root, because task titles never leave the paired hosts.
 */
export function ClawMuseLiveActivityRoot() {
  const capability = getAgentLiveActivityRemoteStatusCapability();
  const statusBinding = useSyncExternalStore(
    subscribeClawMuseStatusBindings,
    getClawMuseStatusBindingSnapshot,
    getClawMuseStatusBindingSnapshot,
  );
  if (Platform.OS !== "ios" || !supportsClawMuseLiveActivity(capability)) {
    return null;
  }
  // Push-to-start is an OS capability, not proof that ClawMuse Status is
  // configured for this installation. Keep the local activity alive until
  // the status session has been enrolled; otherwise a fresh install with an
  // unconfigured daemon ends its local activity and has no remote producer.
  const remoteDriven =
    supportsRemoteStatusLiveActivity(capability) && statusBinding.installationId !== null;
  return <EnabledLiveActivityRoot remoteDriven={remoteDriven} />;
}

function EnabledLiveActivityRoot({ remoteDriven }: { remoteDriven: boolean }) {
  const { t } = useTranslation();
  const { summary } = useClawMuseLiveActivityFeed();
  const status = useClawMuseStatusSummary();
  const hostPlans = useHostUsagePlans();
  const usages = useMemo(
    () =>
      mergePlanUsages(
        hostPlans.flatMap((entry) => entry.plans),
        status?.usages ?? [],
      ),
    [hostPlans, status],
  );

  useWidgetSnapshotSync(summary, status, hostPlans);

  const [retryRevision, requestRetry] = useReducer((revision: number) => revision + 1, 0);
  const coordinationRef = useRef(INITIAL_CLAWMUSE_LIVE_ACTIVITY_STATE);
  const operationChainRef = useRef<Promise<void>>(Promise.resolve());
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (remoteDriven) {
      return;
    }
    // Local activities have no background producer. Renew while foregrounded,
    // and resume immediately rather than waiting for a task's counts to change.
    const timer = setInterval(() => {
      if (AppState.currentState === "active") {
        requestRetry();
      }
    }, CLAWMUSE_LIVE_ACTIVITY_REFRESH_MS);
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        requestRetry();
      }
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [remoteDriven]);

  useEffect(() => {
    mountedRef.current = true;
    if (remoteDriven) {
      // A capsule this device started locally would fight the pushed one.
      void endLegacyAgentLiveActivities().catch(() => undefined);
    }
    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, [remoteDriven]);

  useEffect(() => {
    if (remoteDriven) {
      return;
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    const copy: ClawMuseLiveActivityCopy = {
      phase: {
        attention: t(PHASE_LABEL_KEYS.attention),
        error: t(PHASE_LABEL_KEYS.error),
        completed: t(PHASE_LABEL_KEYS.completed),
        working: t(PHASE_LABEL_KEYS.working),
        monitoring: t(PHASE_LABEL_KEYS.monitoring),
        unverifiable: t(PHASE_LABEL_KEYS.unverifiable),
      },
      compactCount: (status_, total) =>
        t("clawmuseStatus.liveActivity.compactCount", { status: status_, total }),
    };
    const previousState = coordinationRef.current;
    const plan = planClawMuseLiveActivityAction(previousState, summary, copy, usages);
    coordinationRef.current = plan.state;
    if (plan.action.type === "none") {
      return;
    }
    const payload = plan.action.payload;
    operationChainRef.current = operationChainRef.current
      .then(async () => {
        await syncAgentLiveActivity(payload);
        return;
      })
      .catch(() => {
        if (!mountedRef.current || coordinationRef.current !== plan.state) {
          return;
        }
        coordinationRef.current = previousState;
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          requestRetry();
        }, NATIVE_RETRY_DELAY_MS);
      });
  }, [remoteDriven, retryRevision, summary, t, usages]);

  return (
    <>
      <ClawMuseHostUsageCollector />
      <UsageWidgetBridge />
    </>
  );
}

/**
 * The home-screen widget cannot see the hosts, so the app mirrors what it knows
 * into the App Group whenever the picture changes.
 */
function useWidgetSnapshotSync(
  summary: ReturnType<typeof useClawMuseLiveActivityFeed>["summary"],
  status: ReturnType<typeof useClawMuseStatusSummary>,
  hostPlans: ReturnType<typeof useHostUsagePlans>,
): void {
  const fingerprintRef = useRef<string | null>(null);

  useEffect(() => {
    const snapshot = buildAgentWidgetSnapshot({
      activities: summary,
      status,
      hostPlans: hostPlans.flatMap((entry) => entry.plans),
      now: Date.now(),
    });
    const fingerprint = widgetSnapshotFingerprint(snapshot);
    if (fingerprint === fingerprintRef.current) {
      return;
    }
    fingerprintRef.current = fingerprint;
    void updateAgentWidgetSnapshot(snapshot).catch(() => {
      fingerprintRef.current = null;
    });
  }, [hostPlans, status, summary]);
}
