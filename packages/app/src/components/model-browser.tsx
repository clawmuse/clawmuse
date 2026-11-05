import { createContext, useCallback, useContext, useMemo, useReducer, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  FlatList as SheetFlatList,
  ScrollView as SheetScrollView,
} from "@/components/ui/scroll-view";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { AlertTriangle, Check, Pencil, Plus, Search, Settings } from "lucide-react-native";
import type { AgentProvider } from "@getpaseo/protocol/agent-types";
import {
  AgentProfileGlyph,
  type AgentProfilePicker,
  type AgentProfilePickerRow as AgentProfilePickerRowModel,
  type AgentProfileSeed,
} from "@/agent-profiles";
import type { SheetHeader } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useProviderIcon } from "@/components/provider-icons";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isNative, isWeb } from "@/constants/platform";
import {
  buildProviderQualifiedDescription,
  buildSelectedTriggerLabel,
  getProviderModelRows,
  resolveSelectedModelLabel,
  type ProviderSelectionModelRow,
  type ProviderSelectorProvider,
} from "@/provider-selection/provider-selection";
import type { RecentModelSelection } from "@/create-agent-preferences/preferences";
import { useProviderSettingsStore } from "@/stores/provider-settings-store";
import { useCurrentOverlayLayer } from "@/lib/overlay-root";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import {
  groupProfilesByProviderModel,
  resolveInitialActiveProviderId,
  resolveModelBrowserAllView,
  resolveRecentModelRows,
} from "@/components/model-browser-view";

const DESKTOP_VIEW_MIN_HEIGHT = 220;
const DESKTOP_VIEW_MAX_HEIGHT = 400;
const DESKTOP_VIEW_BASE_HEIGHT = 88;
const DESKTOP_TAB_BAR_HEIGHT = 40;
const DESKTOP_SECTION_HEADING_HEIGHT = 28;
const DESKTOP_MODEL_ROW_HEIGHT = 40;

const ThemedAlertTriangle = withUnistyles(AlertTriangle);
const ThemedCheck = withUnistyles(Check);
const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);
const ThemedPencil = withUnistyles(Pencil);
const ThemedPlus = withUnistyles(Plus);
const ThemedSearch = withUnistyles(Search);
const ThemedSettings = withUnistyles(Settings);

function ProviderSettingsAction({
  accessibilityLabel,
  provider,
  serverId,
}: {
  accessibilityLabel: string;
  provider: string;
  serverId: string | null;
}) {
  const overlayParentLayer = useCurrentOverlayLayer();
  const handlePress = useCallback(() => {
    if (!serverId) return;
    useProviderSettingsStore.getState().open({ serverId, provider, overlayParentLayer });
  }, [overlayParentLayer, provider, serverId]);

  return (
    <Pressable
      onPress={handlePress}
      disabled={!serverId}
      hitSlop={8}
      style={iconButtonStyle}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={`selector-header-settings-${provider}`}
    >
      <HeaderSettingsIcon disabled={!serverId} />
    </Pressable>
  );
}

function AgentProfilesEditAction({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Tooltip delayDuration={250} enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger asChild>
        <Pressable
          onPress={onPress}
          hitSlop={8}
          style={iconButtonStyle}
          accessibilityRole="button"
          accessibilityLabel={t("modelSelector.editProfilesLabel")}
          testID="model-profiles-edit"
        >
          <ThemedPencil size={ICON_SIZE.xs} uniProps={foregroundExtraMutedMapping} />
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="top" align="center" offset={8}>
        <Text style={styles.tooltipText}>{t("modelSelector.editProfilesLabel")}</Text>
      </TooltipContent>
    </Tooltip>
  );
}

const IndependentScrollGestureContext = createContext<ReturnType<typeof Gesture.Native> | null>(
  null,
);

const foregroundMutedMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});

const foregroundExtraMutedMapping = (theme: Theme) => ({
  color: theme.colors.foregroundExtraMuted,
});

const headerSettingsMapping = (disabled: boolean) => (theme: Theme) => ({
  color: disabled ? theme.colors.border : theme.colors.foregroundMuted,
});

interface ModelBrowserInput {
  providers: ProviderSelectorProvider[];
  selectedProvider: string;
  selectedModel: string;
  isLoading: boolean;
  autoFocusSearch?: boolean;
  /** Pinned above the active provider's models. `null` hides the section. */
  profiles?: AgentProfilePicker | null;
  /** Stored recent picks powering the Recently used section. */
  recentModels?: readonly RecentModelSelection[];
  serverId?: string | null;
}

export interface ModelBrowserState {
  serverId: string | null;
  providers: ProviderSelectorProvider[];
  selectedProvider: string;
  selectedModel: string;
  profiles: AgentProfilePicker | null;
  /** The provider whose models the browse view lists; `null` when none exist. */
  activeProviderId: string | null;
  /** Recent picks resolved against the current catalogs, most recent first. */
  recentModelRows: ProviderSelectionModelRow[];
  searchQuery: string;
  isSearchFocused: boolean;
  header: SheetHeader;
  selectedModelLabel: string;
  triggerLabel: string;
  desktopFixedHeight: number | undefined;
  selectProviderTab: (providerId: string) => void;
  prepareToOpen: () => void;
  reset: () => void;
}

interface ModelBrowserProps {
  state: ModelBrowserState;
  onSelect: (provider: string, modelId: string) => void;
  /** Applying a profile resolves the pick and dismisses, exactly like a model row. */
  onApplyProfile?: (profileId: string) => void;
  onEditProfiles?: () => void;
  onCreateProfile?: (seed: AgentProfileSeed) => void;
  onEditProfile?: (profileId: string) => void;
  onRetryProvider?: (provider: AgentProvider) => void;
  isRetryingProvider?: boolean;
  scrolling?: "sheet" | "independent";
  /** Empty focused search shows all model rows instead of the browse root. */
  searchAllOnFocus?: boolean;
  /** Replaces the whole browse view while the search is empty. */
  rootBrowseContent?: React.ReactNode;
  /** Hide the pinned Profiles section while still using rows for model matching. */
  showProfilesSection?: boolean;
}

interface ModelBrowserContentProps extends Omit<ModelBrowserProps, "state" | "scrolling"> {
  serverId: string | null;
  activeProviderId: string | null;
  recentModelRows: ProviderSelectionModelRow[];
  providers: ProviderSelectorProvider[];
  selectedProvider: string;
  selectedModel: string;
  searchQuery: string;
  isSearchFocused: boolean;
  profiles: AgentProfilePicker | null;
  onSelectProviderTab: (providerId: string) => void;
  scrolling: "sheet" | "independent";
  searchAllOnFocus: boolean;
  rootBrowseContent?: React.ReactNode;
}

type ProviderGlyphTone = "muted" | "foreground";

export function ModelProviderGlyph({
  provider,
  serverId,
  size,
  tone = "muted",
}: {
  provider: string;
  serverId: string | null;
  size: number;
  tone?: ProviderGlyphTone;
}) {
  const Icon = useProviderIcon(provider, serverId);
  const color =
    tone === "foreground" ? styles.providerIconForeground.color : styles.providerIconMuted.color;
  return <Icon size={size} color={color} />;
}

function HeaderSettingsIcon({ disabled }: { disabled: boolean }) {
  const uniProps = useMemo(() => headerSettingsMapping(disabled), [disabled]);
  return <ThemedSettings size={ICON_SIZE.sm} uniProps={uniProps} />;
}

function iconButtonStyle({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) {
  return [
    styles.rowIconButton,
    Boolean(hovered) && styles.rowIconButtonHovered,
    pressed && styles.rowIconButtonPressed,
  ];
}

function resolveDesktopFixedHeight({
  providers,
  activeProvider,
  recentRowCount,
  profileRowCount,
}: {
  providers: ProviderSelectorProvider[];
  activeProvider: ProviderSelectorProvider | null;
  recentRowCount: number;
  profileRowCount: number;
}): number {
  const modelRowCount =
    (activeProvider ? getProviderModelRows(activeProvider).length : 0) +
    recentRowCount +
    profileRowCount;
  const chromeHeight =
    DESKTOP_VIEW_BASE_HEIGHT +
    (providers.length > 1 ? DESKTOP_TAB_BAR_HEIGHT : 0) +
    (recentRowCount > 0 ? DESKTOP_SECTION_HEADING_HEIGHT : 0) +
    (profileRowCount > 0 ? DESKTOP_SECTION_HEADING_HEIGHT : 0);
  return Math.min(
    Math.max(DESKTOP_VIEW_MIN_HEIGHT, chromeHeight + modelRowCount * DESKTOP_MODEL_ROW_HEIGHT),
    DESKTOP_VIEW_MAX_HEIGHT,
  );
}

export function useModelBrowser({
  providers,
  selectedProvider,
  selectedModel,
  isLoading,
  autoFocusSearch = isWeb,
  profiles = null,
  recentModels,
  serverId = null,
}: ModelBrowserInput): ModelBrowserState {
  const { t } = useTranslation();
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [searchResetKey, bumpSearchResetKey] = useReducer((key: number) => key + 1, 0);

  const initialActiveProviderId = useMemo(
    () => resolveInitialActiveProviderId({ providers, selectedProvider }),
    [providers, selectedProvider],
  );

  const recentModelRows = useMemo(
    () => resolveRecentModelRows({ recentModels, providers }),
    [providers, recentModels],
  );

  const activeProvider = useMemo(
    () => providers.find((entry) => entry.id === activeProviderId) ?? null,
    [activeProviderId, providers],
  );

  const prepareToOpen = useCallback(() => {
    setActiveProviderId(initialActiveProviderId);
  }, [initialActiveProviderId]);

  const reset = useCallback(() => {
    setSearchQuery("");
    setIsSearchFocused(false);
    bumpSearchResetKey();
  }, []);

  const selectProviderTab = useCallback((providerId: string) => {
    setActiveProviderId(providerId);
  }, []);

  const handleSearchQueryChange = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  const header = useMemo<SheetHeader>(
    () => ({
      title: t("modelSelector.selectModel"),
      actions: activeProvider ? (
        <View style={styles.headerActionRow}>
          <ProviderSettingsAction
            serverId={serverId}
            provider={activeProvider.id}
            accessibilityLabel={t("modelSelector.openProviderSettings", {
              provider: activeProvider.label,
            })}
          />
        </View>
      ) : undefined,
      search: {
        onChange: handleSearchQueryChange,
        onFocus: () => setIsSearchFocused(true),
        onBlur: () => setIsSearchFocused(false),
        resetKey: `browse:${searchResetKey}`,
        placeholder:
          providers.length > 1
            ? t("modelSelector.searchAllPlaceholder")
            : t("modelSelector.searchPlaceholder"),
        autoFocus: autoFocusSearch,
        testID: providers.length > 1 ? "model-search-all-input" : "model-search-input",
      },
    }),
    [
      activeProvider,
      autoFocusSearch,
      handleSearchQueryChange,
      providers.length,
      searchResetKey,
      serverId,
      t,
    ],
  );

  const selectedModelLabel = useMemo(
    () =>
      resolveSelectedModelLabel({
        providers,
        selectedProvider,
        selectedModel,
        isLoading,
      }),
    [isLoading, providers, selectedModel, selectedProvider],
  );

  const triggerLabel = useMemo(() => {
    const isPlaceholder =
      selectedModelLabel === t("modelSelector.loading") ||
      selectedModelLabel === t("modelSelector.selectModel");
    return isPlaceholder ? selectedModelLabel : buildSelectedTriggerLabel(selectedModelLabel);
  }, [selectedModelLabel, t]);

  const profileRowCount = profiles?.rows.length ?? 0;

  const desktopFixedHeight = useMemo(
    () =>
      resolveDesktopFixedHeight({
        providers,
        activeProvider,
        recentRowCount: recentModelRows.length,
        profileRowCount,
      }),
    [activeProvider, profileRowCount, providers, recentModelRows.length],
  );

  return {
    serverId,
    providers,
    selectedProvider,
    selectedModel,
    profiles,
    activeProviderId,
    recentModelRows,
    searchQuery,
    isSearchFocused,
    header,
    selectedModelLabel,
    triggerLabel,
    desktopFixedHeight,
    selectProviderTab,
    prepareToOpen,
    reset,
  };
}

function normalizeSearchQuery(value: string): string {
  return value.trim().toLowerCase();
}

interface ModelBrowserPressableProps {
  children: React.ReactNode | ((state: PressableStateCallbackType) => React.ReactNode);
  style?:
    | StyleProp<ViewStyle>
    | ((state: PressableStateCallbackType & { hovered?: boolean }) => StyleProp<ViewStyle>);
  onPress: () => void;
  hitSlop?: number;
  accessibilityLabel?: string;
  /** Only rows that can express selection pass this; the rest stay unannotated. */
  accessibilitySelected?: boolean;
  testID?: string;
}

function ModelBrowserPressable({
  children,
  style,
  onPress,
  hitSlop,
  accessibilityLabel,
  accessibilitySelected,
  testID,
}: ModelBrowserPressableProps) {
  const independentScrollGesture = useContext(IndependentScrollGestureContext);
  const [pressed, setPressed] = useState(false);
  // Android's scroll handler must keep the pointer stream until release so a
  // fling survives leaving the short viewport. A simultaneous Tap keeps rows
  // interactive, while maxDistance makes a real scroll fail instead of select.
  const tapGesture = useMemo(() => {
    const gesture = Gesture.Tap()
      .maxDistance(8)
      .shouldCancelWhenOutside(true)
      .runOnJS(true)
      .onBegin(() => setPressed(true))
      .onEnd((_event, success) => {
        if (success) onPress();
      })
      .onFinalize(() => setPressed(false));
    if (hitSlop !== undefined) gesture.hitSlop(hitSlop);
    if (independentScrollGesture) {
      gesture.simultaneousWithExternalGesture(independentScrollGesture);
    }
    return gesture;
  }, [hitSlop, independentScrollGesture, onPress]);
  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      onPress();
    },
    [onPress],
  );
  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === "activate") onPress();
    },
    [onPress],
  );
  const accessibilityState = useMemo(
    () => (accessibilitySelected === undefined ? undefined : { selected: accessibilitySelected }),
    [accessibilitySelected],
  );

  if (!independentScrollGesture) {
    return (
      <Pressable
        onPress={handlePress}
        hitSlop={hitSlop}
        style={style}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={accessibilityState}
        aria-selected={accessibilitySelected}
        testID={testID}
      >
        {children}
      </Pressable>
    );
  }

  const state = { pressed };
  const resolvedStyle = typeof style === "function" ? style(state) : style;
  const resolvedChildren = typeof children === "function" ? children(state) : children;
  return (
    <GestureDetector gesture={tapGesture}>
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={accessibilityState}
        aria-selected={accessibilitySelected}
        accessibilityActions={[{ name: "activate" }]}
        onAccessibilityAction={handleAccessibilityAction}
        style={resolvedStyle}
        testID={testID}
      >
        {resolvedChildren}
      </View>
    </GestureDetector>
  );
}

type ModelBrowserRowTone = "default" | "elevated";

function ModelBrowserRow({
  label,
  description,
  leadingSlot,
  trailingSlot,
  selected = false,
  selectionIndicator = false,
  tone = "default",
  labelMuted = false,
  onPress,
  testID,
}: {
  label: string;
  description?: string;
  leadingSlot: React.ReactNode;
  trailingSlot?: React.ReactNode;
  selected?: boolean;
  selectionIndicator?: boolean;
  tone?: ModelBrowserRowTone;
  /** For rows that offer an action rather than name a thing you can pick. */
  labelMuted?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const pressableStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.browserRow,
      styles.browserModelRow,
      Boolean(hovered) &&
        (tone === "elevated" ? styles.browserRowHoveredElevated : styles.browserRowHovered),
      pressed && (tone === "default" ? styles.browserRowPressed : styles.browserRowPressedElevated),
    ],
    [tone],
  );
  const contentStyle = useMemo(
    () => [styles.browserRowText, description && styles.browserRowTextInline],
    [description],
  );
  const hasTrailing = selected || trailingSlot;

  return (
    <ModelBrowserPressable
      onPress={onPress}
      style={pressableStyle}
      // A profile row is an action, not a selection, so it carries no selection
      // state at all — only rows that draw the checkmark claim one.
      accessibilitySelected={selectionIndicator ? selected : undefined}
      testID={testID}
    >
      <View style={styles.browserRowContent}>
        <View style={styles.browserRowLeading}>{leadingSlot}</View>
        <View style={contentStyle}>
          <Text
            numberOfLines={1}
            style={labelMuted ? styles.browserRowLabelMuted : styles.browserRowLabel}
          >
            {label}
          </Text>
          {description ? (
            <Text numberOfLines={1} style={styles.browserRowDescription}>
              {description}
            </Text>
          ) : null}
        </View>
        {hasTrailing ? (
          <View style={styles.browserRowTrailing}>
            {selectionIndicator ? (
              <View style={styles.browserRowSelection}>
                {selected ? (
                  <ThemedCheck size={ICON_SIZE.sm} uniProps={foregroundMutedMapping} />
                ) : null}
              </View>
            ) : null}
            {trailingSlot}
          </View>
        ) : null}
      </View>
    </ModelBrowserPressable>
  );
}

function ModelRowProfileAction({
  hovered,
  onPress,
  label,
  testID,
  children,
}: {
  hovered: boolean;
  onPress: () => void;
  label: string;
  testID: string;
  children: React.ReactNode;
}) {
  const isCompact = useIsCompactFormFactor();
  const visible = hovered || isNative || isCompact;
  const pressableStyle = useCallback(
    ({ hovered: buttonHovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.rowIconButton,
      Boolean(buttonHovered) && styles.rowIconButtonHovered,
      pressed && styles.rowIconButtonPressed,
      !visible && styles.profileActionHidden,
    ],
    [visible],
  );
  return (
    <Tooltip delayDuration={250} enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger asChild>
        <Pressable
          onPress={onPress}
          hitSlop={8}
          style={pressableStyle}
          pointerEvents={visible ? "auto" : "none"}
          accessibilityRole="button"
          accessibilityLabel={label}
          testID={testID}
        >
          {children}
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="top" align="center" offset={8}>
        <Text style={styles.tooltipText}>{label}</Text>
      </TooltipContent>
    </Tooltip>
  );
}

function ModelRow({
  row,
  serverId,
  isSelected,
  showProviderLabel = false,
  onPress,
  profiledRows,
  onCreateProfile,
  onEditProfile,
  onEditProfiles,
  idPrefix = "model",
}: {
  row: ProviderSelectionModelRow;
  serverId: string | null;
  isSelected: boolean;
  showProviderLabel?: boolean;
  onPress: () => void;
  profiledRows: AgentProfilePickerRowModel[];
  onCreateProfile?: (seed: AgentProfileSeed) => void;
  onEditProfile?: (profileId: string) => void;
  onEditProfiles?: () => void;
  /** Recent rows use `recent-model` so `model-row-*` selectors stay unambiguous. */
  idPrefix?: string;
}) {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const leadingSlot = useMemo(
    () => <ModelProviderGlyph provider={row.provider} serverId={serverId} size={ICON_SIZE.sm} />,
    [row.provider, serverId],
  );

  const description = showProviderLabel ? buildProviderQualifiedDescription(row) : row.description;
  const primary = profiledRows[profiledRows.length - 1];

  const handleCreateProfile = useCallback(() => {
    onCreateProfile?.({
      provider: row.provider,
      modelId: row.modelId,
      name: row.modelLabel,
    });
  }, [onCreateProfile, row.modelId, row.modelLabel, row.provider]);

  const handleEditProfile = useCallback(() => {
    onEditProfile?.(primary.id);
  }, [onEditProfile, primary]);

  const handleEditProfiles = useCallback(() => {
    onEditProfiles?.();
  }, [onEditProfiles]);

  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);

  const profileAction = useMemo(() => {
    if (row.modelId.length === 0) {
      return null;
    }
    if (profiledRows.length === 0) {
      if (!onCreateProfile) {
        return null;
      }
      return (
        <ModelRowProfileAction
          hovered={isHovered}
          onPress={handleCreateProfile}
          label={t("modelSelector.createProfileFromModel")}
          testID={`${idPrefix}-create-profile-${row.provider}-${row.modelId}`}
        >
          <ThemedPlus size={ICON_SIZE.xs} uniProps={foregroundMutedMapping} />
        </ModelRowProfileAction>
      );
    }
    if (profiledRows.length === 1) {
      if (!onEditProfile) {
        return null;
      }
      return (
        <ModelRowProfileAction
          hovered={isHovered}
          onPress={handleEditProfile}
          label={t("modelSelector.editProfileLabel", { name: primary.name })}
          testID={`${idPrefix}-edit-profile-${row.provider}-${row.modelId}`}
        >
          <AgentProfileGlyph icon={primary.icon} color={primary.color} size={ICON_SIZE.xs} />
        </ModelRowProfileAction>
      );
    }
    if (!onEditProfiles) {
      return null;
    }
    return (
      <ModelRowProfileAction
        hovered={isHovered}
        onPress={handleEditProfiles}
        label={t("modelSelector.editProfilesCount", { count: profiledRows.length })}
        testID={`${idPrefix}-edit-profiles-${row.provider}-${row.modelId}`}
      >
        <AgentProfileGlyph icon={primary.icon} color={primary.color} size={ICON_SIZE.xs} />
      </ModelRowProfileAction>
    );
  }, [
    handleCreateProfile,
    handleEditProfile,
    handleEditProfiles,
    idPrefix,
    isHovered,
    onCreateProfile,
    onEditProfile,
    onEditProfiles,
    primary,
    profiledRows,
    row.modelId,
    row.provider,
    t,
  ]);

  const pressableStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.browserRow,
      Boolean(hovered) && styles.browserRowHovered,
      pressed && styles.browserRowPressed,
    ],
    [],
  );

  return (
    <View
      style={[styles.modelRowHoverBoundary, styles.browserModelRow]}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <ModelBrowserPressable
        onPress={onPress}
        style={pressableStyle}
        accessibilitySelected={isSelected}
        testID={`${idPrefix}-row-${row.provider}-${row.modelId}`}
      >
        <View style={styles.browserRowContent}>
          <View style={styles.browserRowLeading}>{leadingSlot}</View>
          <View style={[styles.browserRowText, description && styles.browserRowTextInline]}>
            <Text numberOfLines={1} style={styles.browserRowLabel}>
              {row.modelLabel}
            </Text>
            {description ? (
              <Text numberOfLines={1} style={styles.browserRowDescription}>
                {description}
              </Text>
            ) : null}
          </View>
          <View style={styles.browserRowTrailing}>
            <View style={styles.browserRowSelection}>
              {isSelected ? (
                <ThemedCheck size={ICON_SIZE.sm} uniProps={foregroundMutedMapping} />
              ) : null}
            </View>
            {profileAction ? <View style={styles.rowIconButton} /> : null}
          </View>
        </View>
      </ModelBrowserPressable>
      {/* The row renders a <button> on web, so its profile action sits beside it,
          over the slot reserved above, rather than inside it. */}
      {profileAction ? (
        <View style={styles.modelRowProfileActionSlot} pointerEvents="box-none">
          {profileAction}
        </View>
      ) : null}
    </View>
  );
}

function SelectableModelRow({
  row,
  serverId,
  isSelected,
  showProviderLabel,
  onSelect,
  profiledRows,
  onCreateProfile,
  onEditProfile,
  onEditProfiles,
  idPrefix,
}: {
  row: ProviderSelectionModelRow;
  serverId: string | null;
  isSelected: boolean;
  showProviderLabel?: boolean;
  onSelect: (provider: string, modelId: string) => void;
  profiledRows: AgentProfilePickerRowModel[];
  onCreateProfile?: (seed: AgentProfileSeed) => void;
  onEditProfile?: (profileId: string) => void;
  onEditProfiles?: () => void;
  idPrefix?: string;
}) {
  const handlePress = useCallback(() => {
    onSelect(row.provider, row.modelId);
  }, [onSelect, row.modelId, row.provider]);
  return (
    <ModelRow
      row={row}
      serverId={serverId}
      isSelected={isSelected}
      showProviderLabel={showProviderLabel}
      onPress={handlePress}
      profiledRows={profiledRows}
      onCreateProfile={onCreateProfile}
      onEditProfile={onEditProfile}
      onEditProfiles={onEditProfiles}
      idPrefix={idPrefix}
    />
  );
}

function AgentProfilePickerRowView({
  row,
  onApply,
}: {
  row: AgentProfilePickerRowModel;
  onApply: (profileId: string) => void;
}) {
  const handlePress = useCallback(() => onApply(row.id), [onApply, row.id]);
  const leadingSlot = useMemo(
    () => <AgentProfileGlyph icon={row.icon} color={row.color} size={ICON_SIZE.sm} />,
    [row.color, row.icon],
  );
  return (
    <ModelBrowserRow
      label={row.name}
      description={row.summary}
      tone="elevated"
      onPress={handlePress}
      leadingSlot={leadingSlot}
      testID={`model-profile-row-${row.id}`}
    />
  );
}

/**
 * Pinned above the active provider's models. Rows are actions, not selections:
 * applying a profile writes its values into the composer and nothing stays
 * bound to it, so there is no checkmark and no active row to show.
 */
function AgentProfilesPickerSection({
  rows,
  onApplyProfile,
  onEditProfiles,
}: {
  rows: AgentProfilePickerRowModel[];
  onApplyProfile?: (profileId: string) => void;
  onEditProfiles?: () => void;
}) {
  const { t } = useTranslation();
  const handleApply = useCallback(
    (profileId: string) => onApplyProfile?.(profileId),
    [onApplyProfile],
  );
  return (
    <View style={styles.profilesContainer}>
      <View style={styles.sectionHeading}>
        <Text style={styles.sectionHeadingText}>{t("modelSelector.profiles")}</Text>
        {onEditProfiles ? (
          <View style={styles.sectionHeadingAction}>
            <AgentProfilesEditAction onPress={onEditProfiles} />
          </View>
        ) : null}
      </View>
      {rows.map((row) => (
        <AgentProfilePickerRowView key={row.id} row={row} onApply={handleApply} />
      ))}
    </View>
  );
}

function CreateAgentProfileRow({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const leadingSlot = useMemo(
    () => (
      <View testID="model-profiles-create-icon">
        <ThemedPlus size={ICON_SIZE.sm} uniProps={foregroundMutedMapping} />
      </View>
    ),
    [],
  );
  return (
    <ModelBrowserRow
      label={t("modelSelector.createProfile")}
      labelMuted
      leadingSlot={leadingSlot}
      onPress={onPress}
      testID="model-profiles-empty"
    />
  );
}

function AgentProfilesPickerContent({
  rows,
  onApplyProfile,
  onEditProfiles,
}: {
  rows: AgentProfilePickerRowModel[];
  onApplyProfile?: (profileId: string) => void;
  onEditProfiles?: () => void;
}) {
  if (rows.length === 0) {
    return onEditProfiles ? <CreateAgentProfileRow onPress={onEditProfiles} /> : null;
  }
  return (
    <AgentProfilesPickerSection
      rows={rows}
      onApplyProfile={onApplyProfile}
      onEditProfiles={onEditProfiles}
    />
  );
}

function ProviderTab({
  provider,
  serverId,
  isActive,
  onPress,
}: {
  provider: ProviderSelectorProvider;
  serverId: string | null;
  isActive: boolean;
  onPress: (providerId: string) => void;
}) {
  const handlePress = useCallback(() => onPress(provider.id), [onPress, provider.id]);
  const pressableStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.providerTab,
      isActive && styles.providerTabActive,
      !isActive && Boolean(hovered) && styles.providerTabHovered,
      !isActive && pressed && styles.providerTabPressed,
    ],
    [isActive],
  );
  const selection = provider.modelSelection;
  const stateSlot = useMemo(() => {
    if (selection.kind === "loading") {
      return (
        <View style={styles.providerTabSpinner}>
          <ThemedLoadingSpinner size={ICON_SIZE.xs} uniProps={foregroundMutedMapping} />
        </View>
      );
    }
    if (selection.kind === "error") {
      return <ThemedAlertTriangle size={ICON_SIZE.xs} uniProps={foregroundMutedMapping} />;
    }
    return null;
  }, [selection.kind]);

  return (
    <ModelBrowserPressable
      onPress={handlePress}
      style={pressableStyle}
      accessibilitySelected={isActive}
      testID={`model-tab-${provider.id}`}
    >
      <View style={styles.providerTabContent}>
        <ModelProviderGlyph
          provider={provider.id}
          serverId={serverId}
          size={ICON_SIZE.sm}
          tone={isActive ? "foreground" : "muted"}
        />
        <Text
          numberOfLines={1}
          style={isActive ? styles.providerTabLabelActive : styles.providerTabLabel}
        >
          {provider.label}
        </Text>
        {stateSlot}
      </View>
    </ModelBrowserPressable>
  );
}

/**
 * One pill per provider, horizontally scrollable so large catalogs stay
 * reachable on narrow sheets. Tab state mirrors catalog health: loading and
 * error markers ride beside the label instead of hiding the tab.
 */
function ProviderTabBar({
  providers,
  serverId,
  activeProviderId,
  onSelectProvider,
}: {
  providers: ProviderSelectorProvider[];
  serverId: string | null;
  activeProviderId: string | null;
  onSelectProvider: (providerId: string) => void;
}) {
  return (
    <View style={styles.providerTabBar}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.providerTabBarContent}
      >
        {providers.map((provider) => (
          <ProviderTab
            key={provider.id}
            provider={provider}
            serverId={serverId}
            isActive={provider.id === activeProviderId}
            onPress={onSelectProvider}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function IndependentScrollBoundary({ children }: { children: React.ReactElement }) {
  // Prevent the parent sheet from cancelling Android's native scroll when the
  // finger crosses this viewport; receiving ACTION_UP is what preserves fling.
  const nativeScrollGesture = useMemo(
    () =>
      Gesture.Native()
        .shouldActivateOnStart(true)
        .shouldCancelWhenOutside(false)
        .disallowInterruption(true),
    [],
  );

  if (Platform.OS !== "android") {
    return children;
  }

  return (
    <IndependentScrollGestureContext.Provider value={nativeScrollGesture}>
      <GestureDetector gesture={nativeScrollGesture}>{children}</GestureDetector>
    </IndependentScrollGestureContext.Provider>
  );
}

function IndependentModelList({
  rows,
  renderItem,
  header,
}: {
  rows: ProviderSelectionModelRow[];
  renderItem: ({ item }: { item: ProviderSelectionModelRow }) => React.ReactElement;
  header?: React.ReactElement;
}) {
  return (
    <IndependentScrollBoundary>
      <FlatList
        data={rows}
        renderItem={renderItem}
        ListHeaderComponent={header}
        keyExtractor={getModelRowKey}
        style={styles.virtualizedModelList}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.virtualizedModelListContent}
        nestedScrollEnabled
        testID="compact-model-list"
      />
    </IndependentScrollBoundary>
  );
}

function getModelRowKey(row: ProviderSelectionModelRow): string {
  return row.favoriteKey;
}

function IndependentProviderList({ children }: { children: React.ReactNode }) {
  return (
    <IndependentScrollBoundary>
      <ScrollView
        style={styles.virtualizedModelList}
        contentContainerStyle={[
          styles.virtualizedModelListContent,
          styles.virtualizedProviderListContent,
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        testID="compact-provider-list"
      >
        {children}
      </ScrollView>
    </IndependentScrollBoundary>
  );
}

function ModelRowList({
  rows,
  serverId,
  selectedProvider,
  selectedModel,
  onSelect,
  showProviderLabel = false,
  header,
  scrolling,
  profiledLookup,
  onCreateProfile,
  onEditProfile,
  onEditProfiles,
}: {
  rows: ProviderSelectionModelRow[];
  serverId: string | null;
  selectedProvider: string;
  selectedModel: string;
  onSelect: (provider: string, modelId: string) => void;
  showProviderLabel?: boolean;
  header?: React.ReactElement;
  scrolling: "sheet" | "independent";
  profiledLookup: Map<string, AgentProfilePickerRowModel[]>;
  onCreateProfile?: (seed: AgentProfileSeed) => void;
  onEditProfile?: (profileId: string) => void;
  onEditProfiles?: () => void;
}) {
  const isCompact = useIsCompactFormFactor();
  const renderItem = useCallback(
    ({ item }: { item: ProviderSelectionModelRow }) => (
      <SelectableModelRow
        row={item}
        serverId={serverId}
        isSelected={item.provider === selectedProvider && item.modelId === selectedModel}
        showProviderLabel={showProviderLabel}
        onSelect={onSelect}
        profiledRows={profiledLookup.get(`${item.provider}:${item.modelId}`) ?? []}
        onCreateProfile={onCreateProfile}
        onEditProfile={onEditProfile}
        onEditProfiles={onEditProfiles}
      />
    ),
    [
      onEditProfile,
      onEditProfiles,
      onCreateProfile,
      onSelect,
      profiledLookup,
      selectedModel,
      selectedProvider,
      serverId,
      showProviderLabel,
    ],
  );
  const keyExtractor = useCallback((row: ProviderSelectionModelRow) => row.favoriteKey, []);

  if (scrolling === "independent") {
    return <IndependentModelList rows={rows} renderItem={renderItem} header={header} />;
  }

  if (isCompact && isNative) {
    return (
      <SheetFlatList
        data={rows}
        renderItem={renderItem}
        ListHeaderComponent={header}
        keyExtractor={keyExtractor}
        style={styles.virtualizedModelList}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.virtualizedModelListContent}
      />
    );
  }

  return (
    <View>
      {header}
      {rows.map((row) => (
        <View key={row.favoriteKey}>{renderItem({ item: row })}</View>
      ))}
    </View>
  );
}

function ProviderErrorEmptyState({
  providerId,
  message,
  onRetryProvider,
  isRetryingProvider,
}: {
  providerId: string;
  message: string;
  onRetryProvider?: (provider: AgentProvider) => void;
  isRetryingProvider: boolean;
}) {
  const { t } = useTranslation();
  const handleRetry = useCallback(() => {
    onRetryProvider?.(providerId);
  }, [onRetryProvider, providerId]);
  return (
    <View style={styles.emptyState}>
      <ThemedAlertTriangle size={ICON_SIZE.md} uniProps={foregroundMutedMapping} />
      <Text style={styles.emptyStateText}>{message}</Text>
      {onRetryProvider ? (
        <Button variant="default" size="sm" onPress={handleRetry} disabled={isRetryingProvider}>
          {isRetryingProvider ? t("modelSelector.retrying") : t("modelSelector.retry")}
        </Button>
      ) : null}
    </View>
  );
}

function ModelSearchEmptyState() {
  const { t } = useTranslation();
  return (
    <View style={styles.emptyState}>
      <ThemedSearch size={ICON_SIZE.md} uniProps={foregroundMutedMapping} />
      <Text style={styles.emptyStateText}>{t("modelSelector.noMatches")}</Text>
    </View>
  );
}

/**
 * The recent-picks section pinned between the tab bar and the model list. Rows
 * select exactly like catalog rows — picking a different provider's recent is
 * the fast path the redesign exists for.
 */
function RecentModelsSection({
  rows,
  serverId,
  selectedProvider,
  selectedModel,
  onSelect,
  profiledLookup,
  onCreateProfile,
  onEditProfile,
  onEditProfiles,
}: {
  rows: ProviderSelectionModelRow[];
  serverId: string | null;
  selectedProvider: string;
  selectedModel: string;
  onSelect: (provider: string, modelId: string) => void;
  profiledLookup: Map<string, AgentProfilePickerRowModel[]>;
  onCreateProfile?: (seed: AgentProfileSeed) => void;
  onEditProfile?: (profileId: string) => void;
  onEditProfiles?: () => void;
}) {
  const { t } = useTranslation();
  if (rows.length === 0) {
    return null;
  }
  return (
    <View>
      <View style={styles.sectionHeading}>
        <Text style={styles.sectionHeadingText}>{t("modelSelector.recentlyUsed")}</Text>
      </View>
      {rows.map((row) => (
        <SelectableModelRow
          key={row.favoriteKey}
          row={row}
          serverId={serverId}
          isSelected={row.provider === selectedProvider && row.modelId === selectedModel}
          showProviderLabel
          onSelect={onSelect}
          profiledRows={profiledLookup.get(`${row.provider}:${row.modelId}`) ?? []}
          onCreateProfile={onCreateProfile}
          onEditProfile={onEditProfile}
          onEditProfiles={onEditProfiles}
          idPrefix="recent-model"
        />
      ))}
      <View style={styles.recentSectionDivider} />
    </View>
  );
}

/**
 * The active provider's catalog: loading and error states inline so the tab
 * bar stays put above them, otherwise the scrollable row list with profiles
 * and recents folded into its header.
 */
function ActiveProviderModels({
  serverId,
  provider,
  profiles,
  recentModelRows,
  selectedProvider,
  selectedModel,
  onSelect,
  onApplyProfile,
  onEditProfiles,
  onCreateProfile,
  onEditProfile,
  profiledLookup,
  showProfilesSection,
  onRetryProvider,
  isRetryingProvider,
  scrolling,
}: {
  serverId: string | null;
  provider: ProviderSelectorProvider | null;
  profiles: AgentProfilePicker | null;
  recentModelRows: ProviderSelectionModelRow[];
  selectedProvider: string;
  selectedModel: string;
  onSelect: (provider: string, modelId: string) => void;
  onApplyProfile?: (profileId: string) => void;
  onEditProfiles?: () => void;
  onCreateProfile?: (seed: AgentProfileSeed) => void;
  onEditProfile?: (profileId: string) => void;
  profiledLookup: Map<string, AgentProfilePickerRowModel[]>;
  showProfilesSection: boolean;
  onRetryProvider?: (provider: AgentProvider) => void;
  isRetryingProvider: boolean;
  scrolling: "sheet" | "independent";
}) {
  const { t } = useTranslation();
  const listHeader = useMemo(() => {
    // Profiles stay cross-provider like the recents beside them: applying one
    // switches provider, so scoping it to the active tab would hide reachable
    // picks behind a tab press for no gain.
    const profilesContent =
      showProfilesSection && profiles ? (
        <AgentProfilesPickerContent
          rows={profiles.rows}
          onApplyProfile={onApplyProfile}
          onEditProfiles={onEditProfiles}
        />
      ) : null;
    if (!profilesContent && recentModelRows.length === 0) {
      return undefined;
    }
    return (
      <View>
        <RecentModelsSection
          rows={recentModelRows}
          serverId={serverId}
          selectedProvider={selectedProvider}
          selectedModel={selectedModel}
          onSelect={onSelect}
          profiledLookup={profiledLookup}
          onCreateProfile={onCreateProfile}
          onEditProfile={onEditProfile}
          onEditProfiles={onEditProfiles}
        />
        {profilesContent}
      </View>
    );
  }, [
    onApplyProfile,
    onCreateProfile,
    onEditProfile,
    onEditProfiles,
    onSelect,
    profiledLookup,
    profiles,
    recentModelRows,
    selectedModel,
    selectedProvider,
    serverId,
    showProfilesSection,
  ]);

  if (!provider) {
    return <ModelSearchEmptyState />;
  }
  const selection = provider.modelSelection;
  if (selection.kind === "loading") {
    return (
      <View style={styles.emptyState}>
        <View style={styles.rowSpinner}>
          <ThemedLoadingSpinner size={ICON_SIZE.sm} uniProps={foregroundMutedMapping} />
        </View>
        <Text style={styles.emptyStateText}>{t("modelSelector.loadingShort")}</Text>
      </View>
    );
  }
  if (selection.kind === "error") {
    return (
      <ProviderErrorEmptyState
        providerId={provider.id}
        message={selection.message}
        onRetryProvider={onRetryProvider}
        isRetryingProvider={isRetryingProvider}
      />
    );
  }
  return (
    <ModelRowList
      serverId={serverId}
      rows={getProviderModelRows(provider)}
      selectedProvider={selectedProvider}
      selectedModel={selectedModel}
      onSelect={onSelect}
      header={listHeader}
      scrolling={scrolling}
      profiledLookup={profiledLookup}
      onCreateProfile={onCreateProfile}
      onEditProfile={onEditProfile}
      onEditProfiles={onEditProfiles}
    />
  );
}

function ModelBrowserContent({
  serverId,
  activeProviderId,
  recentModelRows,
  providers,
  selectedProvider,
  selectedModel,
  searchQuery,
  isSearchFocused,
  profiles,
  onSelect,
  onApplyProfile,
  onEditProfiles,
  onCreateProfile,
  onEditProfile,
  onSelectProviderTab,
  onRetryProvider,
  isRetryingProvider = false,
  scrolling,
  searchAllOnFocus,
  rootBrowseContent,
  showProfilesSection = true,
}: ModelBrowserContentProps) {
  const { t } = useTranslation();
  const normalizedQuery = useMemo(() => normalizeSearchQuery(searchQuery), [searchQuery]);
  const profiledLookup = useMemo(
    () => groupProfilesByProviderModel(profiles?.rows ?? []),
    [profiles],
  );
  const activeProvider = useMemo(
    () => providers.find((provider) => provider.id === activeProviderId) ?? null,
    [activeProviderId, providers],
  );
  const allView = useMemo(
    () =>
      resolveModelBrowserAllView({
        providers,
        normalizedQuery,
        isSearchFocused: searchAllOnFocus && isSearchFocused,
      }),
    [isSearchFocused, normalizedQuery, providers, searchAllOnFocus],
  );
  const hasResults = profiles !== null || providers.length > 0 || rootBrowseContent != null;

  if (allView.kind === "noSearchMatches") {
    return (
      <View style={styles.emptyState} testID="model-search-empty">
        <ThemedSearch size={ICON_SIZE.md} uniProps={foregroundMutedMapping} />
        <Text style={styles.emptyStateText}>
          {t("modelSelector.noMatchesForQuery", { query: searchQuery.trim() })}
        </Text>
      </View>
    );
  }

  if (allView.kind === "searchResults") {
    return (
      <ModelRowList
        serverId={serverId}
        rows={allView.rows}
        selectedProvider={selectedProvider}
        selectedModel={selectedModel}
        onSelect={onSelect}
        showProviderLabel
        scrolling={scrolling}
        profiledLookup={profiledLookup}
        onCreateProfile={onCreateProfile}
        onEditProfile={onEditProfile}
        onEditProfiles={onEditProfiles}
      />
    );
  }

  if (rootBrowseContent != null) {
    const rootContent = (
      <View>
        {showProfilesSection && profiles ? (
          <AgentProfilesPickerContent
            rows={profiles.rows}
            onApplyProfile={onApplyProfile}
            onEditProfiles={onEditProfiles}
          />
        ) : null}
        {rootBrowseContent}
        {!hasResults ? <ModelSearchEmptyState /> : null}
      </View>
    );
    return scrolling === "independent" ? (
      <IndependentProviderList>{rootContent}</IndependentProviderList>
    ) : (
      <SheetScrollView
        style={styles.virtualizedModelList}
        contentContainerStyle={[
          styles.virtualizedModelListContent,
          styles.virtualizedProviderListContent,
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        testID="compact-provider-list"
      >
        {rootContent}
      </SheetScrollView>
    );
  }

  return (
    <View style={styles.browseBody}>
      {providers.length > 1 ? (
        <ProviderTabBar
          providers={providers}
          serverId={serverId}
          activeProviderId={activeProviderId}
          onSelectProvider={onSelectProviderTab}
        />
      ) : null}
      <ActiveProviderModels
        serverId={serverId}
        provider={activeProvider}
        profiles={profiles}
        recentModelRows={recentModelRows}
        selectedProvider={selectedProvider}
        selectedModel={selectedModel}
        onSelect={onSelect}
        onApplyProfile={onApplyProfile}
        onEditProfiles={onEditProfiles}
        onCreateProfile={onCreateProfile}
        onEditProfile={onEditProfile}
        profiledLookup={profiledLookup}
        showProfilesSection={showProfilesSection}
        onRetryProvider={onRetryProvider}
        isRetryingProvider={isRetryingProvider}
        scrolling={scrolling}
      />
    </View>
  );
}

export function ModelBrowser({
  state,
  onSelect,
  onApplyProfile,
  onEditProfiles,
  onCreateProfile,
  onEditProfile,
  onRetryProvider,
  isRetryingProvider = false,
  scrolling = "sheet",
  searchAllOnFocus = false,
  rootBrowseContent,
  showProfilesSection,
}: ModelBrowserProps) {
  return (
    <ModelBrowserContent
      serverId={state.serverId}
      activeProviderId={state.activeProviderId}
      recentModelRows={state.recentModelRows}
      providers={state.providers}
      selectedProvider={state.selectedProvider}
      selectedModel={state.selectedModel}
      searchQuery={state.searchQuery}
      isSearchFocused={state.isSearchFocused}
      profiles={state.profiles}
      onSelect={onSelect}
      onApplyProfile={onApplyProfile}
      onEditProfiles={onEditProfiles}
      onCreateProfile={onCreateProfile}
      onEditProfile={onEditProfile}
      onSelectProviderTab={state.selectProviderTab}
      onRetryProvider={onRetryProvider}
      isRetryingProvider={isRetryingProvider}
      scrolling={scrolling}
      searchAllOnFocus={searchAllOnFocus}
      rootBrowseContent={rootBrowseContent}
      showProfilesSection={showProfilesSection}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  headerActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  browseBody: {
    flex: 1,
    minHeight: 0,
  },
  providerTabBar: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  providerTabBarContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: isWeb ? theme.spacing[3] : theme.spacing[4],
    paddingVertical: theme.spacing[2],
  },
  providerTab: {
    borderRadius: theme.borderRadius["2xl"],
  },
  providerTabActive: {
    backgroundColor: theme.colors.surface2,
  },
  providerTabHovered: {
    backgroundColor: theme.colors.surface1,
  },
  providerTabPressed: {
    backgroundColor: theme.colors.surface2,
  },
  providerTabContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1.5],
    maxWidth: 160,
  },
  providerTabLabel: {
    fontSize: theme.fontSize.base,
    color: theme.colors.foregroundMuted,
    flexShrink: 1,
  },
  providerTabLabelActive: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foreground,
    flexShrink: 1,
  },
  providerTabSpinner: {
    transform: [{ scale: 0.7 }],
  },
  recentSectionDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
  },
  profilesContainer: {
    backgroundColor: theme.colors.surface1,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  sectionHeading: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: isWeb ? theme.spacing[3] : theme.spacing[6],
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[1],
  },
  sectionHeadingAction: {
    position: "absolute",
    top: theme.spacing[1],
    right: isWeb ? theme.spacing[3] : theme.spacing[6],
  },
  sectionHeadingText: {
    flex: 1,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.foregroundMuted,
  },
  browserRow: {
    flexDirection: "row",
    paddingVertical: theme.spacing[2],
    minHeight: 36,
  },
  modelRowHoverBoundary: {
    position: "relative",
  },
  modelRowProfileActionSlot: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: isWeb ? theme.spacing[3] : theme.spacing[6],
    justifyContent: "center",
  },
  browserModelRow: isWeb ? {} : { marginBottom: theme.spacing[1] },
  browserRowHovered: {
    backgroundColor: theme.colors.surface1,
  },
  browserRowHoveredElevated: {
    backgroundColor: theme.colors.surface2,
  },
  browserRowPressed: {
    backgroundColor: theme.colors.surface1,
  },
  browserRowPressedElevated: {
    backgroundColor: theme.colors.surface2,
  },
  browserRowContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: isWeb ? theme.spacing[3] : theme.spacing[6],
  },
  browserRowLeading: {
    width: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  browserRowText: {
    flex: 1,
    flexShrink: 1,
  },
  browserRowTextInline: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: theme.spacing[2],
  },
  browserRowLabel: {
    fontSize: theme.fontSize.base,
    color: theme.colors.foreground,
    flexShrink: 0,
  },
  browserRowLabelMuted: {
    fontSize: theme.fontSize.base,
    color: theme.colors.foregroundMuted,
    flexShrink: 0,
  },
  browserRowDescription: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    flexShrink: 1,
  },
  browserRowTrailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    marginLeft: "auto",
  },
  browserRowSelection: {
    width: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  rowIconButton: {
    width: 24,
    height: 24,
    borderRadius: theme.borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  rowSpinner: {
    transform: [{ scale: 0.7 }],
  },
  rowIconButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
  rowIconButtonPressed: {
    backgroundColor: theme.colors.surface1,
  },
  profileActionHidden: {
    opacity: 0,
  },
  emptyState: {
    padding: theme.spacing[4],
    alignItems: "center",
    gap: theme.spacing[2],
  },
  emptyStateText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.foregroundMuted,
  },
  tooltipText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
  },
  virtualizedModelList: {
    flex: 1,
  },
  virtualizedModelListContent: {
    paddingTop: theme.spacing[1],
    paddingBottom: theme.spacing[8],
  },
  virtualizedProviderListContent: {
    paddingTop: 0,
  },
  providerIconMuted: {
    color: theme.colors.foregroundMuted,
  },
  providerIconForeground: {
    color: theme.colors.foreground,
  },
}));
