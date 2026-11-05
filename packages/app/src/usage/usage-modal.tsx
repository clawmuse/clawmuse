import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { AdaptiveModalSheet } from "@/components/adaptive-modal-sheet";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { ALL_HOSTS_OPTION_ID } from "@/components/hosts/host-picker-constants";
import { builtinSidebarNavLabelKey } from "@/sidebar-nav/model";
import { UsageMonitoringSettings } from "./monitoring";
import { Button } from "@/components/ui/button";
import { UsageControls } from "./controls";
import { useUsageDisplay, type UsageDisplay } from "./display";
import { useUsageHostSelection } from "./hosts";
import type { UsageHost } from "./model";
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
 * shows the selected hosts' reports with pins, and the host filter, Refresh all, and Settings in its
 * title row.
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
  const manageMonitoring = useCallback(() => setMonitoring(true), []);
  const closeMonitoring = useCallback(() => setMonitoring(false), []);
  const selectedHosts = useMemo(
    () => hosts.filter((host) => serverId === ALL_HOSTS_OPTION_ID || host.serverId === serverId),
    [hosts, serverId],
  );
  const { views, refresh, refreshHost } = useHostsUsage(selectedHosts);
  const reports = views.flatMap(({ view }) => (view.kind === "ready" ? view.reports : []));
  const { display } = useUsageDisplay(reports);
  const hostSelection = useMemo(
    () => ({ hosts, serverId, onSelect: onSelectHost }),
    [hosts, onSelectHost, serverId],
  );
  let settingsServerId: string | null = serverId;
  if (serverId === ALL_HOSTS_OPTION_ID)
    settingsServerId = selectedHosts.length === 1 ? selectedHosts[0].serverId : null;
  const controls = useMemo(
    () => (
      <UsageControls
        serverId={settingsServerId}
        views={views.map(({ view }) => view)}
        onRefresh={refresh}
        hostSelection={hostSelection}
        onManageMonitoring={manageMonitoring}
      />
    ),
    [hostSelection, refresh, views, manageMonitoring, settingsServerId],
  );
  const showHostLabels = selectedHosts.length > 1;
  return (
    <UsageModalFrame {...props} actions={controls}>
      {monitoring ? (
        <Button variant="ghost" size="sm" onPress={closeMonitoring}>
          {t("usageMonitoring.back")}
        </Button>
      ) : null}
      {/* Keyed by host so a refresh in flight on one host never shows on another's cards. Only the
          body: keying the frame remounts the sheet, and on phones and native the unmounting sheet
          reports onDismiss, which closes the modal as soon as another host is picked. */}
      <View key={serverId}>
        {monitoring
          ? selectedHosts.map((host) => (
              <SettingsSection key={host.serverId} title={host.label}>
                <UsageMonitoringSettings serverId={host.serverId} />
              </SettingsSection>
            ))
          : views.map(({ host, view }) => (
              <HostUsageBody
                key={host.serverId}
                host={host}
                view={view}
                display={display}
                onRefreshHost={refreshHost}
                showHostLabel={showHostLabels}
              />
            ))}
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
  children,
}: UsageModalProps & { actions?: ReactNode; children: ReactNode }) {
  const { t } = useTranslation();
  const title = t(builtinSidebarNavLabelKey("usage"));
  const header = useMemo(() => ({ title, actions }), [actions, title]);
  return (
    <AdaptiveModalSheet
      header={header}
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      desktopMaxWidth={640}
      contextBridge={null}
      testID="usage-modal"
    >
      <View testID="usage-modal-body">{children}</View>
    </AdaptiveModalSheet>
  );
}
