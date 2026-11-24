import { describe, expect, it } from "vitest";
import type { AggregatedAgent } from "@/hooks/use-aggregated-agents";
import { buildProjectArchiveOptions, resolveAgentProject } from "./project-scope";
import type { ArchiveRowItem } from "./types";

function makeRowItem(id: string, overrides: Partial<AggregatedAgent> = {}): ArchiveRowItem {
  const agent: AggregatedAgent = {
    id,
    serverId: "host-a",
    serverLabel: "Host A",
    provider: "codex",
    title: id,
    cwd: "/work/alpha",
    workspaceId: `ws-${id}`,
    status: "idle",
    labels: {},
    turn: { phase: "idle", cancellationRequestId: null },
    createdAt: new Date("2026-11-20T00:00:00Z"),
    lastActivityAt: new Date("2026-11-20T00:00:00Z"),
    archivedAt: null,
    pendingPermissionCount: 0,
    requiresAttention: false,
    attentionReason: null,
    attentionTimestamp: null,
    ...overrides,
  };
  return {
    key: `${agent.serverId}:${agent.id}`,
    agent,
    meta: { model: null, lastError: null, parentAgentId: null, childCount: 0 },
    entry: { phase: "idle" },
  };
}

describe("resolveAgentProject", () => {
  it("prefers canonical projectPlacement projectKey and projectName", () => {
    const resolved = resolveAgentProject({
      cwd: "C:\\work\\alpha\\wt-1\\",
      projectPlacement: {
        projectKey: "repo:github.com/acme/alpha",
        projectName: "Alpha",
        workspaceName: "feat/x",
        checkout: {
          worktreeRoot: "C:\\work\\alpha\\wt-1",
          cwd: "C:\\work\\alpha\\wt-1",
          isGit: true,
          currentBranch: "feat/x",
          remoteUrl: "https://github.com/acme/alpha.git",
          isPaseoOwnedWorktree: true,
          mainRepoRoot: "C:\\work\\alpha",
        },
      },
    });
    expect(resolved).toEqual({
      id: "repo:github.com/acme/alpha",
      label: "Alpha",
      pathHint: "C:/work/alpha",
    });
  });

  it("normalizes trailing slashes and backslashes when falling back to cwd", () => {
    const first = resolveAgentProject({ cwd: "C:\\Users\\dev\\bianpai\\", projectPlacement: null });
    const second = resolveAgentProject({ cwd: "C:/Users/dev/bianpai", projectPlacement: null });
    expect(first.id).toBe("cwd:C:/Users/dev/bianpai");
    expect(first.label).toBe("bianpai");
    expect(second).toEqual(first);
  });

  it("handles empty cwd gracefully", () => {
    expect(resolveAgentProject({ cwd: "   ", projectPlacement: null })).toEqual({
      id: "__unassigned__",
      label: "",
    });
  });
});

describe("buildProjectArchiveOptions", () => {
  it("groups items, sorts by count descending then name, and disambiguates duplicate names", () => {
    const items = [
      makeRowItem("a1", { cwd: "/work/team-a/app" }),
      makeRowItem("b1", {
        cwd: "/work/bianpai",
        projectPlacement: {
          projectKey: "proj:bianpai",
          projectName: "bianpai",
          workspaceName: "main",
          checkout: {
            worktreeRoot: "/work/bianpai",
            cwd: "/work/bianpai",
            isGit: true,
            currentBranch: "main",
            remoteUrl: null,
            isPaseoOwnedWorktree: false,
            mainRepoRoot: "/work/bianpai",
          },
        },
      }),
      makeRowItem("b2", {
        cwd: "/work/bianpai/wt",
        projectPlacement: {
          projectKey: "proj:bianpai",
          projectName: "bianpai",
          workspaceName: "fix",
          checkout: {
            worktreeRoot: "/work/bianpai/wt",
            cwd: "/work/bianpai/wt",
            isGit: true,
            currentBranch: "fix",
            remoteUrl: null,
            isPaseoOwnedWorktree: true,
            mainRepoRoot: "/work/bianpai",
          },
        },
      }),
      makeRowItem("a2", { cwd: "/work/team-b/app" }),
      makeRowItem("none", { cwd: "" }),
    ];

    const options = buildProjectArchiveOptions(items, "Other");
    expect(options).toEqual([
      { id: "proj:bianpai", label: "bianpai", description: undefined, count: 2 },
      { id: "cwd:/work/team-a/app", label: "app", description: "/work/team-a/app", count: 1 },
      { id: "cwd:/work/team-b/app", label: "app", description: "/work/team-b/app", count: 1 },
      { id: "__unassigned__", label: "Other", description: undefined, count: 1 },
    ]);
  });
});
