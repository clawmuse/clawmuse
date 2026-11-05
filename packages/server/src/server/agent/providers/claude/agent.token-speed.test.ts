import { expect, test } from "vitest";
import { createTestLogger } from "../../../../test-utils/test-logger.js";
import { collectSessionTurnEvents } from "../test-utils/session-stream-adapter.js";
import { ClaudeAgentClient } from "./agent.js";
import type { ClaudeQueryFactory } from "./query.js";

const SESSION_ID = "token-speed-session";

function streamEvent(event: Record<string, unknown>, parentToolUseId: string | null = null) {
  return {
    type: "stream_event",
    session_id: SESSION_ID,
    parent_tool_use_id: parentToolUseId,
    event,
  };
}

// One turn of two main-thread requests (text, then a tool call) plus a subagent request.
function tokenSpeedQuery(): ClaudeQueryFactory {
  return ({ prompt }) => {
    const messages = (async function* () {
      if (typeof prompt === "string") throw new Error("Expected streaming input");
      for await (const _message of prompt) {
        yield {
          type: "system",
          subtype: "init",
          session_id: SESSION_ID,
          permissionMode: "default",
          model: "claude-opus-5-5",
        };
        yield streamEvent({ type: "message_start", message: { usage: { input_tokens: 10 } } });
        yield streamEvent({
          type: "content_block_start",
          index: 0,
          content_block: { type: "text" },
        });
        yield streamEvent({
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "one two three four five six" },
        });
        yield streamEvent({ type: "content_block_stop", index: 0 });
        yield streamEvent({ type: "message_delta", usage: { output_tokens: 30 } });
        yield streamEvent({ type: "message_start", message: { usage: { input_tokens: 40 } } });
        yield streamEvent({
          type: "content_block_start",
          index: 0,
          content_block: { type: "tool_use", id: "tool-1", name: "Read" },
        });
        yield streamEvent({
          type: "content_block_delta",
          index: 0,
          delta: { type: "input_json_delta", partial_json: '{"file_path":"a.ts"}' },
        });
        yield streamEvent({ type: "content_block_stop", index: 0 });
        yield streamEvent({ type: "message_delta", usage: { output_tokens: 20 } });
        // A subagent's request must count toward neither the estimate nor the snap.
        yield streamEvent(
          { type: "message_start", message: { usage: { input_tokens: 5 } } },
          "subagent-tool",
        );
        yield streamEvent(
          { type: "message_delta", usage: { output_tokens: 900 } },
          "subagent-tool",
        );
        yield {
          type: "result",
          subtype: "success",
          session_id: SESSION_ID,
          duration_ms: 1,
          duration_api_ms: 1,
          is_error: false,
          num_turns: 1,
          result: "done",
          stop_reason: null,
          total_cost_usd: 0,
          usage: { input_tokens: 40, output_tokens: 950, cache_read_input_tokens: 0 },
          modelUsage: {},
          permission_denials: [],
          uuid: "token-speed-result",
        };
      }
    })();
    return Object.assign(messages, {
      close: () => {
        void messages.return();
      },
      interrupt: async () => undefined,
      setModel: async () => undefined,
      setPermissionMode: async () => undefined,
      supportedModels: async () => [],
      supportedCommands: async () => [],
    }) as ReturnType<ClaudeQueryFactory>;
  };
}

test("reports the turn's token speed, snapped to main-thread output at the end", async () => {
  const client = new ClaudeAgentClient({
    logger: createTestLogger(),
    queryFactory: tokenSpeedQuery(),
    resolveBinary: async () => process.execPath,
  });
  const session = await client.createSession({ provider: "claude", cwd: process.cwd() });
  try {
    const events = await collectSessionTurnEvents(session, "go");
    const live = events.flatMap((event) =>
      event.type === "usage_updated" && event.usage.tokenSpeed ? [event.usage.tokenSpeed] : [],
    );
    expect(live.length).toBeGreaterThan(0);
    expect(live.every((speed) => speed.streaming)).toBe(true);

    const completed = events.find((event) => event.type === "turn_completed");
    expect(completed?.type === "turn_completed" && completed.usage?.tokenSpeed).toMatchObject({
      streaming: false,
      tokens: 50,
    });
  } finally {
    await session.close();
  }
});
