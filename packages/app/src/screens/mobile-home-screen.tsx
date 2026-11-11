import { useCallback, useMemo, type ReactNode } from "react";
import { useIsFocused } from "expo-router/react-navigation";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { Search, SquarePen } from "@/components/icons/app-icons";
import { MenuHeader } from "@/components/headers/menu-header";
import { HeaderToggleButton } from "@/components/headers/header-toggle-button";
import { DensityIcon } from "@/components/ui/density-icon";
import { SidebarWorkspaceList } from "@/components/sidebar-workspace-list";
import { SidebarAgentListSkeleton } from "@/components/sidebar-agent-list-skeleton";
import { SidebarModelProvider, useSidebarModel } from "@/components/sidebar/sidebar-model";
import {
  FloatingActionButton,
  FLOATING_ACTION_BUTTON_CLEARANCE,
} from "@/components/ui/floating-action-button";
import { useOpenAddProject } from "@/hooks/use-open-add-project";
import { useOpenNewWorkspace } from "@/hooks/use-open-new-workspace";
import { useImportSession } from "@/hooks/use-import-session";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";

export function MobileHomeScreen({ supportContent }: { supportContent: ReactNode }) {
  const focused = useIsFocused();
  if (!focused) return <View style={styles.container} />;
  return (
    <SidebarModelProvider>
      <MobileHomeContent supportContent={supportContent} />
    </SidebarModelProvider>
  );
}

function MobileHomeContent({ supportContent }: { supportContent: ReactNode }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const model = useSidebarModel();
  const openNewWorkspace = useOpenNewWorkspace();
  const openAddProject = useOpenAddProject();
  const importSession = useImportSession();
  const setCommandCenterOpen = useKeyboardShortcutsStore((state) => state.setCommandCenterOpen);
  const openSearch = useCallback(() => setCommandCenterOpen(true), [setCommandCenterOpen]);
  const addProject = useCallback(() => {
    void openAddProject();
  }, [openAddProject]);
  const searchLabel = t("sidebar.sections.search");
  const listFooter = useMemo(
    () => <View style={styles.listFooter(insets.bottom)}>{supportContent}</View>,
    [insets.bottom, supportContent],
  );
  const searchAction = useMemo(
    () => (
      <HeaderToggleButton
        onPress={openSearch}
        tooltipLabel={searchLabel}
        tooltipKeys={[]}
        tooltipSide="bottom"
        accessibilityLabel={searchLabel}
        testID="mobile-home-search"
      >
        <DensityIcon icon={Search} size="lg" color="foreground" />
      </HeaderToggleButton>
    ),
    [openSearch, searchLabel],
  );

  return (
    <View style={styles.container} testID="mobile-home">
      <MenuHeader title={t("shell.commandCenter.workspaces")} rightContent={searchAction} />
      <View style={styles.list}>
        {model.isInitialLoad ? (
          <>
            <SidebarAgentListSkeleton />
            {supportContent}
          </>
        ) : (
          <SidebarWorkspaceList
            workspaceGroups={model.workspaceGroups}
            projectIconTargets={model.projectIconTargets}
            pinnedGroups={model.pinnedGroups}
            projects={model.projects}
            hasProjectsBeforeFilter={model.hasProjectsBeforeFilter}
            hasActiveProjectFilter={model.resolvedProjectFilters.length > 0}
            workspaceEntriesByKey={model.workspaceEntriesByKey}
            collapsedProjectKeys={model.collapsedProjectKeys}
            onToggleProjectCollapsed={model.toggleProjectCollapsed}
            shortcutIndexByWorkspaceKey={model.shortcutModel.shortcutIndexByWorkspaceKey}
            groupMode={model.groupMode}
            isRefreshing={model.isRevalidating}
            onRefresh={model.refreshAll}
            onAddProject={addProject}
            onImportSession={importSession.open}
            listFooterComponent={listFooter}
          />
        )}
        <FloatingActionButton
          icon={SquarePen}
          accessibilityLabel={t("newWorkspace.title")}
          onPress={openNewWorkspace}
          bottomInset={insets.bottom}
          variant="primary"
          testID="mobile-home-new-workspace"
        />
      </View>
      {importSession.sheet}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.surface0 },
  list: { flex: 1, minHeight: 0 },
  listFooter: (bottomInset: number) => ({
    paddingBottom: FLOATING_ACTION_BUTTON_CLEARANCE + bottomInset,
  }),
}));
