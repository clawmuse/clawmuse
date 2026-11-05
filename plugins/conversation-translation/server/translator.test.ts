import { afterEach, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTranslator } from "./translator.js";
import { protectLiterals, protectFields } from "./literals.js";
import type { TranslationRequest } from "./generation.js";
import { createModelTranslator } from "./generation.js";
import { preferences, configuredPreferencesSchema } from "../shared/contracts.js";
import { enqueueTranslation } from "../client/queue.js";
import { paragraphs } from "../shared/paragraphs.js";

const directories: string[] = [];
const settings = { provider: "claude", model: "translation-test" } as const;
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
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

test("streaming waits for complete paragraphs and never splits fenced code", () => {
  expect(paragraphs("First.\n\nGrowing", "streaming")).toEqual([
    { start: 0, text: "First.\n\n", complete: true },
    { start: 8, text: "Growing", complete: false },
  ]);
  const code = "```ts\nlet x = 1;\n\nlet y = 2;\n```";
  expect(paragraphs(code, "streaming")).toEqual([{ start: 0, text: code, complete: false }]);
  expect(paragraphs(code, "complete")).toEqual([{ start: 0, text: code, complete: true }]);
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
      expect(request.prompt).toContain('"Hello PASEO_LITERAL_0_END"');
      expect(request.systemPrompt).toContain("Simplified Chinese");
      expect(options?.signal).toBe(signal);
      return '```json\n{"translation":"你好 PASEO_LITERAL_0_END"}\n```';
    });
    await expect(
      translate({
        provider,
        model: "vendor/model-v1",
        text: "Hello PASEO_LITERAL_0_END",
        target: "Simplified Chinese",
        signal,
      }),
    ).resolves.toBe("你好 PASEO_LITERAL_0_END");
  },
);

test("translation rejects malformed model output and hides provider diagnostics", async () => {
  const request: TranslationRequest = {
    provider: "grok",
    model: "test",
    text: "Hello",
    target: "Simplified Chinese",
    signal: new AbortController().signal,
  };
  const malformed = createModelTranslator(async () => '{"translation":null}');
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
