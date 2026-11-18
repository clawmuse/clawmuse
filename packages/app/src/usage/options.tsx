import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Server, Settings } from "@/components/icons/app-icons";
import { withUnistyles } from "react-native-unistyles";
import { useCallback, useMemo } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSubTrigger,
  type MenuPageDefinition,
} from "@/components/ui/dropdown-menu";
import { HostMenuItem } from "@/components/hosts/host-menu-item";
import { ALL_HOSTS_OPTION_ID } from "@/components/hosts/host-picker-constants";
import {
  mutedIconColorMapping,
  useIconButtonChromeGlyphSize,
} from "@/components/ui/icon-button-chrome";
import { ToolbarButton } from "@/components/ui/pane-content-toolbar";
import { useIsCompactFormFactor } from "@/constants/layout";
import { MenuSettingsRows, SettingsRow, SettingsSwitch } from "@/components/settings";
import { SegmentedControl, type SegmentedControlOption } from "@/components/ui/segmented-control";
import { Alert } from "@/components/ui/alert";
import { useHosts } from "@/runtime/host-runtime";
import { settingsStyles } from "@/styles/settings";
import { ICON_SIZE } from "@/styles/theme";
import { useUsageSetting } from "./setting";
import { useUsageDisplay } from "./display";
import { useUsageInSidebar } from "./in-sidebar";
import { formatUsageHostLabel, hasHostChoice, type UsageHostSelection } from "./hosts";
import type { UsageDisplayAs } from "./preferences";

const ThemedSettings = withUnistyles(Settings);
const ThemedServer = withUnistyles(Server);

const HOST_PAGE = "host";

/**
 * The shared usage preferences, opened from a cog as a popover or compact sheet. With more than
 * one host, it leads with the host whose usage shows: the row reads as the current host, and the
 * hosts are a page of the same surface, so a compact sheet never opens a second sheet over it.
 */
export function UsageOptions({
  serverId,
  hostSelection,
  onManageMonitoring,
}: {
  serverId: string | null;
  hostSelection?: UsageHostSelection;
  onManageMonitoring?: () => void;
}) {
  const setting = useUsageSetting(serverId);
  const hostLabel = useHosts().find((host) => host.serverId === serverId)?.label ?? serverId;
  const { t } = useTranslation();
  const displayAsOptions: SegmentedControlOption<UsageDisplayAs>[] = [
    { value: "used", label: t("providerUsage.displayUsed"), testID: "usage-display-used" },
    {
      value: "remaining",
      label: t("providerUsage.displayRemaining"),
      testID: "usage-display-remaining",
    },
  ];
  const compact = useIsCompactFormFactor();
  const glyphSize = useIconButtonChromeGlyphSize("small", compact);
  const { display } = useUsageDisplay([]);
  const { inSidebar, setInSidebar } = useUsageInSidebar();
  const hostChoice = hasHostChoice(hostSelection) ? hostSelection : null;
  const selectedHostLabel = formatUsageHostLabel(
    hostSelection,
    t("sidebar.display.hostFilter.all"),
  );
  const pages = useMemo<MenuPageDefinition[] | undefined>(
    () =>
      hostChoice
        ? [
            {
              id: HOST_PAGE,
              title: t("providerUsage.host"),
              content: <UsageHostPage hostSelection={hostChoice} />,
            },
          ]
        : undefined,
    [hostChoice, t],
  );
  return (
    <DropdownMenu compactMode="sheet">
      <ToolbarButton
        kind="menu"
        label={t("providerUsage.options")}
        compact={compact}
        testID="usage-options-menu"
      >
        <ThemedSettings size={glyphSize} uniProps={mutedIconColorMapping} />
      </ToolbarButton>
      <DropdownMenuContent
        align="end"
        width={340}
        sheetTitle={t("providerUsage.options")}
        pages={pages}
        testID="usage-options-surface"
      >
        {hostChoice ? (
          <DropdownMenuSubTrigger
            id={HOST_PAGE}
            value={selectedHostLabel}
            testID="usage-options-host"
          >
            {t("providerUsage.host")}
          </DropdownMenuSubTrigger>
        ) : null}
        {onManageMonitoring ? (
          <DropdownMenuItem onSelect={onManageMonitoring} testID="usage-manage-monitoring">
            {t("usageMonitoring.title")}
          </DropdownMenuItem>
        ) : null}
        <View
          style={hostChoice || onManageMonitoring ? settingsStyles.rowBorder : undefined}
          testID="usage-options-fields"
        >
          <MenuSettingsRows>
            {setting.error ? <Alert variant="error" description={setting.error.message} /> : null}
            {setting.supported ? (
              <SettingsSwitch
                label={t("providerUsage.checkUsage")}
                hint={t("providerUsage.checkUsageHint", { host: hostLabel })}
                disabled={!setting.ready}
                value={setting.enabled}
                onValueChange={setting.setEnabled}
              />
            ) : null}
            <View style={setting.supported ? settingsStyles.rowBorder : undefined}>
              <SettingsSwitch
                label={t("providerUsage.showInSidebar")}
                hint={t("providerUsage.showInSidebarHint")}
                value={inSidebar}
                onValueChange={setInSidebar}
                testID="usage-show-in-sidebar"
              />
            </View>
            <View style={settingsStyles.rowBorder}>
              <SettingsRow label={t("providerUsage.displayAs")}>
                <SegmentedControl
                  options={displayAsOptions}
                  value={display.displayAs}
                  onValueChange={display.setDisplayAs}
                  testID="usage-display-as"
                />
              </SettingsRow>
            </View>
          </MenuSettingsRows>
        </View>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UsageHostPage({ hostSelection }: { hostSelection: UsageHostSelection }) {
  const { t } = useTranslation();
  const selectAllHosts = useCallback(
    () => hostSelection.onSelect(ALL_HOSTS_OPTION_ID),
    [hostSelection],
  );
  const allLeading = useMemo(
    () => <ThemedServer size={ICON_SIZE.sm} uniProps={mutedIconColorMapping} />,
    [],
  );
  return (
    <>
      <DropdownMenuItem
        selected={hostSelection.serverId === ALL_HOSTS_OPTION_ID}
        leading={allLeading}
        onSelect={selectAllHosts}
        testID={`usage-options-host-${ALL_HOSTS_OPTION_ID}`}
      >
        {t("sidebar.display.hostFilter.all")}
      </DropdownMenuItem>
      {hostSelection.hosts.map((host) => (
        <HostMenuItem
          key={host.serverId}
          serverId={host.serverId}
          label={host.label}
          selected={host.serverId === hostSelection.serverId}
          onSelect={hostSelection.onSelect}
          testID={`usage-options-host-${host.serverId}`}
        />
      ))}
    </>
  );
}
