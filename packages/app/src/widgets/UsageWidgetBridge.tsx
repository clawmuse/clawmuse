import {
  readPinnedUsageWidgetDeviceIds,
  readUsageWidgetSnapshot,
  writeUsageWidgetSnapshot,
} from "@clawmuse/expo-agent-live-activity";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppState, Platform } from "react-native";
import { useHostUsagePlans } from "@/clawmuse-status/host-usage-plans";
import type { ClawMuseStatusUsage } from "@/clawmuse-status/summary";
import { useClawMuseStatusSummary } from "@/clawmuse-status/use-summary";
import type { ClawMuseUsageHostPlans } from "@/clawmuse-status/usage-rows";
import { useHosts } from "@/runtime/host-runtime";
import { useSessionStore, type SessionState } from "@/stores/session-store";
import type { UsageHost } from "@/usage/model";
import { useHostsUsage, useUsageHosts } from "@/usage/queries";
import type { UsageView } from "@/usage/types";
import {
  buildHostUsageWidgetSnapshot,
  createEmptyHostUsageLedger,
  EMPTY_USAGE_WIDGET_STORE,
  mergeUsageWidgetState,
  parseUsageWidgetStore,
  parseUsageWidgetLedgers,
  reconcileUsageWidgetComputers,
  type AgentUsageSample,
  type HostUsageLedger,
  type UsageWidgetComputer,
  type UsageWidgetStore,
} from "./usage-widget-sync";

const LEDGERS_STORAGE_KEY = "clawmuse.usageWidget.ledgers.v1";

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
  views: readonly { host: UsageHost; view: UsageView }[];
  sessions: Readonly<Record<string, SessionState>>;
  hostPlans: readonly ClawMuseUsageHostPlans[];
  serviceUsages: readonly ClawMuseStatusUsage[];
  ledgers: Record<string, HostUsageLedger>;
  locale: string;
  nowMs: number;
}): { nextStore: UsageWidgetStore; ledgersChanged: boolean } {
  let nextStore = reconcileUsageWidgetComputers(input.initialStore, {
    computers: input.computers,
    preferredDeviceId: input.preferredDeviceId,
  });
  let ledgersChanged = false;

  for (const { host, view } of input.views) {
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
    const previousLedger = input.ledgers[host.serverId] ?? createEmptyHostUsageLedger();

    const hasAnyData =
      reports.length > 0 ||
      fallbackForHost.length > 0 ||
      agents.some((a) => a.lastUsage !== undefined) ||
      Object.keys(previousLedger.days).length > 0;

    if (!hasAnyData && !host.isConnected) continue;

    const { snapshot, ledger } = buildHostUsageWidgetSnapshot({
      reports,
      fallbackPlans: fallbackForHost,
      agents,
      ledger: previousLedger,
      locale: input.locale,
      nowMs: input.nowMs,
    });

    if (JSON.stringify(ledger) !== JSON.stringify(previousLedger)) {
      input.ledgers[host.serverId] = ledger;
      ledgersChanged = true;
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
    const previousLedger = input.ledgers[syntheticId] ?? createEmptyHostUsageLedger();
    const { snapshot } = buildHostUsageWidgetSnapshot({
      reports: [],
      fallbackServiceUsages: input.serviceUsages,
      agents: [],
      ledger: previousLedger,
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

  const allowed = new Set(input.computers.map((computer) => computer.id));
  if (input.serviceUsages.length > 0) allowed.add("clawmuse-cloud");
  for (const id of Object.keys(input.ledgers)) {
    if (!allowed.has(id)) {
      delete input.ledgers[id];
      ledgersChanged = true;
    }
  }
  nextStore = reconcileUsageWidgetComputers(nextStore, {
    computers: nextStore.computers,
    preferredDeviceId: input.preferredDeviceId,
  });
  return { nextStore, ledgersChanged };
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
  const { views, refreshHost } = useHostsUsage(usageHosts);
  const hostPlans = useHostUsagePlans();
  const statusSummary = useClawMuseStatusSummary();
  const sessions = useSessionStore((state) => state.sessions);

  const viewsRef = useRef(views);
  viewsRef.current = views;

  const [ledgersLoaded, setLedgersLoaded] = useState(false);
  const ledgersRef = useRef<Record<string, HostUsageLedger>>({});
  const storeRef = useRef<UsageWidgetStore>(EMPTY_USAGE_WIDGET_STORE);
  const lastWrittenJsonRef = useRef<string | null>(null);

  useEffect(() => {
    const existingRaw = readUsageWidgetSnapshot();
    if (existingRaw) {
      storeRef.current = parseUsageWidgetStore(existingRaw);
      lastWrittenJsonRef.current = canonicalStoreFingerprint(storeRef.current);
    }
    let cancelled = false;
    async function hydrateLedgers() {
      try {
        const raw = await AsyncStorage.getItem(LEDGERS_STORAGE_KEY);
        if (cancelled) return;
        ledgersRef.current = parseUsageWidgetLedgers(raw);
      } catch {
        // Ignore malformed cache
      } finally {
        if (!cancelled) {
          setLedgersLoaded(true);
        }
      }
    }
    void hydrateLedgers();
    return () => {
      cancelled = true;
    };
  }, []);

  // Refresh any host that a placed home-screen or lock-screen widget is pinned to.
  useEffect(() => {
    const refreshPinned = () => {
      const pinnedIds = readPinnedUsageWidgetDeviceIds();
      for (const id of pinnedIds) {
        if (
          viewsRef.current.some(
            ({ host, view }) =>
              host.serverId === id &&
              host.isConnected &&
              host.supportsUsage &&
              view.kind === "ready",
          )
        ) {
          refreshHost(id);
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
    const firstOnline = usageHosts.find((host) => host.isConnected);
    return firstOnline?.serverId ?? hosts[0]?.serverId ?? null;
  }, [hosts, usageHosts]);

  useEffect(() => {
    if (!ledgersLoaded) return;

    const { nextStore, ledgersChanged } = syncHostsIntoStore({
      initialStore: storeRef.current,
      computers,
      preferredDeviceId,
      views,
      sessions,
      hostPlans,
      serviceUsages: statusSummary?.usages ?? [],
      ledgers: ledgersRef.current,
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

    if (ledgersChanged) {
      void AsyncStorage.setItem(LEDGERS_STORAGE_KEY, JSON.stringify(ledgersRef.current)).catch(
        () => undefined,
      );
    }
  }, [
    computers,
    hostPlans,
    i18n.language,
    ledgersLoaded,
    preferredDeviceId,
    sessions,
    statusSummary,
    views,
  ]);

  return null;
}
