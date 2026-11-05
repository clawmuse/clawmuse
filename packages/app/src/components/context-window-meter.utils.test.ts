import { describe, expect, it } from "vitest";
import {
  buildTokenSpeedFigures,
  formatContextPercentage,
  formatElapsedSeconds,
  formatLiveTokenRate,
  formatOutputTokenCount,
  formatTokenRate,
} from "./context-window-meter.utils";

describe("formatTokenRate", () => {
  it("rounds like Cindy: whole from 100, one decimal below, a floor for trickles", () => {
    expect(formatTokenRate(142.6)).toBe("143");
    expect(formatTokenRate(57.04)).toBe("57");
    expect(formatTokenRate(8.26)).toBe("8.3");
    expect(formatTokenRate(0.05)).toBe("<0.1");
    expect(formatTokenRate(0)).toBe("0");
    expect(formatTokenRate(Number.NaN)).toBeNull();
  });
});

describe("formatLiveTokenRate", () => {
  const speed = { rate: 64, average: 50, tokens: 500, elapsedMs: 10_000, streaming: true };

  it("shows the last second's rate only while the turn streams", () => {
    expect(formatLiveTokenRate(speed)).toBe("64");
    expect(formatLiveTokenRate({ ...speed, streaming: false })).toBeNull();
    expect(formatLiveTokenRate({ ...speed, rate: 0 })).toBeNull();
    expect(formatLiveTokenRate(null)).toBeNull();
  });
});

describe("formatElapsedSeconds", () => {
  it("keeps a decimal under ten seconds", () => {
    expect(formatElapsedSeconds(2_340)).toBe("2.3s");
    expect(formatElapsedSeconds(42_600)).toBe("43s");
    expect(formatElapsedSeconds(220_000)).toBe("3m40s");
    expect(formatElapsedSeconds(3_900_000)).toBe("1h05m");
  });
});

describe("formatOutputTokenCount", () => {
  it("keeps one decimal from a thousand up", () => {
    expect(formatOutputTokenCount(950)).toBe("950");
    expect(formatOutputTokenCount(1_460)).toBe("1.5k");
    expect(formatOutputTokenCount(12_000)).toBe("12k");
  });
});

describe("buildTokenSpeedFigures", () => {
  it("adds a streaming turn on top of the completed turns for the session average", () => {
    const figures = buildTokenSpeedFigures({
      rate: 90,
      average: 50,
      tokens: 500,
      elapsedMs: 10_000,
      streaming: true,
      peak: 120,
      low: 20,
      sessionTokens: 1_500,
      sessionElapsedMs: 30_000,
    });
    expect(figures).toEqual({
      current: "90",
      turnAverage: "50",
      peak: "120",
      low: "20",
      turnTokens: "500",
      turnElapsed: "10s",
      sessionAverage: "50",
      sessionTokens: "2k",
      sessionElapsed: "40s",
    });
  });

  it("leaves out what an older daemon does not report", () => {
    const figures = buildTokenSpeedFigures({
      rate: 40,
      average: 40,
      tokens: 400,
      elapsedMs: 10_000,
      streaming: false,
    });
    expect(figures).toMatchObject({ current: null, peak: null, low: null, sessionAverage: null });
  });
});

describe("context window meter formatting", () => {
  it("localizes percentages without hiding context overflow", () => {
    expect(formatContextPercentage(125, "en")).toBe("125%");
    expect(formatContextPercentage(42, "fr")).toBe("42\u00a0%");
  });
});
