import { useCallback } from "react";
import { router } from "expo-router";
import { canCreateWorktreeForProjectKind } from "@/projects/host-projects";
import { useHostFeature } from "@/runtime/host-features";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { useSidebarViewStore } from "@/stores/sidebar-view-store";
import { useWorkspace } from "@/stores/session-store-hooks";
import { buildNewWorkspaceRoute } from "@/utils/host-routes";

/**
 * The host a new workspace starts on. The sidebar pinned to one host means "I am working on that
 * machine", so it wins over an active workspace that lives elsewhere. The active workspace still
 * wins when it is on the pinned host, so the composer keeps its project.
 */
export function resolveNewWorkspaceHost(input: {
  activeServerId: string | null;
  hostFilters: readonly string[];
}): { serverId: string | null; keepActiveWorkspace: boolean } {
  const pinned = input.hostFilters.length === 1 ? input.hostFilters[0] : null;
  if (pinned && pinned !== input.activeServerId) {
    return { serverId: pinned, keepActiveWorkspace: false };
  }
  return { serverId: input.activeServerId, keepActiveWorkspace: true };
}

/** All creation entrances carry the current project through to the composer. */
export function useOpenNewWorkspace(onBeforeNavigate?: () => void) {
  const selection = useActiveWorkspaceSelection();
  const hostFilters = useSidebarViewStore((state) => state.hostFilters);
  const target = resolveNewWorkspaceHost({
    activeServerId: selection?.serverId ?? null,
    hostFilters,
  });
  const serverId = target.serverId;
  const workspaceId = target.keepActiveWorkspace ? (selection?.workspaceId ?? null) : null;
  const workspace = useWorkspace(serverId, workspaceId);
  const supportsMultiplicity = useHostFeature(serverId, "workspaceMultiplicity");
  const canUseProject = Boolean(
    workspace && (supportsMultiplicity || canCreateWorktreeForProjectKind(workspace.projectKind)),
  );

  return useCallback(() => {
    onBeforeNavigate?.();
    if (!serverId) {
      router.push(buildNewWorkspaceRoute());
      return;
    }
    if (workspace && canUseProject) {
      router.push(
        buildNewWorkspaceRoute({
          serverId,
          sourceDirectory: workspace.projectRootPath,
          projectId: workspace.projectId,
        }),
      );
      return;
    }
    router.push(buildNewWorkspaceRoute({ serverId }));
  }, [onBeforeNavigate, serverId, workspace, canUseProject]);
}
