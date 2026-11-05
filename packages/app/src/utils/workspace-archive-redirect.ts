import type { Href } from "expo-router";
import type { ActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import type { SidebarShortcutWorkspaceTarget } from "@/utils/sidebar-shortcuts";
import {
  buildWorkspaceArchiveRedirectRoute,
  resolveNextWorkspaceAfterArchive,
} from "@/utils/workspace-archive-navigation";

export interface RedirectIfArchivingActiveWorkspaceInput {
  serverId: string;
  workspaceId: string;
  activeWorkspaceSelection: ActiveWorkspaceSelection | null;
}

export interface RedirectIfArchivingActiveWorkspaceDeps {
  navigateToRoute: (route: Href) => void;
  navigateToWorkspace: (target: SidebarShortcutWorkspaceTarget) => void;
  readWorkspaces: (serverId: string) => Iterable<WorkspaceDescriptor>;
  /** Sidebar rows in top-to-bottom visual order. */
  readSidebarTargets: () => readonly SidebarShortcutWorkspaceTarget[];
  openAgentList: () => void;
}

export function redirectIfArchivingActiveWorkspace(
  input: RedirectIfArchivingActiveWorkspaceInput,
  deps: RedirectIfArchivingActiveWorkspaceDeps,
): boolean {
  if (
    input.activeWorkspaceSelection?.serverId !== input.serverId ||
    input.activeWorkspaceSelection.workspaceId !== input.workspaceId
  ) {
    return false;
  }

  const next = resolveNextWorkspaceAfterArchive({
    targets: deps.readSidebarTargets(),
    archived: { serverId: input.serverId, workspaceId: input.workspaceId },
    isAvailable: (target) =>
      Array.from(deps.readWorkspaces(target.serverId)).some(
        (workspace) => workspace.id === target.workspaceId && workspace.archivingAt === null,
      ),
  });
  if (next) {
    deps.navigateToWorkspace(next);
    return true;
  }

  deps.navigateToRoute(
    buildWorkspaceArchiveRedirectRoute({
      serverId: input.serverId,
      archivedWorkspaceId: input.workspaceId,
      workspaces: deps.readWorkspaces(input.serverId),
    }),
  );
  deps.openAgentList();
  return true;
}
