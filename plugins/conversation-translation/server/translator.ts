import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { Preferences } from "../shared/contracts.js";
import type { TranslationRequest } from "./generation.js";
import { protectLiterals, protectFields, TranslationError } from "./literals.js";

interface TranslatorOptions {
  directory: string;
  translate(request: TranslationRequest): Promise<string>;
}

interface InputRequest {
  agentId: string;
  text: string;
  clientMessageId?: string;
  settings: Preferences;
  signal: AbortSignal;
}

interface OriginalRequest {
  agentId: string;
  text: string;
  clientMessageId?: string;
}

export function createTranslator(options: TranslatorOptions) {
  const cache = new Map<string, string>();
  const pending = new Map<string, Promise<string>>();
  const lifetime = new AbortController();

  function key(parts: string[]): string {
    return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
  }

  function originalKey({ agentId, text, clientMessageId }: OriginalRequest): string {
    return clientMessageId
      ? key(["message", agentId, clientMessageId])
      : key(["text", agentId, text]);
  }

  async function translate(
    text: string,
    target: TranslationRequest["target"],
    settings: Preferences,
    signal = lifetime.signal,
    sessionKey?: string,
  ): Promise<string> {
    return translateProtected({
      source: text,
      target,
      settings,
      signal,
      protection: protectLiterals(text),
      kind: "text",
      sessionKey,
    });
  }

  async function translateProtected({
    source,
    target,
    settings,
    signal,
    protection,
    kind,
    sessionKey,
  }: {
    source: string;
    target: TranslationRequest["target"];
    settings: Preferences;
    signal: AbortSignal;
    protection: ReturnType<typeof protectLiterals>;
    kind: "text" | "fields";
    sessionKey?: string;
  }): Promise<string> {
    if (!settings.model.trim()) throw new TranslationError("请先在会话翻译设置中选择模型");
    signal.throwIfAborted();
    lifetime.signal.throwIfAborted();
    const letters = protection.prose.match(/\p{L}/gu) ?? [];
    const hasSourceLanguage = letters.some((letter) =>
      target === "English" ? letter.codePointAt(0)! > 127 : !/\p{Script=Han}/u.test(letter),
    );
    if (!hasSourceLanguage) return source;
    if (protection.text.length > 24000) throw new TranslationError("消息太长，请分段发送后再翻译");
    const id = key([kind, settings.provider, settings.model, target, source]);
    const cached = cache.get(id);
    if (cached !== undefined) return cached;
    const existing = pending.get(id);
    if (existing) return existing;
    if (pending.size >= 2) throw new TranslationError("翻译任务繁忙，请稍后重试");
    const request = (async () => {
      const result = await options.translate({
        provider: settings.provider,
        model: settings.model,
        text: protection.text,
        target,
        signal: AbortSignal.any([signal, lifetime.signal]),
        sessionKey,
      });
      signal.throwIfAborted();
      lifetime.signal.throwIfAborted();
      const restored = protection.restore(result);
      if (!restored.trim()) throw new TranslationError("翻译返回了空文本，请重试");
      cache.set(id, restored);
      if (cache.size > 256) cache.delete(cache.keys().next().value!);
      return restored;
    })();
    pending.set(id, request);
    try {
      return await request;
    } finally {
      pending.delete(id);
    }
  }

  return {
    translate,
    async fields(texts: string[], settings: Preferences): Promise<string[]> {
      if (!texts.length) return [];
      const translated = await translateProtected({
        source: JSON.stringify(texts),
        target: "Simplified Chinese",
        settings,
        signal: lifetime.signal,
        protection: protectFields(texts),
        kind: "fields",
      });
      return z.array(z.string()).parse(JSON.parse(translated));
    },
    async replies(texts: string[], settings: Preferences, agentId: string): Promise<string[]> {
      if (texts.length === 1)
        return [await translate(texts[0]!, "Simplified Chinese", settings, undefined, agentId)];
      // Protected inline-code boundaries survive the model's output and keep each
      // complete message in its original timeline position. Stable markers retain caching.
      const boundary = "`PASEO_REPLY_" + key(texts) + "_END`";
      const result = await translate(
        texts.join(`\n\n${boundary}\n\n`),
        "Simplified Chinese",
        settings,
        undefined,
        agentId,
      );
      const parts = result.split(boundary);
      if (parts.length !== texts.length) throw new TranslationError("翻译结果不完整，请重试");
      return parts.map((part) => part.replace(/^\n+|\n+$/g, ""));
    },
    close() {
      lifetime.abort();
      cache.clear();
    },
    async input({ agentId, text, settings, signal, clientMessageId }: InputRequest) {
      if (!text.trim() || text.trimStart().startsWith("/")) return text;
      const translated = await translate(text, "English", settings, signal, agentId);
      const sent = `${translated}\n\nRespond in English; the client translates your replies for display. Preserve the language of requested artifacts and literal content.`;
      const id = originalKey({ agentId, text: sent, clientMessageId });
      await mkdir(options.directory, { recursive: true, mode: 0o700 });
      const temporary = join(options.directory, `${id}.${randomUUID()}.tmp`);
      await writeFile(temporary, JSON.stringify({ text }), { mode: 0o600 });
      await rename(temporary, join(options.directory, `${id}.json`));
      return sent;
    },
    async original(request: OriginalRequest): Promise<string | null> {
      try {
        const content = await readFile(
          join(options.directory, `${originalKey(request)}.json`),
          "utf8",
        );
        return z.object({ text: z.string() }).parse(JSON.parse(content)).text;
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
        throw error;
      }
    },
  };
}
