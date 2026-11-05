import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginPromptRecommendationPrediction,
  clearPromptRecommendationSession,
  dismissPromptRecommendation,
  notePromptRecommendationCompletion,
  resolvePromptRecommendationPrediction,
  getPromptRecommendationGeneration,
  restorePromptRecommendation,
} from "./store";

afterEach(() => {
  clearPromptRecommendationSession("test");
  vi.useRealTimers();
});

describe("Cindy recommendation lifecycle", () => {
  it("starts once and rejects a result after dismissal", () => {
    vi.useFakeTimers();
    notePromptRecommendationCompletion("test", "turn-1");
    vi.advanceTimersByTime(500);
    const seq = beginPromptRecommendationPrediction("test", "turn-1");
    expect(seq).not.toBeNull();
    expect(beginPromptRecommendationPrediction("test", "turn-1")).toBeNull();
    dismissPromptRecommendation("test", "turn-1");
    resolvePromptRecommendationPrediction("test", "turn-1", seq!, "stale");
    expect(beginPromptRecommendationPrediction("test", "turn-1")).toBeNull();
  });

  it("cancels the completion settle when a new turn begins", () => {
    vi.useFakeTimers();
    notePromptRecommendationCompletion("test", "turn-1");
    clearPromptRecommendationSession("test");
    vi.advanceTimersByTime(500);
    expect(beginPromptRecommendationPrediction("test", "turn-1")).toBeNull();
  });

  it("discards cache replies from before a new turn and cancels pending completions on dismissal", () => {
    vi.useFakeTimers();
    const generation = getPromptRecommendationGeneration("test");
    clearPromptRecommendationSession("test");
    restorePromptRecommendation("test", "turn-1", "stale", generation);
    notePromptRecommendationCompletion("test", "turn-2");
    dismissPromptRecommendation("test");
    vi.advanceTimersByTime(500);
    expect(beginPromptRecommendationPrediction("test", "turn-2")).toBeNull();
  });
});
