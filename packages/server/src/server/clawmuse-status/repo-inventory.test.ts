import { describe, expect, it } from "vitest";

import type { PersistedProjectRecord } from "../workspace-registry.js";
import { findGoalRepoRoot, goalRepoDisplayName, listGoalRepos } from "./repo-inventory.js";

function project(overrides: Partial<PersistedProjectRecord>): PersistedProjectRecord {
  return {
    projectId: overrides.projectId ?? overrides.rootPath ?? "p",
    rootPath: "/srv/app",
    kind: "git",
    displayName: "app",
    projectKey: "remote:github.com/acme/app",
    customName: null,
    customIconRevision: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}

describe("goalRepoDisplayName", () => {
  it("drops the GitHub host and keeps other hosts", () => {
    expect(goalRepoDisplayName("remote:github.com/acme/app")).toBe("acme/app");
    expect(goalRepoDisplayName("remote:github.com/acme/app.git")).toBe("acme/app");
    expect(goalRepoDisplayName("remote:git.example.com/acme/app")).toBe("git.example.com/acme/app");
    expect(goalRepoDisplayName("remote:github.com/acme/mono#subdir:packages/app")).toBe(
      "acme/mono/packages/app",
    );
    expect(goalRepoDisplayName("local:/srv/thing")).toBe("local:/srv/thing");
  });
});

describe("listGoalRepos", () => {
  it("publishes active remote-backed git projects once each, sorted", () => {
    const repos = listGoalRepos([
      project({ rootPath: "/srv/zeta", projectKey: "remote:github.com/acme/zeta" }),
      project({ rootPath: "/srv/app" }),
      project({ rootPath: "/srv/app-copy" }),
      project({ rootPath: "/srv/old", archivedAt: "2026-10-02T00:00:00.000Z" }),
      project({ rootPath: "/srv/notes", kind: "non_git", projectKey: null }),
      project({ rootPath: "/srv/local", projectKey: "local:/srv/local" }),
      project({ rootPath: "/srv/weird", projectKey: "remote:github.com/acme/has space" }),
    ]);
    expect(repos).toEqual([
      { repoKey: "remote:github.com/acme/app", displayName: "acme/app" },
      { repoKey: "remote:github.com/acme/zeta", displayName: "acme/zeta" },
    ]);
  });
});

describe("findGoalRepoRoot", () => {
  it("returns the oldest active checkout of the repository, or null", () => {
    const projects = [
      project({ rootPath: "/srv/app-new", createdAt: "2026-10-05T00:00:00.000Z" }),
      project({ rootPath: "/srv/app", createdAt: "2026-09-01T00:00:00.000Z" }),
      project({
        rootPath: "/srv/app-gone",
        createdAt: "2026-01-01T00:00:00.000Z",
        archivedAt: "2026-02-01T00:00:00.000Z",
      }),
    ];
    expect(findGoalRepoRoot(projects, "remote:github.com/acme/app")).toBe("/srv/app");
    expect(findGoalRepoRoot(projects, "remote:github.com/acme/other")).toBeNull();
  });
});
