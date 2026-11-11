import { afterEach, expect, test, vi } from "vitest";
import { createTranslationQueue } from "../client/queue.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTranslator } from "./translator.js";
import { protectLiterals, protectFields } from "./literals.js";
import type { TranslationRequest } from "./generation.js";
import { createModelTranslator } from "./generation.js";
import { preferences, configuredPreferencesSchema } from "../shared/contracts.js";
import { enqueueTranslation } from "../client/queue.js";
import { createReplyQueue } from "../client/replies.js";

const directories: string[] = [];
const settings = { provider: "claude", model: "translation-test" } as const;
afterEach(async () => {
  vi.useRealTimers();
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

test("history backlog expires before spending minutes starting more model sessions", async () => {
  vi.useFakeTimers();
  const queue = createTranslationQueue();
  const starts: number[] = [];
  const results = Array.from({ length: 40 }, (_, index) =>
    queue
      .enqueue({
        signal: new AbortController().signal,
        onStart() {
          starts.push(index);
        },
        run: () => new Promise<string>((resolve) => setTimeout(() => resolve("译文"), 5_000)),
      })
      .catch((error: Error) => error.message),
  );
  await vi.advanceTimersByTimeAsync(15_001);
  expect(await results[39]).toBe("等待翻译超时，请点击重试翻译");
  expect(starts).toEqual([0, 1, 2]);
  expect(await results[0]).toBe("译文");
  queue.close();
});

test("canceling an active row frees its UI but preserves the host slot until the RPC settles", async () => {
  const queue = createTranslationQueue();
  const active = new AbortController();
  let finish: (text: string) => void = () => {
    throw new Error("RPC has not started");
  };
  const starts: string[] = [];
  const first = queue
    .enqueue({
      signal: active.signal,
      onStart() {
        starts.push("first");
      },
      run: () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    })
    .catch((error: Error) => error.message);
  const second = queue.enqueue({
    signal: new AbortController().signal,
    onStart() {
      starts.push("second");
    },
    run: async () => "新的译文",
  });
  await Promise.resolve();
  active.abort();
  expect(await first).toBe("翻译已取消");
  expect(starts).toEqual(["first"]);
  finish("旧的译文");
  expect(await second).toBe("新的译文");
  expect(starts).toEqual(["first", "second"]);
  queue.close();
});

test("plugin teardown cancels queued work without starting another RPC", async () => {
  const queue = createTranslationQueue();
  const run = vi.fn(async () => "译文");
  const result = queue.enqueue({ signal: new AbortController().signal, onStart() {}, run });
  queue.close();
  await expect(result).rejects.toThrow("翻译已取消");
  expect(run).not.toHaveBeenCalled();
  await expect(
    queue.enqueue({ signal: new AbortController().signal, onStart() {}, run }),
  ).rejects.toThrow("翻译已取消");
});

async function createTestTranslator(translate: (request: TranslationRequest) => Promise<string>) {
  const directory = await mkdtemp(join(tmpdir(), "translation-test-"));
  directories.push(directory);
  return { directory, translator: createTranslator({ directory, translate }) };
}

test("code fences, inline commands, paths, nested JSON and URLs survive translation byte for byte", () => {
  const source =
    '请修改 src/中文.ts 和 `npm test`。\n```json\n{"a":{"b":"中文"}}\n```\n配置 {"用户": ["中文", {"路径":"/tmp/中文"}]}\nhttps://example.com/test\nnpm run build';
  const protectedText = protectLiterals(source);
  expect(protectedText.prose).not.toContain("npm");
  expect(protectedText.prose).not.toContain("中文.ts");
  expect(protectedText.prose).not.toContain("用户");
  expect(protectedText.restore(protectedText.text.replace("请修改", "Change"))).toBe(
    source.replace("请修改", "Change"),
  );
});

test("missing, duplicated and invented literal markers reject the translation", () => {
  const protectedText = protectLiterals("修改 `git status`");
  expect(() => protectedText.restore("Change it")).toThrow("标记");
  expect(() => protectedText.restore(`${protectedText.text} PASEO_LITERAL_0_END`)).toThrow("标记");
  expect(() => protectedText.restore(`${protectedText.text} PASEO_LITERAL_99_END`)).toThrow("标记");
});

test("a source marker is not confused with a generated literal", () => {
  const source = "修改 PASEO_LITERAL_0_END 和 `abc`";
  const protectedText = protectLiterals(source);
  expect(protectedText.restore(protectedText.text)).toBe(source);
});

test("unfinished code fences remain literal and moving commands is rejected", () => {
  const source = "说明\n```ts\nconst 文本 = '中文';";
  const protectedText = protectLiterals(source);
  expect(protectedText.prose).not.toContain("const");
  expect(protectedText.restore(protectedText.text)).toBe(source);
  const commands = protectLiterals("先 `git add .` 后 `git commit`");
  expect(() => commands.restore("First PASEO_LITERAL_1_END then PASEO_LITERAL_0_END")).toThrow(
    "标记",
  );
});

test("input sends English and persists the original outside the agent context", async () => {
  const { translator, directory } = await createTestTranslator(async ({ text }) =>
    text.replace("请修改", "Please change"),
  );
  const original = "请修改 `app.ts`";
  const sent = await translator.input({
    agentId: "agent-a",
    text: original,
    settings,
    signal: new AbortController().signal,
  });
  expect(sent).toContain("Please change `app.ts`");
  expect(sent).not.toContain("请修改");
  expect(sent).toContain("Respond in English");
  const reloaded = createTranslator({
    directory,
    translate: async () => {
      throw new Error("must not translate");
    },
  });
  expect(await reloaded.original({ agentId: "agent-a", text: sent })).toBe(original);
  expect(await reloaded.original({ agentId: "agent-b", text: sent })).toBeNull();
});

test("slash commands and code-only passages never invoke the model", async () => {
  const { translator } = await createTestTranslator(async () => {
    throw new Error("must not translate");
  });
  const signal = new AbortController().signal;
  expect(await translator.input({ agentId: "a", text: "/review 检查", settings, signal })).toBe(
    "/review 检查",
  );
  expect(
    await translator.translate('```json\n{"中文":true}\n```', "Simplified Chinese", settings),
  ).toBe('```json\n{"中文":true}\n```');
});

test("translation failure rejects the send instead of forwarding Chinese; retry is not cached", async () => {
  let calls = 0;
  const { translator } = await createTestTranslator(async () => {
    calls++;
    if (calls === 1) throw new Error("model unavailable");
    return "Change it";
  });
  const signal = new AbortController().signal;
  await expect(
    translator.input({ agentId: "a", text: "请修改", settings, signal }),
  ).rejects.toThrow("model unavailable");
  expect(await translator.input({ agentId: "a", text: "请修改", settings, signal })).toContain(
    "Change it",
  );
  expect(calls).toBe(2);
});

test("different user messages with identical English translations retain their own originals", async () => {
  const { translator } = await createTestTranslator(async () => "Change it");
  const signal = new AbortController().signal;
  const first = await translator.input({
    agentId: "a",
    clientMessageId: "first",
    text: "请修改",
    settings,
    signal,
  });
  const second = await translator.input({
    agentId: "a",
    clientMessageId: "second",
    text: "改一下",
    settings,
    signal,
  });
  expect(first).toBe(second);
  expect(await translator.original({ agentId: "a", clientMessageId: "first", text: first })).toBe(
    "请修改",
  );
  expect(await translator.original({ agentId: "a", clientMessageId: "second", text: second })).toBe(
    "改一下",
  );
});

test("identical simultaneous requests share work; changing model invalidates the cache", async () => {
  let calls = 0;
  const { translator } = await createTestTranslator(async () => {
    calls++;
    return "你好";
  });
  await Promise.all([
    translator.translate("Hello", "Simplified Chinese", settings),
    translator.translate("Hello", "Simplified Chinese", settings),
  ]);
  await translator.translate("Hello", "Simplified Chinese", settings);
  expect(calls).toBe(1);
  await translator.translate("Hello", "Simplified Chinese", { ...settings, model: "another" });
  expect(calls).toBe(2);
});

test("fresh hosts have no selected CLI or model", () => {
  const empty = preferences.schema.parse({});
  expect(empty).toEqual({ provider: "", model: "" });
  expect(configuredPreferencesSchema.safeParse(empty).success).toBe(false);
  expect(configuredPreferencesSchema.safeParse({ provider: "codex", model: "" }).success).toBe(
    false,
  );
  expect(configuredPreferencesSchema.safeParse({ provider: "", model: "any-model" }).success).toBe(
    false,
  );
});

test.each(["grok", "opencode", "pi", "my-custom-provider"])(
  "translation settings retain the host provider %s",
  (provider) => {
    const selection = { provider, model: "vendor/model-v1" };
    expect(preferences.schema.parse(selection)).toEqual(selection);
    expect(configuredPreferencesSchema.parse(selection)).toEqual(selection);
  },
);

test.each(["grok", "claude", "codex", "my-custom-provider"])(
  "translation executes the selected %s model through the host",
  async (provider) => {
    const signal = new AbortController().signal;
    const translate = createModelTranslator(async (request, options) => {
      expect(request.provider).toBe(provider);
      expect(request.model).toBe("vendor/model-v1");
      expect(request.sessionKey).toBe("agent-translation");
      expect(request.prompt).toContain("Source text:\nHello PASEO_LITERAL_0_END");
      expect(request.prompt).toContain("Target language: Simplified Chinese");
      expect(options?.signal).toBe(signal);
      return "你好 PASEO_LITERAL_0_END";
    });
    await expect(
      translate({
        provider,
        model: "vendor/model-v1",
        text: "Hello PASEO_LITERAL_0_END",
        sessionKey: "agent-translation",
        target: "Simplified Chinese",
        signal,
      }),
    ).resolves.toBe("你好 PASEO_LITERAL_0_END");
  },
);

test("translation rejects empty model output and hides provider diagnostics", async () => {
  const request: TranslationRequest = {
    provider: "grok",
    model: "test",
    text: "Hello",
    target: "Simplified Chinese",
    signal: new AbortController().signal,
  };
  const malformed = createModelTranslator(async () => "  ");
  await expect(malformed(request)).rejects.toThrow("翻译失败");
  const failure = createModelTranslator(async () => {
    throw new Error("secret credential and private source text");
  });
  await expect(failure(request)).rejects.toThrow(
    /^翻译失败或超时：请检查主机上的 Provider 登录、模型和网络，或选择更快的模型$/,
  );
});

test("question fields translate together while preserving boundaries and code", async () => {
  let calls = 0;
  const { translator } = await createTestTranslator(async ({ text }) => {
    calls++;
    return text
      .replace("Entity", "主体")
      .replace("Where registered?", "在哪里注册？")
      .replace("Mainland China", "中国大陆");
  });
  const fields = ["Entity", "Where registered?", "Mainland China", "`GDPR`", ""];
  const expected = ["主体", "在哪里注册？", "中国大陆", "`GDPR`", ""];
  expect(await translator.fields(fields, settings)).toEqual(expected);
  expect(await translator.fields(fields, settings)).toEqual(expected);
  expect(calls).toBe(1);
});

test("non-Latin replies translate and typographic English does not waste an input request", async () => {
  let calls = 0;
  const { translator } = await createTestTranslator(async () => {
    calls++;
    return "你好";
  });
  expect(await translator.translate("こんにちは", "Simplified Chinese", settings)).toBe("你好");
  expect(await translator.translate("Привет", "Simplified Chinese", settings)).toBe("你好");
  expect(await translator.translate("你好。", "Simplified Chinese", settings)).toBe("你好。");
  expect(await translator.translate("It’s ready — continue…", "English", settings)).toBe(
    "It’s ready — continue…",
  );
  expect(calls).toBe(2);
});

test("interactive translations bypass queued history and canceled work never starts", async () => {
  const order: string[] = [];
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const signal = new AbortController().signal;
  const first = enqueueTranslation(async () => {
    order.push("first");
    await gate;
  }, signal);
  const history = enqueueTranslation(async () => {
    order.push("history");
  }, signal);
  const canceled = new AbortController();
  const skipped = enqueueTranslation(async () => {
    order.push("canceled");
  }, canceled.signal);
  const rejected = expect(skipped).rejects.toThrow("翻译已取消");
  canceled.abort();
  const question = enqueueTranslation(
    async () => {
      order.push("question");
    },
    signal,
    true,
  );
  finish();
  await Promise.all([first, history, question, rejected]);
  expect(order).toEqual(["first", "question", "history"]);
});

test("missing question text rejects instead of caching an empty choice", async () => {
  let calls = 0;
  const { translator } = await createTestTranslator(async ({ text }) =>
    ++calls === 1 ? text.replace("Mainland China", "") : text.replace("Mainland China", "中国大陆"),
  );
  await expect(translator.fields(["Entity", "Mainland China"], settings)).rejects.toThrow("丢失");
  expect(await translator.fields(["Entity", "Mainland China"], settings)).toEqual([
    "Entity",
    "中国大陆",
  ]);
  expect(calls).toBe(2);
});

test("an unclosed code fence in one question field cannot swallow the next field", async () => {
  const { translator } = await createTestTranslator(async ({ text }) =>
    text.replace("Mainland China", "中国大陆"),
  );
  expect(
    await translator.fields(["```ts\nconst entity = 'CN';", "Mainland China"], settings),
  ).toEqual(["```ts\nconst entity = 'CN';", "中国大陆"]);
});

test("large code-only replies bypass the model and canceled requests cannot return cached content", async () => {
  let calls = 0;
  const { translator } = await createTestTranslator(async () => {
    calls++;
    return "你好";
  });
  const code = "```txt\n" + "literal ".repeat(4000) + "\n```";
  expect(await translator.translate(code, "Simplified Chinese", settings)).toBe(code);
  expect(calls).toBe(0);
  await translator.translate("Hello", "Simplified Chinese", settings);
  const canceled = new AbortController();
  canceled.abort();
  await expect(
    translator.translate("Hello", "Simplified Chinese", settings, canceled.signal),
  ).rejects.toThrow();
  expect(calls).toBe(1);
});

test("batched translation rejects missing or reordered fields and invented literal markers", () => {
  const fields = protectFields(["Entity `name`", "Country", "Hosting"]);
  expect(() => fields.restore(fields.text.replace("PASEO_LITERAL_BOUNDARY_0_END", ""))).toThrow(
    "顺序",
  );
  expect(() =>
    fields.restore(
      fields.text.replace("PASEO_LITERAL_BOUNDARY_0_END", "PASEO_LITERAL_BOUNDARY_1_END"),
    ),
  ).toThrow("顺序");
  expect(() => fields.restore(fields.text + " PASEO_LITERAL_FIELD_999_0_END")).toThrow("标记");
});

test("Grok translation uses low effort while retaining the selected model and conversation key", async () => {
  const translate = createModelTranslator(async (request) => {
    expect(request).toMatchObject({
      provider: "grok",
      model: "grok-4.7",
      thinkingOptionId: "low",
      sessionKey: "agent-1",
    });
    return "你好";
  });
  await expect(
    translate({
      provider: "grok",
      model: "grok-4.7",
      target: "Simplified Chinese",
      text: "Hello",
      signal: new AbortController().signal,
      sessionKey: "agent-1",
    }),
  ).resolves.toBe("你好");
});

test("complete replies share one request without splitting paragraphs or mixing conversations", async () => {
  vi.useFakeTimers();
  const queue = createReplyQueue();
  const translate = vi.fn(async ({ texts }: { texts: string[] }) => ({
    texts: texts.map((text) => `译文：${text}`),
  }));
  const signal = new AbortController().signal;
  const first = queue.enqueue({
    agentId: "one",
    text: "First paragraph.\n\nSecond paragraph.",
    signal,
    onStart() {},
    translate,
  });
  const second = queue.enqueue({
    agentId: "one",
    text: "Another complete message.",
    signal,
    onStart() {},
    translate,
  });
  const other = queue.enqueue({
    agentId: "two",
    text: "Other conversation.",
    signal,
    onStart() {},
    translate,
  });
  expect(translate).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(25);
  await expect(first).resolves.toEqual({ text: "译文：First paragraph.\n\nSecond paragraph." });
  await expect(second).resolves.toEqual({ text: "译文：Another complete message." });
  await expect(other).resolves.toEqual({ text: "译文：Other conversation." });
  expect(translate.mock.calls.map(([request]) => request)).toEqual([
    {
      agentId: "one",
      texts: ["First paragraph.\n\nSecond paragraph.", "Another complete message."],
    },
    { agentId: "two", texts: ["Other conversation."] },
  ]);
  queue.close();
});

test("canceling one pending reply does not cancel the other replies in its batch", async () => {
  vi.useFakeTimers();
  const queue = createReplyQueue();
  const translate = vi.fn(async ({ texts }: { texts: string[] }) => ({ texts }));
  const controller = new AbortController();
  const canceled = queue.enqueue({
    agentId: "one",
    text: "Canceled.",
    signal: controller.signal,
    onStart() {},
    translate,
  });
  const rejected = expect(canceled).rejects.toThrow("翻译已取消");
  const result = queue.enqueue({
    agentId: "one",
    text: "Keep this reply.",
    signal: new AbortController().signal,
    onStart() {},
    translate,
  });
  controller.abort();
  await vi.advanceTimersByTimeAsync(25);
  await rejected;
  await expect(result).resolves.toEqual({ text: "Keep this reply." });
  expect(translate).toHaveBeenCalledWith({ agentId: "one", texts: ["Keep this reply."] });
  queue.close();
});

test("batched translation keeps message boundaries and protected code with one model call", async () => {
  const calls: TranslationRequest[] = [];
  const translator = createTranslator({
    directory: "/unused",
    translate: async (request) => {
      calls.push(request);
      return request.text.replace("First", "第一条").replace("Second", "第二条");
    },
  });
  const texts = ["First\n\n`npm run lint`", "Second\n\nhttps://example.com"];
  try {
    await expect(translator.replies(texts, settings, "agent-1")).resolves.toEqual([
      "第一条\n\n`npm run lint`",
      "第二条\n\nhttps://example.com",
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sessionKey).toBe("agent-1");
    await translator.replies(texts, settings, "agent-1");
    expect(calls).toHaveLength(1);
  } finally {
    translator.close();
  }
});

test("translation direction changes reuse launch instructions and only translate the current input", async () => {
  const requests: Parameters<Parameters<typeof createModelTranslator>[0]>[0][] = [];
  const translate = createModelTranslator(async (request) => {
    requests.push(request);
    return requests.length === 1 ? "Hello" : "你好";
  });
  const common = {
    provider: "grok",
    model: "grok-4.7",
    sessionKey: "agent-1",
    signal: new AbortController().signal,
  };
  await translate({ ...common, text: "你好", target: "English" });
  await translate({ ...common, text: "Hello", target: "Simplified Chinese" });
  expect(requests[0]!.systemPrompt).toBe(requests[1]!.systemPrompt);
  expect(requests[0]!.sessionKey).toBe(requests[1]!.sessionKey);
  expect(requests[0]!.prompt).toContain("Target language: English");
  expect(requests[1]!.prompt).toContain("Target language: Simplified Chinese");
  expect(requests[1]!.prompt).not.toContain("你好");
});

test("process preparation uses the 15-second queue budget and generation still times out after 8 seconds", async () => {
  vi.useFakeTimers();
  const queue = createTranslationQueue();
  const onStart = vi.fn();
  const result = queue.enqueue({
    signal: new AbortController().signal,
    onStart,
    prepare: () => new Promise((resolve) => setTimeout(resolve, 2000)),
    run: () => new Promise(() => {}),
  });
  const rejected = expect(result).rejects.toThrow("翻译超时");
  await vi.advanceTimersByTimeAsync(1999);
  expect(onStart).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(onStart).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(8000);
  await rejected;
  queue.close();
});

test("preparation cannot extend the queue deadline or send a late translation", async () => {
  vi.useFakeTimers();
  const queue = createTranslationQueue();
  const run = vi.fn(async () => "late");
  const result = queue.enqueue({
    signal: new AbortController().signal,
    onStart() {},
    prepare: () => new Promise((resolve) => setTimeout(resolve, 16000)),
    run,
  });
  const rejected = expect(result).rejects.toThrow("等待翻译超时");
  await vi.advanceTimersByTimeAsync(15000);
  await rejected;
  await vi.advanceTimersByTimeAsync(1000);
  expect(run).not.toHaveBeenCalled();
  queue.close();
});
