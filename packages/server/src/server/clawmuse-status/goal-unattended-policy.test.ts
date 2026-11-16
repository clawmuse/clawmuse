import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PersistedWorkspaceRecord } from "../workspace-registry.js";
import { blockedGoalCommandReason, resolveGoalRunIsolation } from "./goal-unattended-policy.js";
import {
  deriveWorktreeProjectHash,
  getGitCommonDir,
  isPaseoOwnedWorktreeCwd,
  resolvePaseoWorktreesBaseRoot,
} from "../../utils/worktree.js";

function workspace(
  overrides: Partial<Pick<PersistedWorkspaceRecord, "kind" | "cwd" | "branch">>,
): Pick<PersistedWorkspaceRecord, "kind" | "cwd" | "branch"> {
  return {
    kind: "directory",
    cwd: "/srv/app",
    branch: null,
    ...overrides,
  };
}

describe("resolveGoalRunIsolation", () => {
  it("never runs the probe for non-worktree workspaces", async () => {
    const probe = vi.fn(async () => true);
    for (const kind of ["local_checkout", "directory"] as const) {
      await expect(resolveGoalRunIsolation(workspace({ kind }), probe)).resolves.toEqual({
        isolation: "local",
        worktreePath: null,
      });
    }
    expect(probe).not.toHaveBeenCalled();
  });

  it("degrades a worktree on a default branch to local", async () => {
    const probe = vi.fn(async () => true);
    for (const branch of ["main", "master", null, undefined]) {
      await expect(
        resolveGoalRunIsolation(workspace({ kind: "worktree", branch: branch ?? null }), probe),
      ).resolves.toEqual({ isolation: "local", worktreePath: null });
    }
    expect(probe).not.toHaveBeenCalled();
  });

  it("fails closed when the ownership probe rejects the path", async () => {
    await expect(
      resolveGoalRunIsolation(
        workspace({ kind: "worktree", cwd: "/srv/app-wt", branch: "goal/fix" }),
        async () => false,
      ),
    ).resolves.toEqual({ isolation: "local", worktreePath: null });
  });

  it("fails closed when the ownership probe throws", async () => {
    await expect(
      resolveGoalRunIsolation(
        workspace({ kind: "worktree", cwd: "/srv/app-wt", branch: "goal/fix" }),
        async () => {
          throw new Error("git broke");
        },
      ),
    ).resolves.toEqual({ isolation: "local", worktreePath: null });
  });

  it("grants worktree isolation to a verified feature-branch worktree", async () => {
    await expect(
      resolveGoalRunIsolation(
        workspace({ kind: "worktree", cwd: "/srv/app-wt", branch: "goal/fix" }),
        async () => true,
      ),
    ).resolves.toEqual({ isolation: "worktree", worktreePath: "/srv/app-wt" });
  });
});

describe("resolveGoalRunIsolation against a real worktree", () => {
  let tempDir: string;
  let repoDir: string;
  let paseoHome: string;

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  async function makeRepoWithPaseoWorktree(branch: string): Promise<string> {
    tempDir = realpathSync(mkdtempSync(join(tmpdir(), "goal-isolation-")));
    repoDir = join(tempDir, "repo");
    paseoHome = join(tempDir, "paseo-home");
    mkdirSync(repoDir, { recursive: true });
    execFileSync("git", ["init", "-b", "main"], { cwd: repoDir });
    execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: repoDir });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: repoDir });
    writeFileSync(join(repoDir, "file.txt"), "hello\n");
    execFileSync("git", ["add", "."], { cwd: repoDir });
    execFileSync("git", ["-c", "commit.gpgsign=false", "commit", "-m", "initial"], {
      cwd: repoDir,
    });

    const worktreePath = join(
      resolvePaseoWorktreesBaseRoot({ paseoHome }),
      await deriveWorktreeProjectHash(repoDir),
      "goal-test",
    );
    execFileSync("git", ["worktree", "add", "-b", branch, worktreePath], { cwd: repoDir });
    return worktreePath;
  }

  // Same shape as the default probe: ownership by layout/git registration plus
  // a git root that actually resolves from the candidate path.
  const probe = async (cwd: string) => {
    const ownership = await isPaseoOwnedWorktreeCwd(cwd, { paseoHome });
    if (!ownership.allowed) return false;
    try {
      await getGitCommonDir(cwd);
      return true;
    } catch {
      return false;
    }
  };

  it("verifies a real Paseo worktree through git", async () => {
    const worktreePath = await makeRepoWithPaseoWorktree("goal/feature");
    await expect(
      resolveGoalRunIsolation(
        workspace({ kind: "worktree", cwd: worktreePath, branch: "goal/feature" }),
        probe,
      ),
    ).resolves.toEqual({ isolation: "worktree", worktreePath });
  });

  it("rejects a worktree-shaped path git does not know about", async () => {
    const worktreePath = await makeRepoWithPaseoWorktree("goal/feature");
    const impostor = join(
      resolvePaseoWorktreesBaseRoot({ paseoHome }),
      await deriveWorktreeProjectHash(repoDir),
      "hand-made",
    );
    mkdirSync(impostor, { recursive: true });
    await expect(
      resolveGoalRunIsolation(
        workspace({ kind: "worktree", cwd: impostor, branch: "goal/fake" }),
        probe,
      ),
    ).resolves.toEqual({ isolation: "local", worktreePath: null });
    expect(worktreePath).not.toBe(impostor);
  });
});

describe("blockedGoalCommandReason", () => {
  it.each([
    "gh pr merge 12",
    "gh pr merge 12 --squash --auto",
    "gh repo delete acme/app --yes",
    "gh secret list",
    "gh release create v1.2.3",
    "gh api repos/acme/app/pulls/12/merge -X PUT",
  ])("blocks `%s`", (command) => {
    expect(blockedGoalCommandReason(command)).not.toBeNull();
  });

  it.each([
    "git push --force",
    "git push -f origin feat",
    "git push --force-with-lease",
    "git push origin --force",
    "git push --delete origin feat",
    "git push --mirror origin",
    "git push origin main",
    "git push upstream master",
    "git push origin HEAD:main",
    "git push origin feature:master",
    "git push origin +feat:main",
    "git push origin +main",
    "git push origin refs/heads/main",
    "git push origin :main",
    "npm test && gh pr merge 12",
    "npm test; git push -f",
    "git config --global user.name x",
    "git worktree remove ../other",
    "git -C ../repo push --force",
    "git --git-dir=../repo/.git push origin main",
    "git -c core.hooksPath=/dev/null push origin +feat",
  ])("blocks `%s`", (command) => {
    expect(blockedGoalCommandReason(command)).not.toBeNull();
  });

  it.each([
    "npm test",
    "npx vitest run src/foo.test.ts",
    "npm run typecheck && npm run lint",
    "git status --short",
    "git add . && git commit -m 'feat: x'",
    "git checkout -b feat/x",
    "git push",
    "git push -u origin HEAD",
    "git push origin HEAD",
    "git push origin feat/goal-42",
    "git push origin release/main-hotfix",
    "gh pr create --title x --body y",
    "gh pr checks 12",
    "gh auth status",
    "git config user.name x",
    "git config --local core.hooksPath /dev/null",
  ])("allows `%s`", (command) => {
    expect(blockedGoalCommandReason(command)).toBeNull();
  });
});
