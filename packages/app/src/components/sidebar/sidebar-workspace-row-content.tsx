import { memo, useMemo, useCallback, useState, type ReactNode } from "react";
import { Text, View, type GestureResponderEvent, type ViewStyle } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useReducedMotion } from "react-native-reanimated";
import { Archive, CircleAlert, Folder, FolderGit2, Monitor } from "@/components/icons/app-icons";
import { Button } from "@/components/ui/button";
import { buttonControlHeight } from "@/components/ui/control-geometry";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ProjectStatusIndicator } from "@/components/sidebar/project-leading-visual";
import type { SidebarSurfaceBackdrop } from "@/styles/surface-backdrop";
import {
  WorkspaceMetaRow,
  type WorkspaceServiceSummary,
} from "@/components/sidebar/workspace-meta-row";
import { WorkspaceHoverCard } from "@/components/workspace-hover-card";
import type { HostBadgeModel } from "@/hosts/appearance";
import type { SidebarWorkspaceEntry } from "@/hooks/use-sidebar-workspaces-list";
import {
  hasSidebarWorkspaceTrailing,
  type SidebarWorkspaceTrailing,
} from "@/components/sidebar/workspace-trailing";
import { isWeb } from "@/constants/platform";
import { useAppSettings } from "@/hooks/use-settings";
import { densityIconBox } from "@/styles/density";
import { ContentLabel } from "@/components/markdown/content-label";
import type { Theme } from "@/styles/theme";
import type { SidebarStateBucket } from "@/utils/sidebar-agent-state";
import { getStatusDotColor } from "@/utils/status-dot-color";
import {
  STATUS_INDICATOR_ALERT_SIZE,
  STATUS_INDICATOR_DOT_SIZE,
  STATUS_INDICATOR_FILLED_DOT_SIZE,
} from "@/utils/status-indicator-geometry";
import { shouldRenderSyncedStatusLoader } from "@/utils/status-loader";
import { StatusRing } from "@/components/status-ring";
import { resolveSidebarWorkspacePrimaryLabel } from "@/components/sidebar/sidebar-workspace-title";
import { DensityIcon } from "@/components/ui/density-icon";
import { TrailingActionScrim } from "@/components/ui/trailing-action-scrim";
import { useWorkspaceLabelDefinitions } from "@/workspace-labels";
import { SidebarActionsMenuContext } from "@/components/sidebar/use-open-kebab-menu-visibility";

const needsInputColorMapping = (theme: Theme) => ({
  color: theme.colors.surface0,
  fill: getStatusDotColor({ theme, bucket: "needs_input" }) ?? undefined,
});

const ThemedCircleAlert = withUnistyles(CircleAlert);
const ThemedArchive = withUnistyles(Archive);
const archiveIconMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
  size: theme.iconSize.sm,
});
const archiveIcon = <ThemedArchive uniProps={archiveIconMapping} />;

function stopArchivePressPropagation(event: GestureResponderEvent) {
  event.stopPropagation();
}

export function SidebarWorkspaceArchiveButton({
  workspaceKey,
  loading,
  visible,
  label,
  onArchive,
}: {
  workspaceKey: string;
  visible: boolean;
  loading: boolean;
  label: string;
  onArchive: () => void;
}) {
  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      onArchive();
    },
    [onArchive],
  );

  return (
    <Tooltip enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          style={styles.archiveButton}
          leftIcon={archiveIcon}
          disabled={loading || !visible}
          loading={loading}
          accessibilityLabel={label}
          accessibilityElementsHidden={!visible}
          importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
          pointerEvents={visible ? "auto" : "none"}
          onPressIn={stopArchivePressPropagation}
          onPress={handlePress}
          testID={`sidebar-workspace-archive-${workspaceKey}`}
        />
      </TooltipTrigger>
      <TooltipContent>
        <Text style={styles.archiveTooltipText}>{label}</Text>
      </TooltipContent>
    </Tooltip>
  );
}

export function SidebarWorkspaceRowFrame({
  workspace,
  isDragging = false,
  children,
}: {
  workspace: SidebarWorkspaceEntry;
  isDragging?: boolean;
  children: (input: {
    isHovered: boolean;
    contextMenuOpen: boolean;
    onContextMenuOpenChange: (open: boolean) => void;
    hoverHandlers: { onPointerEnter: () => void; onPointerLeave: () => void };
  }) => ReactNode;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const handleActionsMenuOpenChange = useCallback((open: boolean) => {
    setActionsMenuOpen(open);
    // A portal can cover the hovered row before it receives pointerleave.
    setIsHovered(false);
  }, []);
  const handlePointerEnter = useCallback(() => {
    if (!contextMenuOpen) setIsHovered(true);
  }, [contextMenuOpen]);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const handleContextMenuOpenChange = useCallback((open: boolean) => {
    setContextMenuOpen(open);
    if (open) setIsHovered(false);
  }, []);
  const hoverHandlers = useMemo(
    () => ({ onPointerEnter: handlePointerEnter, onPointerLeave: handlePointerLeave }),
    [handlePointerEnter, handlePointerLeave],
  );

  return (
    <WorkspaceHoverCard
      workspace={workspace}
      prHint={workspace.prHint}
      isDragging={isDragging}
      disabled={contextMenuOpen || actionsMenuOpen}
    >
      <SidebarActionsMenuContext.Provider value={handleActionsMenuOpenChange}>
        {children({
          isHovered: isHovered && !contextMenuOpen && !actionsMenuOpen && !isDragging,
          contextMenuOpen,
          onContextMenuOpenChange: handleContextMenuOpenChange,
          hoverHandlers,
        })}
      </SidebarActionsMenuContext.Provider>
    </WorkspaceHoverCard>
  );
}

export const SidebarWorkspaceRowContent = memo(function SidebarWorkspaceRowContent({
  workspace,
  hostBadge,
  leadingProjectName = null,
  leadingProjectIconDataUri = null,
  serviceSummary = null,
  backdrop,
  isLoading,
  shortcutNumber = null,
  showShortcutBadge = false,
  reserveIdleStatusIndicatorSpace = true,
  children,
}: {
  workspace: SidebarWorkspaceEntry;
  hostBadge?: HostBadgeModel | null;
  /** Hoisted rows use their project icon as the leading visual because no project row contains them. */
  leadingProjectName?: string | null;
  leadingProjectIconDataUri?: string | null;
  serviceSummary?: WorkspaceServiceSummary | null;
  /** The row's current background, so the project status badge can knock out of it. */
  backdrop: SidebarSurfaceBackdrop;
  isLoading: boolean;
  shortcutNumber?: number | null;
  showShortcutBadge?: boolean;
  /** Keep the empty leading slot when the workspace has no active status. */
  reserveIdleStatusIndicatorSpace?: boolean;
  children?: ReactNode;
}) {
  const {
    settings: { workspaceTitleSource },
  } = useAppSettings();
  const workspaceLabel = resolveSidebarWorkspacePrimaryLabel({ workspace, workspaceTitleSource });
  // The workspace carries label names; their colors live in its host's catalog, so the row is
  // where the two meet — the meta line is handed finished definitions.
  const labels = useWorkspaceLabelDefinitions(workspace.serverId, workspace.labels);

  return (
    <View style={styles.workspaceRowContent}>
      <View style={styles.workspaceRowMain}>
        {leadingProjectName ? (
          <ProjectStatusIndicator
            twoLine
            iconDataUri={leadingProjectIconDataUri}
            displayName={leadingProjectName}
            projectViewKey={workspace.projectViewKey}
            statusBucket={workspace.statusBucket}
            backdrop={backdrop}
            loading={isLoading}
            testID={`sidebar-row-project-icon-${workspace.workspaceKey}`}
          />
        ) : (
          <WorkspaceStatusIndicator
            bucket={workspace.statusBucket}
            workspaceKind={workspace.workspaceKind}
            loading={isLoading}
            reserveIdleSpace={reserveIdleStatusIndicatorSpace}
          />
        )}
        <View
          style={styles.workspaceContentColumn}
          testID={`sidebar-workspace-text-${workspace.workspaceKey}`}
        >
          <View style={styles.workspaceTitleRow}>
            <ContentLabel text={workspaceLabel} />
            <View style={sidebarWorkspaceRowStyles.rowRight}>{children}</View>
          </View>
          <WorkspaceMetaRow
            currentBranch={workspace.currentBranch}
            projectName={leadingProjectName}
            hostBadge={hostBadge ?? null}
            prHint={workspace.prHint}
            serviceSummary={serviceSummary}
            labels={labels}
          />
        </View>
      </View>
      {showShortcutBadge && shortcutNumber !== null ? (
        <View style={styles.shortcutBadgeOverlay} pointerEvents="none">
          <SidebarWorkspaceShortcutBadge number={shortcutNumber} />
        </View>
      ) : null}
    </View>
  );
});

function WorkspaceStatusIndicator({
  bucket,
  workspaceKind,
  loading = false,
  reserveIdleSpace = true,
}: {
  bucket: SidebarWorkspaceEntry["statusBucket"];
  workspaceKind: SidebarWorkspaceEntry["workspaceKind"];
  loading?: boolean;
  reserveIdleSpace?: boolean;
}) {
  // Busy is the only status that moves, and it is the ring rather than a dot for the same
  // reason it is a dot elsewhere: every status in the sidebar sits in this one slot, so busy
  // has to fill it without displacing anything. A row starting up and a row working are both
  // busy, so they share the ring and differ only in testID.
  if (loading) {
    return (
      <View style={styles.workspaceStatusDot} testID="workspace-status-indicator-loading">
        <StatusRing />
      </View>
    );
  }

  if (shouldRenderSyncedStatusLoader({ bucket })) {
    return (
      <View style={styles.workspaceStatusDot} testID="workspace-status-indicator-running">
        <StatusRing />
      </View>
    );
  }

  if (bucket === "needs_input") {
    return (
      <View style={styles.workspaceStatusDot} testID="workspace-status-indicator-needs_input">
        <ThemedCircleAlert size={STATUS_INDICATOR_ALERT_SIZE} uniProps={needsInputColorMapping} />
      </View>
    );
  }

  if (bucket === "attention") {
    return (
      <View style={styles.workspaceStatusDot} testID="workspace-status-indicator-attention">
        <View style={styles.standaloneStatusDot} />
      </View>
    );
  }

  if (bucket === "done") {
    // An idle row still gets a dot rather than an empty slot. Nested rows are marked as
    // workspaces by indentation alone, and with nothing in the leading slot the rail has no
    // edge to read against — a workspace carrying its own glyph starts looking like a project
    // header. The dot is muted to half opacity so it holds the rail without reporting status.
    return reserveIdleSpace ? (
      <View style={styles.workspaceStatusDot} testID="workspace-status-indicator-done">
        <View style={styles.idleStatusDot} />
      </View>
    ) : null;
  }

  let KindIcon: typeof Monitor;
  if (workspaceKind === "local_checkout") KindIcon = Monitor;
  else if (workspaceKind === "worktree") KindIcon = FolderGit2;
  else KindIcon = Folder;

  const dotColorStyle = getStatusDotColorStyle(bucket);
  return (
    <View style={styles.workspaceStatusDot} testID={`workspace-status-indicator-${bucket}`}>
      <DensityIcon icon={KindIcon} size="sm" color="foregroundMuted" />
      {dotColorStyle ? <StatusDotOverlay dotColorStyle={dotColorStyle} /> : null}
    </View>
  );
}

function StatusDotOverlay({ dotColorStyle }: { dotColorStyle: ViewStyle }) {
  return <View style={[styles.statusDotOverlay, dotColorStyle]} />;
}

function getStatusDotColorStyle(bucket: SidebarStateBucket) {
  switch (bucket) {
    case "needs_input":
      return styles.statusDotNeedsInput;
    case "failed":
      return styles.statusDotFailed;
    case "running":
      return styles.statusDotRunning;
    case "attention":
      return styles.statusDotAttention;
    case "done":
      return null;
  }
}

export const sidebarWorkspaceRowStyles = StyleSheet.create((theme) => ({
  // How far a workspace row sits inside the group header above it — a project row or a
  // status group header. Both groupings share this one indent, so every grouped workspace row
  // in the sidebar sits on the same rail regardless of how the list is grouped. Pinned rows
  // are not grouped and stay flush.
  //
  // It is row padding rather than a margin on the list, because the row's hover and selected
  // backgrounds have to keep spanning the group's full width. Indenting the container instead
  // pulls the highlight in with the content and the row stops lining up with its header.
  rowIndented: {
    paddingLeft: theme.spacing[2] + theme.spacing[2],
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
  },
  shortcutBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: theme.spacing[1],
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.surface2,
    backgroundColor: theme.colors.surface0,
    flexShrink: 0,
  },
  shortcutBadgeText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    lineHeight: 14,
  },
  hidden: { opacity: 0 },
  replaced: { opacity: 0, position: "absolute", right: 0, top: 0 },
  fade: isWeb
    ? {
        transitionProperty: "opacity",
        transitionDuration: "120ms",
        transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
      }
    : {},
  reducedMotion: isWeb ? { transitionDuration: "0ms" } : {},
  // Stays position:relative at zero width so the absolutely-positioned kebab keeps
  // anchoring to the same right edge whether or not the slot holds anything.
  trailingActionSlot: {
    position: "relative",
    minHeight: 20,
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "flex-start",
  },
  trailingActionSlotReserved: {
    position: "relative",
    minWidth: 18,
    marginLeft: theme.spacing[2],
    minHeight: 20,
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "flex-start",
  },
  trailingActionOverlay: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minHeight: 20,
  },
  trailingActionScrim: {
    ...StyleSheet.absoluteFillObject,
    // The gradient sits behind the action group while metadata crossfades out.
    overflow: "hidden",
  },
}));

export function SidebarWorkspaceShortcutBadge({ number }: { number: number }) {
  return (
    <View style={sidebarWorkspaceRowStyles.shortcutBadge}>
      <Text style={sidebarWorkspaceRowStyles.shortcutBadgeText}>{number}</Text>
    </View>
  );
}

export type SidebarWorkspaceTrailingPresentation = "visible" | "hidden" | "replaced" | "absent";

/**
 * What the trailing slot shows for a row. Derived in one place because three row renderers
 * share it: the two project-mode rows and the status-mode row. The rule used to be copied
 * into each of them and immediately drifted — one call site kept hiding the diff after the
 * others stopped.
 *
 * Metadata and actions share the row's right edge. Only the visible group takes layout
 * space; the other stays mounted for its fade and for controlled menus.
 */
export function resolveTrailingActionVisibility({
  workspace,
  trailing,
  hasArchiveAction,
  isHovered,
  isTouchPlatform,
  showShortcut,
}: {
  workspace: SidebarWorkspaceEntry;
  trailing: SidebarWorkspaceTrailing;
  hasArchiveAction: boolean;
  isHovered: boolean;
  isTouchPlatform: boolean;
  showShortcut: boolean;
}): {
  trailingPresentation: SidebarWorkspaceTrailingPresentation;
  showKebab: boolean;
  showScrim: boolean;
  renderSlot: boolean;
  reserveSlotWidth: boolean;
} {
  const hasTrailing = hasSidebarWorkspaceTrailing({ workspace, trailing });
  const showKebab = Boolean(hasArchiveAction && (isHovered || isTouchPlatform)) && !showShortcut;
  // Touch permanently replaces the stats with the menu. Only temporary shortcut hints
  // conceal content while retaining its width, so desktop rows do not shift.
  const hasContent = hasTrailing && !(hasArchiveAction && isTouchPlatform);
  let trailingPresentation: SidebarWorkspaceTrailingPresentation = "absent";
  if (hasContent) {
    trailingPresentation = "visible";
    if (showKebab) trailingPresentation = "replaced";
    if (showShortcut) trailingPresentation = "hidden";
  }
  return {
    trailingPresentation,
    showKebab,
    // The scrim paints the row's own hover background, so it can only be drawn on a hovered
    // row — over an unhovered one the gradient fades to the wrong color. That is also why
    // touch, which shows the kebab without ever hovering, never gets one.
    showScrim: showKebab && isHovered,
    renderSlot: hasArchiveAction || hasTrailing,
    reserveSlotWidth: hasContent || showKebab,
  };
}

export function SidebarWorkspaceTrailingActionSlot({
  reserveWidth,
  children,
}: {
  reserveWidth: boolean;
  children: ReactNode;
}) {
  return (
    <View
      style={
        reserveWidth
          ? sidebarWorkspaceRowStyles.trailingActionSlotReserved
          : sidebarWorkspaceRowStyles.trailingActionSlot
      }
    >
      {children}
    </View>
  );
}

export function SidebarWorkspaceTrailingActionBase({
  presentation,
  children,
}: {
  presentation: SidebarWorkspaceTrailingPresentation;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  if (presentation === "absent") return null;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden={presentation !== "visible"}
      importantForAccessibility={presentation === "visible" ? "auto" : "no-hide-descendants"}
      style={[
        sidebarWorkspaceRowStyles.fade,
        reducedMotion && sidebarWorkspaceRowStyles.reducedMotion,
        presentation === "hidden" && sidebarWorkspaceRowStyles.hidden,
        presentation === "replaced" && sidebarWorkspaceRowStyles.replaced,
      ]}
      testID="sidebar-workspace-trailing-metadata"
    >
      {children}
    </View>
  );
}

export function SidebarWorkspaceTrailingActionOverlay({
  visible,
  scrimBackdrop,
  children,
}: {
  visible: boolean;
  /** Fade the row into the kebab when something (the diff stat) is still rendered behind it. */
  scrimBackdrop?: SidebarSurfaceBackdrop;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  if (!children) return null;
  return (
    <View
      style={[
        sidebarWorkspaceRowStyles.trailingActionOverlay,
        sidebarWorkspaceRowStyles.fade,
        reducedMotion && sidebarWorkspaceRowStyles.reducedMotion,
        !visible && sidebarWorkspaceRowStyles.replaced,
      ]}
      pointerEvents={visible ? "auto" : "none"}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
      testID="sidebar-workspace-trailing-actions"
    >
      {scrimBackdrop ? (
        <View
          style={sidebarWorkspaceRowStyles.trailingActionScrim}
          pointerEvents="none"
          testID="sidebar-workspace-trailing-scrim"
        >
          <TrailingActionScrim backdrop={scrimBackdrop} />
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  archiveButton: {
    width: buttonControlHeight.sm,
    paddingHorizontal: 0,
    // Center the larger hit area on the title without increasing the list's row height.
    marginVertical: (Math.round(theme.fontSize.content * 1.6) - buttonControlHeight.sm) / 2,
  },
  archiveTooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  workspaceRowContent: {
    position: "relative",
  },
  workspaceRowMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    width: "100%",
  },
  workspaceContentColumn: {
    flex: 1,
    minWidth: 0,
  },
  workspaceTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  shortcutBadgeOverlay: {
    position: "absolute",
    top: 1,
    right: 0,
  },
  workspaceStatusDot: {
    position: "relative",
    width: densityIconBox("md"),
    height: Math.round(theme.fontSize.content * 1.6),
    borderRadius: theme.borderRadius.full,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  statusDotOverlay: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: STATUS_INDICATOR_DOT_SIZE,
    height: STATUS_INDICATOR_DOT_SIZE,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
  },
  standaloneStatusDot: {
    width: STATUS_INDICATOR_FILLED_DOT_SIZE,
    height: STATUS_INDICATOR_FILLED_DOT_SIZE,
    borderRadius: theme.borderRadius.full,
    backgroundColor: getStatusDotColor({ theme, bucket: "attention" }) ?? undefined,
  },
  idleStatusDot: {
    width: STATUS_INDICATOR_FILLED_DOT_SIZE,
    height: STATUS_INDICATOR_FILLED_DOT_SIZE,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.foregroundExtraMuted,
    opacity: 0.3,
  },
  statusDotNeedsInput: {
    backgroundColor: getStatusDotColor({ theme, bucket: "needs_input" }) ?? undefined,
    borderColor: theme.colors.surface0,
  },
  statusDotFailed: {
    backgroundColor: getStatusDotColor({ theme, bucket: "failed" }) ?? undefined,
    borderColor: theme.colors.surface0,
  },
  statusDotRunning: {
    backgroundColor: getStatusDotColor({ theme, bucket: "running" }) ?? undefined,
    borderColor: theme.colors.surface0,
  },
  statusDotAttention: {
    backgroundColor: getStatusDotColor({ theme, bucket: "attention" }) ?? undefined,
    borderColor: theme.colors.surface0,
  },
}));
