import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatLocalDayKey,
  formatUsageModelShort,
  LocalDailyUsageCollector,
} from "./local-daily-usage.js";

describe("local-daily-usage", () => {
  it("formats Claude and GPT model wire ids into compact widget labels", () => {
    expect(formatUsageModelShort("claude-opus-4-8[1m]")).toBe("Opus 4.8");
    expect(formatUsageModelShort("claude-haiku-4-5-20251001")).toBe("Haiku 4.5");
    expect(formatUsageModelShort("openai-codex/gpt-6-astra")).toBe("GPT-6-ASTRA");
    expect(formatUsageModelShort("codex/gpt-5.4")).toBe("GPT-5.4");
  });

  it("aggregates 30-day Claude and Codex JSONL session logs with deduplication and incremental deltas", async () => {
    const tmpHome = await mkdtemp(path.join(os.tmpdir(), "clawmuse-daily-usage-"));
    try {
      const nowMs = Date.parse("2026-11-08T12:00:00Z");
      const todayIso = new Date(nowMs - 3600_000).toISOString();
      const todayKey = formatLocalDayKey(nowMs - 3600_000);

      const claudeDir = path.join(tmpHome, ".claude", "projects", "test-proj");
      await mkdir(claudeDir, { recursive: true });
      await writeFile(
        path.join(claudeDir, "s1.jsonl"),
        [
          JSON.stringify({
            timestamp: todayIso,
            requestId: "req_1",
            message: {
              id: "msg_1",
              model: "claude-opus-4-8[1m]",
              usage: {
                input_tokens: 1000,
                cache_creation_input_tokens: 2000,
                cache_read_input_tokens: 3000,
                output_tokens: 100,
              },
            },
          }),
          // Streaming update for the same message.id should replace, not double-count
          JSON.stringify({
            timestamp: todayIso,
            requestId: "req_1",
            message: {
              id: "msg_1",
              model: "claude-opus-4-8[1m]",
              usage: {
                input_tokens: 1000,
                cache_creation_input_tokens: 2000,
                cache_read_input_tokens: 3000,
                output_tokens: 500,
              },
            },
          }),
        ].join("\n"),
        "utf8",
      );

      const codexDir = path.join(tmpHome, ".codex", "sessions", "2026", "11", "08");
      await mkdir(codexDir, { recursive: true });
      await writeFile(
        path.join(codexDir, "rollout-1.jsonl"),
        [
          JSON.stringify({
            timestamp: todayIso,
            type: "turn_context",
            payload: { model: "gpt-6-astra" },
          }),
          JSON.stringify({
            timestamp: todayIso,
            type: "event_msg",
            payload: {
              type: "token_count",
              info: { total_token_usage: { total_tokens: 40_000 } },
            },
          }),
          JSON.stringify({
            timestamp: todayIso,
            type: "event_msg",
            payload: {
              type: "token_count",
              info: { total_token_usage: { total_tokens: 95_000 } },
            },
          }),
        ].join("\n"),
        "utf8",
      );

      const collector = new LocalDailyUsageCollector({
        homeDir: tmpHome,
        now: () => nowMs,
      });
      const history = await collector.collect(true);

      expect(history.days).toHaveLength(30);
      const todayIdx = history.days.indexOf(todayKey);
      expect(todayIdx).toBe(29);
      expect(history.daily[todayIdx]?.tokens).toEqual([6500, 95_000, 0]);
      expect(history.models).toEqual([
        { name: "GPT-6-ASTRA", harness: "codex" },
        { name: "Opus 4.8", harness: "claude-code" },
      ]);
      // modelTokens has length models.length + 1 (top models + "other")
      expect(history.daily[todayIdx]?.modelTokens).toEqual([95_000, 6500, 0]);
    } finally {
      await rm(tmpHome, { recursive: true, force: true });
    }
  });
});

it("keeps archived sessions, repeated counters, day boundaries and explicit zero costs", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "clawmuse-history-"));
  const now = new Date(2026, 10, 9, 12).getTime();
  const yesterday = new Date(2026, 10, 8, 12).toISOString();
  const today = new Date(now).toISOString();
  const event = (timestamp: string, total: number) =>
    JSON.stringify({
      timestamp,
      type: "event_msg",
      payload: { type: "token_count", info: { total_token_usage: { total_tokens: total } } },
    });
  try {
    const archived = path.join(home, ".codex", "archived_sessions");
    await mkdir(archived, { recursive: true });
    await writeFile(
      path.join(archived, "session.jsonl"),
      [
        event(yesterday, 100),
        event(yesterday, 100),
        "not-json",
        event(today, 180),
        event(today, 180),
      ].join("\n"),
    );
    const pi = path.join(home, ".pi", "agent", "sessions");
    await mkdir(pi, { recursive: true });
    const piLog = path.join(pi, "pi.jsonl");
    await writeFile(
      piLog,
      JSON.stringify({
        timestamp: yesterday,
        message: { model: "pi-model", usage: { totalTokens: 50, cost: { total: 0 } } },
      }),
    );
    const collector = new LocalDailyUsageCollector({ homeDir: home, now: () => now });
    const history = await collector.collect(true);
    expect(history.daily[28]?.tokens).toEqual([0, 100, 50]);
    expect(history.daily[29]?.tokens).toEqual([0, 80, 0]);
    expect(history.daily[28]?.costAvailable).toBe(false);
    expect(history.daily[29]?.costAvailable).toBe(false);
    expect(history.daily[0]?.costAvailable).toBe(false);
    await rm(path.join(archived, "session.jsonl"));
    const zeroCost = await collector.collect(true);
    expect(zeroCost.daily[28]?.costAvailable).toBe(true);
    expect(zeroCost.daily[28]?.money).toEqual([0, 0, 0]);
    await writeFile(
      piLog,
      JSON.stringify({
        timestamp: today,
        message: { model: "pi-model", usage: { totalTokens: 100, cost: { total: 0.75 } } },
      }),
    );
    const refreshed = await collector.collect(true);
    expect(refreshed.daily[29]?.tokens).toEqual([0, 0, 100]);
    expect(refreshed.daily[29]?.money).toEqual([0, 0, 0.75]);
    expect(refreshed.daily[29]?.costAvailable).toBe(true);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

it("reports unreadable history instead of returning a successful all-zero reading", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "clawmuse-history-error-"));
  try {
    await mkdir(path.join(home, ".codex"));
    await writeFile(path.join(home, ".codex", "sessions"), "not a directory");
    const collector = new LocalDailyUsageCollector({ homeDir: home });
    await expect(collector.collect(true)).rejects.toMatchObject({ code: "ENOTDIR" });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
