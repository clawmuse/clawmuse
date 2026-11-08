import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PROVIDER_CAPABILITIES,
  ProviderEventSchema,
  type ProviderConnection,
  type ProviderContent,
  type ProviderEvent,
  type ProviderInput,
  type ProviderLaunch,
  type ProviderPersistence,
} from "@getpaseo/plugin/server/provider";
import { signalPlan } from "./internal/signals.js";
import { AntigravityTokenSpeedObserver } from "./internal/token-speed.js";
import { createAntigravityProvider } from "./provider.js";
import { createFrameDecoder, type Step } from "./internal/wire.js";

const temporary: string[] = [];
const connections: ProviderConnection[] = [];
const fake = fileURLToPath(new URL("../test/agy.mjs", import.meta.url));
const provider = createAntigravityProvider();

it("publishes a monochrome, theme-aware provider icon", async () => {
  const icon = await readFile(new URL("../icon.svg", import.meta.url), "utf8");
  expect(icon).toContain('viewBox="0 0 24 24"');
  expect(icon).toContain('fill="currentColor"');
  expect(icon).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(|url\(/i);
  expect(icon).not.toMatch(/<(?:style|mask|defs|linearGradient|radialGradient)\b|\bid=/i);
  expect([...icon.matchAll(/\b(?:fill|stroke)="([^"]+)"/g)].map((match) => match[1])).toEqual([
    "currentColor",
  ]);
});

afterEach(async () => {
  await Promise.all(connections.splice(0).map((connection) => connection.close()));
  await Promise.all(
    temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function harness(env: Record<string, string> = {}) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "antigravity-test-"));
  temporary.push(cwd);
  const log = path.join(cwd, "argv.ndjson");
  const launch: ProviderLaunch = {
    command: process.execPath,
    args: [fake, "--launch-prefix"],
    env: { HOME: cwd, USERPROFILE: cwd, AGY_TEST_LOG: log, ...env },
  };
  const connection = await provider.connect({
    versions: [1],
    capabilities: PROVIDER_CAPABILITIES,
    launch,
  });
  connections.push(connection);
  const events: ProviderEvent[] = [];
  connection.onEvent((event) => {
    ProviderEventSchema.parse(event);
    events.push(event);
  });
  async function wait(predicate: (event: ProviderEvent) => boolean) {
    await expect.poll(() => events.some(predicate), { timeout: 5000, interval: 10 }).toBe(true);
    const event = events.find(predicate);
    if (!event) throw new Error("Expected event missing");
    return event;
  }
  async function request(input: ProviderInput) {
    await connection.send(input);
    if ("requestId" in input)
      await wait(
        (event) =>
          "requestId" in event &&
          event.requestId === input.requestId &&
          (event.type === "request.completed" ||
            event.type === "request.failed" ||
            event.type === "session.ready" ||
            event.type === "catalog"),
      );
  }
  async function open(
    restored?: ProviderPersistence,
    sessionId = "s",
    history: "replay" | "skip" = "replay",
  ) {
    await request({
      type: "session.open",
      requestId: `open-${events.length}`,
      sessionId,
      persistence: restored,
      history,
      config: {
        cwd,
        env: { AGY_SESSION_VALUE: "session-overlay" },
        settings: {},
        mcpServers: {},
        persist: true,
        systemPrompt: "SYSTEM PREFIX",
      },
    });
  }
  async function message(content: ProviderContent[], sessionId = "s") {
    const clientMessageId = `prompt-${events.length}`;
    await connection.send({
      type: "session.prompt",
      sessionId,
      prompt: {
        clientMessageId,
        delivery: "auto",
        input: { type: "message", content },
      },
    });
    await wait(
      (event) =>
        event.type === "session.prompt_result" && event.clientMessageId === clientMessageId,
    );
    return clientMessageId;
  }
  function prompt(text: string) {
    return message([{ type: "text", text }]);
  }
  async function completed(clientMessageId: string) {
    const result = events.find(
      (event) =>
        event.type === "session.prompt_result" && event.clientMessageId === clientMessageId,
    );
    if (!result || result.type !== "session.prompt_result" || result.result.type !== "turn")
      throw new Error("Prompt was not admitted");
    const turnId = result.result.turnId;
    return wait(
      (event) =>
        event.type === "session.turn" && event.turnId === turnId && event.state !== "started",
    );
  }
  async function records() {
    return (await readFile(log, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
  }
  function persistence() {
    const opened = events.find((event) => event.type === "session.opened");
    if (!opened || opened.type !== "session.opened" || !opened.persistence)
      throw new Error("Missing persistence");
    return opened.persistence;
  }
  return {
    connection,
    events,
    launch,
    cwd,
    wait,
    request,
    open,
    prompt,
    message,
    completed,
    records,
    persistence,
  };
}

it("streams complete text snapshots, prefixes the system prompt only once and preserves launch argv/env", async () => {
  const h = await harness();
  expect(h.connection.capabilities).toEqual([
    "prompt.message",
    "prompt.image",
    "session.configure",
    "session.persistence",
  ]);
  await h.open();
  await h.completed(await h.prompt("HELLO"));
  await h.completed(await h.prompt("HELLO AGAIN"));
  const text = h.events.filter(
    (event) => event.type === "timeline.item" && event.item.type === "assistant_message",
  );
  expect(
    text.map((event) =>
      event.type === "timeline.item" && event.item.type === "assistant_message"
        ? event.item.text
        : "",
    ),
  ).toEqual(["PHASE0_HELLO", "PHASE0_HELLO\n", "PHASE0_HELLO", "PHASE0_HELLO\n"]);
  const records = await h.records();
  expect(records.find((entry) => entry.args.includes("--input-format")).args).toEqual([
    "--launch-prefix",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--add-dir",
    h.cwd,
    "--disable-slash-commands",
    "--dangerously-skip-permissions",
  ]);
  expect(records.find((entry) => entry.args.includes("--input-format")).env).toBe(
    "session-overlay",
  );
  expect(
    records.filter((entry) => entry.input).map((entry) => entry.input.message.content),
  ).toEqual(["SYSTEM PREFIX\n\nHELLO", "HELLO AGAIN"]);
});

it("completes a recovered API error when the CLI finishes a later response and keeps the session usable", async () => {
  const h = await harness();
  await h.open();
  const result = await h.completed(await h.prompt("RECOVERED_API_ERROR"));
  expect(result).toMatchObject({ type: "session.turn", state: "completed" });
  expect(await h.completed(await h.prompt("HELLO AGAIN"))).toMatchObject({
    type: "session.turn",
    state: "completed",
  });
  const records = await h.records();
  expect(records.filter((entry) => entry.args?.includes("--input-format"))).toHaveLength(1);
});

describe("recovered Antigravity result errors", () => {
  const apiError =
    "API error (attempt 1): UNAVAILABLE (code 503): The service is currently unavailable.";
  const errorStep = { step_index: 1, step_type: "error_message", state: "DONE" } as const;
  const userStep = { step_index: 0, step_type: "user_input", state: "DONE" } as const;
  const answer = {
    step_index: 2,
    step_type: "agent_response",
    state: "DONE",
    text_delta: "Done.",
  } as const;

  function decoder() {
    const decode = createFrameDecoder();
    decode(
      JSON.stringify({
        event: "init",
        conversation_id: "c",
        init: { model: "gemini-4-argon-high" },
      }),
    );
    return decode;
  }
  function step(decode: ReturnType<typeof createFrameDecoder>, update: Partial<Step>) {
    return decode(
      JSON.stringify({ event: "step_update", step_update: { conversation_id: "c", ...update } }),
    );
  }
  function result(
    decode: ReturnType<typeof createFrameDecoder>,
    overrides: Record<string, string> = {},
  ) {
    return decode(
      JSON.stringify({
        event: "result",
        result: {
          conversation_id: "c",
          status: "ERROR",
          error: apiError,
          response: "Done.",
          ...overrides,
        },
      }),
    );
  }

  it("recognizes a completed streamed answer after a recovered 503", () => {
    const decode = decoder();
    step(decode, errorStep);
    step(decode, { ...answer, state: "ACTIVE", text_delta: "Do" });
    step(decode, { ...answer, text_delta: "ne." });
    expect(result(decode)).toMatchObject({
      result: { status: "SUCCESS", error: "", response: "Done." },
    });
    expect(result(decode)).toMatchObject({ result: { status: "ERROR", error: apiError } });
  });

  it.each([
    { name: "no observed retry error", steps: [answer] },
    { name: "only an earlier answer", steps: [answer, { ...errorStep, step_index: 3 }] },
    { name: "partial response", steps: [errorStep, { ...answer, state: "ACTIVE" }] },
    { name: "failed response", steps: [errorStep, { ...answer, state: "ERROR" }] },
    {
      name: "pending tool",
      steps: [{ step_index: 0, step_type: "tool", state: "ACTIVE" }, errorStep, answer],
    },
    {
      name: "pending subagent",
      steps: [{ step_index: 0, step_type: "subagent", state: "ACTIVE" }, errorStep, answer],
    },
    {
      name: "later tool",
      steps: [errorStep, answer, { step_index: 3, step_type: "tool", state: "DONE" }],
    },
    {
      name: "new user turn",
      steps: [errorStep, answer, { step_index: 3, step_type: "user_input", state: "DONE" }],
    },
    {
      name: "late replay of old answer",
      steps: [errorStep, answer, { ...errorStep, step_index: 3 }, { ...answer, text_delta: "" }],
    },
    { name: "empty answer", steps: [errorStep, { ...answer, text_delta: "" }] },
    { name: "another conversation", steps: [errorStep, { ...answer, conversation_id: "other" }] },
  ] satisfies Array<{ name: string; steps: Partial<Step>[] }>)(
    "preserves failure with $name",
    ({ steps }) => {
      const decode = decoder();
      for (const update of steps) step(decode, update);
      expect(result(decode)).toMatchObject({ result: { status: "ERROR", error: apiError } });
    },
  );

  it.each([
    { error: "interrupted" },
    { error: "authentication failed" },
    { error: "API error (attempt 1): PERMISSION_DENIED (code 403)" },
    { response: "A different response" },
    { conversation_id: "other" },
  ])("does not replace an unrelated result: %j", (overrides) => {
    const decode = decoder();
    step(decode, errorStep);
    step(decode, answer);
    expect(result(decode, overrides)).toMatchObject({ result: { status: "ERROR", ...overrides } });
  });

  it.each([
    { name: "no user boundary", steps: [answer] },
    { name: "a current quota error", steps: [userStep, errorStep] },
    { name: "a response after a current error", steps: [userStep, errorStep, answer] },
    { name: "an incomplete answer", steps: [userStep, { ...answer, state: "ACTIVE" }] },
    { name: "a later error", steps: [userStep, answer, { ...errorStep, step_index: 3 }] },
    {
      name: "a pending tool",
      steps: [userStep, { step_index: 1, step_type: "tool", state: "ACTIVE" }, answer],
    },
  ] satisfies Array<{ name: string; steps: Partial<Step>[] }>)(
    "preserves quota failures with $name",
    ({ steps }) => {
      const decode = decoder();
      for (const update of steps) step(decode, update);
      const error = "Individual quota reached. Resets in 4m4s.";
      expect(result(decode, { error })).toMatchObject({ result: { status: "ERROR", error } });
    },
  );

  it("does not reuse a completed turn to dismiss the next quota failure", () => {
    const decode = decoder();
    const error = "Individual quota reached. Resets in 4m4s.";
    step(decode, { step_index: 0, step_type: "user_input", state: "DONE" });
    step(decode, answer);
    expect(result(decode, { error })).toMatchObject({ result: { status: "SUCCESS" } });
    expect(result(decode, { error })).toMatchObject({ result: { status: "ERROR", error } });
  });
});

it("completes a fresh answer when agy replays a quota error from an older turn", async () => {
  const h = await harness();
  await h.open();
  expect(await h.completed(await h.prompt("STALE_QUOTA"))).toMatchObject({ state: "completed" });
  expect(await h.completed(await h.prompt("HELLO"))).toMatchObject({ state: "completed" });
  expect(
    (await h.records()).filter((entry) => entry.args?.includes("--input-format")),
  ).toHaveLength(1);
});

it("maps tools and emits one denial notice for a SUCCESS result", async () => {
  const h = await harness();
  await h.open();
  // This capture contains three distinct native results, one for each submitted prompt.
  await h.completed(await h.prompt("TOOLS"));
  await h.completed(await h.prompt("TOOLS"));
  const result = await h.completed(await h.prompt("TOOLS"));
  expect(result).toMatchObject({ type: "session.turn", state: "completed" });
  const tools = h.events.filter(
    (event) => event.type === "timeline.item" && event.item.type === "tool_call",
  );
  expect(tools).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        item: expect.objectContaining({
          name: "view_file",
          status: "completed",
          detail: expect.objectContaining({ type: "read" }),
        }),
      }),
      expect.objectContaining({
        item: expect.objectContaining({
          name: "write_to_file",
          status: "completed",
          detail: expect.objectContaining({ type: "write" }),
        }),
      }),
      expect.objectContaining({
        item: expect.objectContaining({
          name: "run_command",
          status: "failed",
          detail: expect.objectContaining({ type: "shell", command: "printf PHASE0_SHELL" }),
        }),
      }),
    ]),
  );
  const notices = h.events.filter(
    (event) => event.type === "session.notice" && event.notice.id !== "s:full-access",
  );
  expect(notices).toHaveLength(1);
  expect(notices[0]).toMatchObject({
    notice: {
      title: "Shell command denied",
      description: "Antigravity's own policy denied it.",
    },
  });
});

it("reports only new process denials across replayed turns and resets after respawn", async () => {
  const h = await harness();
  await h.open();
  await h.completed(await h.prompt("DENIAL_REPLAY"));
  expect(
    h.events.filter(
      (event) => event.type === "session.notice" && event.notice.id !== "s:full-access",
    ),
  ).toHaveLength(1);
  const followupStart = h.events.length;
  await h.completed(await h.prompt("DENIAL_REPLAY"));
  const followup = h.events.slice(followupStart);
  expect(
    followup.some(
      (event) => event.type === "session.notice" && event.notice.id !== "s:full-access",
    ),
  ).toBe(false);
  expect(followup).toContainEqual(
    expect.objectContaining({
      type: "timeline.item",
      item: expect.objectContaining({ type: "assistant_message", text: "FOLLOWUP_OK\n" }),
    }),
  );
  await h.request({
    type: "session.configure",
    sessionId: "s",
    requestId: "mode",
    changes: { model: "gemini-3.8-flash-low" },
  });
  await h.completed(await h.prompt("DENIAL_REPLAY"));
  expect(
    h.events.filter(
      (event) => event.type === "session.notice" && event.notice.id !== "s:full-access",
    ),
  ).toHaveLength(2);
  expect(
    (await h.records()).filter((entry) => entry.args?.includes("--input-format")),
  ).toHaveLength(2);
});

it("counts repeated native action denials without exposing tool identifiers", async () => {
  const h = await harness({ AGY_TEST_DENIAL_COUNTS: "2,2,3" });
  await h.open();
  await h.completed(await h.prompt("DENIAL_REPLAY"));
  await h.completed(await h.prompt("DENIAL_REPLAY"));
  const notices = h.events.filter(
    (event) => event.type === "session.notice" && event.notice.id !== "s:full-access",
  );
  expect(notices).toHaveLength(1);
  expect(notices[0]).toMatchObject({
    notice: {
      title: "2 actions denied",
      description: "Antigravity's own policy denied it.",
    },
  });
  await h.completed(await h.prompt("DENIAL_REPLAY"));
  expect(
    h.events.filter(
      (event) => event.type === "session.notice" && event.notice.id !== "s:full-access",
    ),
  ).toHaveLength(2);
  expect(
    h.events.findLast(
      (event) => event.type === "session.notice" && event.notice.id !== "s:full-access",
    ),
  ).toMatchObject({
    notice: { title: "Shell command denied" },
  });
});

it("accounts DONE generation usage once without adding cumulative results, including resume", async () => {
  const h = await harness();
  await h.open();
  await h.completed(await h.prompt("MULTI"));
  await h.completed(await h.prompt("MULTI"));
  const completedUsages = () =>
    h.events.filter(
      (event): event is Extract<ProviderEvent, { type: "session.usage" }> =>
        event.type === "session.usage" && event.usage.tokenSpeed?.streaming === false,
    );
  expect(completedUsages().map((event) => event.usage.inputTokens)).toEqual([11263, 11604]);
  expect(completedUsages()[0]?.usage.tokenSpeed).toMatchObject({
    tokens: 466,
    elapsedMs: 4393,
    streaming: false,
  });
  expect(completedUsages()[1]?.usage.tokenSpeed).toMatchObject({
    tokens: 3,
    elapsedMs: 1784,
    streaming: false,
  });
  const persistence = h.persistence();
  await h.request({ type: "session.close", sessionId: "s", requestId: "close" });
  await h.open(persistence);
  await h.completed(await h.prompt("RESUME"));
  expect(completedUsages()).toHaveLength(3);
  expect(completedUsages().at(-1)).toMatchObject({
    usage: {
      inputTokens: 11815,
      outputTokens: 12,
      tokenSpeed: {
        tokens: 12,
        elapsedMs: 1821,
        streaming: false,
      },
    },
  });
});

describe("Antigravity token speed", () => {
  function makeStep(overrides: Partial<Step>): Step {
    return {
      conversation_id: "c",
      step_index: 1,
      state: "ACTIVE",
      step_type: "agent_response",
      text_delta: "",
      tool_name: "",
      tool_info: null,
      subagent_info: null,
      duration_seconds: null,
      usage: null,
      ...overrides,
    };
  }

  it("tracks live streaming rate, excludes tool and retry waits, and snaps DONE steps", () => {
    const observer = new AntigravityTokenSpeedObserver();
    expect(
      observer.observeStep(makeStep({ step_index: 0, step_type: "user_input", state: "DONE" }), 0),
    ).toBe(false);

    // Fewer than 5 tokens does not trigger a live publish yet.
    expect(observer.observeStep(makeStep({ step_index: 1, text_delta: "one two" }), 200)).toBe(
      false,
    );

    // Reaching >= 5 tokens triggers the first live publish, then throttles for 1s.
    expect(
      observer.observeStep(makeStep({ step_index: 1, text_delta: " three four five" }), 500),
    ).toBe(true);
    expect(observer.snapshot(500)).toMatchObject({
      rate: 10,
      tokens: 5,
      elapsedMs: 500,
      streaming: true,
    });
    expect(
      observer.observeStep(makeStep({ step_index: 1, text_delta: " six seven eight" }), 900),
    ).toBe(false);
    expect(observer.observeStep(makeStep({ step_index: 1, text_delta: " nine ten" }), 1_500)).toBe(
      true,
    );

    // Step 1 finishes with exact usage and duration_seconds.
    observer.observeStep(
      makeStep({
        step_index: 1,
        state: "DONE",
        duration_seconds: 2.0,
        usage: { input_tokens: 100, output_tokens: 40, cache_read_tokens: 0 },
      }),
      2_000,
    );
    expect(observer.snapshot(2_000)).toMatchObject({
      tokens: 40,
      elapsedMs: 2_000,
      average: 20,
      streaming: true,
    });

    // Tool runs from t=2000 to t=12000 (10s tool wait must be excluded).
    observer.observeStep(makeStep({ step_index: 2, step_type: "tool", state: "ACTIVE" }), 2_000);
    observer.observeStep(makeStep({ step_index: 2, step_type: "tool", state: "DONE" }), 12_000);

    // API retry error at t=15000 discards the 3s failed attempt and waits until t=20000.
    observer.observeStep(
      makeStep({ step_index: 3, step_type: "error_message", state: "DONE" }),
      15_000,
    );

    // Step 4 streams from t=20000 to t=21000 without duration_seconds, falling back to wall time.
    observer.observeStep(
      makeStep({ step_index: 4, text_delta: "alpha beta gamma delta epsilon" }),
      20_000,
    );
    observer.observeStep(
      makeStep({
        step_index: 4,
        state: "DONE",
        usage: { input_tokens: 120, output_tokens: 60, cache_read_tokens: 0 },
      }),
      21_000,
    );
    observer.stop(null, 21_000);

    expect(observer.snapshot(25_000)).toEqual({
      rate: (100 * 1_000) / 3_000,
      average: (100 * 1_000) / 3_000,
      tokens: 100,
      elapsedMs: 3_000,
      streaming: false,
    });
  });

  it("accumulates multi-step tool turns and settles streaming=false on completion", async () => {
    const h = await harness();
    await h.open();
    await h.completed(await h.prompt("TOOLS"));
    const usages = h.events.filter(
      (event): event is Extract<ProviderEvent, { type: "session.usage" }> =>
        event.type === "session.usage",
    );
    expect(usages.length).toBeGreaterThanOrEqual(2);
    expect(usages.slice(0, -1).every((event) => event.usage.tokenSpeed?.streaming === true)).toBe(
      true,
    );
    const finalSpeed = usages.at(-1)?.usage.tokenSpeed;
    expect(finalSpeed).toMatchObject({
      tokens: 149 + 49,
      elapsedMs: 3738 + 2698,
      streaming: false,
    });
    expect(finalSpeed?.rate).toBeCloseTo(((149 + 49) * 1_000) / (3738 + 2698), 5);
  });
});

it("maps subagent steps to a tool carrying the child conversation ID", async () => {
  const h = await harness();
  await h.open();
  await h.completed(await h.prompt("SUBAGENT"));
  expect(h.events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "timeline.item",
        item: expect.objectContaining({
          name: "invoke_subagent",
          status: "completed",
          detail: expect.objectContaining({
            type: "sub_agent",
            childSessionId: "b6f02329-7415-49a7-a9a9-1cd09e898d26",
          }),
        }),
      }),
    ]),
  );
});

it.each(["HANG", "TOOL_HANG"])(
  "interrupts %s, settles canceled, and respawns the same conversation",
  async (text) => {
    const h = await harness();
    await h.open();
    const message = await h.prompt(text);
    await h.wait(
      (event) =>
        event.type === "timeline.item" &&
        (event.item.type === "assistant_message" || event.item.type === "tool_call"),
    );
    await h.request({ type: "session.interrupt", requestId: "interrupt", sessionId: "s" });
    expect(await h.completed(message)).toMatchObject({ state: "canceled" });
    await h.completed(await h.prompt("HELLO"));
    const records = await h.records();
    const launches = records.filter((entry) => entry.args && entry.args.includes("--input-format"));
    expect(launches).toHaveLength(2);
    expect(launches[1].args.slice(-2)).toEqual([
      "--conversation",
      "e5cf1e2d-c715-4328-8e67-4a85c8dc3cda",
    ]);
    // Windows taskkill terminates the tree without invoking the CLI's signal handlers.
    expect(records.filter((entry) => entry.signal)).toEqual(
      process.platform === "win32" ? [] : [{ signal: "SIGINT" }],
    );
    const canceled = h.events.filter(
      (event) => event.type === "session.turn" && event.state === "canceled",
    );
    expect(canceled).toHaveLength(1);
  },
);

it("stops an unresponsive driver and still respawns the conversation", async () => {
  const h = await harness({ AGY_TEST_IGNORE_SIGNALS: "yes" });
  await h.open();
  const message = await h.prompt("HANG");
  await h.wait(
    (event) => event.type === "timeline.item" && event.item.type === "assistant_message",
  );
  await h.request({ type: "session.interrupt", requestId: "interrupt-timeout", sessionId: "s" });
  expect(await h.completed(message)).toMatchObject({ state: "canceled" });
  expect((await h.records()).filter((entry) => entry.signal)).toEqual(
    process.platform === "win32" ? [] : [{ signal: "SIGINT" }, { signal: "SIGTERM" }],
  );
  await h.completed(await h.prompt("HELLO"));
});

it.skipIf(process.platform === "win32")(
  "shares error retirement with an immediate retry instead of signaling the driver twice",
  async () => {
    const h = await harness({ AGY_TEST_IGNORE_SIGNALS: "yes" });
    await h.open();
    expect(await h.completed(await h.prompt("QUOTA_ERROR"))).toMatchObject({ state: "failed" });
    expect(await h.completed(await h.prompt("HELLO"))).toMatchObject({ state: "completed" });
    expect((await h.records()).filter((entry) => entry.signal)).toEqual([
      { signal: "SIGINT" },
      { signal: "SIGTERM" },
    ]);
  },
);

it.skipIf(process.platform === "win32")(
  "preserves quota failure and retries cleanup after a live-process signal is denied",
  async () => {
    const h = await harness();
    await h.open();
    const kill = process.kill.bind(process);
    let denied = false;
    const signal = vi.spyOn(process, "kill").mockImplementation((pid, name) => {
      if (pid < 0 && name === "SIGINT" && !denied) {
        denied = true;
        throw Object.assign(new Error("kill EPERM"), { code: "EPERM" });
      }
      return kill(pid, name);
    });
    try {
      expect(await h.completed(await h.prompt("QUOTA_ERROR"))).toMatchObject({
        state: "failed",
        error: { message: "Individual quota reached. Resets in 4m4s." },
      });
      await h.wait((event) => event.type === "session.notice" && event.notice.id === "s:cleanup");
      expect(await h.completed(await h.prompt("HELLO"))).toMatchObject({ state: "completed" });
      expect(
        (await h.records()).filter((entry) => entry.args?.includes("--input-format")),
      ).toHaveLength(2);
    } finally {
      signal.mockRestore();
    }
  },
);

it.skipIf(process.platform === "win32")(
  "closes an exited driver when its final process-group sweep reports EPERM",
  async () => {
    const h = await harness();
    await h.open();
    const kill = process.kill.bind(process);
    // Inject the OS race only after graceful shutdown; launch and exit are real.
    const signal = vi.spyOn(process, "kill").mockImplementation((pid, name) => {
      if (pid < 0 && name === "SIGKILL")
        throw Object.assign(new Error("kill EPERM"), { code: "EPERM" });
      return kill(pid, name);
    });
    try {
      await h.request({ type: "session.close", requestId: "close-eperm", sessionId: "s" });
      expect(h.events).toContainEqual({ type: "request.completed", requestId: "close-eperm" });
      await h.open(h.persistence(), "resumed");
      expect(
        await h.completed(await h.message([{ type: "text", text: "HELLO" }], "resumed")),
      ).toMatchObject({ state: "completed" });
    } finally {
      signal.mockRestore();
    }
  },
);

it("rejects plan and keeps the full-access selection without respawning", async () => {
  const h = await harness();
  await h.open();
  await h.request({
    type: "session.configure",
    requestId: "plan",
    sessionId: "s",
    changes: { mode: "plan" },
  });
  expect(h.events).toContainEqual(
    expect.objectContaining({
      type: "request.failed",
      requestId: "plan",
      error: { code: "INVALID_MODE", message: "Unknown Antigravity mode: plan" },
    }),
  );
  await h.request({
    type: "session.configure",
    requestId: "full",
    sessionId: "s",
    changes: { mode: "full-access" },
  });
  await h.completed(await h.prompt("HELLO"));
  expect(
    (await h.records()).filter((entry) => entry.args?.includes("--input-format")),
  ).toHaveLength(1);
});

it("emits one full-access warning per open, none on respawn, and one again on resume", async () => {
  const h = await harness();
  await h.open();
  const warning = {
    type: "session.notice",
    sessionId: "s",
    notice: {
      id: "s:full-access",
      severity: "warning",
      title: "Antigravity is running with full access",
      description:
        "Antigravity's CLI cannot ask for permission when another app drives it, so Paseo starts it with --dangerously-skip-permissions. Every tool call, including shell commands, runs without asking.",
    },
  };
  const opened = h.events.findIndex((event) => event.type === "session.opened");
  expect(h.events[opened + 1]).toEqual(warning);
  expect(h.events.slice(0, opened).some((event) => event.type === "session.notice")).toBe(false);
  await h.completed(await h.prompt("HELLO"));
  await h.request({
    type: "session.configure",
    requestId: "model",
    sessionId: "s",
    changes: { model: "gemini-3.8-flash-low" },
  });
  await h.completed(await h.prompt("HELLO"));
  expect(h.events.filter((event) => event.type === "session.notice")).toEqual([warning]);
  const launches = (await h.records()).filter((entry) => entry.args?.includes("--input-format"));
  expect(launches).toHaveLength(2);
  for (const launch of launches) {
    expect(launch.args).toContain("--dangerously-skip-permissions");
    expect(launch.args).not.toContain("--mode");
  }
  const persistence = h.persistence();
  await h.connection.close();
  const resumed = await harness();
  await resumed.open(persistence);
  await resumed.completed(await resumed.prompt("RESUME"));
  expect(
    resumed.events.filter(
      (event) => event.type === "session.notice" && event.notice.id === "s:full-access",
    ),
  ).toEqual([warning]);
});

it("defers model and mode changes until the next prompt, then respawns with validated flags", async () => {
  const h = await harness();
  await h.open();
  await h.request({
    type: "session.configure",
    requestId: "change",
    sessionId: "s",
    changes: { model: "gemini-3.8-flash-low", mode: "full-access" },
  });
  expect(
    (await h.records()).filter((entry) => entry.args && entry.args.includes("--input-format")),
  ).toHaveLength(1);
  await h.completed(await h.prompt("HELLO"));
  const launches = (await h.records()).filter(
    (entry) => entry.args && entry.args.includes("--input-format"),
  );
  expect(launches).toHaveLength(2);
  expect(launches[1].args.slice(-4)).toEqual([
    "--model",
    "gemini-3.8-flash-low",
    "--conversation",
    "e5cf1e2d-c715-4328-8e67-4a85c8dc3cda",
  ]);
  await h.request({
    type: "session.configure",
    requestId: "invalid",
    sessionId: "s",
    changes: { model: "unknown" },
  });
  expect(h.events).toContainEqual(
    expect.objectContaining({
      type: "request.failed",
      requestId: "invalid",
      error: expect.objectContaining({ code: "INVALID_MODEL" }),
    }),
  );
});

it("replays the native transcript before ready, preserving messages and tool results", async () => {
  const h = await harness();
  const conversationId = "history-conversation";
  const directory = path.join(
    h.cwd,
    ".gemini/antigravity-cli/brain",
    conversationId,
    ".system_generated/logs",
  );
  await mkdir(directory, { recursive: true });
  const created_at = "2026-11-05T11:41:54Z";
  const rows = [
    {
      step_index: 0,
      type: "USER_INPUT",
      status: "DONE",
      created_at,
      content:
        "<USER_REQUEST>\n检查页面\n</USER_REQUEST>\n<ADDITIONAL_METADATA>private</ADDITIONAL_METADATA>",
    },
    {
      step_index: 1,
      type: "PLANNER_RESPONSE",
      status: "DONE",
      created_at,
      thinking: "Check the file",
      tool_calls: [{ name: "run_command", args: { CommandLine: "cat proof.txt" } }],
    },
    { step_index: 2, type: "GENERIC", status: "DONE", created_at, content: "proof output" },
    { step_index: 3, type: "PLANNER_RESPONSE", status: "DONE", created_at, content: "检查完成" },
  ];
  await writeFile(
    path.join(directory, "transcript_full.jsonl"),
    rows.map((row) => JSON.stringify(row)).join("\n") + "\n",
  );
  await h.open({ version: 1, data: { conversationId } });
  const items = h.events.filter((event) => event.type === "timeline.item");
  expect(items.map((event) => event.item.type)).toEqual([
    "user_message",
    "reasoning",
    "tool_call",
    "assistant_message",
  ]);
  expect(items[0]).toMatchObject({ timestamp: created_at, item: { text: "检查页面" } });
  expect(items[2]).toMatchObject({
    item: {
      name: "run_command",
      status: "completed",
      detail: { type: "shell", command: "cat proof.txt", output: "proof output" },
    },
  });
  expect(items[3]).toMatchObject({ item: { text: "检查完成" } });
  expect(h.events.at(-1)?.type).toBe("session.ready");
  await h.completed(await h.prompt("RESUME"));
  await h.request({ type: "session.close", sessionId: "s", requestId: "close-history" });
  h.events.length = 0;
  await h.open({ version: 1, data: { conversationId } }, "s", "skip");
  expect(h.events.filter((event) => event.type === "timeline.item")).toEqual([]);
});

it.each(["transcript_full.jsonl", "transcript.jsonl"])(
  "restores %s with stable IDs and reports corrupt history",
  async (filename) => {
    const h = await harness();
    const conversationId = "native-history";
    const directory = path.join(
      h.cwd,
      ".gemini/antigravity-cli/brain",
      conversationId,
      ".system_generated/logs",
    );
    await mkdir(directory, { recursive: true });
    const file = path.join(directory, filename);
    const rows = [
      { step_index: 0, type: "USER_INPUT", status: "DONE", content: "literal <USER_REQUEST> text" },
      {
        step_index: 1,
        type: "PLANNER_RESPONSE",
        status: "DONE",
        tool_calls: [
          { name: "read_file", args: { Path: "/tmp/proof.txt" } },
          { name: "run_command", args: { CommandLine: "false" } },
          { name: "write_file", args: { Path: "/tmp/unfinished.txt" } },
        ],
      },
      { step_index: 2, type: "GENERIC", status: "DONE", content: "file contents" },
      { step_index: 3, type: "GENERIC", status: "ERROR", content: "command failed" },
    ];
    await writeFile(file, rows.map((row) => JSON.stringify(row)).join("\n"));
    await h.open({ version: 1, data: { conversationId } });
    const items = h.events
      .filter((event) => event.type === "timeline.item")
      .map((event) => event.item);
    expect(items).toMatchObject([
      { type: "user_message", text: "literal <USER_REQUEST> text" },
      {
        type: "tool_call",
        status: "completed",
        detail: { type: "read", filePath: "/tmp/proof.txt", content: "file contents" },
      },
      { type: "tool_call", status: "failed", error: "command failed" },
      { type: "tool_call", status: "canceled" },
    ]);
    await h.request({ type: "session.close", sessionId: "s", requestId: "close" });
    h.events.length = 0;
    await h.open({ version: 1, data: { conversationId } });
    expect(
      h.events.filter((event) => event.type === "timeline.item").map((event) => event.item),
    ).toEqual(items);
    await h.request({ type: "session.close", sessionId: "s", requestId: "close-again" });
    h.events.length = 0;
    await writeFile(file, "{broken JSON");
    await h.open({ version: 1, data: { conversationId } });
    expect(h.events).toContainEqual(
      expect.objectContaining({
        type: "request.failed",
        error: expect.objectContaining({ code: "INVALID_HISTORY" }),
      }),
    );
    expect(h.events.filter((event) => event.type === "session.ready")).toEqual([]);
  },
);

it("rejects transcript path traversal before launching a session", async () => {
  const h = await harness();
  await h.open({ version: 1, data: { conversationId: "../../outside" } });
  expect(h.events).toContainEqual(expect.objectContaining({ type: "request.failed" }));
  expect((await h.records()).filter((entry) => entry.args?.includes("--conversation"))).toEqual([]);
});

it("reports missing history and resumes without another system prefix", async () => {
  const first = await harness();
  await first.open();
  await first.completed(await first.prompt("HELLO"));
  const persistence = first.persistence();
  await first.connection.close();
  const second = await harness();
  await second.open(persistence);
  expect(second.events.filter((event) => event.type === "timeline.item")).toEqual([]);
  expect(second.events).toContainEqual(
    expect.objectContaining({
      type: "session.notice",
      notice: expect.objectContaining({ id: "s:history-unavailable" }),
    }),
  );
  await second.completed(await second.prompt("RESUME"));
  expect(
    (await second.records())
      .filter((entry) => entry.input)
      .map((entry) => entry.input.message.content),
  ).toEqual(["RESUME"]);
});

it.each(["auth", "exit", "stderr"])(
  "reports startup %s without waiting for init forever",
  async (startup) => {
    const h = await harness({ AGY_TEST_STARTUP: startup });
    await h.open();
    expect(h.events.filter((event) => event.type === "session.ready")).toEqual([]);
    const failure = h.events.find((event) => event.type === "request.failed");
    expect(failure).toMatchObject({
      type: "request.failed",
      error: {
        message: expect.stringMatching(startup === "exit" ? /exited/ : /Run `agy` and sign in/),
      },
    });
  },
);

it("rejects mid-turn steering and reports a busy message without queueing a second native turn", async () => {
  const h = await harness();
  await h.open();
  await h.prompt("HANG");
  const second = await h.prompt("SECOND");
  expect(
    h.events.find(
      (event) => event.type === "session.prompt_result" && event.clientMessageId === second,
    ),
  ).toMatchObject({
    type: "session.prompt_result",
    result: { type: "failed", error: { code: "TURN_ACTIVE" } },
  });
  await expect(
    h.connection.send({
      type: "session.prompt",
      sessionId: "s",
      prompt: {
        clientMessageId: "steer",
        delivery: "steer",
        input: { type: "message", content: [{ type: "text", text: "x" }] },
      },
    }),
  ).rejects.toThrow(/prompt.steer/);
});

describe("discovery", () => {
  it("reuses one discovered catalog for two opens and configure, and refreshes explicit catalog requests", async () => {
    const h = await harness();
    await h.open();
    await h.open(undefined, "second");
    await h.request({
      type: "session.configure",
      requestId: "configure-cached",
      sessionId: "second",
      changes: { model: "gemini-3.8-flash-low" },
    });
    expect(
      (await h.records()).filter((entry) => entry.args && entry.args.includes("models")),
    ).toHaveLength(1);
    await h.request({ type: "catalog", requestId: "refresh" });
    expect(
      (await h.records()).filter((entry) => entry.args && entry.args.includes("models")),
    ).toHaveLength(2);
  });
  it.each(["1.1.15", "1.2.12", "1.2.13"])("accepts driver-capable version %s", async (version) => {
    const h = await harness({ AGY_TEST_VERSION: version });
    expect(await provider.status?.({ launch: h.launch })).toEqual({ available: true });
  });

  it("parses tab-separated catalog and exposes only full access without thinking options", async () => {
    const h = await harness();
    await h.request({ type: "catalog", requestId: "catalog" });
    const event = h.events[0];
    expect(event).toMatchObject({
      type: "catalog",
      catalog: {
        models: expect.arrayContaining([
          { id: "gemini-3.8-flash-low", label: "Gemini 3.8 Flash (Low)" },
        ]),
        thinkingOptions: [],
        defaultMode: "full-access",
      },
    });
    if (event.type !== "catalog") throw new Error("Missing catalog");
    expect(event.catalog.models).toHaveLength(11);
    expect(event.catalog.modes).toEqual([
      {
        id: "full-access",
        label: "Full access",
        icon: "ShieldOff",
        colorTier: "dangerous",
        isUnattended: true,
        description:
          "Antigravity cannot ask for permission when another app drives it. Paseo starts it with --dangerously-skip-permissions.",
      },
    ]);
  });
  it("reports missing, old, unauthenticated and available launches", async () => {
    expect(await provider.status?.({})).toMatchObject({
      available: false,
      diagnostic: expect.stringContaining("agy not found"),
    });
    const missing = await harness();
    expect(
      await provider.status?.({
        launch: { ...missing.launch, command: path.join(missing.cwd, "missing-agy") },
      }),
    ).toMatchObject({ available: false, diagnostic: expect.stringContaining("ENOENT") });
    const old = await harness({ AGY_TEST_VERSION: "1.1.14" });
    expect(await provider.status?.({ launch: old.launch })).toMatchObject({
      available: false,
      diagnostic: expect.stringContaining("1.1.15"),
    });
    const unauthenticated = await harness({ AGY_TEST_AUTH: "missing" });
    expect(await provider.status?.({ launch: unauthenticated.launch })).toEqual({
      available: false,
      diagnostic: "Antigravity authentication failed. Run `agy` and sign in, then retry.",
    });
    const authenticated = await harness();
    expect(await provider.status?.({ launch: authenticated.launch })).toEqual({ available: true });
  });
  it("keys catalog caching by the complete effective launch without exposing env values", async () => {
    const h = await harness();
    const key = await provider.getCatalogCacheKey?.({ scope: "global", launch: h.launch });
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(
      await provider.getCatalogCacheKey?.({
        scope: "workspace",
        cwd: h.cwd,
        force: true,
        launch: h.launch,
      }),
    ).toBe(key);
    expect(
      await provider.getCatalogCacheKey?.({
        scope: "global",
        launch: { ...h.launch, args: [...h.launch.args, "changed"] },
      }),
    ).not.toBe(key);
    expect(
      await provider.getCatalogCacheKey?.({
        scope: "global",
        launch: { ...h.launch, env: { ...h.launch.env, HOME: "different" } },
      }),
    ).not.toBe(key);
  });
});

describe("process signal plans", () => {
  it.each(["SIGINT", "SIGTERM", "SIGKILL"] as const)("kills the Windows tree for %s", (signal) => {
    expect(signalPlan({ platform: "win32", pid: 123, signal })).toEqual({
      type: "tree",
      command: "taskkill",
      args: ["/PID", "123", "/T", "/F"],
    });
  });
  it.each(["SIGINT", "SIGTERM", "SIGKILL"] as const)(
    "preserves POSIX group signal %s",
    (signal) => {
      expect(signalPlan({ platform: "linux", pid: 123, signal })).toEqual({
        type: "group",
        pid: -123,
        signal,
      });
    },
  );
});

describe("image prompts", () => {
  it.each(["session", "connection"])(
    "encodes mixed content as private session files and cleans up on %s close",
    async (close) => {
      const h = await harness();
      await h.open();
      const png = await readFile(
        new URL("../test/fixtures/image-file-external.png", import.meta.url),
      );
      const jpeg = Buffer.from("image file bytes");
      await h.completed(
        await h.message([
          { type: "text", text: "Describe these images." },
          { type: "image", data: png.toString("base64"), mimeType: "image/png" },
          { type: "text", text: "Compare them." },
          { type: "image", data: jpeg.toString("base64"), mimeType: "image/jpeg" },
        ]),
      );
      const sent = (await h.records()).find((entry) => entry.input).input.message.content;
      const lines = sent.split("\n");
      const pngPath = lines[3].slice("Attached image: ".length);
      const jpegPath = lines[5].slice("Attached image: ".length);
      expect(sent).toBe(
        `SYSTEM PREFIX\n\nDescribe these images.\nAttached image: ${pngPath}\nCompare them.\nAttached image: ${jpegPath}`,
      );
      expect(path.isAbsolute(pngPath)).toBe(true);
      expect(path.extname(pngPath)).toBe(".png");
      expect(path.extname(jpegPath)).toBe(".jpg");
      expect(path.dirname(pngPath)).toBe(path.dirname(jpegPath));
      expect(path.dirname(pngPath)).not.toBe(h.cwd);
      expect(await readFile(pngPath)).toEqual(png);
      expect(await readFile(jpegPath)).toEqual(jpeg);
      if (process.platform !== "win32") {
        expect((await stat(path.dirname(pngPath))).mode & 0o777).toBe(0o700);
        expect((await stat(pngPath)).mode & 0o777).toBe(0o600);
        expect((await stat(jpegPath)).mode & 0o777).toBe(0o600);
      }
      const args = (await h.records()).find((entry) => entry.args?.includes("--input-format")).args;
      expect(args.filter((arg: string) => arg === "--add-dir")).toHaveLength(1);
      if (close === "connection") await h.connection.close();
      else await h.request({ type: "session.close", requestId: "close-images", sessionId: "s" });
      await expect(stat(path.dirname(pngPath))).rejects.toMatchObject({ code: "ENOENT" });
    },
  );

  it("keeps image-only prompts in distinct session directories until each session closes", async () => {
    const h = await harness();
    await h.open();
    await h.open(undefined, "other");
    const content: ProviderContent[] = [
      { type: "image", data: "aW1hZ2U=", mimeType: "image/webp" },
    ];
    await h.completed(await h.message(content));
    await h.completed(await h.message(content));
    await h.completed(await h.message(content, "other"));
    const paths = (await h.records())
      .filter((entry) => entry.input)
      .map((entry) => entry.input.message.content.split("Attached image: ")[1]);
    expect(new Set(paths).size).toBe(3);
    expect(path.dirname(paths[0])).toBe(path.dirname(paths[1]));
    expect(path.dirname(paths[0])).not.toBe(path.dirname(paths[2]));
    expect(paths.every((file: string) => path.extname(file) === ".webp")).toBe(true);
    await h.request({ type: "session.close", requestId: "close-first", sessionId: "s" });
    await expect(stat(path.dirname(paths[0]))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(paths[2], "utf8")).toBe("image");
    await h.connection.close();
    await expect(stat(path.dirname(paths[2]))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects a non-image MIME type before writing to native stdin", async () => {
    const h = await harness();
    await h.open();
    const id = await h.message([{ type: "image", data: "dGV4dA==", mimeType: "text/plain" }]);
    expect(
      h.events.find(
        (event) => event.type === "session.prompt_result" && event.clientMessageId === id,
      ),
    ).toMatchObject({
      result: { type: "failed", error: { message: expect.stringContaining("image MIME type") } },
    });
    expect((await h.records()).filter((entry) => entry.input)).toHaveLength(0);
  });
});

it.runIf(process.platform === "win32")(
  "launches an Antigravity command shim for probes and conversation startup",
  async () => {
    const h = await harness();
    const shim = path.join(h.cwd, "agy launcher.cmd");
    await writeFile(shim, `@echo off\r\n"${process.execPath}" "${fake}" %*\r\n`);
    h.launch.command = shim;
    h.launch.args = ["--launch-prefix"];
    expect(await provider.status!({ launch: h.launch })).toEqual({ available: true });
    await h.open();
    expect(await h.wait((event) => event.type === "session.opened")).toMatchObject({
      sessionId: "s",
    });
  },
);
