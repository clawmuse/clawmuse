import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { AgentStreamEvent } from "./agent-sdk-types.js";
import { providerMeasuresOwnTokenSpeed, StreamTokenSpeedEstimator } from "./stream-token-speed.js";

const PROVIDER = "opencode";

function text(value: string): AgentStreamEvent {
  return { type: "timeline", provider: PROVIDER, item: { type: "assistant_message", text: value } };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
});

test("estimates speed from streamed text and excludes tool time", () => {
  const estimator = new StreamTokenSpeedEstimator();
  estimator.observe({ type: "turn_started", provider: PROVIDER });
  vi.setSystemTime(1_000);
  estimator.observe(text("a b c d e f g h i j"));
  vi.setSystemTime(2_000);
  estimator.observe({
    type: "timeline",
    provider: PROVIDER,
    item: { type: "reasoning", text: "k l m n o p q r s t" },
  });
  estimator.observe({
    type: "timeline",
    provider: PROVIDER,
    item: {
      type: "tool_call",
      callId: "c1",
      name: "shell",
      status: "running",
      detail: { type: "unknown", input: null, output: null },
      error: null,
    },
  });
  vi.setSystemTime(12_000);
  estimator.observe(text("u v w x y z 1 2 3 4"));
  vi.setSystemTime(13_000);
  estimator.observe({ type: "turn_completed", provider: PROVIDER });

  // The clock starts at the first text: 30 estimated tokens over 1s before the tool and 1s after.
  expect(estimator.snapshot()).toEqual({
    rate: 15,
    average: 15,
    tokens: 30,
    elapsedMs: 2_000,
    streaming: false,
  });
});

test("starts over on the first text after a turn without a turn start", () => {
  const estimator = new StreamTokenSpeedEstimator();
  estimator.observe(text("a b c d e"));
  vi.setSystemTime(1_000);
  estimator.observe({ type: "turn_completed", provider: PROVIDER });
  vi.setSystemTime(5_000);
  estimator.observe(text("x y"));

  expect(estimator.snapshot()).toMatchObject({ tokens: 2, streaming: true });
});

test("Claude, Codex and Antigravity measure their own speed", () => {
  expect(providerMeasuresOwnTokenSpeed("claude")).toBe(true);
  expect(providerMeasuresOwnTokenSpeed("codex")).toBe(true);
  expect(providerMeasuresOwnTokenSpeed("antigravity")).toBe(true);
  expect(providerMeasuresOwnTokenSpeed("opencode")).toBe(false);
});
