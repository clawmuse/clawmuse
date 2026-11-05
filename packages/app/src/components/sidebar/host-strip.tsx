import { router } from "expo-router";
import {
  ChevronDown,
  Eye,
  Laptop,
  ListMinus,
  ListPlus,
  Server,
  Settings,
  SquarePen,
} from "lucide-react-native";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactElement,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PressableStateCallbackType,
  type ScrollView,
} from "react-native";
import { Gesture, GestureDetector, type GestureType } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { shallow } from "zustand/shallow";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { useClawMuseDeviceLabel } from "@/clawmuse/device-label";
import { HostStatusDot } from "@/components/host-status-dot";
import { ALL_HOSTS_OPTION_ID, HostPicker } from "@/components/hosts/host-picker";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  HorizontalScrollBoundaryShades,
  useHorizontalScrollBoundary,
} from "@/components/ui/horizontal-scroll-boundary";
import { PressHighlight } from "@/components/ui/press-highlight";
import { isWeb } from "@/constants/platform";
import {
  deriveSidebarHostActivity,
  type SidebarHostActivity,
} from "@/hooks/sidebar-workspaces-view-model";
import { useLocalDaemonServerId } from "@/hooks/use-is-local-daemon";
import type { HostColor } from "@/hosts/appearance";
import { HOST_ICON_MAPPINGS, hostLabelColorStyle } from "@/hosts/host-badge";
import { getHostRuntimeStore, useHosts } from "@/runtime/host-runtime";
import { useCreateFlowStore } from "@/stores/create-flow-store";
import { useSessionStore } from "@/stores/session-store";
import { workspaceEqualityFns } from "@/stores/session-store-hooks/selectors";
import { useSidebarViewStore } from "@/stores/sidebar-view-store";
import { density, densityText } from "@/styles/density";
import type { Theme } from "@/styles/theme";
import { orderHostsLocalFirst } from "@/types/host-connection";
import { buildNewWorkspaceRoute } from "@/utils/host-routes";

const ThemedLaptop = withUnistyles(Laptop);
const ThemedServer = withUnistyles(Server);
const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedEye = withUnistyles(Eye);
const ThemedListPlus = withUnistyles(ListPlus);
const ThemedListMinus = withUnistyles(ListMinus);
const ThemedSquarePen = withUnistyles(SquarePen);
const ThemedSettings = withUnistyles(Settings);

const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const CHIP_ICON_SIZE = 14;
// Gap kept between a chip scrolled into view and the strip's edge; inside the edge fade's opaque end.
const SCROLL_EDGE_INSET = 8;
const MENU_ICON_SIZE = 14;

const selectOnlyLeading = <ThemedEye size={MENU_ICON_SIZE} uniProps={mutedColorMapping} />;
const addToFilterLeading = <ThemedListPlus size={MENU_ICON_SIZE} uniProps={mutedColorMapping} />;
const removeFromFilterLeading = (
  <ThemedListMinus size={MENU_ICON_SIZE} uniProps={mutedColorMapping} />
);
const newAgentLeading = <ThemedSquarePen size={MENU_ICON_SIZE} uniProps={mutedColorMapping} />;
const settingsLeading = <ThemedSettings size={MENU_ICON_SIZE} uniProps={mutedColorMapping} />;

/**
 * One press-sized chip per host above the workspace list, plus "All" and an overflow picker.
 *
 * It is a second view on `hostFilters`, not a second filter: the Host page in display
 * preferences reads and writes the same list, so the two can never disagree. A plain press pins
 * the sidebar to one host; long press, right click, or a modifier click adds hosts on top.
 */
export function SidebarHostStrip({
  onOpenHostSettings,
  onBeforeNavigate,
  panelGestureRef,
}: {
  onOpenHostSettings: (serverId: string) => void;
  onBeforeNavigate?: () => void;
  /** The compact panel's close gesture, which would otherwise take a horizontal drag. */
  panelGestureRef?: MutableRefObject<GestureType | undefined>;
}): ReactElement | null {
  const { t } = useTranslation();
  const hosts = useHosts();
  const localServerId = useLocalDaemonServerId();
  const deviceLabel = useClawMuseDeviceLabel();
  const hostFilters = useSidebarViewStore((state) => state.hostFilters);
  const selectOnlyHost = useSidebarViewStore((state) => state.selectOnlyHost);
  const toggleHostFilter = useSidebarViewStore((state) => state.toggleHostFilter);
  const clearHostFilters = useSidebarViewStore((state) => state.clearHostFilters);

  const orderedHosts = useMemo(
    () => orderHostsLocalFirst(hosts, localServerId),
    [hosts, localServerId],
  );
  const serverIds = useMemo(() => orderedHosts.map((host) => host.serverId), [orderedHosts]);
  const visible = orderedHosts.length > 1;

  // A chip reports hosts the filter hides, so every host keeps its directory live while the strip
  // is up. That is the same demand the sidebar holds with no filter.
  useEffect(() => {
    if (!visible) return;
    const runtime = getHostRuntimeStore();
    const releases = serverIds.map((serverId) => runtime.acquireDirectoryDemand(serverId));
    return () => releases.forEach((release) => release());
  }, [serverIds, visible]);

  const selected = useMemo(() => {
    const known = new Set(serverIds);
    return hostFilters.filter((serverId) => known.has(serverId));
  }, [hostFilters, serverIds]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const scrollRef = useRef<ScrollView>(null);
  const boundary = useHorizontalScrollBoundary();
  const chipNodes = useRef(new Map<string, View>());
  const trackRef = useRef<View>(null);
  const trackWidth = useRef(0);
  const viewportWidth = useRef(0);

  // Measured when needed rather than cached from `onLayout`: on web a chip's `onLayout` fires only
  // when its own size changes, so a chip pushed sideways by a neighbour that grew (a late font, a
  // count badge arriving) keeps reporting where it used to be.
  //
  // Scrolls only when the chip is not already fully in view, and then stops just short of the
  // edge so the neighbour that is cut off sits under the fade rather than beside the chip.
  const scrollChipIntoView = useCallback(
    (serverId: string) => {
      const chip = chipNodes.current.get(serverId);
      const track = trackRef.current;
      const viewport = viewportWidth.current;
      if (!chip || !track || viewport === 0) return;
      chip.measureLayout(track, (x, _y, width) => {
        const offset = boundary.offset.value;
        let target: number | null = null;
        if (x < offset) {
          target = x - SCROLL_EDGE_INSET;
        } else if (x + width > offset + viewport) {
          target = x + width + SCROLL_EDGE_INSET - viewport;
        }
        if (target === null) return;
        const maxOffset = Math.max(0, trackWidth.current - viewport);
        scrollRef.current?.scrollTo({
          x: Math.min(maxOffset, Math.max(0, target)),
          animated: true,
        });
      });
    },
    [boundary.offset],
  );

  const lastSelected = selected.length > 0 ? selected[selected.length - 1] : null;
  useEffect(() => {
    if (lastSelected) scrollChipIntoView(lastSelected);
  }, [lastSelected, scrollChipIntoView]);

  const registerChip = useCallback((serverId: string, node: View | null) => {
    if (node) {
      chipNodes.current.set(serverId, node);
    } else {
      chipNodes.current.delete(serverId);
    }
  }, []);

  // The track's width does follow its children, so its `onLayout` stays current. Its first
  // measure is also the first moment a selection restored on launch can be scrolled to.
  const handleTrackLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const isFirstMeasure = trackWidth.current === 0;
      trackWidth.current = event.nativeEvent.layout.width;
      if (isFirstMeasure && lastSelected) scrollChipIntoView(lastSelected);
    },
    [lastSelected, scrollChipIntoView],
  );

  const handleViewportLayout = useCallback(
    (event: LayoutChangeEvent) => {
      viewportWidth.current = event.nativeEvent.layout.width;
      boundary.onLayout(event);
    },
    [boundary],
  );

  const handleNewAgent = useCallback(
    (serverId: string) => {
      onBeforeNavigate?.();
      router.push(buildNewWorkspaceRoute({ serverId }));
    },
    [onBeforeNavigate],
  );

  const pickerHosts = useMemo(
    () => orderedHosts.map((host) => ({ serverId: host.serverId, label: host.label })),
    [orderedHosts],
  );
  const handlePickerSelect = useCallback(
    (id: string) => {
      if (id === ALL_HOSTS_OPTION_ID) {
        clearHostFilters();
      } else {
        selectOnlyHost(id);
      }
    },
    [clearHostFilters, selectOnlyHost],
  );

  const scrollGesture = useMemo(() => {
    const native = Gesture.Native();
    return panelGestureRef ? native.blocksExternalGesture(panelGestureRef) : native;
  }, [panelGestureRef]);

  if (!visible) return null;

  return (
    <View style={styles.container} testID="sidebar-host-strip">
      <View style={styles.row}>
        <AllHostsChip selected={selected.length === 0} onPress={clearHostFilters} />
        <View style={styles.scrollContainer} onLayout={handleViewportLayout}>
          <GestureDetector gesture={scrollGesture}>
            <Animated.ScrollView
              ref={scrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              onContentSizeChange={boundary.onContentSizeChange}
              onScroll={boundary.onScroll}
              scrollEventThrottle={16}
              testID="sidebar-host-strip-scroll"
            >
              <View ref={trackRef} onLayout={handleTrackLayout} style={styles.track}>
                {orderedHosts.map((host) => (
                  <HostChip
                    key={host.serverId}
                    serverId={host.serverId}
                    label={deviceLabel(host.serverId, host.label)}
                    color={host.appearance.color}
                    isLocal={host.serverId === localServerId}
                    selected={selectedSet.has(host.serverId)}
                    onSelectOnly={selectOnlyHost}
                    onToggle={toggleHostFilter}
                    onNewAgent={handleNewAgent}
                    onOpenSettings={onOpenHostSettings}
                    register={registerChip}
                  />
                ))}
              </View>
            </Animated.ScrollView>
          </GestureDetector>
          <HorizontalScrollBoundaryShades
            visible
            backdrop="sidebar"
            testIDPrefix="sidebar-host-strip-shade"
            leftStyle={boundary.leftShadeStyle}
            rightStyle={boundary.rightShadeStyle}
          />
        </View>
        <MoreHostsButton
          hosts={pickerHosts}
          value={pickerValue(selected)}
          onSelect={handlePickerSelect}
          onOpenHostSettings={onOpenHostSettings}
          title={t("sidebar.display.hostFilter.more")}
        />
      </View>
      {selected.length > 1 ? (
        <View style={styles.summaryRow} testID="sidebar-host-strip-summary">
          <Text style={styles.summaryText}>
            {t("sidebar.display.hostFilter.shownCount", { count: selected.length })}
          </Text>
          <PressHighlight
            onPress={clearHostFilters}
            accessibilityRole="button"
            hitSlop={8}
            style={summaryClearStyle}
            testID="sidebar-host-strip-clear"
          >
            <Text style={styles.summaryClear}>{t("sidebar.display.hostFilter.clear")}</Text>
          </PressHighlight>
        </View>
      ) : null}
    </View>
  );
}

/** The picker ticks one row; with several hosts pinned no single row is the answer. */
function pickerValue(selected: readonly string[]): string {
  if (selected.length === 0) return ALL_HOSTS_OPTION_ID;
  return selected.length === 1 ? selected[0] : "";
}

function chipStyle(selected: boolean) {
  return ({ hovered = false }: PressableStateCallbackType & { hovered?: boolean }) => [
    styles.chip,
    hovered && !selected && styles.chipHovered,
    selected && styles.chipSelected,
  ];
}

function summaryClearStyle({
  hovered = false,
}: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.summaryClearButton, hovered && styles.chipHovered];
}

function AllHostsChip({
  selected,
  onPress,
}: {
  selected: boolean;
  onPress: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const style = useMemo(() => chipStyle(selected), [selected]);
  const accessibilityState = useMemo(() => ({ selected }), [selected]);
  return (
    <PressHighlight
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      accessibilityLabel={t("sidebar.display.hostFilter.all")}
      style={style}
      testID="sidebar-host-strip-all"
    >
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
        {t("sidebar.display.hostFilter.allShort")}
      </Text>
    </PressHighlight>
  );
}

/** Cmd/Ctrl/Shift on a click adds to the filter instead of replacing it. Web only. */
function isAdditivePress(event: GestureResponderEvent): boolean {
  if (!isWeb) return false;
  const native = event.nativeEvent as unknown;
  if (typeof native !== "object" || native === null) return false;
  return (
    Reflect.get(native, "metaKey") === true ||
    Reflect.get(native, "ctrlKey") === true ||
    Reflect.get(native, "shiftKey") === true
  );
}

const HostChip = memo(function HostChip({
  serverId,
  label,
  color,
  isLocal,
  selected,
  onSelectOnly,
  onToggle,
  onNewAgent,
  onOpenSettings,
  register,
}: {
  serverId: string;
  label: string;
  color: HostColor;
  isLocal: boolean;
  selected: boolean;
  onSelectOnly: (serverId: string) => void;
  onToggle: (serverId: string) => void;
  onNewAgent: (serverId: string) => void;
  onOpenSettings: (serverId: string) => void;
  register: (serverId: string, node: View | null) => void;
}): ReactElement {
  const { t } = useTranslation();
  const activity = useSidebarHostActivity(serverId);
  const [menuOpen, setMenuOpen] = useState(false);
  const style = useMemo(() => chipStyle(selected), [selected]);
  const accessibilityState = useMemo(() => ({ selected }), [selected]);

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      if (isAdditivePress(event)) {
        onToggle(serverId);
      } else {
        onSelectOnly(serverId);
      }
    },
    [onSelectOnly, onToggle, serverId],
  );
  const handleRef = useCallback(
    (node: View | null) => register(serverId, node),
    [register, serverId],
  );
  const handleSelectOnly = useCallback(() => onSelectOnly(serverId), [onSelectOnly, serverId]);
  const handleToggle = useCallback(() => onToggle(serverId), [onToggle, serverId]);
  const handleNewAgent = useCallback(() => onNewAgent(serverId), [onNewAgent, serverId]);
  const handleOpenSettings = useCallback(
    () => onOpenSettings(serverId),
    [onOpenSettings, serverId],
  );

  const Icon = isLocal ? ThemedLaptop : ThemedServer;
  const accessibilityLabel = [
    label,
    activity.running > 0
      ? t("sidebar.display.hostFilter.running", { count: activity.running })
      : null,
    activity.needsInput ? t("sidebar.display.hostFilter.needsInput") : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <View ref={handleRef} collapsable={false}>
      <ContextMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <ContextMenuTrigger
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityState={accessibilityState}
          accessibilityLabel={accessibilityLabel}
          style={style}
          testID={`sidebar-host-strip-chip-${serverId}`}
        >
          <HostStatusDot serverId={serverId} />
          <Icon size={CHIP_ICON_SIZE} uniProps={HOST_ICON_MAPPINGS[color]} />
          <Text
            numberOfLines={1}
            style={[
              styles.chipLabel,
              selected && styles.chipLabelSelected,
              hostLabelColorStyle(color),
            ]}
          >
            {label}
          </Text>
          {activity.running > 0 ? (
            <View style={styles.count} testID={`sidebar-host-strip-running-${serverId}`}>
              <Text style={styles.countText}>{activity.running}</Text>
            </View>
          ) : null}
          {activity.needsInput ? (
            <View style={styles.needsInput} testID={`sidebar-host-strip-needs-input-${serverId}`} />
          ) : null}
        </ContextMenuTrigger>
        <ContextMenuContent
          align="start"
          width={240}
          testID={`sidebar-host-strip-menu-${serverId}`}
        >
          <ContextMenuItem leading={selectOnlyLeading} onSelect={handleSelectOnly}>
            {t("sidebar.display.hostFilter.selectOnly")}
          </ContextMenuItem>
          <ContextMenuItem
            leading={selected ? removeFromFilterLeading : addToFilterLeading}
            onSelect={handleToggle}
            testID={`sidebar-host-strip-toggle-${serverId}`}
          >
            {selected
              ? t("sidebar.display.hostFilter.removeFromFilter")
              : t("sidebar.display.hostFilter.addToFilter")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem leading={newAgentLeading} onSelect={handleNewAgent}>
            {t("sidebar.display.hostFilter.newAgentHere")}
          </ContextMenuItem>
          <ContextMenuItem leading={settingsLeading} onSelect={handleOpenSettings}>
            {t("sidebar.display.hostFilter.settings")}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </View>
  );
});

function useSidebarHostActivity(serverId: string): SidebarHostActivity {
  const pendingCreateAttempts = useStoreWithEqualityFn(
    useCreateFlowStore,
    (state) => state.pendingByDraftId,
    workspaceEqualityFns.deep,
  );
  const selector = useCallback(
    (state: ReturnType<typeof useSessionStore.getState>) =>
      deriveSidebarHostActivity({
        serverId,
        session: state.sessions[serverId],
        pendingCreateAttempts,
      }),
    [pendingCreateAttempts, serverId],
  );
  return useStoreWithEqualityFn(useSessionStore, selector, shallow);
}

function MoreHostsButton({
  hosts,
  value,
  onSelect,
  onOpenHostSettings,
  title,
}: {
  hosts: { serverId: string; label: string }[];
  value: string;
  onSelect: (id: string) => void;
  onOpenHostSettings: (serverId: string) => void;
  title: string;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<View>(null);
  const handlePress = useCallback(() => setOpen(true), []);
  return (
    <HostPicker
      hosts={hosts}
      value={value}
      onSelect={onSelect}
      open={open}
      onOpenChange={setOpen}
      anchorRef={anchorRef}
      includeAllHost
      onOpenHostSettings={onOpenHostSettings}
      searchable
      title={title}
      desktopPlacement="bottom-start"
      hostOptionTestID={hostOptionTestID}
    >
      <View ref={anchorRef} collapsable={false} style={styles.moreDivider}>
        <PressHighlight
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel={title}
          hitSlop={4}
          style={moreButtonStyle}
          testID="sidebar-host-strip-more"
        >
          <ThemedChevronDown size={CHIP_ICON_SIZE} uniProps={mutedColorMapping} />
        </PressHighlight>
      </View>
    </HostPicker>
  );
}

function hostOptionTestID(serverId: string): string {
  return `sidebar-host-strip-option-${serverId}`;
}

function moreButtonStyle({ hovered = false }: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.moreButton, hovered && styles.chipHovered];
}

const styles = StyleSheet.create((theme) => ({
  container: {
    paddingTop: theme.spacing[1.5],
    paddingBottom: theme.spacing[1],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: theme.spacing[2],
    paddingRight: theme.spacing[1],
    gap: theme.spacing[0.5],
  },
  scrollContainer: {
    position: "relative",
    flex: 1,
    minWidth: 0,
  },
  track: {
    flexDirection: "row",
    gap: theme.spacing[0.5],
    alignItems: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    minHeight: density.tightRowHeight,
    paddingHorizontal: { xs: theme.spacing[3], md: theme.spacing[2] },
    borderRadius: theme.borderRadius.full,
  },
  chipHovered: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  chipSelected: {
    backgroundColor: theme.colors.surface3,
  },
  chipLabel: {
    ...densityText(theme, "secondary"),
    color: theme.colors.foregroundMuted,
    maxWidth: 160,
  },
  chipLabelSelected: {
    color: theme.colors.foreground,
  },
  count: {
    minWidth: 18,
    paddingHorizontal: theme.spacing[1],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface3,
    alignItems: "center",
  },
  countText: {
    ...densityText(theme, "caption"),
    color: theme.colors.foregroundMuted,
  },
  needsInput: {
    width: 7,
    height: 7,
    marginLeft: -theme.spacing[0.5],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.statusDotDanger,
  },
  moreDivider: {
    borderLeftWidth: theme.borderWidth[1],
    borderLeftColor: theme.colors.border,
    paddingLeft: theme.spacing[0.5],
  },
  moreButton: {
    width: density.tightRowHeight,
    height: density.tightRowHeight,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.full,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[1],
  },
  summaryText: {
    ...densityText(theme, "caption"),
    color: theme.colors.foregroundMuted,
  },
  summaryClearButton: {
    paddingHorizontal: theme.spacing[1.5],
    borderRadius: theme.borderRadius.base,
  },
  summaryClear: {
    ...densityText(theme, "caption"),
    color: theme.colors.foreground,
  },
}));
