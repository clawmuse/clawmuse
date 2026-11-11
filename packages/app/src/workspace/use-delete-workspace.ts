import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/contexts/toast-context";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { redirectIfArchivingActiveWorkspace } from "@/utils/sidebar-workspace-archive-redirect";
import { confirmDialog } from "@/utils/confirm-dialog";
import { agentHistoryQueryKey, allAgentHistoryQueryRootKey } from "@/hooks/agent-history-query-key";

interface DeleteWorkspaceTarget {
  serverId: string;
  workspaceId: string;
  workspaceKey: string;
  name: string;
}

const pendingDeletes = new Set<string>();

export function useDeleteWorkspace() {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const activeWorkspaceSelection = useActiveWorkspaceSelection();
  return useMutation({
    mutationFn: async (target: DeleteWorkspaceTarget) => {
      if (pendingDeletes.has(target.workspaceKey)) return;
      pendingDeletes.add(target.workspaceKey);
      try {
        const client = getHostRuntimeStore().getClient(target.serverId);
        if (!client) throw new Error(t("sidebar.workspace.toasts.hostDisconnected"));
        const confirmed = await confirmDialog({
          title: t("sidebar.workspace.deleteWorkspace.label"),
          message: t("sidebar.workspace.deleteWorkspace.message", { name: target.name }),
          confirmLabel: t("sidebar.workspace.deleteWorkspace.label"),
          cancelLabel: t("sidebar.workspace.confirmations.cancel"),
          destructive: true,
        });
        if (!confirmed) return;
        const dismiss = toast.show(t("sidebar.workspace.deleteWorkspace.deleting"), {
          durationMs: null,
        });
        try {
          await client.deleteWorkspace(target.workspaceId);
          redirectIfArchivingActiveWorkspace({ ...target, activeWorkspaceSelection });
          getHostRuntimeStore().removeWorkspaceSnapshot(target.serverId, target.workspaceId);
          useWorkspaceLayoutStore.getState().purgeWorkspace(target.workspaceKey);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: agentHistoryQueryKey(target.serverId) }),
            queryClient.invalidateQueries({ queryKey: allAgentHistoryQueryRootKey() }),
          ]);
          toast.show(t("sidebar.workspace.deleteWorkspace.deleted"));
        } finally {
          dismiss();
        }
      } finally {
        pendingDeletes.delete(target.workspaceKey);
      }
    },
    onError: (error) => {
      toast.show(t("sidebar.workspace.deleteWorkspace.failed", { error: error.message }), {
        variant: "error",
        durationMs: null,
      });
    },
  });
}
