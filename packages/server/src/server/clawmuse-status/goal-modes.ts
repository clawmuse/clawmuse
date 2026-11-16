import { tmpdir } from "node:os";

import type { AgentMode } from "../agent/agent-sdk-types.js";
import type { ProviderOptions } from "@getpaseo/protocol/agent-types";
import type { CodexProviderOptions } from "../agent/providers/codex/options.js";
import {
  buildClaudeGoalUnattendedOptions,
  type GoalRunIsolationContext,
} from "./goal-unattended-policy.js";

function codexStrictGoalRunOptions(kind: "plan" | "execute"): CodexProviderOptions {
  return {
    approval_policy: "on-request",
    sandbox_mode: kind === "plan" ? "read-only" : "workspace-write",
    sandbox_workspace_write: {
      writable_roots: [],
      network_access: false,
      exclude_slash_tmp: true,
      exclude_tmpdir_env_var: true,
    },
  };
}

/**
 * Inside a verified worktree the executor must run tests, push its feature
 * branch and open a PR without a human in the loop: writes open to the
 * worktree plus the system temp dir, network opens for package/git/GitHub
 * traffic, and `never` turns out-of-sandbox escalations into hard failures
 * instead of parked approval prompts.
 */
function codexWorktreeGoalRunOptions(worktreePath: string): CodexProviderOptions {
  return {
    approval_policy: "never",
    sandbox_mode: "workspace-write",
    sandbox_workspace_write: {
      writable_roots: [worktreePath, tmpdir()],
      network_access: true,
      exclude_slash_tmp: false,
      exclude_tmpdir_env_var: false,
    },
  };
}

/**
 * A profile must not turn a Goals run into full access. The worktree-scoped
 * unattended profile applies only to execute runs whose workspace passed the
 * ownership check in `resolveGoalRunIsolation`; providers without a tailored
 * profile keep their conservative defaults and fail closed.
 */
export function goalRunProviderOptions(
  provider: string,
  modeId: string | undefined,
  kind: "plan" | "execute",
  context?: GoalRunIsolationContext,
): ProviderOptions | undefined {
  const worktreePath =
    kind === "execute" && context?.isolation === "worktree" ? context.worktreePath : null;
  if (provider === "codex") {
    if (modeId !== "auto") return undefined;
    return worktreePath
      ? codexWorktreeGoalRunOptions(worktreePath)
      : codexStrictGoalRunOptions(kind);
  }
  if (provider === "claude") {
    return worktreePath ? buildClaudeGoalUnattendedOptions() : undefined;
  }
  return undefined;
}

/** Goals never grant provider-wide bypass authority. Unknown providers fail closed. */
export function resolveGoalRunModeId(modes: readonly AgentMode[]): string {
  for (const id of ["auto", "acceptEdits", "default"]) {
    if (modes.some((mode) => mode.id === id)) return id;
  }
  throw new Error("This provider has no supported permission-preserving Goals mode");
}
