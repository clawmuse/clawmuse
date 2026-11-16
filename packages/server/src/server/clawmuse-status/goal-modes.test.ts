import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { goalRunProviderOptions, resolveGoalRunModeId } from "./goal-modes.js";
import type { GoalRunIsolationContext } from "./goal-unattended-policy.js";
import { mergeProviderOptions } from "../agent/provider-options.js";
import {
  ClaudeProviderOptionsSchema,
  type ClaudeProviderOptions,
} from "../agent/providers/claude/options.js";

const WORKTREE: GoalRunIsolationContext = {
  isolation: "worktree",
  worktreePath: "/paseo/worktrees/abc12345/goal-42",
};

describe("goalRunProviderOptions", () => {
  it("overrides permissive Codex profiles and keeps planners read-only", () => {
    const inherited = {
      approval_policy: "never",
      sandbox_mode: "danger-full-access",
      sandbox_workspace_write: { writable_roots: ["/home"], network_access: true },
    };
    expect(
      mergeProviderOptions(inherited, goalRunProviderOptions("codex", "auto", "execute")),
    ).toMatchObject({
      approval_policy: "on-request",
      sandbox_mode: "workspace-write",
      sandbox_workspace_write: {
        writable_roots: [],
        network_access: false,
        exclude_slash_tmp: true,
        exclude_tmpdir_env_var: true,
      },
    });
    expect(goalRunProviderOptions("codex", "auto", "plan")?.sandbox_mode).toBe("read-only");
    expect(goalRunProviderOptions("claude", "acceptEdits", "execute")).toBeUndefined();
  });

  it("keeps the strict Codex sandbox on local isolation even when asked", () => {
    const local: GoalRunIsolationContext = { isolation: "local", worktreePath: null };
    expect(goalRunProviderOptions("codex", "auto", "execute", local)).toMatchObject({
      approval_policy: "on-request",
      sandbox_workspace_write: { network_access: false, exclude_slash_tmp: true },
    });
  });

  it("opens the worktree plus temp dir and network for Codex execute runs", () => {
    expect(goalRunProviderOptions("codex", "auto", "execute", WORKTREE)).toMatchObject({
      approval_policy: "never",
      sandbox_mode: "workspace-write",
      sandbox_workspace_write: {
        writable_roots: [WORKTREE.worktreePath, tmpdir()],
        network_access: true,
        exclude_slash_tmp: false,
        exclude_tmpdir_env_var: false,
      },
    });
  });

  it("never relaxes a Codex plan run even inside a worktree", () => {
    expect(goalRunProviderOptions("codex", "auto", "plan", WORKTREE)).toMatchObject({
      sandbox_mode: "read-only",
      approval_policy: "on-request",
      sandbox_workspace_write: { network_access: false, exclude_slash_tmp: true },
    });
  });

  it("gives Claude execute runs a worktree-scoped allow/deny rule set", () => {
    const options = goalRunProviderOptions("claude", "acceptEdits", "execute", WORKTREE) as
      | ClaudeProviderOptions
      | undefined;
    expect(ClaudeProviderOptionsSchema.safeParse(options).success).toBe(true);
    const permissions = options?.settings?.permissions;
    expect(permissions?.allow).toEqual(
      expect.arrayContaining([
        "Bash(npm:*)",
        "Bash(git commit:*)",
        "Bash(git push origin HEAD)",
        "Bash(gh pr create:*)",
      ]),
    );
    // A bare `git push origin main` must not be auto-approved.
    expect(permissions?.allow).not.toContain("Bash(git push:*)");
    expect(permissions?.deny).toEqual(
      expect.arrayContaining([
        "Bash(gh pr merge:*)",
        "Bash(gh repo delete:*)",
        "Bash(gh secret:*)",
        "Bash(gh release:*)",
        "Bash(git push --force:*)",
        "Bash(git push origin main:*)",
      ]),
    );
    expect(options?.disallowedTools).toEqual(expect.arrayContaining(["Bash(gh pr merge:*)"]));
    expect(options?.additionalDirectories).toEqual([tmpdir()]);
  });

  it("fails closed for providers without a tailored profile", () => {
    expect(goalRunProviderOptions("opencode", "build", "execute", WORKTREE)).toBeUndefined();
    expect(goalRunProviderOptions("claude", "default", "execute")).toBeUndefined();
  });
});

describe("resolveGoalRunModeId", () => {
  it("keeps Claude permission prompts instead of choosing bypass", () => {
    expect(
      resolveGoalRunModeId([
        { id: "default", label: "Always Ask" },
        { id: "bypassPermissions", label: "Bypass", isUnattended: true },
      ]),
    ).toBe("default");
  });
  it("allows Claude repository edits while preserving command permission checks", () => {
    expect(
      resolveGoalRunModeId([
        { id: "default", label: "Ask" },
        { id: "acceptEdits", label: "Accept edits" },
        { id: "bypassPermissions", label: "Bypass" },
      ]),
    ).toBe("acceptEdits");
  });
  it("keeps Codex sandbox and approval flow", () => {
    expect(
      resolveGoalRunModeId([
        { id: "auto", label: "Default" },
        { id: "full-access", label: "Full Access" },
      ]),
    ).toBe("auto");
  });
  it("refuses a provider with only bypass or unknown permissions", () => {
    expect(() =>
      resolveGoalRunModeId([{ id: "robot", label: "Robot", isUnattended: true }]),
    ).toThrow(/no supported/);
    expect(() => resolveGoalRunModeId([])).toThrow(/no supported/);
  });
});
