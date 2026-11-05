import { router } from "expo-router";
import { useSessionStore } from "@/stores/session-store";
import { usePanelStore } from "@/stores/panel-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import {
  redirectIfArchivingActiveWorkspace as redirectIfArchivingActiveWorkspacePure,
  type RedirectIfArchivingActiveWorkspaceInput,
} from "@/utils/workspace-archive-redirect";

export function redirectIfArchivingActiveWorkspace(
  input: RedirectIfArchivingActiveWorkspaceInput,
): boolean {
  return redirectIfArchivingActiveWorkspacePure(input, {
    navigateToRoute: (route) => router.replace(route),
    navigateToWorkspace: (target) => navigateToWorkspace(target),
    readWorkspaces: (serverId) =>
      useSessionStore.getState().sessions[serverId]?.workspaces.values() ?? [],
    readSidebarTargets: () => useKeyboardShortcutsStore.getState().sidebarShortcutWorkspaceTargets,
    openAgentList: () =>
      usePanelStore.getState().openAgentListForLayout({
        isCompact: useWorkspaceLayoutStore.getState().layoutMode === "compact",
      }),
  });
}
