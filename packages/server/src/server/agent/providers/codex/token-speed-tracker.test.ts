import { afterEach, expect, test, vi } from "vitest";
import { CodexTokenSpeedTracker } from "./token-speed-tracker.js";

afterEach(() => {
  vi.useRealTimers();
});

test("pairs turn output with model time, leaving tool runs out", () => {
  const tracker = new CodexTokenSpeedTracker();
  tracker.recordUsage({ totalOutputTokens: 1_000, lastOutputTokens: 100 }, 0);
  tracker.beginTurn(10_000);
  tracker.recordUsage({ totalOutputTokens: 1_200, lastOutputTokens: 200 }, 14_000);
  tracker.pauseForTool("cmd-1", 14_000);
  tracker.resumeFromTool("cmd-1", 30_000);
  tracker.recordUsage({ totalOutputTokens: 1_300, lastOutputTokens: 100 }, 32_000);
  tracker.completeTurn(32_000);

  // 300 output tokens this turn over 4s + 2s of generation; the 16s tool run is excluded.
  expect(tracker.snapshot()).toEqual({
    rate: 50,
    average: 50,
    tokens: 300,
    elapsedMs: 6_000,
    streaming: false,
  });
});

test("the first report after a resume subtracts the thread's history", () => {
  const tracker = new CodexTokenSpeedTracker();
  tracker.beginTurn(0);
  tracker.recordUsage({ totalOutputTokens: 50_000, lastOutputTokens: 120 }, 2_000);

  expect(tracker.snapshot()).toMatchObject({ tokens: 120, elapsedMs: 2_000, rate: 60 });
});

test("ignores subagent-free input-only and duplicate reports", () => {
  const tracker = new CodexTokenSpeedTracker();
  tracker.recordUsage({ totalOutputTokens: 0, lastOutputTokens: 0 }, 0);
  tracker.beginTurn(0);
  tracker.recordUsage({ totalOutputTokens: 100, lastOutputTokens: 100 }, 2_000);
  tracker.recordUsage({ totalOutputTokens: 100, lastOutputTokens: 100 }, 9_000);

  expect(tracker.snapshot()).toMatchObject({ tokens: 100, elapsedMs: 2_000 });
});

test("a tool still pending at turn end withdraws the speed", () => {
  const tracker = new CodexTokenSpeedTracker();
  tracker.recordUsage({ totalOutputTokens: 0, lastOutputTokens: 0 }, 0);
  tracker.beginTurn(0);
  tracker.recordUsage({ totalOutputTokens: 100, lastOutputTokens: 100 }, 2_000);
  tracker.pauseForTool("cmd-1", 2_000);
  tracker.completeTurn(5_000);

  expect(tracker.snapshot()).toBeUndefined();
});

test("a delayed usage report cannot move the next turn's output baseline backwards", () => {
  const tracker = new CodexTokenSpeedTracker();
  tracker.recordUsage({ totalOutputTokens: 1_000, lastOutputTokens: 100 }, 0);
  tracker.beginTurn(0);
  tracker.recordUsage({ totalOutputTokens: 1_200, lastOutputTokens: 200 }, 2_000);
  tracker.recordUsage({ totalOutputTokens: 1_100, lastOutputTokens: 100 }, 3_000);
  tracker.completeTurn(3_000);

  expect(tracker.snapshot()).toMatchObject({ tokens: 200, elapsedMs: 2_000, average: 100 });
  tracker.beginTurn(4_000);
  tracker.recordUsage({ totalOutputTokens: 1_300, lastOutputTokens: 100 }, 6_000);
  tracker.completeTurn(6_000);
  expect(tracker.snapshot()).toMatchObject({ tokens: 100, elapsedMs: 2_000, average: 50 });
});

test("tool completion without a start withdraws a measurement instead of counting the wait", () => {
  const tracker = new CodexTokenSpeedTracker();
  tracker.beginTurn(0);
  tracker.recordUsage({ totalOutputTokens: 100, lastOutputTokens: 100 }, 2_000);
  tracker.observeItem("completed", "contextCompaction", "compact-1", 20_000);
  tracker.recordUsage({ totalOutputTokens: 200, lastOutputTokens: 100 }, 22_000);
  tracker.completeTurn(22_000);

  expect(tracker.snapshot()).toBeUndefined();
});

test("counts accepted response output instead of attributing a thread-total gap to this turn", () => {
  const tracker = new CodexTokenSpeedTracker();
  tracker.recordUsage({ totalOutputTokens: 1_000, lastOutputTokens: 100 }, 0);
  tracker.beginTurn(0);
  // The thread total includes an older response not observed before this turn started.
  tracker.recordUsage({ totalOutputTokens: 1_300, lastOutputTokens: 100 }, 2_000);
  tracker.completeTurn(2_000);

  expect(tracker.snapshot()).toMatchObject({ tokens: 100, elapsedMs: 2_000, average: 50 });
});

test("excludes overlapping tool runs and tolerates duplicate lifecycle channels", () => {
  const tracker = new CodexTokenSpeedTracker();
  tracker.beginTurn(0);
  tracker.recordUsage({ totalOutputTokens: 100, lastOutputTokens: 100 }, 2_000);
  tracker.observeItem("started", "commandExecution", "cmd-1", 2_000);
  tracker.observeItem("started", "commandExecution", "cmd-1", 2_000);
  tracker.observeItem("started", "mcpToolCall", "mcp-1", 3_000);
  tracker.observeItem("completed", "commandExecution", "cmd-1", 10_000);
  tracker.observeItem("completed", "commandExecution", "cmd-1", 10_000);
  tracker.observeItem("completed", "mcpToolCall", "mcp-1", 12_000);
  tracker.recordUsage({ totalOutputTokens: 200, lastOutputTokens: 100 }, 14_000);
  tracker.completeTurn(14_000);

  expect(tracker.snapshot()).toEqual({
    tokens: 200,
    elapsedMs: 4_000,
    rate: 50,
    average: 50,
    streaming: false,
  });
});

test("completion-only file changes are output notifications rather than tool pauses", () => {
  const tracker = new CodexTokenSpeedTracker();
  tracker.beginTurn(0);
  tracker.observeItem("completed", "fileChange", "patch-1", 1_000);
  tracker.recordUsage({ totalOutputTokens: 100, lastOutputTokens: 100 }, 2_000);
  tracker.completeTurn(2_000);

  expect(tracker.snapshot()).toMatchObject({ tokens: 100, elapsedMs: 2_000, average: 50 });
});

test("a backwards clock invalidates timing even if generation resumes later", () => {
  const tracker = new CodexTokenSpeedTracker();
  tracker.beginTurn(10_000);
  tracker.pauseForTool("cmd-1", 9_000);
  tracker.resumeFromTool("cmd-1", 12_000);
  tracker.recordUsage({ totalOutputTokens: 100, lastOutputTokens: 100 }, 14_000);
  tracker.completeTurn(14_000);

  expect(tracker.snapshot()).toBeUndefined();
});
