import { describe, expect, it } from "vitest";
import { goalRunProviderOptions, resolveGoalRunModeId } from "./goal-modes.js";
import { mergeProviderOptions } from "../agent/provider-options.js";

describe("resolveGoalRunModeId", () => {
  it("overrides permissive Codex profiles and keeps planners read-only", () => {
    const inherited = {
      approval_policy: "never",
      sandbox_mode: "danger-full-access",
      sandbox_workspace_write: { writable_roots: ["/home"], network_access: true },
    };
    expect(
      mergeProviderOptions(inherited, goalRunProviderOptions("auto", "execute")),
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
    expect(goalRunProviderOptions("auto", "plan")?.sandbox_mode).toBe("read-only");
    expect(goalRunProviderOptions("acceptEdits", "execute")).toBeUndefined();
  });
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
