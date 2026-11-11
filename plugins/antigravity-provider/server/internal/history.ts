import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";
import type { ProviderLaunch, ProviderTimelineItem } from "@getpaseo/plugin/server/provider";
import { toolItem } from "./timeline.js";
import { AntigravityError } from "./wire.js";

export const recordSchema = z.object({
  step_index: z.number().int().nonnegative(),
  type: z.string(),
  status: z.string(),
  created_at: z.string().optional(),
  content: z.string().default(""),
  thinking: z.string().default(""),
  tool_calls: z
    .array(
      z.object({
        name: z.string(),
        args: z.record(z.string(), z.json()).default({}),
      }),
    )
    .default([]),
});

interface HistoryItem {
  item: ProviderTimelineItem;
  timestamp?: string;
}

export async function readHistory(
  conversationId: string,
  launch: ProviderLaunch,
): Promise<HistoryItem[] | null> {
  for (const filename of transcriptPaths(conversationId, launch)) {
    let text: string;
    try {
      text = await readFile(filename, "utf8");
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
      throw new AntigravityError(
        "Could not read Antigravity history. Check access to the CLI transcript and retry.",
        "HISTORY_READ_FAILED",
      );
    }
    return parseHistory(text, conversationId);
  }
  return null;
}

export function transcriptPaths(conversationId: string, launch: ProviderLaunch): string[] {
  const home = launch.env.HOME || launch.env.USERPROFILE || homedir();
  const directory = path.join(
    home,
    ".gemini",
    "antigravity-cli",
    "brain",
    conversationId,
    ".system_generated",
    "logs",
  );
  return ["transcript_full.jsonl", "transcript.jsonl"].map((filename) =>
    path.join(directory, filename),
  );
}

function parseHistory(text: string, conversationId: string): HistoryItem[] {
  const items: HistoryItem[] = [];
  const pending: HistoryItem[] = [];
  const seen = new Set<number>();
  for (const [lineIndex, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let record: z.infer<typeof recordSchema>;
    try {
      record = recordSchema.parse(JSON.parse(line));
    } catch {
      throw new AntigravityError(
        `Could not restore Antigravity history: invalid transcript record at line ${lineIndex + 1}.`,
        "INVALID_HISTORY",
      );
    }
    if (seen.has(record.step_index)) continue;
    seen.add(record.step_index);
    const id = `${conversationId}:history:${record.step_index}`;
    const timestamp = record.created_at;
    if (record.type === "USER_INPUT") {
      pending.length = 0;
      const request = /^<USER_REQUEST>\r?\n([\s\S]*?)\r?\n<\/USER_REQUEST>(?:\r?\n|$)/.exec(
        record.content,
      );
      const content = request ? request[1] : record.content;
      items.push({ timestamp, item: { type: "user_message", id, text: content } });
    } else if (record.type === "PLANNER_RESPONSE") {
      pending.length = 0;
      if (record.thinking)
        items.push({
          timestamp,
          item: { type: "reasoning", id: `${id}:thinking`, text: record.thinking },
        });
      if (record.content)
        items.push({
          timestamp,
          item: { type: "assistant_message", id, messageId: id, text: record.content },
        });
      for (const [index, call] of record.tool_calls.entries()) {
        const item = toolItem(
          {
            conversation_id: conversationId,
            step_index: record.step_index,
            state: "ACTIVE",
            step_type: "tool",
            text_delta: "",
            tool_name: call.name,
            tool_info: { name: call.name, parameters: call.args, output: "", error: null },
            subagent_info: null,
            duration_seconds: null,
            usage: null,
          },
          `${id}:tool:${index}`,
        );
        // A missing result is interrupted work, not a successful tool execution.
        const entry: HistoryItem = {
          timestamp,
          item: { ...item, status: "canceled", error: null },
        };
        items.push(entry);
        pending.push(entry);
      }
    } else if (record.type === "GENERIC") {
      // agy emits tool results in the same order as the preceding planner's calls.
      const entry = pending.shift();
      if (entry) completeTool(entry, record);
    } else if (record.type === "ERROR_MESSAGE" && record.content) {
      items.push({ timestamp, item: { type: "error", id, message: record.content } });
    }
  }
  return items;
}

function completeTool(entry: HistoryItem, record: z.infer<typeof recordSchema>): void {
  if (entry.item.type !== "tool_call") return;
  const item = entry.item;
  let detail = item.detail;
  if (detail.type === "shell") detail = { ...detail, output: record.content };
  else if (detail.type === "read") detail = { ...detail, content: record.content };
  else if (detail.type === "unknown") detail = { ...detail, output: record.content };
  if (record.status === "ERROR")
    entry.item = { ...item, detail, status: "failed", error: record.content };
  else if (record.status === "DONE")
    entry.item = { ...item, detail, status: "completed", error: null };
}
