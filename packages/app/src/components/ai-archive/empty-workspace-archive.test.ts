import { describe, expect, it, vi } from "vitest";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import {
  archiveEmptyWorkspaceIfSafe,
  type ArchiveEmptyWorkspaceDeps,
  type EmptyWorkspaceArchiveClient,
  type EmptyWorkspaceSessionAgent,
} from "./empty-workspace-archive";

function makeWorkspace(overrides: Partial<WorkspaceDescriptor> = {}): WorkspaceDescriptor {
  return {
    id: "ws-1",
    projectId: "proj-1",
    projectDisplayName: "ClawMuse",
    projectRootPath: "/repo",
    workspaceDirectory: "/repo",
    projectKind: "git",
    workspaceKind: "directory",
    name: "main",
    createdAt: new Date("2026-11-24T00:00:00.000Z"),
    lastUserMessageAt: null,
    status: "done",
    statusEnteredAt: null,
    archivingAt: null,
    diffStat: null,
    scripts: [],
    ...overrides,
  };
}

function createHarness(options?: {
  workspace?: WorkspaceDescriptor;
  agents?: EmptyWorkspaceSessionAgent[];
  terminals?: unknown[];
  listTerminalsError?: Error;
  checkoutStatus?: {
    isDirty?: boolean;
    aheadOfOrigin?: number | null;
    error?: { code: string; message: string } | null;
  };
  checkoutStatusError?: Error;
  archiveOutcome?: "archived" | "canceled";
  archiveError?: Error;
}) {
  const workspace = options?.workspace ?? makeWorkspace();
  const agents = new Map<string, EmptyWorkspaceSessionAgent>(
    (options?.agents ?? [{ id: "agent-1", workspaceId: workspace.id, archivedAt: new Date() }]).map(
      (agent) => [agent.id, agent],
    ),
  );
  const workspaces = new Map<string, WorkspaceDescriptor>([[workspace.id, workspace]]);

  const archiveWorkspace = vi.fn(async () => ({ error: null }));
  const listTerminals = vi.fn(async () => {
    if (options?.listTerminalsError) throw options.listTerminalsError;
    return { terminals: options?.terminals ?? [] };
  });
  const getCheckoutStatus: NonNullable<EmptyWorkspaceArchiveClient["getCheckoutStatus"]> = vi.fn(
    async () => {
      if (options?.checkoutStatusError) throw options.checkoutStatusError;
      return {
        cwd: workspace.workspaceDirectory,
        requestId: "req-1",
        isGit: true as const,
        repoRoot: workspace.workspaceDirectory,
        mainRepoRoot: workspace.projectRootPath,
        isPaseoOwnedWorktree: workspace.workspaceKind === "worktree",
        currentBranch: "main",
        baseRef: "main",
        aheadBehind: { ahead: 0, behind: 0 },
        aheadOfOrigin: options?.checkoutStatus?.aheadOfOrigin ?? 0,
        behindOfOrigin: 0,
        hasRemote: true,
        isDirty: options?.checkoutStatus?.isDirty ?? false,
        hasUntracked: false,
        hasStaged: false,
        hasUnstaged: false,
        remoteUrl: null,
        error: options?.checkoutStatus?.error
          ? { code: "UNKNOWN" as const, message: options.checkoutStatus.error.message }
          : null,
      };
    },
  );

  const client: EmptyWorkspaceArchiveClient = {
    archiveWorkspace,
    listTerminals,
    getCheckoutStatus,
  };

  const redirectIfActive = vi.fn(() => false);
  const archiveWorkspaceDep = vi.fn(async () => {
    if (options?.archiveError) throw options.archiveError;
    return options?.archiveOutcome ?? "archived";
  });
  const purgeWorkspaceLayout = vi.fn();

  const deps: ArchiveEmptyWorkspaceDeps = {
    readSession: () => ({ workspaces, agents }),
    readActiveWorkspaceSelection: () => ({ serverId: "host-a", workspaceId: workspace.id }),
    redirectIfActive,
    archiveWorkspace: archiveWorkspaceDep,
    purgeWorkspaceLayout,
  };

  return {
    workspace,
    client,
    deps,
    listTerminals,
    getCheckoutStatus,
    redirectIfActive,
    archiveWorkspaceDep,
    purgeWorkspaceLayout,
  };
}

describe("archiveEmptyWorkspaceIfSafe", () => {
  it("archives an empty directory workspace and redirects + purges layout", async () => {
    const h = createHarness();
    const outcome = await archiveEmptyWorkspaceIfSafe({
      serverId: "host-a",
      workspaceId: "ws-1",
      archivedAgentId: "agent-1",
      client: h.client,
      deps: h.deps,
    });

    expect(outcome).toBe("archived");
    expect(h.redirectIfActive).toHaveBeenCalledWith({
      serverId: "host-a",
      workspaceId: "ws-1",
      activeWorkspaceSelection: { serverId: "host-a", workspaceId: "ws-1" },
    });
    expect(h.archiveWorkspaceDep).toHaveBeenCalledTimes(1);
    expect(h.purgeWorkspaceLayout).toHaveBeenCalledWith({
      serverId: "host-a",
      workspaceId: "ws-1",
    });
    expect(h.getCheckoutStatus).not.toHaveBeenCalled();
  });

  it("keeps the workspace when another unarchived agent still belongs to it", async () => {
    const h = createHarness({
      agents: [
        { id: "agent-1", workspaceId: "ws-1", archivedAt: new Date() },
        { id: "agent-2", workspaceId: "ws-1", archivedAt: null },
      ],
    });
    const outcome = await archiveEmptyWorkspaceIfSafe({
      serverId: "host-a",
      workspaceId: "ws-1",
      archivedAgentId: "agent-1",
      client: h.client,
      deps: h.deps,
    });

    expect(outcome).toBe("kept_other_agents");
    expect(h.archiveWorkspaceDep).not.toHaveBeenCalled();
  });

  it("keeps the workspace when a workspace script is running", async () => {
    const h = createHarness({
      workspace: makeWorkspace({
        scripts: [
          {
            scriptName: "dev",
            type: "service",
            hostname: "localhost",
            port: 3000,
            proxyUrl: null,
            lifecycle: "running",
            health: "healthy",
            exitCode: null,
            terminalId: null,
          },
        ],
      }),
    });
    const outcome = await archiveEmptyWorkspaceIfSafe({
      serverId: "host-a",
      workspaceId: "ws-1",
      archivedAgentId: "agent-1",
      client: h.client,
      deps: h.deps,
    });

    expect(outcome).toBe("kept_running_scripts");
    expect(h.archiveWorkspaceDep).not.toHaveBeenCalled();
  });

  it("keeps the workspace when open terminals exist or terminal lookup fails", async () => {
    const withTerminal = createHarness({ terminals: [{ id: "term-1" }] });
    expect(
      await archiveEmptyWorkspaceIfSafe({
        serverId: "host-a",
        workspaceId: "ws-1",
        archivedAgentId: "agent-1",
        client: withTerminal.client,
        deps: withTerminal.deps,
      }),
    ).toBe("kept_terminals");
    expect(withTerminal.archiveWorkspaceDep).not.toHaveBeenCalled();

    const failedLookup = createHarness({ listTerminalsError: new Error("timeout") });
    expect(
      await archiveEmptyWorkspaceIfSafe({
        serverId: "host-a",
        workspaceId: "ws-1",
        archivedAgentId: "agent-1",
        client: failedLookup.client,
        deps: failedLookup.deps,
      }),
    ).toBe("kept_terminals");
    expect(failedLookup.archiveWorkspaceDep).not.toHaveBeenCalled();
  });

  it("archives a clean worktree workspace after verifying host checkout status", async () => {
    const h = createHarness({
      workspace: makeWorkspace({
        workspaceKind: "worktree",
        workspaceDirectory: "/worktrees/ws-1",
      }),
      checkoutStatus: { isDirty: false, aheadOfOrigin: 0 },
    });
    const outcome = await archiveEmptyWorkspaceIfSafe({
      serverId: "host-a",
      workspaceId: "ws-1",
      archivedAgentId: "agent-1",
      client: h.client,
      deps: h.deps,
    });

    expect(outcome).toBe("archived");
    expect(h.getCheckoutStatus).toHaveBeenCalledWith("/worktrees/ws-1");
    expect(h.archiveWorkspaceDep).toHaveBeenCalledTimes(1);
  });

  it("keeps a worktree workspace when dirty, unpushed, or git status fails", async () => {
    const dirty = createHarness({
      workspace: makeWorkspace({ workspaceKind: "worktree", workspaceDirectory: "/wt/dirty" }),
      checkoutStatus: { isDirty: true, aheadOfOrigin: 0 },
    });
    expect(
      await archiveEmptyWorkspaceIfSafe({
        serverId: "host-a",
        workspaceId: "ws-1",
        archivedAgentId: "agent-1",
        client: dirty.client,
        deps: dirty.deps,
      }),
    ).toBe("kept_dirty_worktree");

    const unpushed = createHarness({
      workspace: makeWorkspace({ workspaceKind: "worktree", workspaceDirectory: "/wt/ahead" }),
      checkoutStatus: { isDirty: false, aheadOfOrigin: 2 },
    });
    expect(
      await archiveEmptyWorkspaceIfSafe({
        serverId: "host-a",
        workspaceId: "ws-1",
        archivedAgentId: "agent-1",
        client: unpushed.client,
        deps: unpushed.deps,
      }),
    ).toBe("kept_dirty_worktree");

    const unreadable = createHarness({
      workspace: makeWorkspace({ workspaceKind: "worktree", workspaceDirectory: "/wt/err" }),
      checkoutStatusError: new Error("git failed"),
    });
    expect(
      await archiveEmptyWorkspaceIfSafe({
        serverId: "host-a",
        workspaceId: "ws-1",
        archivedAgentId: "agent-1",
        client: unreadable.client,
        deps: unreadable.deps,
      }),
    ).toBe("kept_dirty_worktree");

    expect(dirty.archiveWorkspaceDep).not.toHaveBeenCalled();
    expect(unpushed.archiveWorkspaceDep).not.toHaveBeenCalled();
    expect(unreadable.archiveWorkspaceDep).not.toHaveBeenCalled();
  });

  it("returns failed when archiving the workspace throws", async () => {
    const h = createHarness({ archiveError: new Error("host error") });
    const outcome = await archiveEmptyWorkspaceIfSafe({
      serverId: "host-a",
      workspaceId: "ws-1",
      archivedAgentId: "agent-1",
      client: h.client,
      deps: h.deps,
    });

    expect(outcome).toBe("failed");
    expect(h.purgeWorkspaceLayout).not.toHaveBeenCalled();
  });
});
