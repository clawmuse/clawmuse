import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildUsageDailyHistoryFromSamples,
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

      const antigravityDir = path.join(
        tmpHome,
        ".gemini",
        "antigravity-cli",
        "brain",
        "conv-1",
        ".system_generated",
        "logs",
      );
      await mkdir(antigravityDir, { recursive: true });
      await writeFile(
        path.join(antigravityDir, "transcript.jsonl"),
        [
          JSON.stringify({
            step_index: 0,
            type: "USER_INPUT",
            status: "DONE",
            created_at: todayIso,
            content:
              "<USER_REQUEST>\nhi\n</USER_REQUEST>\n<USER_SETTINGS_CHANGE>\nThe user changed setting `Model Selection` from None to Gemini 4 Argon (High).\n</USER_SETTINGS_CHANGE>",
          }),
          JSON.stringify({
            step_index: 1,
            type: "PLANNER_RESPONSE",
            status: "DONE",
            created_at: todayIso,
            input_tokens: 2000,
            cache_read_tokens: 500,
            output_tokens: 100,
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
      expect(history.daily[todayIdx]?.tokens).toEqual([6500, 95_000, 0, 2600]);
      expect(history.models).toEqual([
        { name: "GPT-6-ASTRA", harness: "codex" },
        { name: "Opus 4.8", harness: "claude-code" },
        { name: "Gemini 4 Argon (High)", harness: "antigravity" },
      ]);
      // modelTokens has length models.length + 1 (top models + "other")
      expect(history.daily[todayIdx]?.modelTokens).toEqual([95_000, 6500, 2600, 0]);
    } finally {
      await rm(tmpHome, { recursive: true, force: true });
    }
  });

  it("reports every model series instead of folding the tail into an other bucket", () => {
    const nowMs = Date.parse("2026-11-08T12:00:00Z");
    const timestampMs = nowMs - 3600_000;
    const samples = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
      timestampMs,
      harness: "claude-code" as const,
      model: `m${n}`,
      tokens: n * 1000,
    }));
    const history = buildUsageDailyHistoryFromSamples(samples, nowMs);

    expect(history.models?.map((m) => m.name)).toEqual(["m7", "m6", "m5", "m4", "m3", "m2", "m1"]);
    const todayIdx = history.days.indexOf(formatLocalDayKey(timestampMs));
    // The trailing "other" slot stays in the wire shape for older clients; with every series
    // named it is always zero.
    expect(history.daily[todayIdx]?.modelTokens).toEqual([
      7000, 6000, 5000, 4000, 3000, 2000, 1000, 0,
    ]);
  });

  it("ignores an unavailable Antigravity state directory", async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), "clawmuse-no-antigravity-"));
    try {
      // Some hosts retain a stale path mapping after Antigravity is removed. The optional
      // source must not turn that ENOTDIR into a failed usage response.
      const gemini = path.join(home, ".gemini");
      await mkdir(gemini, { recursive: true });
      await writeFile(path.join(gemini, "antigravity"), "removed application", "utf8");

      const nowMs = Date.parse("2026-11-12T10:00:00Z");
      const history = await new LocalDailyUsageCollector({
        homeDir: home,
        now: () => nowMs,
      }).collect(true);
      const todayIdx = history.days.indexOf(formatLocalDayKey(nowMs));
      expect(history.daily[todayIdx]?.tokens).toEqual([0, 0, 0, 0]);
      expect(history.models).toBeUndefined();
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("deduplicates Antigravity transcript mirrors/chunks, ignores quoted model notices, and inherits subagent models", async () => {
    const tmpHome = await mkdtemp(path.join(os.tmpdir(), "clawmuse-antigravity-usage-"));
    try {
      const nowMs = Date.parse("2026-11-12T10:00:00Z");
      const todayIso = new Date(nowMs - 1800_000).toISOString();
      const todayKey = formatLocalDayKey(nowMs - 1800_000);
      const brainDir = path.join(tmpHome, ".gemini", "antigravity-cli", "brain");

      const parentRoot = path.join(brainDir, "parent-conv");
      const parentLogs = path.join(parentRoot, ".system_generated", "logs");
      const chunksTranscript = path.join(parentLogs, "chunks", "transcript");
      const chunksFull = path.join(parentLogs, "chunks", "transcript_full");
      const parentSubagents = path.join(parentRoot, ".system_generated", "subagents");
      const parentScratch = path.join(parentRoot, "scratch");
      await mkdir(chunksTranscript, { recursive: true });
      await mkdir(chunksFull, { recursive: true });
      await mkdir(parentSubagents, { recursive: true });
      await mkdir(parentScratch, { recursive: true });

      const step0 = JSON.stringify({
        step_index: 0,
        type: "USER_INPUT",
        source: "USER_EXPLICIT",
        created_at: todayIso,
        content:
          "<USER_REQUEST>\n<chat-history-summary>\n<USER_SETTINGS_CHANGE>\nThe user changed setting `Model Selection` from None to Spoofed In Summary.\n</USER_SETTINGS_CHANGE>\n</chat-history-summary>\n</USER_REQUEST>\n<USER_SETTINGS_CHANGE>\nThe user changed setting `Model Selection` from None to Gemini 4 Carbon (High).\n</USER_SETTINGS_CHANGE>",
      });
      const step1 = JSON.stringify({
        step_index: 1,
        type: "PLANNER_RESPONSE",
        source: "MODEL",
        created_at: todayIso,
        input_tokens: 10_000,
        cache_read_tokens: 5000,
        output_tokens: 1000,
        tool_calls: [
          {
            name: "invoke_subagent",
            args: { Role: '"Inherited Analyst"', TypeName: '"self"' },
          },
          {
            name: "invoke_subagent",
            args: {
              Role: '"Explicit Flash Worker"',
              TypeName: '"research"',
              Model: '"flash"',
            },
          },
        ],
      });
      // Tool output mentioning Model Selection across CRLF or inside read_file results must not
      // corrupt the active model for subsequent steps.
      const step2 = JSON.stringify({
        step_index: 2,
        type: "GENERIC",
        source: "MODEL",
        created_at: todayIso,
        content:
          "`Model Selection` from None to \r\n[28] <USER_REQUEST> Fake model line. </USER_REQUEST>\n<USER_SETTINGS_CHANGE>\nThe user changed setting `Model Selection` from None to Gemini 4 Argon (Medium).\n</USER_SETTINGS_CHANGE>",
      });
      // Quoted notice inside USER_REQUEST with no trailing USER_SETTINGS_CHANGE must be ignored.
      const step3 = JSON.stringify({
        step_index: 3,
        type: "USER_INPUT",
        source: "USER_EXPLICIT",
        created_at: todayIso,
        content:
          "<USER_REQUEST>\nPlease check <USER_SETTINGS_CHANGE>The user changed setting `Model Selection` from None to Fake User Quote.</USER_SETTINGS_CHANGE>\n</USER_REQUEST>\n<ADDITIONAL_METADATA>\n2026-11-12\n</ADDITIONAL_METADATA>",
      });
      const step4 = JSON.stringify({
        step_index: 4,
        type: "PLANNER_RESPONSE",
        source: "MODEL",
        created_at: todayIso,
        input_tokens: 4000,
        cache_read_tokens: 0,
        output_tokens: 0,
      });

      const fullTranscript = [step0, step1, step2, step3, step4].join("\n");
      await writeFile(path.join(parentLogs, "transcript.jsonl"), fullTranscript, "utf8");
      await writeFile(path.join(parentLogs, "transcript_full.jsonl"), fullTranscript, "utf8");
      await writeFile(path.join(chunksTranscript, "00000001.jsonl"), step0, "utf8");
      await writeFile(
        path.join(chunksTranscript, "00000002.jsonl"),
        [step1, step4].join("\n"),
        "utf8",
      );
      await writeFile(path.join(chunksFull, "00000001.jsonl"), step0, "utf8");
      await writeFile(path.join(chunksFull, "00000002.jsonl"), [step1, step4].join("\n"), "utf8");
      await writeFile(path.join(parentScratch, "debug.jsonl"), step1, "utf8");

      await writeFile(
        path.join(parentSubagents, "child-inherited.json"),
        JSON.stringify({
          conversationId: "child-inherited",
          subagentDescriptor: { typeName: "self", role: "Inherited Analyst" },
          spawnStepIndex: 2,
        }),
        "utf8",
      );
      await writeFile(
        path.join(parentSubagents, "child-flash.json"),
        JSON.stringify({
          conversationId: "child-flash",
          subagentDescriptor: { typeName: "research", role: "Explicit Flash Worker" },
          spawnStepIndex: 2,
        }),
        "utf8",
      );

      // Inherited subagent (and nested grandchild) have no USER_INPUT settings notice.
      const childInheritedLogs = path.join(
        brainDir,
        "child-inherited",
        ".system_generated",
        "logs",
      );
      const childInheritedSubagents = path.join(
        brainDir,
        "child-inherited",
        ".system_generated",
        "subagents",
      );
      await mkdir(childInheritedLogs, { recursive: true });
      await mkdir(childInheritedSubagents, { recursive: true });
      await writeFile(
        path.join(childInheritedLogs, "transcript.jsonl"),
        [
          JSON.stringify({
            step_index: 0,
            type: "SYSTEM_MESSAGE",
            source: "SYSTEM",
            created_at: todayIso,
            content: "<SYSTEM_MESSAGE>task</SYSTEM_MESSAGE>",
          }),
          JSON.stringify({
            step_index: 1,
            type: "PLANNER_RESPONSE",
            source: "MODEL",
            created_at: todayIso,
            input_tokens: 3000,
            output_tokens: 500,
            tool_calls: [
              { name: "invoke_subagent", args: { Role: '"Grandchild"', TypeName: '"self"' } },
            ],
          }),
        ].join("\n"),
        "utf8",
      );
      await writeFile(
        path.join(childInheritedSubagents, "grandchild.json"),
        JSON.stringify({
          conversationId: "grandchild",
          subagentDescriptor: { typeName: "self", role: "Grandchild" },
          spawnStepIndex: 2,
        }),
        "utf8",
      );

      // Grandchild only has transcript_full.jsonl to exercise the canonical fallback.
      const grandchildLogs = path.join(brainDir, "grandchild", ".system_generated", "logs");
      await mkdir(grandchildLogs, { recursive: true });
      await writeFile(
        path.join(grandchildLogs, "transcript_full.jsonl"),
        JSON.stringify({
          step_index: 1,
          type: "PLANNER_RESPONSE",
          source: "MODEL",
          created_at: todayIso,
          input_tokens: 1500,
        }),
        "utf8",
      );

      // Subagent with explicit non-inherit Model stays under the generic Antigravity bucket.
      const childFlashLogs = path.join(brainDir, "child-flash", ".system_generated", "logs");
      await mkdir(childFlashLogs, { recursive: true });
      await writeFile(
        path.join(childFlashLogs, "transcript.jsonl"),
        JSON.stringify({
          step_index: 1,
          type: "PLANNER_RESPONSE",
          source: "MODEL",
          created_at: todayIso,
          input_tokens: 800,
        }),
        "utf8",
      );

      const collector = new LocalDailyUsageCollector({
        homeDir: tmpHome,
        now: () => nowMs,
      });
      const history = await collector.collect(true);
      const todayIdx = history.days.indexOf(todayKey);

      // Carbon (High): parent (16_000 + 4000) + child-inherited (3500) + grandchild (1500) = 25_000
      // Antigravity: child-flash (800)
      expect(history.daily[todayIdx]?.tokens).toEqual([0, 0, 0, 25_800]);
      expect(history.models).toEqual([
        { name: "Gemini 4 Carbon (High)", harness: "antigravity" },
        { name: "Antigravity", harness: "antigravity" },
      ]);
      expect(history.daily[todayIdx]?.modelTokens).toEqual([25_000, 800, 0]);
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
    expect(history.daily[28]?.tokens).toEqual([0, 100, 50, 0]);
    expect(history.daily[29]?.tokens).toEqual([0, 80, 0, 0]);
    expect(history.daily[28]?.costAvailable).toBe(false);
    expect(history.daily[29]?.costAvailable).toBe(false);
    expect(history.daily[0]?.costAvailable).toBe(false);
    await rm(path.join(archived, "session.jsonl"));
    const zeroCost = await collector.collect(true);
    expect(zeroCost.daily[28]?.costAvailable).toBe(true);
    expect(zeroCost.daily[28]?.money).toEqual([0, 0, 0, 0]);
    await writeFile(
      piLog,
      JSON.stringify({
        timestamp: today,
        message: { model: "pi-model", usage: { totalTokens: 100, cost: { total: 0.75 } } },
      }),
    );
    const refreshed = await collector.collect(true);
    expect(refreshed.daily[29]?.tokens).toEqual([0, 0, 100, 0]);
    expect(refreshed.daily[29]?.money).toEqual([0, 0, 0.75, 0]);
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
