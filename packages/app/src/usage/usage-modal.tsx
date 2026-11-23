import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { AdaptiveModalSheet, SheetHeaderSubtitle } from "@/components/adaptive-modal-sheet";
import { HostStatusIcon } from "@/components/host-status-icon";
import { ALL_HOSTS_OPTION_ID } from "@/components/hosts/host-picker-constants";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { Button } from "@/components/ui/button";
import { PressHighlight } from "@/components/ui/press-highlight";
import { hostLabelColorStyle } from "@/hosts/host-badge";
import type { HostColor } from "@/hosts/appearance";
import { useHosts } from "@/runtime/host-runtime";
import { builtinSidebarNavLabelKey } from "@/sidebar-nav/model";
import { hasUsageControls, UsageControls } from "./controls";
import { useUsageDisplay, type UsageDisplay } from "./display";
import { UsageHistoryCard, type HostDailyHistoryEntry } from "./history-card";
import { formatUsageHostLabel, useUsageHostSelection } from "./hosts";
import type { UsageHost } from "./model";
import { UsageMonitoringSettings } from "./monitoring";
import { useHostsUsage } from "./queries";
import type { UsageView } from "./types";
import { UsageBody, UsageMessage } from "./usage-section";

interface UsageModalProps {
  visible: boolean;
  onClose: () => void;
  onDismiss: () => void;
}

/**
 * Usage over the current screen: a dialog on wide layouts, a bottom sheet on compact ones. It
 * shows the selected hosts' token history and quota reports with pins, a direct computer switcher
 * strip when multiple hosts are connected, and Refresh all + Settings in its title row.
 */
export function UsageModal(props: UsageModalProps) {
  const { t } = useTranslation();
  const { serverId, connectedHosts, select } = useUsageHostSelection();
  if (!serverId) {
    return (
      <UsageModalFrame {...props}>
        <UsageMessage text={t("providerUsage.noHosts")} />
      </UsageModalFrame>
    );
  }
  return (
    <HostUsageModal {...props} serverId={serverId} hosts={connectedHosts} onSelectHost={select} />
  );
}

const SELECTED_ACCESSIBILITY_STATE = { selected: true } as const;
const UNSELECTED_ACCESSIBILITY_STATE = { selected: false } as const;

function UsageModalHostChip({
  serverId,
  label,
  color,
  selected,
  onSelect,
}: {
  serverId: string;
  label: string;
  color: HostColor;
  selected: boolean;
  onSelect: (serverId: string) => void;
}) {
  const handlePress = useCallback(() => onSelect(serverId), [onSelect, serverId]);
  return (
    <PressHighlight
      accessibilityRole="button"
      accessibilityState={selected ? SELECTED_ACCESSIBILITY_STATE : UNSELECTED_ACCESSIBILITY_STATE}
      onPress={handlePress}
      style={[styles.hostChip, selected && styles.hostChipSelected]}
      highlightStyle={styles.hostChipPressed}
      testID={`usage-modal-host-chip-${serverId}`}
    >
      <HostStatusIcon serverId={serverId} size={13} />
      <Text
        numberOfLines={1}
        style={[
          styles.hostChipLabel,
          selected && styles.hostChipLabelSelected,
          hostLabelColorStyle(color),
        ]}
      >
        {label}
      </Text>
    </PressHighlight>
  );
}

function UsageModalHostSwitcher({
  hosts,
  hostColors,
  serverId,
  allLabel,
  onSelectHost,
}: {
  hosts: readonly UsageHost[];
  hostColors: ReadonlyMap<string, HostColor>;
  serverId: string;
  allLabel: string;
  onSelectHost: (serverId: string) => void;
}) {
  const selectAll = useCallback(() => onSelectHost(ALL_HOSTS_OPTION_ID), [onSelectHost]);
  if (hosts.length <= 1) return null;
  const isAll = serverId === ALL_HOSTS_OPTION_ID;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.hostSwitcherTrack}
      style={styles.hostSwitcher}
      testID="usage-modal-host-switcher"
    >
      <PressHighlight
        accessibilityRole="button"
        accessibilityState={isAll ? SELECTED_ACCESSIBILITY_STATE : UNSELECTED_ACCESSIBILITY_STATE}
        onPress={selectAll}
        style={[styles.hostChip, isAll && styles.hostChipSelected]}
        highlightStyle={styles.hostChipPressed}
        testID="usage-modal-host-chip-all"
      >
        <Text style={[styles.hostChipLabel, isAll && styles.hostChipLabelSelected]}>
          {allLabel}
        </Text>
      </PressHighlight>
      {hosts.map((host) => (
        <UsageModalHostChip
          key={host.serverId}
          serverId={host.serverId}
          label={host.label}
          color={hostColors.get(host.serverId) ?? "none"}
          selected={serverId === host.serverId}
          onSelect={onSelectHost}
        />
      ))}
    </ScrollView>
  );
}

function HostUsageModal({
  serverId,
  hosts,
  onSelectHost,
  ...props
}: UsageModalProps & {
  serverId: string;
  hosts: UsageHost[];
  onSelectHost: (serverId: string) => void;
}) {
  const [monitoring, setMonitoring] = useState(false);
  const { t } = useTranslation();
  const hostProfiles = useHosts();
  const hostColors = useMemo(
    () => new Map(hostProfiles.map((profile) => [profile.serverId, profile.appearance.color])),
    [hostProfiles],
  );
  const manageMonitoring = useCallback(() => setMonitoring(true), []);
  const closeMonitoring = useCallback(() => setMonitoring(false), []);
  const selectedHosts = useMemo(
    () => hosts.filter((host) => serverId === ALL_HOSTS_OPTION_ID || host.serverId === serverId),
    [hosts, serverId],
  );
  const { views, refresh, refreshHost } = useHostsUsage(selectedHosts);
  const reports = views.flatMap(({ view }) => (view.kind === "ready" ? view.reports : []));
  const hostHistories = useMemo<HostDailyHistoryEntry[]>(
    () =>
      views.map(({ host, dailyUsage }) => ({
        serverId: host.serverId,
        label: host.label,
        color: hostColors.get(host.serverId),
        dailyUsage,
      })),
    [hostColors, views],
  );
  const hasAnyReadyHost = views.some(({ view }) => view.kind === "ready");
  const { display } = useUsageDisplay(reports);
  const hostSelection = useMemo(
    () => ({ hosts, serverId, onSelect: onSelectHost }),
    [hosts, onSelectHost, serverId],
  );
  let settingsServerId: string | null = serverId;
  if (serverId === ALL_HOSTS_OPTION_ID)
    settingsServerId = selectedHosts.length === 1 ? selectedHosts[0].serverId : null;
  const viewList = useMemo(() => views.map(({ view }) => view), [views]);
  const controls = useMemo(
    () =>
      hasUsageControls(viewList, hostSelection) ? (
        <UsageControls
          key={serverId}
          serverId={settingsServerId}
          views={viewList}
          onRefresh={refresh}
          hostSelection={hostSelection}
          onManageMonitoring={manageMonitoring}
        />
      ) : null,
    [hostSelection, manageMonitoring, refresh, serverId, settingsServerId, viewList],
  );
  const allHostsLabel = t("sidebar.display.hostFilter.all");
  const hostLabel = formatUsageHostLabel(hostSelection, allHostsLabel);
  const showHostLabels = selectedHosts.length > 1;
  return (
    <UsageModalFrame {...props} actions={controls} subtitle={hostLabel}>
      {monitoring ? (
        <Button variant="ghost" size="sm" onPress={closeMonitoring}>
          {t("usageMonitoring.back")}
        </Button>
      ) : (
        <UsageModalHostSwitcher
          hosts={hosts}
          hostColors={hostColors}
          serverId={serverId}
          allLabel={allHostsLabel}
          onSelectHost={onSelectHost}
        />
      )}
      {/* Keyed by host so state the cards hold, such as a refresh in flight, never shows on another
          host's cards. The frame is not keyed: remounting it would dismiss a compact sheet, and
          Usage with it. */}
      <View key={serverId} style={styles.content} testID={`usage-host-${serverId}`}>
        {monitoring ? (
          selectedHosts.map((host) => (
            <SettingsSection key={host.serverId} title={host.label}>
              <UsageMonitoringSettings serverId={host.serverId} />
            </SettingsSection>
          ))
        ) : (
          <>
            {hasAnyReadyHost ? (
              <UsageHistoryCard
                hostHistories={hostHistories}
                scope={serverId === ALL_HOSTS_OPTION_ID ? "all" : "local"}
              />
            ) : null}
            {views.map(({ host, view }) => (
              <HostUsageBody
                key={host.serverId}
                host={host}
                view={view}
                display={display}
                onRefreshHost={refreshHost}
                showHostLabel={showHostLabels}
              />
            ))}
          </>
        )}
      </View>
    </UsageModalFrame>
  );
}

interface HostUsageBodyProps {
  host: UsageHost;
  view: UsageView;
  display: UsageDisplay;
  onRefreshHost: (serverId: string) => void;
  showHostLabel: boolean;
}

function HostUsageBody({ host, view, display, onRefreshHost, showHostLabel }: HostUsageBodyProps) {
  const refresh = useCallback(() => onRefreshHost(host.serverId), [host.serverId, onRefreshHost]);
  const body = (
    <UsageBody serverId={host.serverId} view={view} display={display} onRefresh={refresh} />
  );
  return (
    <View testID={`usage-host-${host.serverId}`}>
      {showHostLabel ? <SettingsSection title={host.label}>{body}</SettingsSection> : body}
    </View>
  );
}

function UsageModalFrame({
  visible,
  onClose,
  onDismiss,
  actions,
  subtitle,
  children,
}: UsageModalProps & { actions?: ReactNode; subtitle?: string; children: ReactNode }) {
  const { t } = useTranslation();
  const title = t(builtinSidebarNavLabelKey("usage"));
  const header = useMemo(
    () => ({
      title,
      titleTestID: "usage-modal-title",
      subtitle: subtitle ? (
        <SheetHeaderSubtitle text={subtitle} testID="usage-modal-host" />
      ) : undefined,
      actions,
    }),
    [actions, subtitle, title],
  );
  return (
    <AdaptiveModalSheet
      header={header}
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      desktopMaxWidth={720}
      contextBridge={null}
      testID="usage-modal"
    >
      <View testID="usage-modal-body">{children}</View>
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  hostSwitcher: {
    marginBottom: theme.spacing[3],
  },
  hostSwitcherTrack: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
  },
  hostChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  hostChipSelected: {
    backgroundColor: theme.colors.surface3,
    borderColor: theme.colors.borderAccent,
  },
  hostChipPressed: {
    backgroundColor: theme.colors.surface3,
  },
  hostChipLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    maxWidth: 180,
  },
  hostChipLabelSelected: {
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.medium,
  },
  content: {
    gap: theme.spacing[4],
  },
}));
