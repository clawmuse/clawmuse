import { z } from "zod";

const usage = z.object({
  input_tokens: z.number().nonnegative(),
  output_tokens: z.number().nonnegative(),
  cache_read_tokens: z.number().nonnegative().default(0),
});
const tool = z.object({
  name: z.string(),
  parameters: z.record(z.string(), z.json()).default({}),
  output: z.string().default(""),
  error: z.object({ type: z.string(), message: z.string() }).nullable().default(null),
});
const child = z.object({
  type_name: z.string(),
  role: z.string().default(""),
  initial_prompt: z.string().default(""),
  conversation_id: z.string().nullable().default(null),
  log_uri: z.string().default(""),
  workspace_uris: z.array(z.string()).default([]),
});
const frame = z.discriminatedUnion("event", [
  z.object({
    event: z.literal("init"),
    conversation_id: z.string().min(1),
    init: z.object({ model: z.string().nullable().default(null) }),
  }),
  z.object({
    event: z.literal("step_update"),
    step_update: z.object({
      conversation_id: z.string(),
      step_index: z.number().int().nonnegative(),
      state: z.enum(["ACTIVE", "DONE", "ERROR"]),
      step_type: z.string(),
      text_delta: z.string().default(""),
      tool_name: z.string().default(""),
      tool_info: tool.nullable().default(null),
      subagent_info: z
        .object({ subagents: z.array(child) })
        .nullable()
        .default(null),
      duration_seconds: z.number().nonnegative().nullable().default(null),
      usage: usage.nullable().default(null),
    }),
  }),
  z.object({
    event: z.literal("result"),
    result: z.object({
      conversation_id: z.string(),
      status: z.enum(["SUCCESS", "ERROR"]),
      response: z.string().default(""),
      error: z.string().default("Antigravity turn failed"),
      duration_seconds: z.number().nonnegative().nullable().default(null),
      denied_actions: z
        .array(z.object({ action: z.string(), display_name: z.string() }))
        .default([]),
    }),
  }),
]);
export type Frame = z.infer<typeof frame>;
export type Step = Extract<Frame, { event: "step_update" }>["step_update"];
export type Init = Extract<Frame, { event: "init" }>;

export function createFrameDecoder(): (line: string) => Frame {
  let conversationId: string | null = null;
  let lastStep: Pick<Step, "step_index" | "step_type" | "state"> | null = null;
  let errorIndex: number | null = null;
  let userInputIndex: number | null = null;
  let response = { index: -1, text: "" };
  const activeTools = new Set<number>();

  function reset(): void {
    lastStep = null;
    errorIndex = null;
    userInputIndex = null;
    response = { index: -1, text: "" };
    activeTools.clear();
  }

  function observeStep(step: Step): void {
    if (step.conversation_id !== conversationId) return;
    if (step.step_type === "user_input") {
      reset();
      userInputIndex = step.step_index;
    }
    if (lastStep === null || step.step_index >= lastStep.step_index) lastStep = step;
    if (step.step_type === "error_message")
      errorIndex = Math.max(errorIndex ?? -1, step.step_index);
    if (step.step_type === "agent_response" && step.step_index >= response.index) {
      const previous = step.step_index === response.index ? response.text : "";
      response = { index: step.step_index, text: previous + step.text_delta };
    }
    const isTool = step.step_type === "tool" || step.step_type === "subagent";
    if (isTool && step.state === "ACTIVE") activeTools.add(step.step_index);
    else activeTools.delete(step.step_index);
  }

  function hasRecovered(result: Extract<Frame, { event: "result" }>["result"]): boolean {
    // COMPAT(antigravityRecoveredApiError): added in v1.4.4, remove after 2027-05-04
    // once agy stops reporting a recovered error_message as the final result error.
    // A DONE response after that error is required; earlier/partial text is not recovery.
    const recoveredApiError =
      /^API error \(attempt \d+\): (?:UNAVAILABLE \(code 503\):|Error 50[234],)/.test(
        result.error,
      ) && errorIndex !== null;
    // COMPAT(antigravityStaleQuota): added in v1.4.4, remove after 2027-05-04
    // agy 1.5.0 can retain a previous turn's quota error in result after completing
    // a new prompt. Require this turn's user boundary and no new error step.
    const staleQuota =
      result.error.startsWith("Individual quota reached.") &&
      userInputIndex !== null &&
      errorIndex === null;
    // COMPAT(antigravityStaleInterrupt): added in v1.5.9, remove after 2027-05-04
    // agy reports a stream interruption from an earlier driver (or an earlier step
    // of this turn, before it recovered) as the final result error even after the
    // answer completes. Both evidence paths apply: an error step observed in this
    // driver, or this turn's user boundary when the interruption predates it.
    const interrupted =
      result.error.includes("The stream was interrupted. Please continue the task") &&
      (errorIndex !== null || userInputIndex !== null);
    let completedAfter: number | null = null;
    if (interrupted) completedAfter = errorIndex ?? userInputIndex;
    else if (recoveredApiError) completedAfter = errorIndex;
    else if (staleQuota) completedAfter = userInputIndex;
    return (
      result.conversation_id === conversationId &&
      result.status === "ERROR" &&
      completedAfter !== null &&
      lastStep !== null &&
      lastStep.step_type === "agent_response" &&
      lastStep.state === "DONE" &&
      lastStep.step_index > completedAfter &&
      response.index === lastStep.step_index &&
      response.text.trim().length > 0 &&
      response.text.trim() === result.response.trim() &&
      activeTools.size === 0
    );
  }

  return (line) => {
    const decoded = frame.parse(JSON.parse(line));
    if (decoded.event === "init") {
      conversationId = decoded.conversation_id;
      reset();
    } else if (decoded.event === "step_update") {
      observeStep(decoded.step_update);
    } else {
      const result = decoded.result;
      const recovered = hasRecovered(result);
      reset();
      if (recovered) return { ...decoded, result: { ...result, status: "SUCCESS", error: "" } };
    }
    return decoded;
  };
}

export function encodePrompt(text: string): string {
  return `${JSON.stringify({ event: "user", message: { content: text } })}\n`;
}

export class AntigravityError extends Error {
  constructor(
    message: string,
    readonly code = "ANTIGRAVITY_ERROR",
  ) {
    super(message);
    this.name = "AntigravityError";
  }
}

export function diagnostic(message: string): string {
  if (/auth|sign.in|log.in/i.test(message)) {
    return "Antigravity authentication failed. Run `agy` and sign in, then retry.";
  }
  return message;
}
