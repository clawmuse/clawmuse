import type { Href } from "expo-router";
import { describe, expect, it } from "vitest";
import {
  buildWorkspaceArchiveRedirectRoute,
  resolveNextWorkspaceAfterArchive,
} from "@/utils/workspace-archive-navigation";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import {
  redirectIfArchivingActiveWorkspace,
  type RedirectIfArchivingActiveWorkspaceDeps,
} from "@/utils/workspace-archive-redirect";

function workspace(
  input: Partial<WorkspaceDescriptor> & Pick<WorkspaceDescriptor, "id">,
): WorkspaceDescriptor {
  return {
    createdAt: null,
    lastUserMessageAt: null,
    id: input.id,
    projectId: input.projectId ?? "project-1",
    projectDisplayName: input.projectDisplayName ?? "Project",
    projectRootPath: input.projectRootPath ?? "/repo",
    workspaceDirectory: input.workspaceDirectory ?? input.projectRootPath ?? "/repo",
    projectKind: input.projectKind ?? "git",
    workspaceKind: input.workspaceKind ?? "worktree",
    name: input.name ?? input.id,
    status: input.status ?? "done",
    archivingAt: input.archivingAt ?? null,
    statusEnteredAt: null,
    diffStat: input.diffStat ?? null,
    scripts: input.scripts ?? [],
  };
}

describe("buildWorkspaceArchiveRedirectRoute", () => {
  it("redirects an archived worktree to the new workspace screen for the same project", () => {
    const workspaces = [
      workspace({ id: "/repo", workspaceKind: "checkout", name: "main" }),
      workspace({ id: "/repo/.paseo/worktrees/feature", name: "feature" }),
    ];

    expect(
      buildWorkspaceArchiveRedirectRoute({
        serverId: "server-1",
        archivedWorkspaceId: "/repo/.paseo/worktrees/feature",
        workspaces,
      }),
    ).toBe("/new?serverId=server-1&dir=%2Frepo&name=Project&projectId=project-1");
  });

  it("redirects to the new workspace route when no sibling workspace target exists", () => {
    const workspaces = [
      workspace({
        id: "/repo/.paseo/worktrees/feature",
        name: "feature",
        projectRootPath: "/repo",
      }),
    ];

    expect(
      buildWorkspaceArchiveRedirectRoute({
        serverId: "server-1",
        archivedWorkspaceId: "/repo/.paseo/worktrees/feature",
        workspaces,
      }),
    ).toBe("/new?serverId=server-1&dir=%2Frepo&name=Project&projectId=project-1");
  });

  it("redirects to the new workspace route instead of another workspace", () => {
    const workspaces = [
      workspace({
        id: "/notes",
        projectId: "notes",
        projectRootPath: "/notes",
        projectKind: "directory",
        workspaceKind: "checkout",
      }),
    ];

    expect(
      buildWorkspaceArchiveRedirectRoute({
        serverId: "server-1",
        archivedWorkspaceId: "/notes",
        workspaces,
      }),
    ).toBe("/new?serverId=server-1&dir=%2Fnotes&name=Project&projectId=notes");
  });
});

function createFakeRouter(
  workspaces: WorkspaceDescriptor[],
  sidebarOrder: string[] = [],
): {
  deps: RedirectIfArchivingActiveWorkspaceDeps;
  routes: Href[];
  workspaceVisits: string[];
  openedLists: (Href | null)[];
} {
  const routes: Href[] = [];
  const workspaceVisits: string[] = [];
  const openedLists: (Href | null)[] = [];
  return {
    routes,
    workspaceVisits,
    openedLists,
    deps: {
      navigateToRoute: (route) => {
        routes.push(route);
      },
      navigateToWorkspace: (target) => {
        workspaceVisits.push(`${target.serverId}:${target.workspaceId}`);
      },
      readWorkspaces: () => workspaces,
      readSidebarTargets: () =>
        sidebarOrder.map((workspaceId) => ({ serverId: "server-1", workspaceId })),
      openAgentList: () => {
        openedLists.push(routes.at(-1) ?? null);
      },
    },
  };
}

describe("redirectIfArchivingActiveWorkspace", () => {
  it("does not replace the route when archiving an inactive workspace", () => {
    const { deps, routes, openedLists } = createFakeRouter([
      workspace({ id: "main", workspaceKind: "local_checkout" }),
      workspace({ id: "feature", name: "feature" }),
    ]);

    expect(
      redirectIfArchivingActiveWorkspace(
        {
          serverId: "server-1",
          workspaceId: "feature",
          activeWorkspaceSelection: { serverId: "server-1", workspaceId: "main" },
        },
        deps,
      ),
    ).toBe(false);

    expect(routes).toEqual([]);
    expect(openedLists).toEqual([]);
  });

  it("opens the workspace list after leaving the archived active workspace", () => {
    const { deps, routes, openedLists } = createFakeRouter([
      workspace({ id: "main", workspaceKind: "local_checkout" }),
      workspace({ id: "feature", name: "feature" }),
    ]);

    expect(
      redirectIfArchivingActiveWorkspace(
        {
          serverId: "server-1",
          workspaceId: "feature",
          activeWorkspaceSelection: { serverId: "server-1", workspaceId: "feature" },
        },
        deps,
      ),
    ).toBe(true);

    expect(routes).toEqual(["/new?serverId=server-1&dir=%2Frepo&name=Project&projectId=project-1"]);
    expect(openedLists).toEqual(routes);
  });

  it("moves to the next sidebar workspace instead of the new workspace screen", () => {
    const { deps, routes, workspaceVisits, openedLists } = createFakeRouter(
      [workspace({ id: "a" }), workspace({ id: "b" }), workspace({ id: "c" })],
      ["a", "b", "c"],
    );

    expect(
      redirectIfArchivingActiveWorkspace(
        {
          serverId: "server-1",
          workspaceId: "b",
          activeWorkspaceSelection: { serverId: "server-1", workspaceId: "b" },
        },
        deps,
      ),
    ).toBe(true);

    expect(workspaceVisits).toEqual(["server-1:c"]);
    expect(routes).toEqual([]);
    expect(openedLists).toEqual([]);
  });
});

describe("resolveNextWorkspaceAfterArchive", () => {
  const target = (workspaceId: string) => ({ serverId: "server-1", workspaceId });
  const archived = target("b");

  it("picks the row below the archived one", () => {
    expect(
      resolveNextWorkspaceAfterArchive({
        targets: ["a", "b", "c"].map(target),
        archived,
        isAvailable: () => true,
      }),
    ).toEqual(target("c"));
  });

  it("falls back to the row above when the archived one was last", () => {
    expect(
      resolveNextWorkspaceAfterArchive({
        targets: ["a", "b"].map(target),
        archived,
        isAvailable: () => true,
      }),
    ).toEqual(target("a"));
  });

  it("skips rows that are already being archived", () => {
    expect(
      resolveNextWorkspaceAfterArchive({
        targets: ["a", "b", "c", "d"].map(target),
        archived,
        isAvailable: (candidate) => candidate.workspaceId !== "c",
      }),
    ).toEqual(target("d"));
  });

  it("returns null when the archived workspace was the only one", () => {
    expect(
      resolveNextWorkspaceAfterArchive({
        targets: [archived],
        archived,
        isAvailable: () => true,
      }),
    ).toBeNull();
  });
});
