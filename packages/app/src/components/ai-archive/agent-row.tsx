import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import {
  Archive,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  RefreshCcw,
} from "@/components/icons/app-icons";
import { useProviderIcon, type ProviderIconComponent } from "@/components/provider-icons";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { StatusBadge, type StatusBadgeVariant } from "@/components/ui/status-badge";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useCompactTimeAgo } from "@/hooks/use-time-ago";
import { formatErrorMessage } from "@/utils/error-messages";
import type { Theme } from "@/styles/theme";
import { deriveLiveRiskFlags, type ArchiveRowItem, type ReviewPhase } from "./types";

const REASON_KEYS = new Set([
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

function ProviderIconGlyph({
  Icon,
  color,
  size,
}: {
  Icon: ProviderIconComponent;
  color?: string;
  size?: number;
}) {
  return <Icon size={size ?? 14} color={color ?? "#888"} />;
}

const ThemedProviderIcon = withUnistyles(ProviderIconGlyph, (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
  size: theme.iconSize.sm,
}));

const ThemedBadgeSpinner = withUnistyles(LoadingSpinner, (theme: Theme) => ({
  color: theme.colors.statusRunning,
}));
const BADGE_SPINNER = <ThemedBadgeSpinner size={12} />;

function AgentRelativeTime({ date }: { date: Date }) {
  const label = useCompactTimeAgo(date);
  return <Text style={[styles.metaText, styles.metaNoShrink]}>{label}</Text>;
}

function resolveBadge(
  item: ArchiveRowItem,
  t: TFunction,
): { label: string; variant: StatusBadgeVariant; spinner: boolean } {
  const { phase, review } = item.entry;
  if (phase !== "idle") {
    return {
      label: t(`aiArchive.phase.${phase}`),
      variant: phaseBadgeVariant(phase, review?.decision, review?.reason),
      spinner: phase === "reviewing" || phase === "archiving",
    };
  }
  const flags = deriveLiveRiskFlags(item.agent, item.meta);
  if (flags.needsPermission) {
    return { label: t("aiArchive.liveStatus.permission"), variant: "warning", spinner: false };
  }
  if (flags.hasError) {
    return { label: t("aiArchive.liveStatus.error"), variant: "error", spinner: false };
  }
  if (item.agent.status === "initializing") {
    return { label: t("aiArchive.liveStatus.starting"), variant: "running", spinner: false };
  }
  if (flags.isRunning) {
    return { label: t("aiArchive.liveStatus.running"), variant: "running", spinner: false };
  }
  if (flags.hasBackgroundWork) {
    return { label: t("aiArchive.liveStatus.backgroundWork"), variant: "warning", spinner: false };
  }
  if (flags.hasChildren) {
    return { label: t("aiArchive.liveStatus.subagents"), variant: "warning", spinner: false };
  }
  if (item.agent.status === "closed") {
    return { label: t("aiArchive.liveStatus.closed"), variant: "muted", spinner: false };
  }
  return { label: t("aiArchive.liveStatus.idle"), variant: "muted", spinner: false };
}

function phaseBadgeVariant(
  phase: ReviewPhase,
  decision: string | undefined,
  reason: string | undefined,
): StatusBadgeVariant {
  if (phase === "failed") return "error";
  if (phase === "ready" || phase === "archived") return "success";
  if (phase === "reviewing" || phase === "archiving") return "running";
  if (
    phase === "kept" &&
    (decision === "needs_user" || reason === "permission" || reason === "error")
  ) {
    return "warning";
  }
  return "muted";
}

function formatWorkspaceLocation(item: ArchiveRowItem): string {
  const placement = item.agent.projectPlacement;
  if (placement) {
    const project = placement.projectName;
    const workspace = placement.workspaceName;
    const branch = placement.checkout.currentBranch;
    const base = workspace && workspace !== project ? `${project} / ${workspace}` : project;
    return branch ? `${base} (${branch})` : base;
  }
  const cwd = item.agent.cwd;
  const segments = cwd.split(/[\\/]/).filter(Boolean);
  return segments.length > 2 ? segments.slice(-2).join("/") : cwd;
}

function formatProvenance(item: ArchiveRowItem, t: TFunction): string | null {
  const { entry } = item;
  if (entry.phase === "archived" && entry.archivedBy === "manual") {
    return t("aiArchive.provenance.manual");
  }
  const review = entry.review;
  if (!review) return null;
  const seconds =
    typeof review.durationMs === "number" ? (review.durationMs / 1000).toFixed(1) : null;
  if (review.provider || review.model) {
    const model =
      review.provider && review.model
        ? `${review.provider} / ${review.model}`
        : (review.model ?? review.provider ?? "");
    return seconds
      ? t("aiArchive.provenance.aiWithDuration", { model, seconds })
      : t("aiArchive.provenance.ai", { model });
  }
  if (review.decision === "blocked") {
    return seconds
      ? t("aiArchive.provenance.precheckWithDuration", { seconds })
      : t("aiArchive.provenance.precheck");
  }
  return null;
}

function resolveReviewReasonText(item: ArchiveRowItem, t: TFunction): string | null {
  const { phase, reason, archivedBy } = item.entry;
  if (phase === "archived" && archivedBy === "manual" && !reason) {
    return t("aiArchive.archivedManual");
  }
  if (!reason) return null;
  if (phase !== "failed" && REASON_KEYS.has(reason)) {
    return t(`aiArchive.reason.${reason}`);
  }
  return phase === "failed" ? formatErrorMessage(reason) : reason;
}

function resolveWorkspaceOutcomeNote(
  item: ArchiveRowItem,
  t: TFunction,
): { text: string; variant: "muted" | "warning" | "error" } | null {
  if (item.entry.phase !== "archived") return null;
  switch (item.entry.workspaceOutcome) {
    case "archived":
      return { text: t("aiArchive.workspaceOutcome.archived"), variant: "muted" };
    case "kept_dirty_worktree":
      return { text: t("aiArchive.workspaceOutcome.keptDirtyWorktree"), variant: "warning" };
    case "kept_running_scripts":
      return { text: t("aiArchive.workspaceOutcome.keptRunningScripts"), variant: "warning" };
    case "kept_terminals":
      return { text: t("aiArchive.workspaceOutcome.keptTerminals"), variant: "warning" };
    case "failed":
      return { text: t("aiArchive.workspaceOutcome.failed"), variant: "error" };
    default:
      return null;
  }
}

function resolveWorkspaceOutcomeStyle(variant: "muted" | "warning" | "error") {
  if (variant === "error") return styles.errorNote;
  if (variant === "warning") return styles.warningNote;
  return styles.provenance;
}

function LiveConditionNotes({ item }: { item: ArchiveRowItem }) {
  const { t } = useTranslation();
  const pendingCount = item.agent.pendingPermissionCount ?? 0;
  const bgCount = item.agent.backgroundWork?.count ?? 0;
  const childCount = item.meta.childCount;
  const errorText = item.meta.lastError?.trim() || null;

  if (!pendingCount && !bgCount && !childCount && !errorText) {
    return null;
  }

  return (
    <View style={styles.liveNotes}>
      {pendingCount > 0 ? (
        <Text style={styles.warningNote}>
          {t("aiArchive.liveMeta.permissions", { count: pendingCount })}
        </Text>
      ) : null}
      {bgCount > 0 ? (
        <Text style={styles.warningNote}>
          {t("aiArchive.liveMeta.backgroundWork", { count: bgCount })}
        </Text>
      ) : null}
      {childCount > 0 ? (
        <Text style={styles.warningNote}>
          {t("aiArchive.liveMeta.subagents", { count: childCount })}
        </Text>
      ) : null}
      {errorText ? (
        <Text style={styles.errorNote} numberOfLines={2}>
          {formatErrorMessage(errorText)}
        </Text>
      ) : null}
    </View>
  );
}

function ConversationPreviewBox({
  latestUserMessage,
  latestReply,
}: {
  latestUserMessage?: string;
  latestReply?: string;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.previewBox}>
      {latestUserMessage ? (
        <View style={styles.previewSection}>
          <Text style={styles.previewLabel}>{t("aiArchive.latestRequest")}</Text>
          <Text style={styles.previewBody} numberOfLines={3}>
            {latestUserMessage}
          </Text>
        </View>
      ) : null}
      {latestReply ? (
        <View style={styles.previewSection}>
          <Text style={styles.previewLabel}>{t("aiArchive.latestReply")}</Text>
          <Text style={styles.previewBody} numberOfLines={4}>
            {latestReply}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function AgentRowMetaLine({
  item,
  showHostLabel,
  compactDesktop = false,
}: {
  item: ArchiveRowItem;
  showHostLabel: boolean;
  compactDesktop?: boolean;
}) {
  const locationText = useMemo(() => formatWorkspaceLocation(item), [item]);
  const modelLabel = item.meta.model
    ? `${item.agent.provider} · ${item.meta.model}`
    : item.agent.provider;

  return (
    <View style={compactDesktop ? styles.metaLineDesktop : styles.metaLine}>
      {showHostLabel ? (
        <>
          <Text style={styles.metaStrong} numberOfLines={1}>
            {item.agent.serverLabel}
          </Text>
          <Text style={styles.metaDot}>·</Text>
        </>
      ) : null}
      <Text style={[styles.metaText, styles.metaEllipsis]} numberOfLines={1}>
        {locationText}
      </Text>
      <Text style={styles.metaDot}>·</Text>
      <Text style={[styles.metaText, styles.metaEllipsis]} numberOfLines={1}>
        {modelLabel}
      </Text>
      <Text style={styles.metaDot}>·</Text>
      <AgentRelativeTime date={item.agent.lastActivityAt} />
    </View>
  );
}

function AgentRowActions({
  item,
  hasPreview,
  detailsOpen,
  hostBusy,
  canCheckAi,
  canArchive,
  inline = false,
  onToggleDetails,
  onOpen,
  onCheck,
  onArchive,
}: {
  item: ArchiveRowItem;
  hasPreview: boolean;
  detailsOpen: boolean;
  hostBusy: boolean;
  canCheckAi: boolean;
  canArchive: boolean;
  inline?: boolean;
  onToggleDetails: () => void;
  onOpen: () => void;
  onCheck: () => void;
  onArchive: () => void;
}) {
  const { t } = useTranslation();
  const isArchived = item.entry.phase === "archived";
  const isRowWorking =
    item.entry.phase === "reviewing" ||
    item.entry.phase === "archiving" ||
    item.entry.phase === "pending";
  const hasCheckedOnce = item.entry.phase !== "idle";

  return (
    <View style={inline ? styles.rowActionsInline : styles.rowActions}>
      {hasPreview ? (
        <Button
          variant="ghost"
          size="sm"
          leftIcon={detailsOpen ? ChevronUp : ChevronDown}
          onPress={onToggleDetails}
          testID={`ai-archive-details-toggle-${item.agent.id}`}
        >
          {t(detailsOpen ? "aiArchive.hideDetails" : "aiArchive.showDetails")}
        </Button>
      ) : null}
      {!inline ? <View style={styles.actionSpacer} /> : null}
      <Button
        variant="ghost"
        size="sm"
        leftIcon={ExternalLink}
        onPress={onOpen}
        testID={`ai-archive-open-${item.agent.id}`}
      >
        {t("aiArchive.openAgent")}
      </Button>
      {!isArchived ? (
        <>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={RefreshCcw}
            disabled={hostBusy || isRowWorking || !canCheckAi}
            onPress={onCheck}
            testID={`ai-archive-check-${item.agent.id}`}
          >
            {t(hasCheckedOnce ? "aiArchive.recheckOne" : "aiArchive.checkOne")}
          </Button>
          <Button
            variant={item.entry.phase === "ready" ? "secondary" : "outline"}
            size="sm"
            leftIcon={Archive}
            loading={item.entry.phase === "archiving"}
            disabled={hostBusy || isRowWorking || !canArchive}
            onPress={onArchive}
            testID={`ai-archive-manual-${item.agent.id}`}
          >
            {t("aiArchive.archiveOne")}
          </Button>
        </>
      ) : null}
    </View>
  );
}

export interface AgentArchiveRowProps {
  item: ArchiveRowItem;
  showHostLabel: boolean;
  hostBusy: boolean;
  canCheckAi: boolean;
  canArchive: boolean;
  onCheck: (item: ArchiveRowItem) => void;
  onArchive: (item: ArchiveRowItem) => void;
  onOpen: (item: ArchiveRowItem) => void;
}

export function AgentArchiveRow({
  item,
  showHostLabel,
  hostBusy,
  canCheckAi,
  canArchive,
  onCheck,
  onArchive,
  onOpen,
}: AgentArchiveRowProps) {
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const ProviderIcon = useProviderIcon(item.agent.provider, item.agent.serverId);

  const badge = resolveBadge(item, t);
  const reasonText = resolveReviewReasonText(item, t);
  const provenanceText = formatProvenance(item, t);
  const workspaceOutcomeNote = resolveWorkspaceOutcomeNote(item, t);
  const hasPreview = Boolean(
    item.entry.review?.latestUserMessage || item.entry.review?.latestReply,
  );
  const isArchived = item.entry.phase === "archived";

  const handleOpen = useCallback(() => onOpen(item), [item, onOpen]);
  const handleCheck = useCallback(() => onCheck(item), [item, onCheck]);
  const handleArchive = useCallback(() => onArchive(item), [item, onArchive]);
  const toggleDetails = useCallback(() => setDetailsOpen((open) => !open), []);

  const badgeNode = (
    <StatusBadge
      label={badge.label}
      variant={badge.variant}
      leading={badge.spinner ? BADGE_SPINNER : undefined}
    />
  );

  const detailsNode = (
    <>
      {!isArchived ? <LiveConditionNotes item={item} /> : null}

      {reasonText ? (
        <Text style={item.entry.phase === "failed" ? styles.errorReason : styles.reason}>
          {reasonText}
        </Text>
      ) : null}

      {workspaceOutcomeNote ? (
        <Text
          style={resolveWorkspaceOutcomeStyle(workspaceOutcomeNote.variant)}
          testID={`ai-archive-workspace-outcome-${item.agent.id}`}
        >
          {workspaceOutcomeNote.text}
        </Text>
      ) : null}

      {provenanceText ? <Text style={styles.provenance}>{provenanceText}</Text> : null}

      {detailsOpen && hasPreview ? (
        <ConversationPreviewBox
          latestUserMessage={item.entry.review?.latestUserMessage}
          latestReply={item.entry.review?.latestReply}
        />
      ) : null}
    </>
  );

  if (!isCompact) {
    return (
      <View style={[styles.row, styles.rowDesktop]} testID={`ai-archive-row-${item.agent.id}`}>
        <View style={styles.desktopMainRow}>
          <View style={styles.desktopInfo}>
            <View style={styles.titleWrap}>
              <ThemedProviderIcon Icon={ProviderIcon} />
              <Text style={styles.title} numberOfLines={1}>
                {item.agent.title || item.agent.id}
              </Text>
            </View>
            <AgentRowMetaLine item={item} showHostLabel={showHostLabel} compactDesktop />
          </View>
          <View style={styles.desktopTrailing}>
            {badgeNode}
            <AgentRowActions
              item={item}
              hasPreview={hasPreview}
              detailsOpen={detailsOpen}
              hostBusy={hostBusy}
              canCheckAi={canCheckAi}
              canArchive={canArchive}
              inline
              onToggleDetails={toggleDetails}
              onOpen={handleOpen}
              onCheck={handleCheck}
              onArchive={handleArchive}
            />
          </View>
        </View>
        {detailsNode}
      </View>
    );
  }

  return (
    <View style={styles.row} testID={`ai-archive-row-${item.agent.id}`}>
      <View style={styles.rowHeader}>
        <View style={styles.titleWrap}>
          <ThemedProviderIcon Icon={ProviderIcon} />
          <Text style={styles.title} numberOfLines={2}>
            {item.agent.title || item.agent.id}
          </Text>
        </View>
        {badgeNode}
      </View>

      <AgentRowMetaLine item={item} showHostLabel={showHostLabel} />

      {detailsNode}

      <AgentRowActions
        item={item}
        hasPreview={hasPreview}
        detailsOpen={detailsOpen}
        hostBusy={hostBusy}
        canCheckAi={canCheckAi}
        canArchive={canArchive}
        onToggleDetails={toggleDetails}
        onOpen={handleOpen}
        onCheck={handleCheck}
        onArchive={handleArchive}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    backgroundColor: theme.colors.surface1,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  rowDesktop: {
    gap: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[3.5],
    paddingVertical: theme.spacing[2],
  },
  desktopMainRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  desktopInfo: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[0.5],
  },
  desktopTrailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flexShrink: 0,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foreground,
  },
  metaLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing[1.5],
  },
  metaLineDesktop: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    gap: theme.spacing[1.5],
    minWidth: 0,
  },
  metaStrong: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foregroundMuted,
    flexShrink: 0,
  },
  metaText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    flexShrink: 1,
  },
  metaEllipsis: {
    minWidth: 0,
  },
  metaNoShrink: {
    flexShrink: 0,
  },
  metaDot: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    flexShrink: 0,
  },
  liveNotes: {
    gap: theme.spacing[1],
  },
  warningNote: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.statusWarning,
  },
  errorNote: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.statusDanger,
  },
  reason: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
  },
  errorReason: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.statusDanger,
  },
  provenance: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  previewBox: {
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
  },
  previewSection: {
    gap: theme.spacing[0.5],
  },
  previewLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foregroundMuted,
  },
  previewBody: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
  },
  rowActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing[1.5],
    paddingTop: theme.spacing[1],
  },
  rowActionsInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flexShrink: 0,
  },
  actionSpacer: {
    flex: 1,
  },
}));
