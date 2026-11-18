import { Fragment, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CompactHeader } from "@/components/headers/compact-header";
import { IconButtonChromeProvider } from "@/components/ui/icon-button-chrome";
import { useIsCompactFormFactor } from "@/constants/layout";
import {
  EXPLORER_TOGGLE_KEYS,
  WorkspaceExplorerToggle,
} from "@/screens/workspace/workspace-explorer-toggle";
import { WorkspaceHeaderProjectRow } from "@/screens/workspace/workspace-header-project-row";
import {
  resolveWorkspaceActionPlacement,
  resolveWorkspaceBarActions,
  useWindowLayout,
  WindowLayoutActions,
} from "@/window-layout";

export { MobileWorkspaceTabSwitcher } from "./tab-switcher";

interface CompactWorkspaceHeaderProps {
  serverId: string;
  isLoading: boolean;
  title: string;
  subtitle: string;
  isSubtitleDistinct: boolean;
  onToggleExplorer: () => void;
  explorerToggleLabel: string;
  explorerToggleAccessibilityState: { expanded: boolean };
  tabSwitcher: ReactNode;
  /** Workspace overflow menu. */
  children: ReactNode;
  headerVariant: "compact" | "full";
  actionsActive: boolean;
}

/** The compact header with the workspace's project row and controls. */
export function CompactWorkspaceHeader({
  isLoading,
  title,
  subtitle,
  isSubtitleDistinct,
  onToggleExplorer,
  explorerToggleLabel,
  explorerToggleAccessibilityState,
  children,
  tabSwitcher,
  serverId,
  headerVariant,
  actionsActive,
}: CompactWorkspaceHeaderProps) {
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
  const actionsInBar = resolveWorkspaceActionPlacement(useWindowLayout()) === "vertical-bar";
  const projectRow = useMemo(
    () => (
      <WorkspaceHeaderProjectRow
        subtitle={subtitle}
        isSubtitleDistinct={isSubtitleDistinct}
        serverId={serverId}
      />
    ),
    [subtitle, isSubtitleDistinct, serverId],
  );
  const symbols = {
    "tab-count": tabSwitcher,
    overflow: children,
    explorer: (
      <WorkspaceExplorerToggle
        onPress={onToggleExplorer}
        label={explorerToggleLabel}
        tooltipLabel={t("workspace.tabs.explorerSidebar.toggle")}
        tooltipKeys={EXPLORER_TOGGLE_KEYS}
        accessibilityState={explorerToggleAccessibilityState}
        mobile
      />
    ),
  };
  const actionIds = resolveWorkspaceBarActions(headerVariant);
  const actions = actionIds.map((symbol) => <Fragment key={symbol}>{symbols[symbol]}</Fragment>);
  const headerActions =
    isCompact && headerVariant === "compact"
      ? actionIds
          .filter((symbol) => symbol !== "explorer")
          .map((symbol) => <Fragment key={symbol}>{symbols[symbol]}</Fragment>)
      : actions;

  return (
    <IconButtonChromeProvider value="header-island">
      {headerVariant === "compact" ? (
        <CompactHeader
          navigation="menu"
          title={title}
          titleTestID="workspace-header-title"
          subtitle={projectRow}
          loading={isLoading}
          actions={actionsInBar ? undefined : headerActions}
        />
      ) : null}
      <WindowLayoutActions active={actionsActive}>{actions}</WindowLayoutActions>
    </IconButtonChromeProvider>
  );
}
