import { useClawMuseDeviceLabel } from "@/clawmuse/device-label";
import { useTranslation } from "react-i18next";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { Pressable, ScrollView, View } from "react-native";
import type { GestureResponderEvent } from "react-native";
import { Check, GripVertical, Plus, Server, Settings } from "@/components/icons/app-icons";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { DraggableList, DraggableListHandle } from "@/components/draggable-list";
import type { DraggableRenderItemInfo } from "@/components/draggable-list.types";
import { HostStatusDot } from "@/components/host-status-dot";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxItem,
  SearchInput,
  type ComboboxProps,
} from "@/components/ui/combobox";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isNative } from "@/constants/platform";
import { type HostOrderDrop, useOrderedHosts } from "@/hosts/host-order";
import type { Theme } from "@/styles/theme";
import {
  ADD_HOST_OPTION_ID,
  ALL_HOSTS_OPTION_ID,
  ENABLE_BUILT_IN_DAEMON_OPTION_ID,
  getHostPickerLabel,
} from "./host-picker-constants";

export {
  ADD_HOST_OPTION_ID,
  ALL_HOSTS_OPTION_ID,
  ENABLE_BUILT_IN_DAEMON_OPTION_ID,
  getHostPickerLabel,
};

const SEARCHABLE_THRESHOLD = 10;
type RenderHostOption = NonNullable<ComboboxProps["renderOption"]>;
export interface HostPickerHost {
  serverId: string;
  label: string;
}

// The leading slot frames a 16px icon; the dot centres on that rail so it sits on the same
// axis as the Server/Plus icons of the system rows.
const STATUS_DOT_SIZE = 10;

const ThemedCheck = withUnistyles(Check);
const ThemedGripVertical = withUnistyles(GripVertical);
const ThemedPlus = withUnistyles(Plus);
const ThemedServer = withUnistyles(Server);
const ThemedSettings = withUnistyles(Settings);

const mutedSmIconProps = (theme: Theme) => ({
  size: theme.iconSize.sm,
  color: theme.colors.foregroundMuted,
});
const checkIconProps = (theme: Theme) => ({
  size: 16,
  color: theme.colors.foregroundMuted,
});

function hostKey(host: HostPickerHost): string {
  return host.serverId;
}

export function HostStatusDotSlot({ serverId }: { serverId: string }): ReactElement {
  return (
    <View style={styles.statusDotSlot}>
      <HostStatusDot serverId={serverId} size={STATUS_DOT_SIZE} />
    </View>
  );
}

export interface HostPickerOptionProps {
  serverId: string;
  label: string;
  showActiveConnection: boolean;
  selected?: boolean;
  active: boolean;
  onPress: () => void;
  onOpenHostSettings?: (serverId: string) => void;
  showDragHandle?: boolean;
  isDragging?: boolean;
  testID?: string;
}

export function HostPickerOption({
  serverId,
  label,
  selected,
  active,
  onPress,
  onOpenHostSettings,
  showDragHandle = false,
  isDragging = false,
  testID,
}: HostPickerOptionProps): ReactElement {
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
  // Trailing actions sit outside the row's button (see ComboboxItem's trailing branch), so they
  // get no hover fill from the row. Reveal on row hover instead — and always show on native or
  // compact layouts where there is no hover.
  const [isHovered, setIsHovered] = useState(false);
  const leadingSlot = useMemo(
    () => (
      <View style={styles.hostLeadingSlot}>
        {selected ? (
          <ThemedCheck uniProps={checkIconProps} />
        ) : (
          <HostStatusDot serverId={serverId} size={STATUS_DOT_SIZE} />
        )}
      </View>
    ),
    [selected, serverId],
  );
  const handleSettingsPress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      onOpenHostSettings?.(serverId);
    },
    [onOpenHostSettings, serverId],
  );
  const handleHoverIn = useCallback(() => setIsHovered(true), []);
  const handleHoverOut = useCallback(() => setIsHovered(false), []);
  const showActions = isNative || isCompact || isHovered || isDragging;
  const trailingSlot = useMemo(() => {
    if (!onOpenHostSettings && !showDragHandle) return undefined;
    const gear = onOpenHostSettings ? (
      <Pressable
        onPress={handleSettingsPress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Open ${label} settings`}
        style={styles.gearButton}
      >
        <ThemedSettings uniProps={mutedSmIconProps} />
      </Pressable>
    ) : null;
    let gearControl: ReactElement | null = null;
    if (gear) {
      gearControl = showActions ? (
        gear
      ) : (
        <View pointerEvents="none" style={styles.actionPlaceholder}>
          {gear}
        </View>
      );
    }
    const dragHandle = showDragHandle ? (
      <DraggableListHandle
        accessibilityLabel={t("sidebar.display.hostFilter.reorderHost", { name: label })}
        testID={`host-picker-drag-handle-${serverId}`}
        style={[styles.dragHandleButton, !showActions && styles.actionPlaceholder]}
      >
        <ThemedGripVertical uniProps={mutedSmIconProps} />
      </DraggableListHandle>
    ) : null;
    return (
      <View style={styles.trailingActions}>
        {dragHandle}
        {gearControl}
      </View>
    );
  }, [handleSettingsPress, label, onOpenHostSettings, serverId, showActions, showDragHandle, t]);

  return (
    <View onPointerEnter={handleHoverIn} onPointerLeave={handleHoverOut}>
      <ComboboxItem
        label={label}
        leadingSlot={leadingSlot}
        trailingAction={trailingSlot}
        active={active}
        onPress={onPress}
        testID={testID}
      />
    </View>
  );
}

function SelectableHostPickerOption({
  onSelect,
  serverId,
  ...rest
}: Omit<HostPickerOptionProps, "onPress"> & { onSelect: (serverId: string) => void }) {
  const handlePress = useCallback(() => onSelect(serverId), [onSelect, serverId]);
  return <HostPickerOption {...rest} serverId={serverId} onPress={handlePress} />;
}

const SYSTEM_HOST_PICKER_OPTION_LABEL_KEYS = {
  add: "settings.addHost",
  all: "sidebar.display.hostFilter.all",
  enableBuiltInDaemon: "settings.enableBuiltInDaemon",
} as const;

function SystemHostPickerOption({
  active,
  selected,
  onPress,
  kind,
  testID,
}: {
  active: boolean;
  selected?: boolean;
  onPress: () => void;
  kind: "add" | "all" | "enableBuiltInDaemon";
  testID?: string;
}): ReactElement {
  const { t } = useTranslation();
  const label = t(SYSTEM_HOST_PICKER_OPTION_LABEL_KEYS[kind]);
  const leadingSlot = useMemo(() => {
    if (selected) return <ThemedCheck uniProps={checkIconProps} />;
    return kind === "add" ? (
      <ThemedPlus uniProps={mutedSmIconProps} />
    ) : (
      <ThemedServer uniProps={mutedSmIconProps} />
    );
  }, [kind, selected]);

  return (
    <ComboboxItem
      label={label}
      leadingSlot={leadingSlot}
      active={active}
      onPress={onPress}
      testID={testID}
    />
  );
}

export interface HostPickerProps {
  hosts: HostPickerHost[];
  value: string;
  onSelect: (id: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorRef: React.RefObject<View | null>;
  includeAllHost?: boolean;
  includeAddHost?: boolean;
  onAddHost?: () => void;
  includeEnableBuiltInDaemon?: boolean;
  onEnableBuiltInDaemon?: () => void;
  showActiveConnection?: boolean;
  onOpenHostSettings?: (serverId: string) => void;
  searchable?: boolean;
  reorderable?: boolean;
  onReorder?: (drop: HostOrderDrop) => void;
  title?: string;
  desktopPlacement?: ComboboxProps["desktopPlacement"];
  desktopMinWidth?: number;
  addHostTestID?: string;
  hostOptionTestID?: (serverId: string) => string;
  children: ReactNode;
}

export function HostPicker({
  hosts,
  value,
  onSelect,
  open,
  onOpenChange,
  anchorRef,
  includeAllHost,
  includeAddHost,
  onAddHost,
  includeEnableBuiltInDaemon,
  onEnableBuiltInDaemon,
  showActiveConnection,
  onOpenHostSettings,
  searchable,
  reorderable = false,
  onReorder,
  title,
  desktopPlacement = "bottom-start",
  desktopMinWidth,
  addHostTestID,
  hostOptionTestID,
  children,
}: HostPickerProps): ReactElement {
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
  const deviceLabel = useClawMuseDeviceLabel();
  const orderedHosts = useOrderedHosts(hosts);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResetKey, setSearchResetKey] = useState(0);

  useEffect(() => {
    if (open) {
      setSearchQuery("");
      setSearchResetKey((prev) => prev + 1);
    }
  }, [open]);

  const options = useMemo(() => {
    const hostOptions = orderedHosts.map((host) => ({
      id: host.serverId,
      label: deviceLabel(host.serverId, host.label),
    }));
    if (includeAllHost)
      hostOptions.unshift({ id: ALL_HOSTS_OPTION_ID, label: t("sidebar.display.hostFilter.all") });
    if (includeAddHost) hostOptions.push({ id: ADD_HOST_OPTION_ID, label: t("settings.addHost") });
    if (includeEnableBuiltInDaemon)
      hostOptions.push({
        id: ENABLE_BUILT_IN_DAEMON_OPTION_ID,
        label: t("settings.enableBuiltInDaemon"),
      });
    return hostOptions;
  }, [orderedHosts, includeAllHost, includeAddHost, includeEnableBuiltInDaemon, deviceLabel, t]);

  const isSearchable = searchable === true && orderedHosts.length > SEARCHABLE_THRESHOLD;
  const useReorderBody = Boolean(reorderable && onReorder && orderedHosts.length > 1);
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const handleSelect = useCallback(
    (id: string) => {
      if (id === ADD_HOST_OPTION_ID) {
        onAddHost?.();
      } else if (id === ENABLE_BUILT_IN_DAEMON_OPTION_ID) {
        onEnableBuiltInDaemon?.();
      } else {
        onSelect(id);
      }
      onOpenChange(false);
    },
    [onAddHost, onEnableBuiltInDaemon, onOpenChange, onSelect],
  );

  const handleOpenHostSettings = useCallback(
    (serverId: string) => {
      onOpenHostSettings?.(serverId);
      onOpenChange(false);
    },
    [onOpenHostSettings, onOpenChange],
  );

  const handleHostDragEnd = useCallback(
    (nextHosts: HostPickerHost[], moved: string) => {
      onReorder?.({
        moved,
        after: nextHosts.map((host) => host.serverId),
      });
    },
    [onReorder],
  );

  const renderOption = useCallback<RenderHostOption>(
    ({ option, selected, active, onPress }) => {
      if (option.id === ADD_HOST_OPTION_ID) {
        return (
          <SystemHostPickerOption
            kind="add"
            active={active}
            onPress={onPress}
            testID={addHostTestID}
          />
        );
      }
      if (option.id === ALL_HOSTS_OPTION_ID) {
        return (
          <SystemHostPickerOption
            kind="all"
            active={active}
            selected={selected}
            onPress={onPress}
            testID={hostOptionTestID?.(option.id)}
          />
        );
      }
      if (option.id === ENABLE_BUILT_IN_DAEMON_OPTION_ID) {
        return (
          <SystemHostPickerOption kind="enableBuiltInDaemon" active={active} onPress={onPress} />
        );
      }
      return (
        <HostPickerOption
          serverId={option.id}
          label={option.label}
          showActiveConnection={showActiveConnection === true}
          selected={selected}
          active={active}
          onPress={onPress}
          onOpenHostSettings={onOpenHostSettings ? handleOpenHostSettings : undefined}
          testID={hostOptionTestID?.(option.id)}
        />
      );
    },
    [
      addHostTestID,
      hostOptionTestID,
      onOpenHostSettings,
      showActiveConnection,
      handleOpenHostSettings,
    ],
  );

  const renderReorderHostItem = useCallback(
    ({ item, isActive }: DraggableRenderItemInfo<HostPickerHost>) => {
      const displayLabel = deviceLabel(item.serverId, item.label);
      return (
        <SelectableHostPickerOption
          serverId={item.serverId}
          label={displayLabel}
          showActiveConnection={showActiveConnection === true}
          selected={value === item.serverId}
          active={isActive}
          onSelect={handleSelect}
          onOpenHostSettings={onOpenHostSettings ? handleOpenHostSettings : undefined}
          showDragHandle
          isDragging={isActive}
          testID={hostOptionTestID?.(item.serverId)}
        />
      );
    },
    [
      deviceLabel,
      handleOpenHostSettings,
      handleSelect,
      hostOptionTestID,
      onOpenHostSettings,
      showActiveConnection,
      value,
    ],
  );

  const allHostsLabel = t("sidebar.display.hostFilter.all");
  const allHostsMatches =
    includeAllHost && (!normalizedSearch || allHostsLabel.toLowerCase().includes(normalizedSearch));
  const handleSelectAllHosts = useCallback(() => handleSelect(ALL_HOSTS_OPTION_ID), [handleSelect]);
  const handleSelectAddHost = useCallback(() => handleSelect(ADD_HOST_OPTION_ID), [handleSelect]);
  const handleSelectEnableBuiltInDaemon = useCallback(
    () => handleSelect(ENABLE_BUILT_IN_DAEMON_OPTION_ID),
    [handleSelect],
  );
  const allHostsHeader = useMemo(
    () =>
      includeAllHost ? (
        <SystemHostPickerOption
          kind="all"
          active={false}
          selected={value === ALL_HOSTS_OPTION_ID}
          onPress={handleSelectAllHosts}
          testID={hostOptionTestID?.(ALL_HOSTS_OPTION_ID)}
        />
      ) : null,
    [handleSelectAllHosts, hostOptionTestID, includeAllHost, value],
  );

  const systemFooter = useMemo(
    () =>
      includeAddHost || includeEnableBuiltInDaemon ? (
        <>
          {includeAddHost ? (
            <SystemHostPickerOption
              kind="add"
              active={false}
              onPress={handleSelectAddHost}
              testID={addHostTestID}
            />
          ) : null}
          {includeEnableBuiltInDaemon ? (
            <SystemHostPickerOption
              kind="enableBuiltInDaemon"
              active={false}
              onPress={handleSelectEnableBuiltInDaemon}
            />
          ) : null}
        </>
      ) : null,
    [
      addHostTestID,
      handleSelectAddHost,
      handleSelectEnableBuiltInDaemon,
      includeAddHost,
      includeEnableBuiltInDaemon,
    ],
  );

  const filteredHosts = useMemo(() => {
    if (!normalizedSearch) return orderedHosts;
    return orderedHosts.filter((host) =>
      deviceLabel(host.serverId, host.label).toLowerCase().includes(normalizedSearch),
    );
  }, [deviceLabel, normalizedSearch, orderedHosts]);

  const reorderStickyHeader = useMemo(
    () =>
      useReorderBody && isSearchable ? (
        <SearchInput
          placeholder="Search hosts"
          onChangeText={setSearchQuery}
          autoFocus={!isCompact}
          useBottomSheetInput={isCompact}
          resetKey={searchResetKey}
        />
      ) : undefined,
    [isCompact, isSearchable, searchResetKey, useReorderBody],
  );

  const reorderExtraData = useMemo(() => ({ value, deviceLabel }), [value, deviceLabel]);

  const reorderBody = useMemo(() => {
    if (!useReorderBody) return undefined;
    if (normalizedSearch.length > 0) {
      const filteredContent = (
        <>
          {allHostsMatches ? allHostsHeader : null}
          {filteredHosts.length === 0 && !allHostsMatches ? (
            <ComboboxEmpty>No hosts found</ComboboxEmpty>
          ) : (
            filteredHosts.map((host) => (
              <SelectableHostPickerOption
                key={host.serverId}
                serverId={host.serverId}
                label={deviceLabel(host.serverId, host.label)}
                showActiveConnection={showActiveConnection === true}
                selected={value === host.serverId}
                active={false}
                onSelect={handleSelect}
                onOpenHostSettings={onOpenHostSettings ? handleOpenHostSettings : undefined}
                testID={hostOptionTestID?.(host.serverId)}
              />
            ))
          )}
          {systemFooter}
        </>
      );
      if (isCompact) {
        return (
          <ScrollView
            style={styles.mobileReorderScroll}
            contentContainerStyle={styles.mobileReorderContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {filteredContent}
          </ScrollView>
        );
      }
      return <View style={styles.desktopReorderContainer}>{filteredContent}</View>;
    }

    if (isCompact) {
      return (
        <DraggableList
          data={orderedHosts}
          keyExtractor={hostKey}
          renderItem={renderReorderHostItem}
          onDragEnd={handleHostDragEnd}
          useDragHandle
          scrollEnabled
          extraData={reorderExtraData}
          ListHeaderComponent={allHostsHeader}
          ListFooterComponent={systemFooter}
          style={styles.mobileReorderScroll}
          contentContainerStyle={styles.mobileReorderContent}
          testID="host-picker-reorder-list"
        />
      );
    }

    return (
      <View style={styles.desktopReorderContainer}>
        {allHostsHeader}
        <DraggableList
          data={orderedHosts}
          keyExtractor={hostKey}
          renderItem={renderReorderHostItem}
          onDragEnd={handleHostDragEnd}
          useDragHandle
          scrollEnabled={false}
          extraData={reorderExtraData}
          testID="host-picker-reorder-list"
        />
        {systemFooter}
      </View>
    );
  }, [
    allHostsHeader,
    allHostsMatches,
    deviceLabel,
    filteredHosts,
    handleHostDragEnd,
    handleOpenHostSettings,
    handleSelect,
    hostOptionTestID,
    isCompact,
    normalizedSearch.length,
    onOpenHostSettings,
    orderedHosts,
    renderReorderHostItem,
    reorderExtraData,
    showActiveConnection,
    systemFooter,
    useReorderBody,
    value,
  ]);

  return (
    <>
      {children}
      <Combobox
        options={options}
        value={value}
        onSelect={handleSelect}
        renderOption={renderOption}
        searchable={isSearchable}
        searchPlaceholder="Search hosts"
        title={title ?? "Host"}
        open={open}
        onOpenChange={onOpenChange}
        anchorRef={anchorRef}
        desktopPlacement={desktopPlacement}
        desktopMinWidth={desktopMinWidth}
        stickyHeader={reorderStickyHeader}
        mobileChildrenScrollEnabled={!useReorderBody}
        desktopChildrenScrollEnabled
      >
        {reorderBody}
      </Combobox>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  statusDotSlot: {
    width: theme.iconSize.sm,
    height: theme.iconSize.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  hostLeadingSlot: {
    width: theme.iconSize.sm,
    height: theme.iconSize.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  trailingActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[0.5],
  },
  dragHandleButton: {
    padding: theme.spacing[1],
  },
  gearButton: {
    padding: theme.spacing[1],
    marginRight: theme.spacing[0.5],
  },
  actionPlaceholder: {
    opacity: 0,
  },
  mobileReorderScroll: {
    flex: 1,
    minHeight: 0,
  },
  mobileReorderContent: {
    paddingBottom: theme.spacing[8],
    paddingHorizontal: theme.spacing[2],
    paddingTop: theme.spacing[1],
  },
  desktopReorderContainer: {
    paddingVertical: theme.spacing[1],
  },
}));
