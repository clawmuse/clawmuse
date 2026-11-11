import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import type { AgentArchiveReview } from "@getpaseo/protocol/messages";
import { Archive } from "@/components/icons/app-icons";
import { AdaptiveModalSheet } from "@/components/adaptive-modal-sheet";
import { SidebarNavIconButton } from "@/components/sidebar/sidebar-nav-icon-button";
import { HeaderToggleButton } from "@/components/headers/header-toggle-button";
import { DensityIcon } from "@/components/ui/density-icon";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAggregatedAgents, type AggregatedAgent } from "@/hooks/use-aggregated-agents";
import { applyArchivedAgentCloseResults } from "@/hooks/use-archive-agent";
import { useSessionStore } from "@/stores/session-store";

type Phase = "pending" | "reviewing" | "ready" | "kept" | "archiving" | "archived" | "failed";
interface ReviewRow {
  agent: AggregatedAgent;
  phase: Phase;
  review?: AgentArchiveReview;
  reason?: string;
}

const keyOf = (agent: AggregatedAgent) => `${agent.serverId}:${agent.id}`;
const reasonKeys = new Set([
  "active",
  "permission",
  "awaiting_reply",
  "error",
  "missing_context",
  "children",
  "background_work",
  "missing_evidence",
  "changed",
  "needs_user",
  "unfinished",
]);

const NO_SHORTCUTS: [] = [];

export function AiAgentArchiveButton({ variant = "sidebar" }: { variant?: "sidebar" | "header" }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const openSheet = useCallback(() => setOpen(true), []);
  const closeSheet = useCallback(() => setOpen(false), []);
  return (
    <>
      {variant === "header" ? (
        <HeaderToggleButton
          onPress={openSheet}
          tooltipLabel={t("aiArchive.title")}
          tooltipKeys={NO_SHORTCUTS}
          tooltipSide="bottom"
          accessibilityLabel={t("aiArchive.title")}
          testID="mobile-home-ai-archive"
        >
          <DensityIcon icon={Archive} size="lg" color="foreground" />
        </HeaderToggleButton>
      ) : (
        <SidebarNavIconButton
          icon={Archive}
          label={t("aiArchive.title")}
          onPress={openSheet}
          testID="sidebar-ai-archive"
        />
      )}
      {open ? <AiAgentArchiveSheet onClose={closeSheet} /> : null}
    </>
  );
}

export function AiAgentArchiveSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { agents, isInitialLoad } = useAggregatedAgents();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const stopped = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const update = useCallback((agent: AggregatedAgent, patch: Partial<ReviewRow>) => {
    if (!mounted.current) return;
    setRows((previous) =>
      previous.map((row) => (keyOf(row.agent) === keyOf(agent) ? { ...row, ...patch } : row)),
    );
  }, []);

  const requireClient = useCallback(
    (agent: AggregatedAgent) => {
      const session = useSessionStore.getState().sessions[agent.serverId];
      if (!session?.client || !session.client.isConnected) throw new Error(t("aiArchive.offline"));
      // COMPAT(aiAgentArchive): added in v1.5.8; remove after 2027-05-11 once host floor supports AI archive.
      if (!session.serverInfo?.features?.aiAgentArchive) throw new Error(t("aiArchive.updateHost"));
      if (!session.serverInfo.permissions?.includes("workspace.write"))
        throw new Error(t("aiArchive.noPermission"));
      return session.client;
    },
    [t],
  );

  const archive = useCallback(
    async (row: ReviewRow) => {
      if (!row.review?.eligible || !row.review.token || !mounted.current || stopped.current) return;
      const { agent } = row;
      update(agent, { phase: "archiving" });
      const result = await requireClient(agent).applyAgentArchive(agent.id, row.review.token);
      applyArchivedAgentCloseResults({
        queryClient,
        serverId: agent.serverId,
        results: [{ agentId: agent.id, archivedAt: result.archivedAt }],
      });
      update(agent, { phase: "archived" });
    },
    [queryClient, requireClient, update],
  );

  const run = useCallback(
    async (autoArchive: boolean) => {
      if (running.current) return;
      running.current = true;
      setBusy(true);
      const applyReviewed = autoArchive && rows.some((row) => row.phase === "ready");
      const work: ReviewRow[] = applyReviewed
        ? rows.filter((row) => row.phase === "ready")
        : agents.map((agent) => ({ agent, phase: "pending" }));
      if (!applyReviewed) setRows(work);
      try {
        // One host/model operation at a time keeps a large list from spawning a fleet.
        for (const row of work) {
          if (!mounted.current || stopped.current) break;
          try {
            if (applyReviewed) {
              await archive(row);
              continue;
            }
            update(row.agent, { phase: "reviewing" });
            const review = await requireClient(row.agent).reviewAgentArchive(row.agent.id);
            const reviewed: ReviewRow = {
              ...row,
              review,
              phase: review.eligible ? "ready" : "kept",
              reason: review.reason,
            };
            update(row.agent, reviewed);
            if (autoArchive && review.eligible) await archive(reviewed);
          } catch (error) {
            update(row.agent, {
              phase: "failed",
              review: undefined,
              reason: error instanceof Error ? error.message : t("aiArchive.failed"),
            });
          }
        }
      } finally {
        running.current = false;
        if (mounted.current) setBusy(false);
      }
    },
    [agents, archive, requireClient, rows, t, update],
  );

  const readyCount = rows.filter((row) => row.phase === "ready").length;
  const archivedCount = rows.filter((row) => row.phase === "archived").length;
  const settledCount = rows.filter(
    (row) => !["pending", "reviewing", "archiving"].includes(row.phase),
  ).length;
  const close = useCallback(() => {
    stopped.current = true;
    onClose();
  }, [onClose]);
  const scan = useCallback(() => {
    void run(false);
  }, [run]);
  const autoArchive = useCallback(() => {
    void run(true);
  }, [run]);
  const header = useMemo(() => ({ title: t("aiArchive.title") }), [t]);
  const footer = useMemo(
    () => (
      <View style={styles.actions}>
        {busy ? (
          <Button variant="ghost" onPress={close} testID="ai-archive-stop">
            {t("aiArchive.stop")}
          </Button>
        ) : null}
        <Button
          variant="outline"
          disabled={busy || isInitialLoad || agents.length === 0}
          onPress={scan}
          testID="ai-archive-scan"
        >
          {t("aiArchive.scan")}
        </Button>
        <Button
          loading={busy}
          disabled={busy || isInitialLoad || (rows.length ? readyCount === 0 : agents.length === 0)}
          onPress={autoArchive}
          testID="ai-archive-auto"
        >
          {readyCount ? t("aiArchive.archiveReady", { count: readyCount }) : t("aiArchive.auto")}
        </Button>
      </View>
    ),
    [agents.length, autoArchive, busy, close, isInitialLoad, readyCount, rows.length, scan, t],
  );
  let progress = t("aiArchive.empty");
  if (isInitialLoad) progress = t("aiArchive.loading");
  else if (agents.length) progress = t("aiArchive.count", { count: agents.length });
  if (rows.length)
    progress = t("aiArchive.summary", {
      ready: readyCount,
      archived: archivedCount,
      kept: rows.length - readyCount - archivedCount,
    });
  if (busy) progress = t("aiArchive.progress", { done: settledCount, total: rows.length });
  return (
    <AdaptiveModalSheet
      visible
      onClose={close}
      header={header}
      testID="ai-archive-sheet"
      desktopMaxWidth={600}
      footer={footer}
    >
      <View style={styles.body}>
        <Text style={styles.description}>{t("aiArchive.description")}</Text>
        <Text
          style={styles.description}
          accessibilityLiveRegion="polite"
          testID="ai-archive-progress"
        >
          {progress}
        </Text>
        {rows.map((row) => (
          <View key={keyOf(row.agent)} style={styles.row} testID={`ai-archive-row-${row.agent.id}`}>
            <View style={styles.rowHeader}>
              <Text style={styles.title} numberOfLines={2}>
                {row.agent.title || row.agent.id}
              </Text>
              <StatusBadge
                label={t(`aiArchive.phase.${row.phase}`)}
                variant={badgeVariant(row.phase)}
              />
            </View>
            <Text style={styles.host}>{row.agent.serverLabel}</Text>
            {row.reason ? (
              <Text style={styles.reason}>
                {row.phase !== "failed" && reasonKeys.has(row.reason)
                  ? t(`aiArchive.reason.${row.reason}`)
                  : row.reason}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </AdaptiveModalSheet>
  );
}

function badgeVariant(phase: Phase) {
  if (phase === "failed") return "error";
  if (phase === "ready" || phase === "archived") return "success";
  return "muted";
}

const styles = StyleSheet.create((theme) => ({
  body: { gap: theme.spacing[4] },
  description: { fontSize: theme.fontSize.sm, color: theme.colors.foregroundMuted },
  row: {
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: theme.spacing[3] },
  title: { flex: 1, minWidth: 0, fontSize: theme.fontSize.base, color: theme.colors.foreground },
  host: { fontSize: theme.fontSize.sm, color: theme.colors.foregroundMuted },
  reason: { fontSize: theme.fontSize.sm, color: theme.colors.foreground },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: theme.spacing[3],
    padding: theme.spacing[4],
  },
}));
