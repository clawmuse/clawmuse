import type { CheckoutStatusClient } from "@/git/checkout-status-cache";
import { readWorktreeArchiveRisk } from "@/git/worktree-archive-warning";
import {
  getLastWorkspaceSelection,
  type ActiveWorkspaceSelection,
} from "@/stores/navigation-active-workspace-store";
import { useSessionStore, type WorkspaceDescriptor } from "@/stores/session-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { redirectIfArchivingActiveWorkspace } from "@/utils/sidebar-workspace-archive-redirect";
import { resolveWorkspaceMapKeyByIdentity } from "@/utils/workspace-identity";
import {
  archiveWorkspaceOptimistically,
  type WorkspaceArchiveOutcome,
  type WorkspaceArchiveTarget,
} from "@/workspace/workspace-archive";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";

export type EmptyWorkspaceArchiveOutcome =
  | "archived"
  | "kept_other_agents"
  | "kept_running_scripts"
  | "kept_terminals"
  | "kept_dirty_worktree"
  | "skipped"
  | "failed";

export interface EmptyWorkspaceArchiveClient extends Partial<CheckoutStatusClient> {
  archiveWorkspace: (workspaceId: string) => Promise<{ error: string | null; canceled?: boolean }>;
  listTerminals?: (
    cwd?: string,
    requestId?: string,
    options?: { workspaceId?: string },
  ) => Promise<{ terminals: readonly unknown[] }>;
}

export interface EmptyWorkspaceSessionAgent {
  id: string;
  workspaceId?: string;
  archivedAt?: Date | null;
}

export interface EmptyWorkspaceSessionSnapshot {
  workspaces: Map<string, WorkspaceDescriptor>;
  agents: Map<string, EmptyWorkspaceSessionAgent>;
}

export interface ArchiveEmptyWorkspaceDeps {
  readSession: (serverId: string) => EmptyWorkspaceSessionSnapshot | undefined;
  readActiveWorkspaceSelection: () => ActiveWorkspaceSelection | null;
  redirectIfActive: (input: {
    serverId: string;
    workspaceId: string;
    activeWorkspaceSelection: ActiveWorkspaceSelection | null;
  }) => boolean;
  archiveWorkspace: (input: {
    client: Pick<EmptyWorkspaceArchiveClient, "archiveWorkspace">;
    workspace: WorkspaceArchiveTarget;
  }) => Promise<WorkspaceArchiveOutcome>;
  purgeWorkspaceLayout: (workspace: WorkspaceArchiveTarget) => void;
}

const defaultDeps: ArchiveEmptyWorkspaceDeps = {
  readSession: (serverId) => useSessionStore.getState().sessions[serverId],
  readActiveWorkspaceSelection: () => getLastWorkspaceSelection(),
  redirectIfActive: (input) => redirectIfArchivingActiveWorkspace(input),
  archiveWorkspace: (input) => archiveWorkspaceOptimistically(input),
  purgeWorkspaceLayout: (workspace) => {
    const workspaceKey = buildWorkspaceTabPersistenceKey(workspace);
    if (workspaceKey) {
      useWorkspaceLayoutStore.getState().purgeWorkspace(workspaceKey);
    }
  },
};

function hasRunningScripts(workspace: WorkspaceDescriptor): boolean {
  return workspace.scripts.some((script) => script.lifecycle === "running");
}

function hasOtherActiveAgents(
  agents: Map<string, EmptyWorkspaceSessionAgent>,
  workspaceId: string,
  archivedAgentId: string,
): boolean {
  for (const agent of agents.values()) {
    if (agent.id === archivedAgentId) continue;
    if (agent.archivedAt) continue;
    if (agent.workspaceId === workspaceId) return true;
  }
  return false;
}

function hasKnownWorktreeRisk(workspace: WorkspaceDescriptor): boolean {
  return workspace.gitRuntime?.isDirty === true || (workspace.gitRuntime?.aheadOfOrigin ?? 0) > 0;
}

async function hasActiveTerminals(
  client: EmptyWorkspaceArchiveClient,
  workspace: WorkspaceDescriptor,
): Promise<boolean> {
  if (typeof client.listTerminals !== "function") {
    return false;
  }
  try {
    const terminalResult = await client.listTerminals(workspace.workspaceDirectory, undefined, {
      workspaceId: workspace.id,
    });
    return terminalResult.terminals.length > 0;
  } catch {
    return true;
  }
}

async function hasWorktreeArchiveRisk(
  client: EmptyWorkspaceArchiveClient,
  workspace: WorkspaceDescriptor,
): Promise<boolean> {
  if (workspace.workspaceKind !== "worktree") {
    return false;
  }
  if (hasKnownWorktreeRisk(workspace) || typeof client.getCheckoutStatus !== "function") {
    return true;
  }
  try {
    const risk = await readWorktreeArchiveRisk(
      { getCheckoutStatus: client.getCheckoutStatus.bind(client) },
      workspace.workspaceDirectory,
    );
    return risk.isDirty === true || (risk.aheadOfOrigin ?? 0) > 0;
  } catch {
    return true;
  }
}

/**
 * Cascades an agent archive to its owning workspace when that workspace is now empty and safe to
 * remove. Worktree checkouts fail closed whenever git status is dirty, unpushed, or unreadable;
 * workspaces with other active agents, running scripts, or open terminals are also kept.
 */
export async function archiveEmptyWorkspaceIfSafe(input: {
  serverId: string;
  workspaceId: string | null | undefined;
  archivedAgentId: string;
  client: EmptyWorkspaceArchiveClient;
  deps?: Partial<ArchiveEmptyWorkspaceDeps>;
}): Promise<EmptyWorkspaceArchiveOutcome> {
  const workspaceId = input.workspaceId?.trim();
  if (!workspaceId) {
    return "skipped";
  }

  const deps: ArchiveEmptyWorkspaceDeps = { ...defaultDeps, ...input.deps };
  const session = deps.readSession(input.serverId);
  if (!session) {
    return "skipped";
  }

  const workspaceKey = resolveWorkspaceMapKeyByIdentity({
    workspaces: session.workspaces,
    workspaceId,
  });
  const workspace = workspaceKey ? session.workspaces.get(workspaceKey) : undefined;
  if (!workspace || workspace.archivingAt != null) {
    return "skipped";
  }

  if (hasOtherActiveAgents(session.agents, workspace.id, input.archivedAgentId)) {
    return "kept_other_agents";
  }

  if (hasRunningScripts(workspace)) {
    return "kept_running_scripts";
  }

  if (await hasActiveTerminals(input.client, workspace)) {
    return "kept_terminals";
  }

  if (await hasWorktreeArchiveRisk(input.client, workspace)) {
    return "kept_dirty_worktree";
  }

  try {
    const target: WorkspaceArchiveTarget = {
      serverId: input.serverId,
      workspaceId: workspace.id,
    };
    deps.redirectIfActive({
      ...target,
      activeWorkspaceSelection: deps.readActiveWorkspaceSelection(),
    });
    const outcome = await deps.archiveWorkspace({
      client: input.client,
      workspace: target,
    });
    if (outcome === "canceled") {
      return "skipped";
    }
    deps.purgeWorkspaceLayout(target);
    return "archived";
  } catch {
    return "failed";
  }
}
