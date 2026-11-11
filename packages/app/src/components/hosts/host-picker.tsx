import { useClawMuseDeviceLabel } from "@/clawmuse/device-label";
import { useTranslation } from "react-i18next";
import { useCallback, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import type { GestureResponderEvent } from "react-native";
import { Check, Plus, Server, Settings } from "@/components/icons/app-icons";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { HostStatusDot } from "@/components/host-status-dot";
import { Combobox, ComboboxItem, type ComboboxProps } from "@/components/ui/combobox";
import { useLocalDaemonServerId } from "@/hooks/use-is-local-daemon";
import { isNative } from "@/constants/platform";
import { orderHostsLocalFirst } from "@/types/host-connection";
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
  testID?: string;
}

export function HostPickerOption({
  serverId,
  label,
  selected,
  active,
  onPress,
  onOpenHostSettings,
  testID,
}: HostPickerOptionProps): ReactElement {
  const { theme } = useUnistyles();
  // The gear is a sibling of the row's button (see ComboboxItem's trailing branch), so it gets
  // no hover fill from the row. Reveal on row hover instead — and always show on native, where
  // there is no hover.
  const [isHovered, setIsHovered] = useState(false);
  const leadingSlot = useMemo(
    () => (
      <View style={styles.hostLeadingSlot}>
        {selected ? (
          <Check size={16} color={theme.colors.foregroundMuted} />
        ) : (
          <HostStatusDot serverId={serverId} size={STATUS_DOT_SIZE} />
        )}
      </View>
    ),
    [selected, serverId, theme.colors.foregroundMuted],
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
  const trailingSlot = useMemo(() => {
    if (!onOpenHostSettings) return undefined;
    const gear = (
      <Pressable
        onPress={handleSettingsPress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Open ${label} settings`}
        style={styles.gearButton}
      >
        <Settings size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
      </Pressable>
    );
    if (isNative || isHovered) return gear;
    // An invisible placeholder keeps the press strip beside the gear out of the label's way:
    // hidden, presses on the strip still fall to the row's button.
    return <View style={styles.gearPlaceholder}>{gear}</View>;
  }, [
    handleSettingsPress,
    isHovered,
    label,
    onOpenHostSettings,
    theme.colors.foregroundMuted,
    theme.iconSize.sm,
  ]);

  return (
    <View onPointerEnter={handleHoverIn} onPointerLeave={handleHoverOut}>
      <ComboboxItem
        label={label}
        leadingSlot={leadingSlot}
        trailingSlot={trailingSlot}
        active={active}
        onPress={onPress}
        testID={testID}
      />
    </View>
  );
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
  const { theme } = useUnistyles();
  const Icon = kind === "add" ? Plus : Server;
  const label = t(SYSTEM_HOST_PICKER_OPTION_LABEL_KEYS[kind]);
  const leadingSlot = useMemo(
    () =>
      selected ? (
        <Check size={16} color={theme.colors.foregroundMuted} />
      ) : (
        <Icon size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
      ),
    [Icon, selected, theme.colors.foregroundMuted, theme.iconSize.sm],
  );

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
  title,
  desktopPlacement = "bottom-start",
  desktopMinWidth,
  addHostTestID,
  hostOptionTestID,
  children,
}: HostPickerProps): ReactElement {
  const { t } = useTranslation();
  const localServerId = useLocalDaemonServerId();
  const deviceLabel = useClawMuseDeviceLabel();
  const orderedHosts = useMemo(
    () => orderHostsLocalFirst(hosts, localServerId),
    [hosts, localServerId],
  );

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
      />
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
  gearButton: {
    padding: theme.spacing[1],
    marginRight: theme.spacing[1],
  },
  gearPlaceholder: {
    opacity: 0,
  },
}));
