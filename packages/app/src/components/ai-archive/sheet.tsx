import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useQueryClient } from "@tanstack/react-query";
import equal from "fast-deep-equal";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { getParentAgentIdFromLabels } from "@getpaseo/protocol/agent-labels";
import { Settings2 } from "@/components/icons/app-icons";
import { AdaptiveModalSheet } from "@/components/adaptive-modal-sheet";
import { HostStatusDot } from "@/components/host-status-dot";
import { HostFilter } from "@/components/hosts/host-filter";
import { ALL_HOSTS_OPTION_ID, type HostPickerHost } from "@/components/hosts/host-picker";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useClawMuseDeviceLabel } from "@/clawmuse/device-label";
import { useAggregatedAgents, type AggregatedAgent } from "@/hooks/use-aggregated-agents";
import { applyArchivedAgentCloseResults } from "@/hooks/use-archive-agent";
import {
  useHostRuntimeConnectionStatuses,
  useVisibleHosts,
  type HostRuntimeConnectionStatus,
} from "@/runtime/host-runtime";
import { useLastWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { useSessionStore } from "@/stores/session-store";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";
import type { Theme } from "@/styles/theme";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { confirmDialog } from "@/utils/confirm-dialog";
import { toErrorMessage } from "@/utils/error-messages";
import { buildSettingsHostSectionRoute } from "@/utils/host-routes";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { AgentArchiveRow } from "./agent-row";
import {
  AiArchiveModelConfigCard,
  AllHostsModelConfigList,
  useAiArchiveModelButtonLabel,
} from "./model-config-panel";
import {
  deriveLiveRiskFlags,
  keyOfAgent,
  type AgentLiveMeta,
  type ArchiveRowItem,
  type ArchiveStatusFilter,
  type HostArchiveInfo,
  type ReviewEntry,
} from "./types";

const aiArchiveHostOptionTestID = (serverId: string) => `ai-archive-host-option-${serverId}`;

const EMPTY_AGENT_META: AgentLiveMeta = {
  model: null,
  lastError: null,
  parentAgentId: null,
  childCount: 0,
};

const ThemedInlineSpinner = withUnistyles(LoadingSpinner, (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
}));

interface HostSessionMeta {
  isConnected: boolean;
  supportsAiArchive: boolean;
  supportsModelConfig: boolean;
  canWriteWorkspace: boolean;
  canManageDaemon: boolean;
}

interface StoreSnapshotSlice {
  hostsById: Record<string, HostSessionMeta>;
  agentMetaByKey: Record<string, AgentLiveMeta>;
}

type SessionValue = ReturnType<typeof useSessionStore.getState>["sessions"][string];
type SessionAgent = NonNullable<SessionValue["agents"]> extends Map<string, infer T> ? T : never;

function readHostSessionMeta(session: SessionValue): HostSessionMeta {
  const permissions = session.serverInfo?.permissions ?? [];
  return {
    isConnected: session.client?.isConnected === true,
    supportsAiArchive: session.serverInfo?.features?.aiAgentArchive === true,
    supportsModelConfig: session.serverInfo?.features?.aiArchiveModelConfig === true,
    canWriteWorkspace: permissions.includes("workspace.write"),
    canManageDaemon: permissions.includes("daemon.manage"),
  };
}

function collectSessionAgentMeta(
  serverId: string,
  agents: readonly SessionAgent[],
  target: Record<string, AgentLiveMeta>,
) {
  const childCountByParent = new Map<string, number>();
  for (const agent of agents) {
    if (agent.archivedAt) continue;
    const parentId = agent.parentAgentId ?? getParentAgentIdFromLabels(agent.labels) ?? null;
    if (parentId) {
      childCountByParent.set(parentId, (childCountByParent.get(parentId) ?? 0) + 1);
    }
  }

  for (const agent of agents) {
    if (agent.background || agent.archivedAt) continue;
    const parentAgentId = agent.parentAgentId ?? getParentAgentIdFromLabels(agent.labels) ?? null;
    target[`${serverId}:${agent.id}`] = {
      model: agent.runtimeInfo?.model ?? agent.model ?? null,
      lastError: agent.lastError ?? null,
      parentAgentId,
      childCount: childCountByParent.get(agent.id) ?? 0,
    };
  }
}

function readStoreSnapshotSlice(
  state: ReturnType<typeof useSessionStore.getState>,
): StoreSnapshotSlice {
  const hostsById: Record<string, HostSessionMeta> = {};
  const agentMetaByKey: Record<string, AgentLiveMeta> = {};

  for (const [serverId, session] of Object.entries(state.sessions)) {
    hostsById[serverId] = readHostSessionMeta(session);
    if (session.agents) {
      collectSessionAgentMeta(serverId, Array.from(session.agents.values()), agentMetaByKey);
    }
  }

  return { hostsById, agentMetaByKey };
}

function resolveInitialSelectedHost(input: {
  hosts: readonly HostPickerHost[];
  lastServerId: string | null | undefined;
  hostsById: Record<string, HostSessionMeta>;
  agents: readonly AggregatedAgent[];
}): string {
  const { hosts, lastServerId, hostsById, agents } = input;
  if (hosts.length === 1) return hosts[0].serverId;
  if (lastServerId && hosts.some((host) => host.serverId === lastServerId)) {
    return lastServerId;
  }
  const activeWithAgents = hosts.find(
    (host) =>
      hostsById[host.serverId]?.isConnected &&
      agents.some((agent) => agent.serverId === host.serverId),
  );
  if (activeWithAgents) return activeWithAgents.serverId;
  if (hosts.length > 0) return hosts[0].serverId;
  return ALL_HOSTS_OPTION_ID;
}

function HostChipButton({
  host,
  onSelect,
  disabled,
}: {
  host: HostArchiveInfo;
  onSelect: (serverId: string) => void;
  disabled: boolean;
}) {
  const deviceLabel = useClawMuseDeviceLabel();
  const handlePress = useCallback(() => onSelect(host.serverId), [host.serverId, onSelect]);
  const dot = useMemo(() => <HostStatusDot serverId={host.serverId} />, [host.serverId]);
  const label = deviceLabel(host.serverId, host.label);

  return (
    <Button
      variant="outline"
      size="sm"
      leftIcon={dot}
      disabled={disabled}
      onPress={handlePress}
      testID={`ai-archive-host-chip-${host.serverId}`}
    >
      {`${label} (${host.openCount})`}
    </Button>
  );
}

function SingleHostSummaryPill({ host }: { host: HostArchiveInfo }) {
  const deviceLabel = useClawMuseDeviceLabel();
  const label = deviceLabel(host.serverId, host.label);
  return (
    <View style={styles.singleHostPill}>
      <HostStatusDot serverId={host.serverId} />
      <Text style={styles.singleHostLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function HostCapabilityAlert({ host }: { host: HostArchiveInfo | null }) {
  const { t } = useTranslation();
  if (!host) return null;
  if (!host.isConnected) {
    return (
      <Alert
        variant="warning"
        size="sm"
        description={t("aiArchive.offline")}
        testID="ai-archive-host-alert"
      />
    );
  }
  if (!host.canWriteWorkspace) {
    return (
      <Alert
        variant="warning"
        size="sm"
        description={t("aiArchive.noPermission")}
        testID="ai-archive-host-alert"
      />
    );
  }
  if (!host.supportsAiArchive) {
    return (
      <Alert
        variant="info"
        size="sm"
        description={t("aiArchive.updateHostManualAvailable")}
        testID="ai-archive-host-alert"
      />
    );
  }
  return null;
}

function buildManualConfirmMessage(item: ArchiveRowItem, t: TFunction): string | null {
  const flags = deriveLiveRiskFlags(item.agent, item.meta);
  if (!flags.needsConfirmForManualArchive) return null;
  const reasons: string[] = [];
  if (flags.isRunning) reasons.push(t("aiArchive.manualConfirm.running"));
  if (flags.needsPermission) reasons.push(t("aiArchive.manualConfirm.permission"));
  if (flags.hasBackgroundWork) reasons.push(t("aiArchive.manualConfirm.backgroundWork"));
  if (flags.hasChildren) reasons.push(t("aiArchive.manualConfirm.subagents"));
  return reasons.join("\n");
}

function getBatchProgressText(input: {
  t: TFunction;
  batchBusy: boolean;
  stopping: boolean;
  batchKind: "review" | "archive";
  batchDone: number;
  batchTotal: number;
  batchTitle: string;
  isInitialLoad: boolean;
  scopedItems: readonly ArchiveRowItem[];
  readyCount: number;
  archivedCount: number;
  keptCount: number;
  failedCount: number;
}): string {
  const {
    t,
    batchBusy,
    stopping,
    batchKind,
    batchDone,
    batchTotal,
    batchTitle,
    isInitialLoad,
    scopedItems,
    readyCount,
    archivedCount,
    keptCount,
    failedCount,
  } = input;

  if (batchBusy) {
    if (stopping) return t("aiArchive.stopping");
    if (batchTitle) {
      return t(
        batchKind === "archive" ? "aiArchive.progressArchiving" : "aiArchive.progressChecking",
        { done: batchDone, total: batchTotal, title: batchTitle },
      );
    }
    return t("aiArchive.progress", { done: batchDone, total: batchTotal });
  }
  if (isInitialLoad) return t("aiArchive.loading");
  if (scopedItems.length === 0) return t("aiArchive.empty");

  const hasCheckedAny = scopedItems.some((item) => item.entry.phase !== "idle");
  if (hasCheckedAny) {
    const settledKept = Math.max(0, keptCount - failedCount);
    if (failedCount > 0) {
      return t("aiArchive.summaryWithFailures", {
        ready: readyCount,
        archived: archivedCount,
        kept: settledKept,
        failed: failedCount,
      });
    }
    return t("aiArchive.summary", {
      ready: readyCount,
      archived: archivedCount,
      kept: settledKept,
    });
  }

  let running = 0;
  let attention = 0;
  for (const item of scopedItems) {
    const flags = deriveLiveRiskFlags(item.agent, item.meta);
    if (flags.isRunning) running += 1;
    else if (
      flags.needsPermission ||
      flags.hasError ||
      flags.hasBackgroundWork ||
      flags.hasChildren
    ) {
      attention += 1;
    }
  }
  const idle = Math.max(0, scopedItems.length - running - attention);
  return t("aiArchive.liveSummary", {
    total: scopedItems.length,
    running,
    attention,
    idle,
  });
}

function BatchProgressBlock({
  batchBusy,
  batchDone,
  batchTotal,
  progressText,
}: {
  batchBusy: boolean;
  batchDone: number;
  batchTotal: number;
  progressText: string;
}) {
  const pct = batchTotal > 0 ? Math.min(100, Math.round((batchDone / batchTotal) * 100)) : 0;
  const fillStyle = useMemo(() => {
    const width: `${number}%` = `${pct}%`;
    return inlineUnistylesStyle({ width });
  }, [pct]);

  return (
    <View style={styles.progressBlock}>
      <View style={styles.progressRow}>
        {batchBusy ? <ThemedInlineSpinner size={14} /> : null}
        <Text
          style={styles.progressText}
          accessibilityLiveRegion="polite"
          testID="ai-archive-progress"
        >
          {progressText}
        </Text>
      </View>
      {batchBusy && batchTotal > 0 ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, fillStyle]} />
        </View>
      ) : null}
    </View>
  );
}

export function AiAgentArchiveSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const visibleHosts = useVisibleHosts();
  const { agents, isInitialLoad } = useAggregatedAgents();
  const lastWorkspace = useLastWorkspaceSelection();
  const queryClient = useQueryClient();

  const storeSlice = useStoreWithEqualityFn(useSessionStore, readStoreSnapshotSlice, equal);

  const hosts = useMemo<HostPickerHost[]>(() => {
    if (visibleHosts.length > 0) {
      return visibleHosts.map((host) => ({ serverId: host.serverId, label: host.label }));
    }
    const seen = new Map<string, string>();
    for (const agent of agents) {
      if (!seen.has(agent.serverId)) seen.set(agent.serverId, agent.serverLabel);
    }
    return Array.from(seen.entries()).map(([serverId, label]) => ({ serverId, label }));
  }, [agents, visibleHosts]);

  const hostIds = useMemo(() => hosts.map((host) => host.serverId), [hosts]);
  const connectionStatuses = useHostRuntimeConnectionStatuses(hostIds);

  const hostInfos = useMemo<HostArchiveInfo[]>(() => {
    const openCounts = new Map<string, number>();
    for (const agent of agents) {
      openCounts.set(agent.serverId, (openCounts.get(agent.serverId) ?? 0) + 1);
    }
    return hosts.map((host) => {
      const meta = storeSlice.hostsById[host.serverId];
      const connectionStatus: HostRuntimeConnectionStatus =
        connectionStatuses.get(host.serverId) ?? (meta?.isConnected ? "online" : "offline");
      const isConnected = meta ? meta.isConnected : connectionStatus === "online";
      return {
        serverId: host.serverId,
        label: host.label,
        isConnected,
        connectionStatus,
        supportsAiArchive: meta?.supportsAiArchive === true,
        supportsModelConfig: meta?.supportsModelConfig === true,
        canWriteWorkspace: meta?.canWriteWorkspace === true,
        canManageDaemon: meta?.canManageDaemon === true,
        openCount: openCounts.get(host.serverId) ?? 0,
      };
    });
  }, [agents, connectionStatuses, hosts, storeSlice.hostsById]);

  const [selectedHost, setSelectedHost] = useState<string>(() =>
    resolveInitialSelectedHost({
      hosts,
      lastServerId: lastWorkspace?.serverId,
      hostsById: storeSlice.hostsById,
      agents,
    }),
  );

  useEffect(() => {
    if (hosts.length === 1 && selectedHost !== hosts[0].serverId) {
      setSelectedHost(hosts[0].serverId);
      return;
    }
    if (
      selectedHost !== ALL_HOSTS_OPTION_ID &&
      hosts.length > 0 &&
      !hosts.some((host) => host.serverId === selectedHost)
    ) {
      setSelectedHost(hosts.length === 1 ? hosts[0].serverId : ALL_HOSTS_OPTION_ID);
    }
  }, [hosts, selectedHost]);

  const [filter, setFilter] = useState<ArchiveStatusFilter>("all");
  const [modelConfigOpen, setModelConfigOpen] = useState(false);
  const [entriesByKey, setEntriesByKey] = useState<Record<string, ReviewEntry>>({});
  const [archivedSnapshots, setArchivedSnapshots] = useState<
    Record<string, { agent: AggregatedAgent; meta: AgentLiveMeta }>
  >({});

  const [batchBusy, setBatchBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [batchKind, setBatchKind] = useState<"review" | "archive">("review");
  const [batchDone, setBatchDone] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchTitle, setBatchTitle] = useState("");

  const runningRef = useRef(false);
  const stoppedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const updateEntry = useCallback((key: string, patch: Partial<ReviewEntry>) => {
    if (!mountedRef.current) return;
    setEntriesByKey((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? { phase: "idle" }), ...patch },
    }));
  }, []);

  const allItems = useMemo<ArchiveRowItem[]>(() => {
    const items: ArchiveRowItem[] = [];
    const liveKeys = new Set<string>();
    for (const agent of agents) {
      const key = keyOfAgent(agent);
      liveKeys.add(key);
      items.push({
        key,
        agent,
        meta: storeSlice.agentMetaByKey[key] ?? EMPTY_AGENT_META,
        entry: entriesByKey[key] ?? { phase: "idle" },
      });
    }
    for (const [key, snapshot] of Object.entries(archivedSnapshots)) {
      if (liveKeys.has(key)) continue;
      items.push({
        key,
        agent: snapshot.agent,
        meta: snapshot.meta,
        entry: entriesByKey[key] ?? { phase: "archived" },
        archivedSnapshot: true,
      });
    }
    return items;
  }, [agents, archivedSnapshots, entriesByKey, storeSlice.agentMetaByKey]);

  const isAllHosts = selectedHost === ALL_HOSTS_OPTION_ID;
  const scopedItems = useMemo(
    () => (isAllHosts ? allItems : allItems.filter((item) => item.agent.serverId === selectedHost)),
    [allItems, isAllHosts, selectedHost],
  );

  const counts = useMemo(() => {
    let ready = 0;
    let kept = 0;
    let archived = 0;
    let failed = 0;
    for (const item of scopedItems) {
      const phase = item.entry.phase;
      if (phase === "ready") ready += 1;
      else if (phase === "kept") kept += 1;
      else if (phase === "failed") {
        kept += 1;
        failed += 1;
      } else if (phase === "archived") archived += 1;
    }
    return { total: scopedItems.length, ready, kept, archived, failed };
  }, [scopedItems]);

  const visibleItems = useMemo(() => {
    if (filter === "all") return scopedItems;
    if (filter === "ready") return scopedItems.filter((item) => item.entry.phase === "ready");
    if (filter === "kept") {
      return scopedItems.filter(
        (item) => item.entry.phase === "kept" || item.entry.phase === "failed",
      );
    }
    return scopedItems.filter((item) => item.entry.phase === "archived");
  }, [filter, scopedItems]);

  const hostInfoById = useMemo(
    () => new Map(hostInfos.map((info) => [info.serverId, info])),
    [hostInfos],
  );

  const activeHostInfo = isAllHosts ? null : (hostInfoById.get(selectedHost) ?? null);
  const scanTargets = useMemo(
    () => scopedItems.filter((item) => item.entry.phase !== "archived"),
    [scopedItems],
  );
  const hasReviewedInScope = useMemo(
    () => scopedItems.some((item) => item.entry.phase !== "idle"),
    [scopedItems],
  );
  const canRunAiInScope = useMemo(() => {
    if (activeHostInfo) {
      return (
        activeHostInfo.isConnected &&
        activeHostInfo.canWriteWorkspace &&
        activeHostInfo.supportsAiArchive
      );
    }
    return scanTargets.some((item) => {
      const info = hostInfoById.get(item.agent.serverId);
      return Boolean(info?.isConnected && info.canWriteWorkspace && info.supportsAiArchive);
    });
  }, [activeHostInfo, hostInfoById, scanTargets]);

  const requireArchiveClient = useCallback(
    (serverId: string) => {
      const session = useSessionStore.getState().sessions[serverId];
      if (!session?.client || !session.client.isConnected) {
        throw new Error(t("aiArchive.offline"));
      }
      if (!session.serverInfo?.permissions?.includes("workspace.write")) {
        throw new Error(t("aiArchive.noPermission"));
      }
      return session.client;
    },
    [t],
  );

  const requireAiClient = useCallback(
    (serverId: string) => {
      const session = useSessionStore.getState().sessions[serverId];
      if (!session?.client || !session.client.isConnected) {
        throw new Error(t("aiArchive.offline"));
      }
      // COMPAT(aiAgentArchive): added in v1.5.8; remove after 2027-05-11 once host floor supports AI archive.
      if (!session.serverInfo?.features?.aiAgentArchive) {
        throw new Error(t("aiArchive.updateHost"));
      }
      if (!session.serverInfo.permissions?.includes("workspace.write")) {
        throw new Error(t("aiArchive.noPermission"));
      }
      return session.client;
    },
    [t],
  );

  const markArchived = useCallback(
    (item: ArchiveRowItem, archivedAt: string, archivedBy: "ai" | "manual") => {
      if (mountedRef.current) {
        setArchivedSnapshots((prev) => ({
          ...prev,
          [item.key]: { agent: item.agent, meta: item.meta },
        }));
      }
      applyArchivedAgentCloseResults({
        queryClient,
        serverId: item.agent.serverId,
        results: [{ agentId: item.agent.id, archivedAt }],
      });
      updateEntry(item.key, {
        phase: "archived",
        archivedAt,
        archivedBy,
      });
    },
    [queryClient, updateEntry],
  );

  const applyVerifiedArchive = useCallback(
    async (item: ArchiveRowItem, token: string) => {
      updateEntry(item.key, { phase: "archiving" });
      const client = requireAiClient(item.agent.serverId);
      const result = await client.applyAgentArchive(item.agent.id, token);
      markArchived(item, result.archivedAt, "ai");
    },
    [markArchived, requireAiClient, updateEntry],
  );

  const handleCheckRow = useCallback(
    async (item: ArchiveRowItem) => {
      if (runningRef.current) return;
      updateEntry(item.key, { phase: "reviewing" });
      try {
        const review = await requireAiClient(item.agent.serverId).reviewAgentArchive(item.agent.id);
        updateEntry(item.key, {
          review,
          phase: review.eligible ? "ready" : "kept",
          reason: review.reason,
        });
      } catch (error) {
        updateEntry(item.key, {
          phase: "failed",
          review: undefined,
          reason: error instanceof Error ? toErrorMessage(error) : t("aiArchive.failed"),
        });
      }
    },
    [requireAiClient, t, updateEntry],
  );

  const handleArchiveRow = useCallback(
    async (item: ArchiveRowItem) => {
      if (runningRef.current) return;
      if (item.entry.phase === "ready" && item.entry.review?.token) {
        try {
          await applyVerifiedArchive(item, item.entry.review.token);
        } catch (error) {
          updateEntry(item.key, {
            phase: "failed",
            review: item.entry.review ? { ...item.entry.review, token: null } : undefined,
            reason: error instanceof Error ? toErrorMessage(error) : t("aiArchive.failed"),
          });
        }
        return;
      }

      try {
        const client = requireArchiveClient(item.agent.serverId);
        const confirmMessage = buildManualConfirmMessage(item, t);
        if (confirmMessage) {
          const confirmed = await confirmDialog({
            title: t("aiArchive.manualConfirm.title"),
            message: confirmMessage,
            confirmLabel: t("aiArchive.manualConfirm.confirm"),
            cancelLabel: t("aiArchive.manualConfirm.cancel"),
            destructive: true,
          });
          if (!confirmed || !mountedRef.current) return;
        }
        updateEntry(item.key, { phase: "archiving" });
        const result = await client.archiveAgent(item.agent.id);
        markArchived(item, result.archivedAt, "manual");
      } catch (error) {
        updateEntry(item.key, {
          phase: "failed",
          reason: error instanceof Error ? toErrorMessage(error) : t("aiArchive.failed"),
        });
      }
    },
    [applyVerifiedArchive, markArchived, requireArchiveClient, t, updateEntry],
  );

  const runSingleBatchStep = useCallback(
    async (item: ArchiveRowItem, applyReviewedOnly: boolean, autoArchive: boolean) => {
      if (applyReviewedOnly) {
        if (item.entry.review?.token) {
          await applyVerifiedArchive(item, item.entry.review.token);
        }
        return;
      }
      updateEntry(item.key, { phase: "reviewing" });
      const review = await requireAiClient(item.agent.serverId).reviewAgentArchive(item.agent.id);
      const nextEntry: ReviewEntry = {
        review,
        phase: review.eligible ? "ready" : "kept",
        reason: review.reason,
      };
      updateEntry(item.key, nextEntry);
      const shouldArchiveNow =
        autoArchive &&
        review.eligible &&
        Boolean(review.token) &&
        mountedRef.current &&
        !stoppedRef.current;
      if (shouldArchiveNow && review.token) {
        await applyVerifiedArchive({ ...item, entry: nextEntry }, review.token);
      }
    },
    [applyVerifiedArchive, requireAiClient, updateEntry],
  );

  const runBatch = useCallback(
    async (autoArchive: boolean) => {
      if (runningRef.current) return;
      const readyItems = scopedItems.filter((item) => item.entry.phase === "ready");
      const applyReviewedOnly = autoArchive && readyItems.length > 0;
      const targets = applyReviewedOnly ? readyItems : scanTargets;
      if (targets.length === 0) return;

      runningRef.current = true;
      stoppedRef.current = false;
      setBatchBusy(true);
      setStopping(false);
      setBatchKind(applyReviewedOnly ? "archive" : "review");
      setBatchDone(0);
      setBatchTotal(targets.length);
      setBatchTitle("");

      if (!applyReviewedOnly && mountedRef.current) {
        setEntriesByKey((prev) => {
          const next = { ...prev };
          for (const item of targets) next[item.key] = { phase: "pending" };
          return next;
        });
      }

      try {
        let completed = 0;
        // One host/model operation at a time keeps a large list from spawning a fleet.
        for (const item of targets) {
          if (!mountedRef.current || stoppedRef.current) break;
          setBatchTitle(item.agent.title || item.agent.id);
          try {
            await runSingleBatchStep(item, applyReviewedOnly, autoArchive);
          } catch (error) {
            updateEntry(item.key, {
              phase: "failed",
              review: undefined,
              reason: error instanceof Error ? toErrorMessage(error) : t("aiArchive.failed"),
            });
          }
          completed += 1;
          if (mountedRef.current) setBatchDone(completed);
        }
      } finally {
        if (mountedRef.current && stoppedRef.current) {
          setEntriesByKey((prev) => {
            const next = { ...prev };
            for (const [key, entry] of Object.entries(next)) {
              if (entry.phase === "pending") next[key] = { phase: "idle" };
            }
            return next;
          });
        }
        runningRef.current = false;
        if (mountedRef.current) {
          setBatchBusy(false);
          setStopping(false);
          setBatchTitle("");
        }
      }
    },
    [runSingleBatchStep, scanTargets, scopedItems, t, updateEntry],
  );

  const stopBatch = useCallback(() => {
    stoppedRef.current = true;
    setStopping(true);
  }, []);

  const closeSheet = useCallback(() => {
    stoppedRef.current = true;
    onClose();
  }, [onClose]);

  const handleOpenRow = useCallback(
    (item: ArchiveRowItem) => {
      closeSheet();
      navigateToAgent({ serverId: item.agent.serverId, agentId: item.agent.id });
    },
    [closeSheet],
  );

  const handleSelectHost = useCallback((nextHost: string) => {
    setSelectedHost(nextHost);
    setFilter("all");
  }, []);

  const handleConfigureHost = useCallback((serverId: string) => {
    setSelectedHost(serverId);
    setFilter("all");
    setModelConfigOpen(true);
  }, []);

  const handleOpenHostSettings = useCallback(
    (serverId: string) => {
      closeSheet();
      router.push(buildSettingsHostSectionRoute(serverId, "metadata"));
    },
    [closeSheet],
  );

  const toggleModelConfig = useCallback(() => {
    setModelConfigOpen((open) => !open);
  }, []);

  const scan = useCallback(() => {
    void runBatch(false);
  }, [runBatch]);

  const autoArchive = useCallback(() => {
    void runBatch(true);
  }, [runBatch]);

  const modelButtonLabel = useAiArchiveModelButtonLabel(selectedHost, isAllHosts);

  const filterOptions = useMemo(
    () => [
      { value: "all" as const, label: t("aiArchive.filter.all", { count: counts.total }) },
      { value: "ready" as const, label: t("aiArchive.filter.ready", { count: counts.ready }) },
      { value: "kept" as const, label: t("aiArchive.filter.kept", { count: counts.kept }) },
      {
        value: "archived" as const,
        label: t("aiArchive.filter.archived", { count: counts.archived }),
      },
    ],
    [counts.archived, counts.kept, counts.ready, counts.total, t],
  );

  const progressText = useMemo(
    () =>
      getBatchProgressText({
        t,
        batchBusy,
        stopping,
        batchKind,
        batchDone,
        batchTotal,
        batchTitle,
        isInitialLoad,
        scopedItems,
        readyCount: counts.ready,
        archivedCount: counts.archived,
        keptCount: counts.kept,
        failedCount: counts.failed,
      }),
    [
      batchBusy,
      batchDone,
      batchKind,
      batchTitle,
      batchTotal,
      counts.archived,
      counts.failed,
      counts.kept,
      counts.ready,
      isInitialLoad,
      scopedItems,
      stopping,
      t,
    ],
  );

  const header = useMemo(() => ({ title: t("aiArchive.title") }), [t]);
  const footer = useMemo(
    () => (
      <View style={styles.actions}>
        {batchBusy ? (
          <Button
            variant="outline"
            disabled={stopping}
            onPress={stopBatch}
            testID="ai-archive-stop"
          >
            {t("aiArchive.stop")}
          </Button>
        ) : null}
        <View style={styles.actionSpacer} />
        <Button
          variant="outline"
          disabled={batchBusy || isInitialLoad || scanTargets.length === 0 || !canRunAiInScope}
          onPress={scan}
          testID="ai-archive-scan"
        >
          {hasReviewedInScope ? t("aiArchive.rescan") : t("aiArchive.scan")}
        </Button>
        <Button
          variant="default"
          loading={batchBusy}
          disabled={
            batchBusy ||
            isInitialLoad ||
            !canRunAiInScope ||
            (hasReviewedInScope ? counts.ready === 0 : scanTargets.length === 0)
          }
          onPress={autoArchive}
          testID="ai-archive-auto"
        >
          {counts.ready
            ? t("aiArchive.archiveReady", { count: counts.ready })
            : t("aiArchive.auto")}
        </Button>
      </View>
    ),
    [
      autoArchive,
      batchBusy,
      canRunAiInScope,
      counts.ready,
      hasReviewedInScope,
      isInitialLoad,
      scan,
      scanTargets.length,
      stopBatch,
      stopping,
      t,
    ],
  );

  let hostControl: ReactNode = null;
  if (hosts.length > 1) {
    hostControl = (
      <HostFilter
        hosts={hosts}
        selectedHost={selectedHost}
        onSelectHost={handleSelectHost}
        includeAllHost
        triggerTestID="ai-archive-host-filter"
        hostOptionTestID={aiArchiveHostOptionTestID}
      />
    );
  } else if (activeHostInfo) {
    hostControl = <SingleHostSummaryPill host={activeHostInfo} />;
  }

  let modelConfigContent: ReactNode = null;
  if (modelConfigOpen) {
    modelConfigContent = isAllHosts ? (
      <AllHostsModelConfigList hosts={hostInfos} onSelectHost={handleConfigureHost} />
    ) : (
      <AiArchiveModelConfigCard
        serverId={selectedHost}
        onOpenHostSettings={handleOpenHostSettings}
      />
    );
  }

  let listContent: ReactNode = null;
  if (visibleItems.length > 0) {
    listContent = (
      <View style={styles.list}>
        {visibleItems.map((item) => {
          const hostInfo = hostInfoById.get(item.agent.serverId);
          const canCheckAi = Boolean(
            hostInfo?.isConnected && hostInfo.canWriteWorkspace && hostInfo.supportsAiArchive,
          );
          const canArchive = Boolean(hostInfo?.isConnected && hostInfo.canWriteWorkspace);
          return (
            <AgentArchiveRow
              key={item.key}
              item={item}
              showHostLabel={isAllHosts}
              hostBusy={batchBusy}
              canCheckAi={canCheckAi}
              canArchive={canArchive}
              onCheck={handleCheckRow}
              onArchive={handleArchiveRow}
              onOpen={handleOpenRow}
            />
          );
        })}
      </View>
    );
  } else if (scopedItems.length > 0) {
    listContent = <Text style={styles.emptyFilter}>{t("aiArchive.emptyFilter")}</Text>;
  }

  return (
    <AdaptiveModalSheet
      visible
      onClose={closeSheet}
      header={header}
      testID="ai-archive-sheet"
      desktopMaxWidth={680}
      footer={footer}
    >
      <View style={styles.body}>
        <Text style={styles.description}>{t("aiArchive.description")}</Text>

        <View style={styles.toolbar}>
          <View style={styles.hostSlot}>{hostControl}</View>
          <Button
            variant={modelConfigOpen ? "secondary" : "outline"}
            size="sm"
            leftIcon={Settings2}
            disabled={batchBusy}
            onPress={toggleModelConfig}
            testID="ai-archive-model-toggle"
          >
            {modelButtonLabel}
          </Button>
        </View>

        {isAllHosts && hostInfos.length > 1 ? (
          <View style={styles.hostChips}>
            {hostInfos.map((host) => (
              <HostChipButton
                key={host.serverId}
                host={host}
                disabled={batchBusy}
                onSelect={handleSelectHost}
              />
            ))}
          </View>
        ) : null}

        {modelConfigContent}

        <HostCapabilityAlert host={activeHostInfo} />

        <BatchProgressBlock
          batchBusy={batchBusy}
          batchDone={batchDone}
          batchTotal={batchTotal}
          progressText={progressText}
        />

        {scopedItems.length > 0 ? (
          <SegmentedControl
            size="sm"
            options={filterOptions}
            value={filter}
            onValueChange={setFilter}
            testID="ai-archive-filter"
          />
        ) : null}

        {listContent}
      </View>
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  body: { gap: theme.spacing[3] },
  description: { fontSize: theme.fontSize.sm, color: theme.colors.foregroundMuted },
  toolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  hostSlot: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 120,
    alignItems: "flex-start",
  },
  singleHostPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  singleHostLabel: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foreground,
    flexShrink: 1,
  },
  hostChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  progressBlock: {
    gap: theme.spacing[1.5],
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  progressText: {
    flex: 1,
    minWidth: 0,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  progressTrack: {
    height: 3,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: theme.colors.accent,
  },
  list: {
    gap: theme.spacing[2],
  },
  emptyFilter: {
    paddingVertical: theme.spacing[4],
    textAlign: "center",
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  actions: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  actionSpacer: {
    flex: 1,
  },
}));
