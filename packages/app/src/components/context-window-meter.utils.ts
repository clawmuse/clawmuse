import type { AgentTokenSpeed } from "@getpaseo/protocol/agent-types";

export function formatContextPercentage(value: number, locale?: string): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

export function formatTokenCount(value: number): string {
  if (value >= 1_000_000) {
    return `${Math.round(value / 1_000_000)}m`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 1_000)}k`;
  }
  return Math.round(value).toString();
}

/**
 * Tokens per second for display. Rounding follows Cindy's `formatOutputTokenRateValue`
 * (Apache-2.0): whole numbers from 100 up, one decimal below, "<0.1" for a trickle.
 */
export function formatTokenRate(rate: number): string | null {
  if (!Number.isFinite(rate) || rate < 0) return null;
  if (rate === 0) return "0";
  if (rate < 0.1) return "<0.1";
  return rate >= 100 ? rate.toFixed(0) : rate.toFixed(1).replace(/\.0$/, "");
}

/** The live reading while the turn streams; null once it ended or before the first second. */
export function formatLiveTokenRate(speed: AgentTokenSpeed | null | undefined): string | null {
  if (!speed?.streaming || speed.rate <= 0) return null;
  return formatTokenRate(speed.rate);
}

export function formatElapsedSeconds(elapsedMs: number): string {
  const seconds = elapsedMs / 1000;
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(Math.round(seconds) / 60);
  if (minutes < 60) return `${minutes}m${String(Math.round(seconds) % 60).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}m`;
}

/** One decimal from a thousand up, like Cindy's `formatRunningTokenCount`. */
export function formatOutputTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${Math.round(tokens)}`;
}

export interface TokenSpeedFigures {
  /** The live reading, while the turn streams. */
  current: string | null;
  turnAverage: string | null;
  peak: string | null;
  low: string | null;
  turnTokens: string;
  turnElapsed: string;
  sessionAverage: string | null;
  sessionTokens: string | null;
  sessionElapsed: string | null;
}

/**
 * Everything the speed popover shows, formatted. The session totals cover completed turns, so a
 * streaming turn is added on top to keep the session average current.
 */
export function buildTokenSpeedFigures(speed: AgentTokenSpeed): TokenSpeedFigures {
  const pendingTokens = speed.streaming ? speed.tokens : 0;
  const pendingElapsedMs = speed.streaming ? speed.elapsedMs : 0;
  const hasSession = speed.sessionTokens !== undefined && speed.sessionElapsedMs !== undefined;
  const sessionTokens = (speed.sessionTokens ?? 0) + pendingTokens;
  const sessionElapsedMs = (speed.sessionElapsedMs ?? 0) + pendingElapsedMs;
  const hasSessionFigures = hasSession && sessionTokens > 0 && sessionElapsedMs > 0;
  return {
    current: formatLiveTokenRate(speed),
    turnAverage: speed.average > 0 ? formatTokenRate(speed.average) : null,
    peak: speed.peak !== undefined ? formatTokenRate(speed.peak) : null,
    low: speed.low !== undefined ? formatTokenRate(speed.low) : null,
    turnTokens: formatOutputTokenCount(speed.tokens),
    turnElapsed: formatElapsedSeconds(speed.elapsedMs),
    sessionAverage: hasSessionFigures
      ? formatTokenRate((sessionTokens * 1000) / sessionElapsedMs)
      : null,
    sessionTokens: hasSessionFigures ? formatOutputTokenCount(sessionTokens) : null,
    sessionElapsed: hasSessionFigures ? formatElapsedSeconds(sessionElapsedMs) : null,
  };
}
