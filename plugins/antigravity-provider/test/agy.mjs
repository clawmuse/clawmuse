import path from "node:path";
import { readFileSync, appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const args = process.argv.slice(2);
const log = process.env.AGY_TEST_LOG;
function record(value) {
  if (log) appendFileSync(log, `${JSON.stringify(value)}\n`);
}
record({ args, pid: process.pid, env: process.env.AGY_SESSION_VALUE });
function fixture(name, stream = "stdout") {
  return readFileSync(new URL(`./fixtures/${name}.${stream}.ndjson`, import.meta.url), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line).data);
}
if (args.includes("--version")) {
  process.stdout.write(`${process.env.AGY_TEST_VERSION || "1.2.13"}\n`);
  process.exit(0);
}
if (args.includes("models")) {
  if (process.env.AGY_TEST_AUTH === "missing") {
    process.stderr.write(fixture("models-unauthenticated", "stderr").join("\n"));
    process.exit(1);
  }
  process.stdout.write(fixture("models-api-key").join("\n") + "\n");
  process.exit(0);
}
if (process.env.AGY_TEST_STARTUP === "auth") {
  process.stderr.write(fixture("not-signed-in", "stderr").join("\n"));
  process.stdout.write(JSON.stringify(fixture("not-signed-in")[0]) + "\n");
  process.exit(1);
}
if (process.env.AGY_TEST_STARTUP === "exit") process.exit(3);
if (process.env.AGY_TEST_STARTUP === "stderr") {
  process.stderr.write("Error: authentication required. Run 'agy' to log in, then retry.\n");
  process.exit(1);
}
const resumeIndex = args.indexOf("--conversation");
const conversationId =
  resumeIndex >= 0 ? args[resumeIndex + 1] : fixture("text-turn")[0].conversation_id;
let denialResults = 0;
function emit(frame) {
  const converted = structuredClone(frame);
  if (converted.conversation_id !== undefined) converted.conversation_id = conversationId;
  if (converted.step_update) converted.step_update.conversation_id = conversationId;
  if (converted.result) {
    converted.result.conversation_id = conversationId;
    if (process.env.AGY_TEST_DENIAL_COUNTS && converted.result.denied_actions?.length) {
      converted.result.denied_actions = Array.from(
        { length: Number(process.env.AGY_TEST_DENIAL_COUNTS.split(",")[denialResults++]) },
        () => converted.result.denied_actions[0],
      );
    }
  }
  process.stdout.write(JSON.stringify(converted) + "\n");
}
const init = fixture("text-turn")[0];
if (args.includes("--model")) init.init.model = args[args.indexOf("--model") + 1];
emit(init);
let interrupted = null;
function fixtureName(text) {
  if (text.includes("Attached image: ")) return "image-file-external";
  if (text.includes("TOOLS")) return "tools-default";
  if (text.includes("DENIAL_REPLAY")) return "denial-replay";
  if (text.includes("SUBAGENT")) return "subagent";
  if (text.includes("MULTI")) return "multi-turn-reasoning";
  if (text.includes("RESUME")) return "resume";
  if (text.includes("HANG")) return "sigint-mid-text";
  if (text.includes("TOOL_HANG")) return "sigint-mid-tool";
  if (text.includes("RECOVERED_API_ERROR")) return "mcp-project";
  if (text.includes("STALE_QUOTA")) return "stale-quota";
  if (text.includes("STALE_INTERRUPT")) return "stale-interrupt";
  return "text-turn";
}
const turns = new Map();
const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const input = JSON.parse(line);
  record({ input });
  const text = input.message.content;
  if (text.includes("QUOTA_ERROR")) {
    emit({
      event: "result",
      result: {
        conversation_id: conversationId,
        status: "ERROR",
        response: "",
        error: "Individual quota reached. Resets in 4m4s.",
      },
    });
    return;
  }
  if (text.includes("FINAL_THINKING")) {
    const directory = path.join(
      process.env.HOME,
      ".gemini/antigravity-cli/brain",
      conversationId,
      ".system_generated/logs",
    );
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      path.join(directory, "transcript_full.jsonl"),
      JSON.stringify({
        step_index: 1,
        type: "PLANNER_RESPONSE",
        status: "DONE",
        thinking: "Final native thought",
      }) + "\n",
    );
  }
  const name = fixtureName(text);
  const frames = fixture(name).slice(1);
  if (name.startsWith("sigint")) {
    interrupted = frames[frames.length - 1];
    for (const frame of frames.slice(0, -1)) emit(frame);
    return;
  }
  const count = frames.filter((frame) => frame.event === "result").length;
  const ordinal = (turns.get(name) || 0) % count;
  turns.set(name, ordinal + 1);
  let resultCount = 0;
  for (const frame of frames) {
    if (resultCount === ordinal) emit(frame);
    if (frame.event === "result") resultCount += 1;
  }
  if (process.env.AGY_TEST_EXIT_AFTER_RESULT === "yes") process.exit(0);
});
process.on("SIGINT", () => {
  record({ signal: "SIGINT" });
  if (process.env.AGY_TEST_IGNORE_SIGNALS === "yes") return;
  if (interrupted) emit(interrupted);
  process.exit(1);
});
process.on("SIGTERM", () => {
  record({ signal: "SIGTERM" });
  if (process.env.AGY_TEST_IGNORE_SIGNALS !== "yes") process.exit(1);
});
lines.on("close", () => process.exit(0));
