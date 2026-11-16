import { describe, expect, it } from "vitest";
import {
  findExistingGoalByExternalSource,
  hasPathScopeOverlap,
  normalizePathScopes,
  pathScopePrompt,
} from "./scheduler-guard.js";

describe("scheduler guard", () => {
  it("finds an external source record regardless of whether it is active or closed", () => {
    const closed = {
      id: "discarded",
      repoKey: "remote:github.com/acme/app",
      source: { kind: "bianpai-idea", key: "idea-42", url: "https://bianpai.example/42" },
    };
    const found = findExistingGoalByExternalSource(
      [closed, { id: "other", repoKey: "remote:github.com/acme/app" }],
      "remote:github.com/acme/app",
      { kind: "bianpai-idea", key: "idea-42" },
    );

    expect(found).toBe(closed);
    expect(
      findExistingGoalByExternalSource([closed], closed.repoKey, {
        kind: "bianpai-idea",
        key: null,
      }),
    ).toBeUndefined();
  });

  it("allows disjoint declared directories but serializes undeclared and overlapping scopes", () => {
    expect(hasPathScopeOverlap(["packages/server"], [["packages/app"]])).toBe(false);
    expect(hasPathScopeOverlap(["packages/server/goals"], [["packages/server"]])).toBe(true);
    expect(hasPathScopeOverlap(["packages/*/src"], [["packages/server/src"]])).toBe(true);
    expect(hasPathScopeOverlap(undefined, [["packages/server"]])).toBe(true);
    expect(hasPathScopeOverlap(["packages/server"], [undefined])).toBe(true);
    expect(hasPathScopeOverlap(undefined, [])).toBe(false);
  });

  it("normalizes persisted path scopes and turns them into an executor boundary", () => {
    expect(normalizePathScopes([" ./packages/server/ ", "packages\\server", "../unsafe"])).toEqual([
      "packages/server",
    ]);
    expect(pathScopePrompt(["packages/server", "docs/goals.md"])).toContain(
      "packages/server、docs/goals.md",
    );
  });
});
