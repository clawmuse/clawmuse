import { expect, test } from "vitest";
import type { AgentTokenSpeed } from "./agent-sdk-types.js";
import { TokenSpeedStats } from "./token-speed-stats.js";

function live(rate: number, tokens: number, elapsedMs: number): AgentTokenSpeed {
  return { rate, average: (tokens * 1000) / elapsedMs, tokens, elapsedMs, streaming: true };
}

function done(tokens: number, elapsedMs: number): AgentTokenSpeed {
  const average = (tokens * 1000) / elapsedMs;
  return { rate: average, average, tokens, elapsedMs, streaming: false };
}

test("tracks the turn's peak and low and adds finished turns to the session", () => {
  const stats = new TokenSpeedStats();
  stats.beginTurn();
  stats.decorate(live(80, 80, 1_000));
  stats.decorate(live(140, 220, 2_000));
  stats.decorate(live(0, 220, 2_500));
  expect(stats.decorate(live(60, 280, 3_000))).toMatchObject({ peak: 140, low: 60 });

  expect(stats.decorate(done(300, 4_000))).toMatchObject({
    peak: 140,
    low: 60,
    sessionTokens: 300,
    sessionElapsedMs: 4_000,
  });
  // The same final reading again, e.g. turn_completed after a usage refresh, is not counted twice.
  expect(stats.decorate(done(300, 4_000))).toMatchObject({ sessionTokens: 300 });

  stats.beginTurn();
  const next = stats.decorate(live(50, 50, 1_000));
  expect(next).toMatchObject({ peak: 50, low: 50, sessionTokens: 300 });
  expect(stats.decorate(done(100, 2_000))).toMatchObject({
    sessionTokens: 400,
    sessionElapsedMs: 6_000,
  });
});

test("a live reading after a finished turn starts a new turn without turn_started", () => {
  const stats = new TokenSpeedStats();
  stats.decorate(live(200, 200, 1_000));
  stats.decorate(done(200, 1_000));

  expect(stats.decorate(live(30, 30, 1_000))).toMatchObject({ peak: 30, low: 30 });
});

test("seeds the session from a persisted reading without recounting its turn", () => {
  const stats = new TokenSpeedStats({
    ...done(500, 10_000),
    sessionTokens: 500,
    sessionElapsedMs: 10_000,
  });

  expect(stats.decorate(done(500, 10_000))).toMatchObject({ sessionTokens: 500 });
  stats.decorate(live(40, 40, 1_000));
  expect(stats.decorate(done(100, 2_000))).toMatchObject({
    sessionTokens: 600,
    sessionElapsedMs: 12_000,
  });
});
