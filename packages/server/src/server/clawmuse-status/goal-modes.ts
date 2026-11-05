import type { AgentMode } from "../agent/agent-sdk-types.js";
import type { CodexProviderOptions } from "../agent/providers/codex/options.js";

/** A profile must not turn an explicitly sandboxed Goals run into full access. */
export function goalRunProviderOptions(
  modeId: string,
  kind: "plan" | "execute",
): CodexProviderOptions | undefined {
  if (modeId !== "auto") return undefined;
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

/** Goals never grant provider-wide bypass authority. Unknown providers fail closed. */
export function resolveGoalRunModeId(modes: readonly AgentMode[]): string {
  for (const id of ["auto", "acceptEdits", "default"]) {
    if (modes.some((mode) => mode.id === id)) return id;
  }
  throw new Error("This provider has no supported permission-preserving Goals mode");
}
