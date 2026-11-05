import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadPersistedConfig } from "../persisted-config.js";
import {
  clearClawMuseStatusRelationship,
  readClawMuseStatusRelationship,
  saveClawMuseStatusRelationship,
} from "./config.js";
import {
  formatClawMuseGoalsProviderTarget,
  parseClawMuseGoalsProviderTarget,
  readClawMuseGoalsSettings,
  saveClawMuseGoalsSettings,
} from "./goals-config.js";

let paseoHome: string;

beforeEach(() => {
  paseoHome = mkdtempSync(path.join(tmpdir(), "clawmuse-goals-config-"));
});

afterEach(() => {
  rmSync(paseoHome, { recursive: true, force: true });
});

describe("provider targets", () => {
  it("round-trips `provider` and `provider/model`", () => {
    expect(parseClawMuseGoalsProviderTarget("claude")).toEqual({ provider: "claude", model: null });
    expect(parseClawMuseGoalsProviderTarget(" zai/glm-4.6 ")).toEqual({
      provider: "zai",
      model: "glm-4.6",
    });
    expect(formatClawMuseGoalsProviderTarget({ provider: "zai", model: "glm-4.6" })).toBe(
      "zai/glm-4.6",
    );
    expect(formatClawMuseGoalsProviderTarget({ provider: "claude", model: null })).toBe("claude");
  });

  it("rejects empty halves", () => {
    expect(() => parseClawMuseGoalsProviderTarget("")).toThrow(/provider is required/);
    expect(() => parseClawMuseGoalsProviderTarget("claude/")).toThrow(/Invalid provider target/);
    expect(() => parseClawMuseGoalsProviderTarget("/haiku")).toThrow(/Invalid provider target/);
  });
});

describe("goal settings", () => {
  it("is off by default with Claude for both roles and worktree isolation", () => {
    expect(readClawMuseGoalsSettings(paseoHome)).toEqual({
      enabled: false,
      planner: { provider: "claude", model: null },
      executor: { provider: "claude", model: null },
      isolation: "worktree",
      maxConcurrentRuns: 1,
    });
  });

  it("saves a patch before any status relationship exists and keeps the config loadable", () => {
    const saved = saveClawMuseGoalsSettings(paseoHome, {
      enabled: true,
      planner: "zai/glm-4.6",
      maxConcurrentRuns: 2,
    });
    expect(saved).toMatchObject({
      enabled: true,
      planner: { provider: "zai", model: "glm-4.6" },
      executor: { provider: "claude", model: null },
      maxConcurrentRuns: 2,
    });
    expect(loadPersistedConfig(paseoHome).clawmuseStatus).toEqual({
      goals: { enabled: true, planner: "zai/glm-4.6", maxConcurrentRuns: 2 },
    });
    expect(readClawMuseStatusRelationship(paseoHome, {})).toBeNull();
  });

  it("survives connect and disconnect of the status relationship", () => {
    saveClawMuseGoalsSettings(paseoHome, { executor: "claude/opus", isolation: "local" });
    saveClawMuseStatusRelationship(paseoHome, {
      url: "https://status.example",
      displayName: "box",
    });
    expect(readClawMuseStatusRelationship(paseoHome, {})).toEqual({
      baseUrl: "https://status.example",
      displayName: "box",
    });
    expect(readClawMuseGoalsSettings(paseoHome)).toMatchObject({
      executor: { provider: "claude", model: "opus" },
      isolation: "local",
    });
    clearClawMuseStatusRelationship(paseoHome);
    expect(readClawMuseStatusRelationship(paseoHome, {})).toBeNull();
    expect(readClawMuseGoalsSettings(paseoHome)).toMatchObject({
      executor: { provider: "claude", model: "opus" },
    });
  });

  it("validates patches before writing", () => {
    expect(() => saveClawMuseGoalsSettings(paseoHome, { planner: "bad/" })).toThrow(
      /Invalid provider target/,
    );
    expect(() => saveClawMuseGoalsSettings(paseoHome, { maxConcurrentRuns: 0 })).toThrow(
      /maxConcurrentRuns/,
    );
    expect(() => saveClawMuseGoalsSettings(paseoHome, { maxConcurrentRuns: 9 })).toThrow(
      /maxConcurrentRuns/,
    );
    expect(loadPersistedConfig(paseoHome).clawmuseStatus).toBeUndefined();
  });
});
