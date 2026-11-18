import { ClawMuseAccountButton } from "@/clawmuse/account-button";
import { SidebarViewSlot } from "@/plugins/sidebar-view";
import { useAddHost } from "@/hosts/add-host";
import {
  ChevronDown,
  ChevronUp,
  CircleGauge,
  FolderPlus,
  GitBranch,
  Server,
  Settings,
  UserRound,
  type LucideIcon,
} from "@/components/icons/app-icons";
import { useTranslation } from "react-i18next";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet as RNStyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from "react-native";
import {
  Gesture,
  type GestureType,
  ScrollView as GHScrollView,
} from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import {
  TitlebarDragRegion,
  WINDOW_CONTENT_DATASET,
} from "@/components/desktop/titlebar-drag-region";
import { SidebarCloseButton } from "@/components/headers/sidebar-close-button";
import {
  resolveDesktopSidebarInsetLeft,
  resolveDesktopSidebarNavScale,
  resolveDesktopSidebarScale,
  resolveDesktopSidebarWidth,
} from "@/components/desktop-sidebar-layout";
import { useTopBand, useWindowLayout, resolveDesktopDivisionLayout } from "@/window-layout";
import {
  SIDEBAR_RESIZE_ACTIVATION_OFFSET,
  SIDEBAR_RESIZE_FAIL_OFFSET,
} from "@/components/sidebar-resize-handle-layout";
import { HostPicker } from "@/components/hosts/host-picker";
import { SidebarDisplayPreferencesMenu } from "@/components/sidebar/display-preferences/menu";
import { SidebarSeparator } from "@/components/sidebar/sidebar-separator";
import { SidebarHostStrip } from "@/components/sidebar/host-strip";
import { SidebarToastRegion } from "@/components/sidebar/sidebar-toast-region";
import { SidebarNavRows } from "@/components/sidebar/sidebar-nav-rows";
import { SidebarFooterIconHighlight } from "@/components/sidebar/sidebar-footer-icon-highlight";
import { SidebarHelpMenu } from "@/components/sidebar/sidebar-help-menu";
import { SidebarFooterOverflowMenu } from "@/components/sidebar/sidebar-footer-overflow-menu";
import {
  resolveSidebarFooterLayout,
  SIDEBAR_FOOTER_ACTIONS,
  type SidebarFooterAction,
} from "@/components/sidebar-footer-layout";
import {
  controlSizingForLayout,
  mapLayout,
  TOOLBAR_CONTROL_SIZES,
} from "@/components/ui/control-geometry";
import { SidebarResizeHandle } from "@/components/sidebar-resize-handle";
import { DensityIcon } from "@/components/ui/density-icon";
import { SidebarSectionHeader } from "@/components/sidebar/sidebar-section-header";
import { Shortcut } from "@/components/ui/shortcut";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HEADER_INNER_HEIGHT, useIsCompactFormFactor } from "@/constants/layout";
import { isNative, isWeb } from "@/constants/platform";
import { useOpenAddProject } from "@/hooks/use-open-add-project";
import { useImportSession } from "@/hooks/use-import-session";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import {
  type SidebarProjectEntry,
  type SidebarWorkspaceEntry,
} from "@/hooks/use-sidebar-workspaces-list";
import { density } from "@/styles/density";
import { SPACING } from "@/styles/theme";
import { useSidebarModel } from "@/components/sidebar/sidebar-model";
import type { PinnedSidebarGroups } from "@/hooks/use-sidebar-pins";
import { RetainedPanelActivity } from "@/components/retained-panel";
import type { SidebarWorkspaceGroup } from "@/components/sidebar/sidebar-labels";
import type { SidebarProjectIconTarget } from "@/utils/sidebar-project-row-model";
import { type SidebarGroupMode, useSidebarViewStore } from "@/stores/sidebar-view-store";
import { useHosts } from "@/runtime/host-runtime";
import { PluginSidebarItem } from "@/plugins/sidebar-items";
import { builtinSidebarNavLabelKey } from "@/sidebar-nav/model";
import { useSidebarNavItems } from "@/sidebar-nav/use-sidebar-nav-items";
import { usePanelStore } from "@/stores/panel-store";
import { useOwnsWindowChromeCorner, WindowChromeSafeArea } from "@/utils/desktop-window";
import { useCloseAgentListGesture } from "@/mobile-panels/gestures";
import { useLeftPanelWidth } from "@/mobile-panels/provider";
import { MobilePanelOverlay } from "@/mobile-panels/presentation";
import { buildSettingsHostSectionRoute } from "@/utils/host-routes";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { openSettingsFromSidebar } from "@/navigation/settings-navigation";
import { UsageSidebarItem, UsageSidebarRoot, useUsageSummary, useOpenSidebarUsage } from "@/usage";
import { SidebarAgentListSkeleton } from "./sidebar-agent-list-skeleton";
import { SidebarCalloutSlot } from "./sidebar-callout-slot";
import { SidebarWorkspaceList } from "./sidebar-workspace-list";
import { NewAgentAction } from "@/components/new-agent-action";
import { COMPACT_FLOATING_ACTION_BUTTON_CLEARANCE } from "@/components/ui/floating-action-button";

type SidebarTheme = ReturnType<typeof useUnistyles>["theme"];

/** The footer icon line's inset; the overflow layout counts it as space the buttons can't use. */
const FOOTER_ROW_PADDING = SPACING[2];

const DEV_BUILD_LABEL = process.env.EXPO_PUBLIC_PASEO_DEV_BUILD_LABEL?.trim() || null;

interface SidebarSharedProps {
  theme: SidebarTheme;
  workspaceGroups: SidebarWorkspaceGroup[];
  projectIconTargets: SidebarProjectIconTarget[];
  pinnedGroups: PinnedSidebarGroups;
  projects: SidebarProjectEntry[];
  hasProjectsBeforeFilter: boolean;
  hasActiveProjectFilter: boolean;
  workspaceEntriesByKey: ReadonlyMap<string, SidebarWorkspaceEntry>;
  isInitialLoad: boolean;
  isRevalidating: boolean;
  isManualRefresh: boolean;
  groupMode: SidebarGroupMode;
  collapsedProjectKeys: ReadonlySet<string>;
  shortcutIndexByWorkspaceKey: Map<string, number>;
  toggleProjectCollapsed: (projectViewKey: string) => void;
  handleRefresh: () => void;
  handleOpenProject: () => void;
  handleImportSession: () => void;
  handleSettings: () => void;
  labels: SidebarLabels;
  handleAddHost: () => void;
  handleOpenHostSettings: (serverId: string) => void;
}

interface SidebarLabels {
  addProject: string;
  hosts: string;
  settings: string;
  searchHosts: string;
  usage: string;
  closeSidebar: string;
}

interface MobileSidebarProps extends SidebarSharedProps {
  active: boolean;
  insetsTop: number;
  insetsBottom: number;
  insetsLeft: number;
  insetsRight: number;
  closeSidebar: () => void;
}

interface DesktopSidebarProps extends SidebarSharedProps {
  insetsTop: number;
  active: boolean;
  overlay: boolean;
}

export const LeftSidebar = memo(function LeftSidebar({
  active,
  desktopOverlay,
}: {
  active: boolean;
  desktopOverlay: boolean;
}) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const isCompactLayout = useIsCompactFormFactor();
  const activeWorkspace = useActiveWorkspaceSelection();
  const showMobileAgent = usePanelStore((state) => state.showMobileAgent);

  const {
    projects,
    hasProjectsBeforeFilter,
    resolvedProjectFilters,
    workspaceEntriesByKey,
    isInitialLoad,
    isRevalidating,
    refreshAll,
    workspaceGroups,
    projectIconTargets,
    pinnedGroups,
    collapsedProjectKeys,
    toggleProjectCollapsed,
    groupMode,
    shortcutModel,
  } = useSidebarModel();
  const { shortcutIndexByWorkspaceKey } = shortcutModel;

  const [isManualRefresh, setIsManualRefresh] = useState(false);

  const handleRefresh = useCallback(() => {
    setIsManualRefresh(true);
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (!isRevalidating && isManualRefresh) {
      setIsManualRefresh(false);
    }
  }, [isRevalidating, isManualRefresh]);

  const openProjectPicker = useOpenAddProject();
  const { open: openImportSession, sheet: importSessionSheet } = useImportSession();

  // Workspace destinations close the overlay; Settings retains it for the return journey.
  const handleOpenProject = useCallback(() => {
    void openProjectPicker();
  }, [openProjectPicker]);

  const handleSettings = useCallback(() => {
    openSettingsFromSidebar({ workspace: activeWorkspace, isCompact: isCompactLayout });
  }, [activeWorkspace, isCompactLayout]);

  const handleAddHost = useAddHost();

  const handleOpenHostSettings = useCallback(
    (serverId: string) => {
      openSettingsFromSidebar({
        workspace: activeWorkspace,
        isCompact: isCompactLayout,
        route: buildSettingsHostSectionRoute(serverId, "host"),
      });
    },
    [activeWorkspace, isCompactLayout],
  );

  const labels = useMemo(
    (): SidebarLabels => ({
      addProject: t("sidebar.actions.addProject"),
      hosts: t("sidebar.actions.hosts"),
      settings: t("sidebar.actions.settings"),
      searchHosts: t("sidebar.host.searchPlaceholder"),
      usage: t(builtinSidebarNavLabelKey("usage")),
      closeSidebar: t("sidebar.actions.closeSidebar"),
    }),
    [t],
  );

  const sharedProps = {
    theme,
    workspaceGroups,
    projectIconTargets,
    pinnedGroups,
    projects,
    hasProjectsBeforeFilter,
    hasActiveProjectFilter: resolvedProjectFilters.length > 0,
    workspaceEntriesByKey,
    isInitialLoad,
    isRevalidating,
    isManualRefresh,
    groupMode,
    collapsedProjectKeys,
    shortcutIndexByWorkspaceKey,
    toggleProjectCollapsed,
    handleRefresh,
    labels,
  };

  const handlers = {
    handleOpenProject,
    handleImportSession: openImportSession,
    handleSettings,
    handleAddHost,
    handleOpenHostSettings,
  };

  return (
    <>
      <RetainedPanelActivity active={active}>
        {isCompactLayout ? (
          <MobileSidebar
            {...sharedProps}
            {...handlers}
            active={active}
            insetsTop={insets.top}
            insetsBottom={insets.bottom}
            insetsLeft={insets.left}
            insetsRight={insets.right}
            closeSidebar={showMobileAgent}
          />
        ) : (
          <DesktopSidebar
            {...sharedProps}
            {...handlers}
            insetsTop={insets.top}
            active={active}
            overlay={desktopOverlay}
          />
        )}
      </RetainedPanelActivity>
      {importSessionSheet}
    </>
  );
});

function sidebarHostOptionTestID(serverId: string): string {
  return `sidebar-host-row-${serverId}`;
}

function FooterIconButton({
  buttonRef,
  onPress,
  testID,
  label,
  icon,
  iconSizeAdjustment = 0,
  shortcutKeys,
}: {
  onPress: () => void;
  testID: string;
  label: string;
  icon: LucideIcon;
  /** Only for a glyph that reads larger than the others at the same size. */
  iconSizeAdjustment?: number;
  shortcutKeys?: ReturnType<typeof useShortcutKeys>;
  buttonRef?: RefObject<View | null>;
}) {
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <Pressable
          ref={buttonRef}
          style={styles.footerIconButton}
          testID={testID}
          nativeID={testID}
          collapsable={false}
          accessible
          accessibilityLabel={label}
          accessibilityRole="button"
          onPress={onPress}
        >
          {({ hovered, pressed }) => (
            <>
              <SidebarFooterIconHighlight visible={pressed} />
              <DensityIcon
                icon={icon}
                size="md"
                sizeAdjustment={iconSizeAdjustment}
                color={hovered ? "foreground" : "foregroundMuted"}
              />
            </>
          )}
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="top" align="center" offset={8} testID={`${testID}-tooltip`}>
        <IconTooltipContent label={label} shortcutKeys={shortcutKeys} />
      </TooltipContent>
    </Tooltip>
  );
}

function SidebarHostPicker({
  label,
  onAddHost,
  onOpenHostSettings,
}: {
  label: string;
  onAddHost: () => void;
  onOpenHostSettings: (serverId: string) => void;
}) {
  const hosts = useHosts();
  const triggerRef = useRef<View | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = useCallback(
    (id: string) => {
      onOpenHostSettings(id);
    },
    [onOpenHostSettings],
  );

  const handleOpen = useCallback(() => setIsOpen(true), []);

  return (
    <HostPicker
      hosts={hosts}
      value=""
      onSelect={handleSelect}
      open={isOpen}
      onOpenChange={setIsOpen}
      anchorRef={triggerRef}
      includeAddHost
      onAddHost={onAddHost}
      showActiveConnection
      onOpenHostSettings={onOpenHostSettings}
      searchable
      desktopPlacement="top-start"
      desktopMinWidth={240}
      addHostTestID="sidebar-host-add"
      hostOptionTestID={sidebarHostOptionTestID}
    >
      <FooterIconButton
        buttonRef={triggerRef}
        onPress={handleOpen}
        testID="sidebar-hosts-trigger"
        label={label}
        icon={Server}
        // Server's two boxes fill more of the square than the other glyphs.
        iconSizeAdjustment={-1}
      />
    </HostPicker>
  );
}

function IconTooltipContent({
  label,
  shortcutKeys,
}: {
  label: string;
  shortcutKeys?: ReturnType<typeof useShortcutKeys>;
}) {
  return (
    <View style={styles.tooltipRow}>
      <Text style={styles.tooltipText}>{label}</Text>
      {shortcutKeys ? <Shortcut chord={shortcutKeys} /> : null}
    </View>
  );
}

function SidebarFooter({
  compact = false,
  handleOpenProject,
  handleSettings,
  labels,
  handleAddHost,
  handleOpenHostSettings,
  onBeforeNavigate,
}: {
  /**
   * The phone sidebar keeps Usage and plugin rows folded until the user expands them.
   */
  compact?: boolean;
  handleOpenProject: () => void;
  handleSettings: () => void;
  labels: {
    addProject: string;
    hosts: string;
    settings: string;
    searchHosts: string;
    usage: string;
  };
  handleAddHost: () => void;
  handleOpenHostSettings: (serverId: string) => void;
  onBeforeNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const newAgentKeys = useShortcutKeys("new-agent");
  const settingsKeys = useShortcutKeys("toggle-settings");
  const footerRows = useVisibleSidebarFooterItems();
  const hasFooterRows = footerRows.visibleItems.length > 0;
  const [rowsExpanded, setRowsExpanded] = useState(false);
  const toggleRows = useCallback(() => setRowsExpanded((expanded) => !expanded), []);
  const showRows = !compact || rowsExpanded;
  const isCompactLayout = useIsCompactFormFactor();
  const [rowWidth, setRowWidth] = useState(0);
  const handleRowLayout = useCallback((event: LayoutChangeEvent) => {
    setRowWidth(event.nativeEvent.layout.width);
  }, []);
  const extraTrailingCount = 1 + (compact && hasFooterRows ? 1 : 0);
  const { inline, overflow } = useMemo(() => {
    const controlSize = TOOLBAR_CONTROL_SIZES[controlSizingForLayout(isCompactLayout)];
    return resolveSidebarFooterLayout({
      rowWidth: rowWidth > 0 ? Math.max(0, rowWidth - extraTrailingCount * controlSize) : 0,
      controlSize,
      rowPadding: FOOTER_ROW_PADDING,
      actions: SIDEBAR_FOOTER_ACTIONS,
    });
  }, [rowWidth, isCompactLayout, extraTrailingCount]);
  const isInline = (action: SidebarFooterAction) => inline.includes(action);

  // One line of icons: Add project, Usage, Hosts, then Account, Help and Settings at the end.
  // Actions that don't fit move behind a caret before Settings.
  return (
    <UsageSidebarRoot>
      <View style={styles.footerContainer} testID="sidebar-footer">
        {showRows ? (
          <SidebarFooterRows {...footerRows} onBeforeNavigate={onBeforeNavigate} />
        ) : null}
        <View
          style={styles.sidebarFooter}
          onLayout={handleRowLayout}
          testID="sidebar-footer-bottom-line"
        >
          {isInline("add-project") ? (
            <FooterIconButton
              onPress={handleOpenProject}
              testID="sidebar-add-project"
              label={labels.addProject}
              icon={FolderPlus}
              shortcutKeys={newAgentKeys}
            />
          ) : null}
          {isInline("usage") ? <SidebarUsageIcon label={labels.usage} /> : null}
          {isInline("hosts") ? (
            <SidebarHostPicker
              label={labels.hosts}
              onAddHost={handleAddHost}
              onOpenHostSettings={handleOpenHostSettings}
            />
          ) : null}
          <View style={styles.footerSpacer} />
          {compact && hasFooterRows ? (
            <FooterIconButton
              onPress={toggleRows}
              testID="sidebar-footer-rows-toggle"
              label={t(rowsExpanded ? "sidebar.footer.showLess" : "sidebar.footer.showMore")}
              icon={rowsExpanded ? ChevronDown : ChevronUp}
            />
          ) : null}
          <ClawMuseAccountButton renderTrigger={renderAccountIcon} />
          {isInline("help") ? <SidebarHelpMenu /> : null}
          {overflow.length > 0 ? (
            <SidebarFooterOverflowMenu
              actions={overflow}
              labels={labels}
              onAddProject={handleOpenProject}
              onSettings={handleSettings}
              onAddHost={handleAddHost}
              onOpenHostSettings={handleOpenHostSettings}
            />
          ) : null}
          {isInline("settings") ? (
            <FooterIconButton
              onPress={handleSettings}
              testID="sidebar-settings"
              label={labels.settings}
              icon={Settings}
              shortcutKeys={settingsKeys}
            />
          ) : null}
        </View>
      </View>
    </UsageSidebarRoot>
  );
}

function SidebarUsageIcon({ label }: { label: string }) {
  const openUsage = useOpenSidebarUsage();
  return (
    <FooterIconButton
      onPress={openUsage}
      testID="sidebar-usage-icon"
      label={label}
      icon={CircleGauge}
    />
  );
}

function renderAccountIcon({ open, label }: { open: () => void; label: string }) {
  return (
    <FooterIconButton
      onPress={open}
      testID="clawmuse-open-account"
      label={label}
      icon={UserRound}
    />
  );
}

/**
 * The footer rows in the user's `sidebarFooterItems` order: the Usage item and plugin rows. The
 * Usage item is left out while it has no summary to show.
 */
function useVisibleSidebarFooterItems() {
  const { items } = useSidebarNavItems("footer");
  const usageSummary = useUsageSummary();
  return {
    usageSummary,
    visibleItems: items.filter(
      (item) => item.visible && (item.kind === "plugin" || usageSummary.length > 0),
    ),
  };
}

function SidebarFooterRows({
  onBeforeNavigate,
  usageSummary,
  visibleItems,
}: ReturnType<typeof useVisibleSidebarFooterItems> & { onBeforeNavigate?: () => void }) {
  const rowsRef = useRef<View | null>(null);
  if (visibleItems.length === 0) return null;
  return (
    <>
      <View ref={rowsRef} collapsable={false} style={styles.footerRows}>
        {visibleItems.map((item) =>
          item.kind === "plugin" ? (
            <PluginSidebarItem
              key={item.key}
              group={item.group}
              section="footer"
              fallbackAnchorRef={rowsRef}
              onBeforeNavigate={onBeforeNavigate}
            />
          ) : (
            <UsageSidebarItem key={item.key} sources={usageSummary} />
          ),
        )}
      </View>
      <SidebarSeparator testID="sidebar-footer-separator" />
    </>
  );
}

function MobileSidebar({
  active,
  theme,
  workspaceGroups,
  projectIconTargets,
  pinnedGroups,
  projects,
  hasProjectsBeforeFilter,
  hasActiveProjectFilter,
  workspaceEntriesByKey,
  isInitialLoad,
  isRevalidating,
  isManualRefresh,
  groupMode,
  collapsedProjectKeys,
  shortcutIndexByWorkspaceKey,
  toggleProjectCollapsed,
  handleRefresh,
  handleOpenProject,
  handleImportSession,
  handleSettings,
  labels,
  handleAddHost,
  handleOpenHostSettings,
  insetsTop,
  insetsBottom,
  insetsLeft,
  insetsRight,
  closeSidebar,
}: MobileSidebarProps) {
  const hasActiveHostFilter = useSidebarViewStore((state) => state.hostFilters.length > 0);
  const { gesture: closeGesture, gestureRef: closeGestureRef } = useCloseAgentListGesture();

  const handleWorkspacePress = useCallback(() => {
    closeSidebar();
  }, [closeSidebar]);
  const listFooter = useMemo(() => <View style={styles.mobileListClearance} />, []);

  const closeButton = useMemo(
    () => (
      <SidebarCloseButton
        onPress={closeSidebar}
        testID="sidebar-close"
        nativeID="sidebar-close"
        label={labels.closeSidebar}
        style={styles.mobileCloseButton}
      />
    ),
    [labels.closeSidebar, closeSidebar],
  );

  const mobileSidebarInsetStyle = useMemo(
    () => ({
      paddingTop: insetsTop,
      paddingBottom: insetsBottom,
      paddingLeft: insetsLeft,
      paddingRight: insetsRight,
      backgroundColor: theme.colors.surfaceSidebar,
    }),
    [insetsTop, insetsBottom, insetsLeft, insetsRight, theme.colors.surfaceSidebar],
  );

  const navRows = (
    <SidebarNavRows
      style={styles.mobileNavRowsGroup}
      onBeforeNavigate={closeSidebar}
      firstRowTrailing={closeButton}
    />
  );

  return (
    <MobilePanelOverlay
      panel="agent-list"
      closeGesture={closeGesture}
      panelStyle={mobileSidebarInsetStyle}
    >
      <View style={styles.sidebarContent} pointerEvents="auto">
        <WindowChromeSafeArea placement="below" />
        <SidebarNavScroll closeGestureRef={closeGestureRef}>{navRows}</SidebarNavScroll>

        <SidebarHostStrip
          onOpenHostSettings={handleOpenHostSettings}
          onBeforeNavigate={closeSidebar}
          panelGestureRef={closeGestureRef}
        />

        <View style={styles.mobileWorkspaceList}>
          <SidebarViewSlot dismiss={handleWorkspacePress}>
            <SidebarToastRegion active={active}>
              {isInitialLoad && !hasActiveHostFilter ? (
                <SidebarAgentListSkeleton />
              ) : (
                <SidebarWorkspaceList
                  collapsedProjectKeys={collapsedProjectKeys}
                  onToggleProjectCollapsed={toggleProjectCollapsed}
                  shortcutIndexByWorkspaceKey={shortcutIndexByWorkspaceKey}
                  groupMode={groupMode}
                  workspaceGroups={workspaceGroups}
                  projectIconTargets={projectIconTargets}
                  pinnedGroups={pinnedGroups}
                  projects={projects}
                  hasProjectsBeforeFilter={hasProjectsBeforeFilter}
                  hasActiveProjectFilter={hasActiveProjectFilter}
                  workspaceEntriesByKey={workspaceEntriesByKey}
                  isRefreshing={isManualRefresh && isRevalidating}
                  onRefresh={handleRefresh}
                  onWorkspacePress={handleWorkspacePress}
                  onAddProject={handleOpenProject}
                  onImportSession={handleImportSession}
                  parentGestureRef={closeGestureRef}
                  dragGestureHostActive={active}
                  listHeaderComponent={workspacesSectionHeaderElement}
                  listFooterComponent={listFooter}
                />
              )}
            </SidebarToastRegion>
          </SidebarViewSlot>
          <NewAgentAction onBeforeNavigate={closeSidebar} testID="sidebar-new-agent" />
        </View>

        <SidebarFooter
          compact
          handleOpenProject={handleOpenProject}
          handleSettings={handleSettings}
          labels={labels}
          handleAddHost={handleAddHost}
          handleOpenHostSettings={handleOpenHostSettings}
          onBeforeNavigate={closeSidebar}
        />
      </View>
    </MobilePanelOverlay>
  );
}

interface SidebarNavScrollProps {
  closeGestureRef: RefObject<GestureType | undefined>;
  /** Web only: the viewport emits no window regions (see WINDOW_CONTENT_DATASET). */
  windowContent?: boolean;
  children: ReactNode;
}

// The capped, scrolling nav block shared by the mobile and desktop sidebars, with the
// divider below it. The divider is a sibling because Unistyles does not patch the
// gesture-handler ScrollView.
function SidebarNavScroll({ closeGestureRef, windowContent, children }: SidebarNavScrollProps) {
  return (
    <>
      {isNative ? (
        <GHScrollView
          // Same contract as the workspace list: vertical drags scroll the nav
          // block, a clear horizontal intent still activates the close pan.
          simultaneousHandlers={closeGestureRef}
          style={styles.navScroll}
          showsVerticalScrollIndicator={false}
          alwaysBounceVertical={false}
          testID="sidebar-nav-scroll"
        >
          {children}
        </GHScrollView>
      ) : (
        <ScrollView
          dataSet={windowContent ? WINDOW_CONTENT_DATASET : undefined}
          style={styles.navScroll}
          showsVerticalScrollIndicator={false}
          alwaysBounceVertical={false}
          testID="sidebar-nav-scroll"
        >
          {children}
        </ScrollView>
      )}
      <SidebarSeparator testID="sidebar-nav-separator" />
    </>
  );
}

function DesktopSidebar({
  theme,
  workspaceGroups,
  projectIconTargets,
  pinnedGroups,
  projects,
  hasProjectsBeforeFilter,
  hasActiveProjectFilter,
  workspaceEntriesByKey,
  isInitialLoad,
  isRevalidating,
  isManualRefresh,
  groupMode,
  collapsedProjectKeys,
  shortcutIndexByWorkspaceKey,
  toggleProjectCollapsed,
  handleRefresh,
  handleOpenProject,
  handleImportSession,
  handleSettings,
  labels,
  handleAddHost,
  handleOpenHostSettings,
  insetsTop,
  active,
  overlay,
}: DesktopSidebarProps) {
  const ownsTopLeft = useOwnsWindowChromeCorner("top-left");
  const hasActiveHostFilter = useSidebarViewStore((state) => state.hostFilters.length > 0);
  const setSidebarWidth = usePanelStore((state) => state.setSidebarWidth);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const viewportWidth = windowWidth - insets.left - insets.right;
  const divisionLayout = resolveDesktopDivisionLayout({
    geometry: useWindowLayout(),
    windowWidth,
    windowHeight,
    leftInset: insets.left,
    rightInset: insets.right,
  });
  const visibleSidebarWidth = useLeftPanelWidth();

  const closeSidebar = usePanelStore((state) => state.showMobileAgent);
  const { gesture: closeGesture, gestureRef: closeGestureRef } = useCloseAgentListGesture(overlay);

  const startWidth = useSharedValue(visibleSidebarWidth);
  const resizeWidth = useSharedValue(visibleSidebarWidth);
  const [resizePressed, setResizePressed] = useState(false);
  const showResizeGrip = useCallback(() => setResizePressed(true), []);
  const hideResizeGrip = useCallback(() => setResizePressed(false), []);

  useEffect(() => {
    resizeWidth.value = visibleSidebarWidth;
  }, [resizeWidth, visibleSidebarWidth]);

  const resizeGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(divisionLayout === null)
        .hitSlop({ left: 8, right: 8, top: 0, bottom: 0 })
        .onBegin(() => {
          scheduleOnRN(showResizeGrip);
        })
        // Horizontal intent only, so a finger dragging down the touch grip scrolls
        // the workspace list instead of resizing. Anchoring the start width to the
        // activation translation keeps the extra threshold from jumping the edge.
        .activeOffsetX([-SIDEBAR_RESIZE_ACTIVATION_OFFSET, SIDEBAR_RESIZE_ACTIVATION_OFFSET])
        .failOffsetY([-SIDEBAR_RESIZE_FAIL_OFFSET, SIDEBAR_RESIZE_FAIL_OFFSET])
        .onStart((event) => {
          startWidth.value = visibleSidebarWidth - event.translationX;
          resizeWidth.value = visibleSidebarWidth;
        })
        .onUpdate((event) => {
          // Dragging right (positive translationX) increases width
          const newWidth = startWidth.value + event.translationX;
          resizeWidth.value = resolveDesktopSidebarWidth({
            requestedWidth: newWidth,
            viewportWidth,
          });
        })
        .onEnd((_event, success) => {
          if (success) runOnJS(setSidebarWidth)(resizeWidth.value);
        })
        .onFinalize(() => {
          scheduleOnRN(hideResizeGrip);
        }),
    [
      divisionLayout,
      hideResizeGrip,
      resizeWidth,
      setSidebarWidth,
      showResizeGrip,
      startWidth,
      viewportWidth,
      visibleSidebarWidth,
    ],
  );

  const leftInset = resolveDesktopSidebarInsetLeft({ overlay, safeAreaLeft: insets.left });
  const divisionWidth = divisionLayout?.sidebarWidth ?? null;
  const resizeAnimatedStyle = useAnimatedStyle(() => ({
    width: divisionWidth ?? resizeWidth.value,
  }));

  const contentHeight = useSharedValue(0);
  const handleContentLayout = useCallback(
    (event: LayoutChangeEvent) => {
      contentHeight.value = event.nativeEvent.layout.height;
    },
    [contentHeight],
  );
  const sidebarBorderWidth = theme.borderWidth[1];
  // Resize one logical surface so icons, text, row spacing and hit-testing agree.
  const scaledContentStyle = useAnimatedStyle<ViewStyle>(() => {
    const contentWidth = divisionWidth ?? resizeWidth.value;
    const scale = resolveDesktopSidebarScale(contentWidth);
    return {
      width: (contentWidth - sidebarBorderWidth - leftInset) / scale,
      height: contentHeight.value / scale,
      // Layout zoom paints SVGs and text at the final web resolution instead of
      // resampling the transformed sidebar surface.
      ...(isWeb ? ({ zoom: scale } as ViewStyle) : { transform: [{ scale }] }),
    };
  });

  const navRowHeight = useSharedValue(0);
  const handleNavRowLayout = useCallback(
    (event: LayoutChangeEvent) => {
      navRowHeight.value = event.nativeEvent.layout.height;
    },
    [navRowHeight],
  );
  const navRowViewportStyle = useAnimatedStyle<ViewStyle>(() => {
    // CSS zoom already scales layout; native needs the measured height compensated.
    if (isWeb) return {};
    const contentWidth = divisionWidth ?? resizeWidth.value;
    return { height: navRowHeight.value * resolveDesktopSidebarNavScale(contentWidth) };
  });
  const scaledNavRowStyle = useAnimatedStyle<ViewStyle>(() => {
    const contentWidth = divisionWidth ?? resizeWidth.value;
    const scale = resolveDesktopSidebarNavScale(contentWidth);
    return {
      width: (contentWidth - sidebarBorderWidth - leftInset) / scale,
      ...(isWeb ? ({ zoom: scale } as ViewStyle) : { transform: [{ scale }] }),
    };
  });

  // The panel host gets no width of its own: the dock sizes to this view and the overlay fills the
  // window. A Reanimated width on the host reached Android after React had switched presentation,
  // and a lost update left the workspace at the dock width after the dock collapsed.
  const desktopSidebarStyle = useMemo(
    () => [staticStyles.desktopSidebar, resizeAnimatedStyle],
    [resizeAnimatedStyle],
  );
  const desktopSidebarBorderStyle = useMemo(
    () => [
      styles.desktopSidebarBorder(divisionLayout !== null),
      {
        flex: 1,
        paddingTop: insetsTop,
        paddingBottom: insets.bottom,
        paddingLeft: leftInset,
      },
    ],
    [insetsTop, insets.bottom, leftInset, divisionLayout],
  );
  const inTopBand = useTopBand() !== null;
  // Windows and Linux draw their window controls top-right, so the sidebar has no chrome
  // row there. The strip above the scrolling rows is then its window drag surface.
  const showsChromeRow = ownsTopLeft || Boolean(DEV_BUILD_LABEL);
  const showsDragStrip = !showsChromeRow && !inTopBand;
  return (
    <MobilePanelOverlay
      panel="agent-list"
      presentation={overlay ? "overlay" : "dock"}
      dockVisible={active}
      closeGesture={closeGesture}
    >
      <Animated.View style={desktopSidebarStyle}>
        <View style={desktopSidebarBorderStyle}>
          <View style={styles.sidebarDragArea}>
            {showsChromeRow ? (
              <View style={styles.desktopChromeRow}>
                <TitlebarDragRegion />
                {DEV_BUILD_LABEL ? (
                  <View
                    pointerEvents="none"
                    style={styles.devBuildBadge}
                    testID="dev-build-label"
                    accessibilityLabel={`Development build: ${DEV_BUILD_LABEL}`}
                  >
                    <GitBranch size={12} color={theme.colors.accentForeground} />
                    <Text numberOfLines={1} ellipsizeMode="tail" style={styles.devBuildBadgeText}>
                      {DEV_BUILD_LABEL}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            {showsDragStrip ? (
              <View style={styles.desktopDragStrip} testID="sidebar-nav-drag-strip">
                <TitlebarDragRegion />
              </View>
            ) : null}
          </View>

          <DesktopScaledViewport
            onLayout={handleContentLayout}
            scaledContentStyle={scaledContentStyle}
          >
            {/* The drag overlay stays above this viewport: Electron does not clip
                app-region rects to scroll viewports, so a scrolled-out row would
                still claim its no-drag rect. */}
            <DesktopScaledNav
              closeGestureRef={closeGestureRef}
              navRowViewportStyle={navRowViewportStyle}
              onNavRowLayout={handleNavRowLayout}
              scaledNavRowStyle={scaledNavRowStyle}
              onBeforeNavigate={closeSidebar}
            />

            <SidebarHostStrip onOpenHostSettings={handleOpenHostSettings} />

            <SidebarViewSlot dismiss={closeSidebar}>
              <SidebarToastRegion active={active}>
                {isInitialLoad && !hasActiveHostFilter ? (
                  <SidebarAgentListSkeleton />
                ) : (
                  <SidebarWorkspaceList
                    collapsedProjectKeys={collapsedProjectKeys}
                    onToggleProjectCollapsed={toggleProjectCollapsed}
                    shortcutIndexByWorkspaceKey={shortcutIndexByWorkspaceKey}
                    groupMode={groupMode}
                    workspaceGroups={workspaceGroups}
                    projectIconTargets={projectIconTargets}
                    pinnedGroups={pinnedGroups}
                    projects={projects}
                    hasProjectsBeforeFilter={hasProjectsBeforeFilter}
                    hasActiveProjectFilter={hasActiveProjectFilter}
                    workspaceEntriesByKey={workspaceEntriesByKey}
                    isRefreshing={isManualRefresh && isRevalidating}
                    onRefresh={handleRefresh}
                    onAddProject={handleOpenProject}
                    onImportSession={handleImportSession}
                    onWorkspacePress={closeSidebar}
                    parentGestureRef={closeGestureRef}
                    dragGestureHostActive={active}
                    listHeaderComponent={workspacesSectionHeaderElement}
                  />
                )}
              </SidebarToastRegion>
            </SidebarViewSlot>

            <SidebarCalloutSlot />
          </DesktopScaledViewport>

          <SidebarFooter
            handleOpenProject={handleOpenProject}
            handleSettings={handleSettings}
            labels={labels}
            handleAddHost={handleAddHost}
            handleOpenHostSettings={handleOpenHostSettings}
            onBeforeNavigate={closeSidebar}
          />

          {!overlay && divisionLayout === null ? (
            <SidebarResizeHandle
              edge="right"
              gesture={resizeGesture}
              pressed={resizePressed}
              testID="left-sidebar-resize-handle"
            />
          ) : null}
        </View>
      </Animated.View>
    </MobilePanelOverlay>
  );
}

function WorkspacesSectionHeader() {
  return (
    <SidebarSectionHeader title="Workspaces">
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <View>
            <SidebarDisplayPreferencesMenu />
          </View>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="center" offset={8}>
          <IconTooltipContent label="Display preferences" />
        </TooltipContent>
      </Tooltip>
    </SidebarSectionHeader>
  );
}

function DesktopScaledViewport({
  onLayout,
  scaledContentStyle,
  children,
}: {
  onLayout: (event: LayoutChangeEvent) => void;
  scaledContentStyle: React.ComponentProps<typeof Animated.View>["style"];
  children: React.ReactNode;
}) {
  return (
    <View
      style={staticStyles.sidebarContentViewport}
      onLayout={onLayout}
      testID="sidebar-scaled-content-viewport"
    >
      <Animated.View
        style={[staticStyles.scaledSidebarContent, scaledContentStyle]}
        testID="sidebar-scaled-content"
      >
        {children}
      </Animated.View>
    </View>
  );
}

function DesktopScaledNav({
  closeGestureRef,
  navRowViewportStyle,
  onNavRowLayout,
  scaledNavRowStyle,
  onBeforeNavigate,
}: {
  closeGestureRef: React.ComponentProps<typeof SidebarNavScroll>["closeGestureRef"];
  navRowViewportStyle: React.ComponentProps<typeof Animated.View>["style"];
  onNavRowLayout: (event: LayoutChangeEvent) => void;
  scaledNavRowStyle: React.ComponentProps<typeof Animated.View>["style"];
  onBeforeNavigate: () => void;
}) {
  return (
    <SidebarNavScroll closeGestureRef={closeGestureRef} windowContent>
      <Animated.View style={navRowViewportStyle} testID="sidebar-scaled-nav-viewport">
        <Animated.View
          onLayout={onNavRowLayout}
          style={scaledNavRowStyle}
          testID="sidebar-scaled-nav"
        >
          <SidebarNavRows style={styles.sidebarHeaderGroup} onBeforeNavigate={onBeforeNavigate} />
        </Animated.View>
      </Animated.View>
    </SidebarNavScroll>
  );
}

// Stable element so the sidebar list's listHeaderComponent prop keeps identity across
// renders (WorkspacesSectionHeader takes no props).
const workspacesSectionHeaderElement = <WorkspacesSectionHeader />;

// Static styles for Animated.Views — must NOT use Unistyles dynamic theme to
// avoid the "Unable to find node on an unmounted component" crash when Unistyles
// tries to patch the native node that Reanimated also manages.
const staticStyles = RNStyleSheet.create({
  sidebarContentViewport: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  scaledSidebarContent: {
    position: "absolute",
    top: 0,
    left: 0,
    transformOrigin: "top left",
  },
  scaledNavRowViewport: {
    overflow: "hidden",
  },
  scaledNavRow: {
    transformOrigin: "top left",
  },
  desktopSidebar: {
    position: "relative" as const,
    flex: 1,
  },
});

const styles = StyleSheet.create((theme) => ({
  // The rows start flush: the chrome row, drag strip, or top band above them gives the inset.
  sidebarHeaderGroup: {
    gap: 2,
    paddingBottom: theme.spacing[1.5],
  },
  desktopDragStrip: {
    position: "relative",
    height: theme.spacing[2],
  },
  // The nav block caps at half the sidebar; a long item list scrolls inside the
  // cap instead of crowding the workspace list off a short screen.
  navScroll: {
    flexGrow: 0,
    flexShrink: 1,
    maxHeight: "50%",
  },
  mobileNavRowsGroup: {
    paddingTop: theme.spacing[2],
    gap: 2,
    paddingBottom: theme.spacing[1.5],
  },
  sidebarContent: {
    flex: 1,
    minHeight: 0,
  },
  mobileWorkspaceList: { flex: 1, minHeight: 0 },
  mobileListClearance: { height: COMPACT_FLOATING_ACTION_BUTTON_CLEARANCE },
  mobileCloseButton: {
    marginRight: theme.spacing[2],
  },
  desktopSidebarBorder: (hasDivision: boolean) => ({
    borderRightWidth: hasDivision ? 0 : 1,
    borderRightColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSidebar,
  }),
  sidebarDragArea: {
    position: "relative",
  },
  desktopChromeRow: {
    position: "relative",
    height: HEADER_INNER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: theme.spacing[3],
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: "transparent",
  },
  devBuildBadge: {
    maxWidth: "60%",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.accent,
  },
  devBuildBadgeText: {
    minWidth: 0,
    flexShrink: 1,
    color: theme.colors.accentForeground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  footerContainer: {},
  // Buttons sit edge to edge; their own inset spaces the glyphs.
  // As tall as its buttons from the first frame, which places none until the row has measured.
  sidebarFooter: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: mapLayout(density.iconButton, (height) => height + theme.spacing[1.5] * 2),
    paddingHorizontal: FOOTER_ROW_PADDING,
    paddingVertical: theme.spacing[1.5],
  },
  footerSpacer: {
    flex: 1,
  },
  // Usage and plugin rows sit above the footer's icon line, spaced like the header nav rows.
  footerRows: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1.5],
    gap: 2,
  },
  footerIconButton: {
    width: density.iconButton,
    height: density.iconButton,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[1],
  },
  tooltipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  tooltipText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.popoverForeground,
  },
}));
