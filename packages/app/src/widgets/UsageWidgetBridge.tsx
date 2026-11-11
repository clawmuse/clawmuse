import type { UsageDailyHistory } from "@getpaseo/protocol/messages";
import {
  readPinnedUsageWidgetDeviceIds,
  readUsageWidgetSnapshot,
  writeUsageWidgetSnapshot,
} from "@clawmuse/expo-agent-live-activity";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { AppState, Platform } from "react-native";
import { useHostUsagePlans } from "@/clawmuse-status/host-usage-plans";
import type { ClawMuseStatusUsage } from "@/clawmuse-status/summary";
import { useClawMuseStatusSummary } from "@/clawmuse-status/use-summary";
import type { ClawMuseUsageHostPlans } from "@/clawmuse-status/usage-rows";
import { useHosts } from "@/runtime/host-runtime";
import { useSessionStore, type SessionState } from "@/stores/session-store";
import { useUsageHostId } from "@/usage/hosts";
import type { UsageHost } from "@/usage/model";
import { useHostsUsage, useUsageHosts } from "@/usage/queries";
import type { UsageView } from "@/usage/types";
import {
  AUTO_USAGE_WIDGET_DEVICE_ID,
  buildHostUsageWidgetSnapshot,
  EMPTY_USAGE_WIDGET_STORE,
  mergeUsageWidgetState,
  parseUsageWidgetStore,
  reconcileUsageWidgetComputers,
  type AgentUsageSample,
  type UsageWidgetComputer,
  type UsageWidgetStore,
} from "./usage-widget-sync";

function collectHostAgentSamples(session: SessionState | undefined): AgentUsageSample[] {
  if (!session) return [];
  const merged = new Map<string, AgentUsageSample>();
  for (const agent of session.agentDetails.values()) {
    merged.set(agent.id, {
      id: agent.id,
      provider: agent.provider,
      model: agent.model,
      lastUsage: agent.lastUsage,
      lastActivityAt: agent.lastActivityAt,
      updatedAt: agent.updatedAt,
      turnOpen: agent.turn.phase === "open",
    });
  }
  for (const agent of session.agents.values()) {
    const detail = merged.get(agent.id);
    merged.set(agent.id, {
      id: agent.id,
      provider: agent.provider,
      model: agent.model ?? detail?.model ?? null,
      lastUsage: agent.lastUsage ?? detail?.lastUsage,
      lastActivityAt: agent.lastActivityAt,
      updatedAt: agent.updatedAt,
      turnOpen: agent.turn.phase === "open",
    });
  }
  return [...merged.values()];
}

function canonicalStoreFingerprint(store: UsageWidgetStore): string {
  return JSON.stringify({
    autoDeviceId: store.autoDeviceId,
    computers: store.computers,
    states: Object.fromEntries(
      Object.entries(store.states).map(([id, state]) => [
        id,
        state.kind === "snapshot"
          ? {
              kind: state.kind,
              deviceName: state.deviceName,
              sources: state.snapshot.sources,
              updatedMinute: Math.floor((state.snapshot.updatedAtMs ?? 0) / 60000),
              usage: state.snapshot.usage,
              locale: state.snapshot.locale,
            }
          : state,
      ]),
    ),
  });
}

function syncHostsIntoStore(input: {
  initialStore: UsageWidgetStore;
  computers: readonly UsageWidgetComputer[];
  preferredDeviceId: string | null;
  views: readonly { host: UsageHost; view: UsageView; dailyUsage?: UsageDailyHistory }[];
  sessions: Readonly<Record<string, SessionState>>;
  hostPlans: readonly ClawMuseUsageHostPlans[];
  serviceUsages: readonly ClawMuseStatusUsage[];
  locale: string;
  nowMs: number;
}): UsageWidgetStore {
  let nextStore = reconcileUsageWidgetComputers(input.initialStore, {
    computers: input.computers,
    preferredDeviceId: input.preferredDeviceId,
  });

  for (const { host, view, dailyUsage } of input.views) {
    if (view.kind === "off") {
      delete nextStore.states[host.serverId];
      continue;
    }
    // Keep an offline host's original observation time; never substitute another
    // host's aggregated cloud quota for this computer's account readings.
    if (!host.isConnected) continue;
    const agents = collectHostAgentSamples(input.sessions[host.serverId]);
    const reports = view.kind === "ready" ? view.reports : [];
    const fallbackForHost =
      input.hostPlans.find((entry) => entry.serverId === host.serverId)?.plans ?? [];
    if (view.kind === "loading" || view.kind === "error") continue;

    const previousState = nextStore.states[host.serverId];
    const { snapshot } = buildHostUsageWidgetSnapshot({
      reports,
      fallbackPlans: fallbackForHost,
      agents,
      dailyUsage,
      locale: input.locale,
      nowMs: input.nowMs,
    });
    if (
      dailyUsage === undefined &&
      view.kind === "ready" &&
      view.isRefreshing &&
      previousState?.kind === "snapshot" &&
      previousState.snapshot.usage.days.length > 0
    ) {
      snapshot.usage = previousState.snapshot.usage;
    }

    nextStore = mergeUsageWidgetState(nextStore, {
      deviceId: host.serverId,
      deviceName: host.label,
      preferredDeviceId: input.preferredDeviceId,
      nowMs: input.nowMs,
      state: {
        kind: "snapshot",
        receivedAtMs: input.nowMs,
        deviceName: host.label,
        snapshot,
      },
    });
  }

  if (input.views.length === 0 && input.serviceUsages.length > 0) {
    const syntheticId = "clawmuse-cloud";
    const { snapshot } = buildHostUsageWidgetSnapshot({
      reports: [],
      fallbackServiceUsages: input.serviceUsages,
      agents: [],
      locale: input.locale,
      nowMs: input.nowMs,
    });
    nextStore = mergeUsageWidgetState(nextStore, {
      deviceId: syntheticId,
      deviceName: "ClawMuse",
      preferredDeviceId: syntheticId,
      nowMs: input.nowMs,
      state: {
        kind: "snapshot",
        receivedAtMs: input.nowMs,
        deviceName: "ClawMuse",
        snapshot,
      },
    });
  }

  nextStore = reconcileUsageWidgetComputers(nextStore, {
    computers: nextStore.computers,
    preferredDeviceId: input.preferredDeviceId,
  });
  return nextStore;
}

export function UsageWidgetBridge() {
  if (Platform.OS !== "ios") {
    return null;
  }
  return <IosUsageWidgetBridge />;
}

function IosUsageWidgetBridge() {
  const { i18n } = useTranslation();
  const hosts = useHosts();
  const usageHosts = useUsageHosts();
  const usageHostId = useUsageHostId();
  const { views, refreshHost } = useHostsUsage(usageHosts);
  const hostPlans = useHostUsagePlans();
  const statusSummary = useClawMuseStatusSummary();
  const sessions = useSessionStore((state) => state.sessions);

  const viewsRef = useRef(views);
  viewsRef.current = views;

  const storeRef = useRef<UsageWidgetStore>(EMPTY_USAGE_WIDGET_STORE);
  const lastWrittenJsonRef = useRef<string | null>(null);

  useEffect(() => {
    const existingRaw = readUsageWidgetSnapshot();
    if (existingRaw) {
      storeRef.current = parseUsageWidgetStore(existingRaw);
      lastWrittenJsonRef.current = canonicalStoreFingerprint(storeRef.current);
    }
  }, []);

  // Refresh any host that a placed home-screen or lock-screen widget is pinned to.
  useEffect(() => {
    const refreshPinned = () => {
      const pinnedIds = readPinnedUsageWidgetDeviceIds();
      const refreshAll = pinnedIds.length === 0 || pinnedIds.includes(AUTO_USAGE_WIDGET_DEVICE_ID);
      for (const { host, view } of viewsRef.current) {
        if (!host.isConnected || !host.supportsUsage || view.kind !== "ready") continue;
        if (refreshAll || pinnedIds.includes(host.serverId)) {
          refreshHost(host.serverId);
        }
      }
    };
    refreshPinned();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refreshPinned();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [refreshHost, usageHosts]);

  const computers = useMemo(
    () => hosts.map((host) => ({ id: host.serverId, name: host.label })),
    [hosts],
  );

  const preferredDeviceId = useMemo(() => {
    if (usageHostId) return usageHostId;
    const firstOnline = usageHosts.find((host) => host.isConnected);
    return firstOnline?.serverId ?? hosts[0]?.serverId ?? null;
  }, [hosts, usageHostId, usageHosts]);

  useEffect(() => {
    const nextStore = syncHostsIntoStore({
      initialStore: storeRef.current,
      computers,
      preferredDeviceId,
      views,
      sessions,
      hostPlans,
      serviceUsages: statusSummary?.usages ?? [],
      locale: i18n.language || "en",
      nowMs: Date.now(),
    });

    storeRef.current = nextStore;
    const canonical = canonicalStoreFingerprint(nextStore);
    if (canonical !== lastWrittenJsonRef.current) {
      if (writeUsageWidgetSnapshot(JSON.stringify(nextStore))) {
        lastWrittenJsonRef.current = canonical;
      }
    }
  }, [computers, hostPlans, i18n.language, preferredDeviceId, sessions, statusSummary, views]);

  return null;
}
