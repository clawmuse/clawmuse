import type { AgentManager } from "./agent/agent-manager.js";
import type { AgentStorage, StoredAgentRecord } from "./agent/agent-storage.js";
import type { WorkspaceRegistry } from "./workspace-registry.js";
import type { TerminalManager } from "../terminal/terminal-manager.js";

interface WorkspaceDeleteDependencies {
  workspaceRegistry: WorkspaceRegistry;
  agentStorage: Pick<AgentStorage, "listByWorkspace" | "remove">;
  agentManager: Pick<
    AgentManager,
    "listAgents" | "closeAgent" | "flush" | "deleteAgentState" | "notifyAgentRemoved"
  >;
  terminalManager: TerminalManager | null;
  stopSetup: (workspaceId: string) => Promise<void>;
  teardown: (workspaceId: string) => Promise<void>;
}

// Different client sessions share these stores. A repeated delete joins the same operation.
const pending = new WeakMap<WorkspaceRegistry, Map<string, Promise<void>>>();

export function deleteWorkspace(
  dependencies: WorkspaceDeleteDependencies,
  workspaceId: string,
): Promise<void> {
  let operations = pending.get(dependencies.workspaceRegistry);
  if (!operations) {
    operations = new Map();
    pending.set(dependencies.workspaceRegistry, operations);
  }
  const existing = operations.get(workspaceId);
  if (existing) return existing;
  const operation = deleteWorkspaceContents(dependencies, workspaceId).finally(() => {
    operations.delete(workspaceId);
  });
  operations.set(workspaceId, operation);
  return operation;
}

async function deleteWorkspaceContents(
  dependencies: WorkspaceDeleteDependencies,
  workspaceId: string,
): Promise<void> {
  const { agentManager, agentStorage, workspaceRegistry, terminalManager } = dependencies;
  await dependencies.stopSetup(workspaceId);
  const records = new Map<string, Pick<StoredAgentRecord, "id" | "workspaceId" | "internal">>(
    (await agentStorage.listByWorkspace(workspaceId)).map((agent) => [agent.id, agent]),
  );
  // Include initializing runtimes that have not reached their first durable snapshot.
  for (const agent of agentManager.listAgents({ includeInternal: true })) {
    if (agent.workspaceId === workspaceId) records.set(agent.id, agent);
  }

  // Closing is deliberately separate from archive: archive can cascade to another workspace.
  for (const agent of records.values()) await agentManager.closeAgent(agent.id);
  if (terminalManager) {
    for (const cwd of terminalManager.listDirectories()) {
      for (const terminal of await terminalManager.getTerminals(cwd, { workspaceId })) {
        if (terminal.workspaceId === workspaceId) {
          await terminalManager.killTerminalAndWait(terminal.id, {
            gracefulTimeoutMs: 2000,
            forceTimeoutMs: 1500,
          });
        }
      }
    }
  }
  await agentManager.flush();
  for (const agent of records.values()) {
    await agentManager.deleteAgentState(agent.id);
    await agentStorage.remove(agent.id);
    agentManager.notifyAgentRemoved(agent);
  }
  await dependencies.teardown(workspaceId);
  // Registry removal is last, so failures retain an addressable workspace for retry.
  // Never use archiveByScope here: it may delete the backing Git worktree.
  await workspaceRegistry.remove(workspaceId);
}
