import type { Href } from "expo-router";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import { buildHostRootRoute, buildNewWorkspaceRoute } from "@/utils/host-routes";
import { resolveWorkspaceRouteId } from "@/utils/workspace-identity";
import type { SidebarShortcutWorkspaceTarget } from "@/utils/sidebar-shortcuts";

/**
 * The workspace to land on after archiving the open one: the row below it in the sidebar, or the
 * row above when it was the last. Rows already being archived are skipped. `null` → nothing left.
 */
export function resolveNextWorkspaceAfterArchive(input: {
  targets: readonly SidebarShortcutWorkspaceTarget[];
  archived: SidebarShortcutWorkspaceTarget;
  isAvailable: (target: SidebarShortcutWorkspaceTarget) => boolean;
}): SidebarShortcutWorkspaceTarget | null {
  const isArchived = (target: SidebarShortcutWorkspaceTarget) =>
    target.serverId === input.archived.serverId &&
    target.workspaceId === input.archived.workspaceId;
  const index = input.targets.findIndex(isArchived);
  // Below first, then upward from the archived row.
  const candidates = index < 0 ? [...input.targets] : input.targets.slice(index + 1);
  for (let i = index - 1; i >= 0; i -= 1) {
    candidates.push(input.targets[i]);
  }
  return candidates.find((target) => !isArchived(target) && input.isAvailable(target)) ?? null;
}

export function buildWorkspaceArchiveRedirectRoute(input: {
  serverId: string;
  archivedWorkspaceId: string;
  workspaces: Iterable<WorkspaceDescriptor>;
}): Href {
  const archivedWorkspaceId = resolveWorkspaceRouteId({
    routeWorkspaceId: input.archivedWorkspaceId,
  });
  if (!archivedWorkspaceId) {
    return buildHostRootRoute(input.serverId);
  }

  const archivedWorkspace =
    Array.from(input.workspaces).find((workspace) => workspace.id === archivedWorkspaceId) ?? null;
  const sourceDirectory =
    archivedWorkspace?.projectRootPath || archivedWorkspace?.workspaceDirectory;
  if (!sourceDirectory) {
    return buildHostRootRoute(input.serverId);
  }

  return buildNewWorkspaceRoute({
    serverId: input.serverId,
    sourceDirectory,
    displayName: archivedWorkspace.projectDisplayName,
    projectId: archivedWorkspace.projectId,
  });
}
