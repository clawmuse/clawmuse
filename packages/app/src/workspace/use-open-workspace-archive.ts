import { useCallback, useState } from "react";
import { useWorkspaceFields } from "@/stores/session-store-hooks";
import { redirectIfArchivingActiveWorkspace } from "@/utils/sidebar-workspace-archive-redirect";
import { useWorkspaceArchive } from "@/workspace/use-workspace-archive";

export function useOpenWorkspaceArchive(input: { serverId: string; workspaceId: string | null }): {
  archive: () => void;
  isArchiving: boolean;
  canArchive: boolean;
} {
  const { serverId, workspaceId } = input;
  const workspace = useWorkspaceFields(serverId, workspaceId, (candidate) => ({
    id: candidate.id,
    name: candidate.name,
    workspaceKind: candidate.workspaceKind,
    workspaceDirectory: candidate.workspaceDirectory,
    archivingAt: candidate.archivingAt,
    diffStat: candidate.diffStat,
  }));
  const [isHiding, setIsHiding] = useState(false);
  const isArchiving = workspace?.archivingAt != null || isHiding;

  const redirectAfterArchive = useCallback(() => {
    if (!workspaceId) {
      return;
    }
    redirectIfArchivingActiveWorkspace({
      serverId,
      workspaceId,
      activeWorkspaceSelection: { serverId, workspaceId },
    });
  }, [serverId, workspaceId]);

  const archiveController = useWorkspaceArchive({
    serverId,
    workspaceId: workspace?.id ?? workspaceId ?? "",
    workspaceKind: workspace?.workspaceKind ?? "directory",
    workspaceDirectory: workspace?.workspaceDirectory ?? "",
    name: workspace?.name ?? "",
    diffStat: workspace?.diffStat ?? null,
    onArchiveStarted: redirectAfterArchive,
    onSetHiding: setIsHiding,
  });

  const archive = useCallback(() => {
    if (!workspace || isArchiving) {
      return;
    }
    archiveController.archive();
  }, [archiveController, isArchiving, workspace]);

  return {
    archive,
    isArchiving,
    canArchive: workspace != null,
  };
}
