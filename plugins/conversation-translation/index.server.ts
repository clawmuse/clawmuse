import type { PluginServerContext } from "@getpaseo/plugin/server";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  checkRpc,
  fieldsRpc,
  originalRpc,
  preferences,
  translationRpc,
  configuredPreferencesSchema,
} from "./shared/contracts.js";
import { createModelTranslator } from "./server/generation.js";
import { createTranslator } from "./server/translator.js";
import { TranslationError } from "./server/literals.js";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(preferences);
  const translator = createTranslator({
    directory: join(
      process.env.PASEO_HOME || join(homedir(), ".paseo"),
      "conversation-translation",
      "originals",
    ),
    translate: createModelTranslator(server.generateText),
  });
  async function readSettings(revision?: string) {
    const current = await settings.read();
    if (current.status !== "ready") throw new TranslationError("会话翻译设置无效，请打开设置修正");
    if (revision !== undefined && revision !== current.revision)
      throw new TranslationError("翻译设置已变更，请使用当前设置重试");
    const configured = configuredPreferencesSchema.safeParse(current.values);
    return configured.success ? configured.data : null;
  }
  const remove = server.before("agent.prompt", async ({ request }, { signal }) => {
    const configured = await readSettings();
    if (!configured) return request;
    return {
      ...request,
      text: await translator.input({ ...request, settings: configured, signal }),
    };
  });
  server.handle(translationRpc, async ({ text, revision }) => {
    const current = await readSettings(revision);
    if (!current) return { text };
    return { text: await translator.translate(text, "Simplified Chinese", current) };
  });
  server.handle(fieldsRpc, async ({ texts, revision }) => {
    const current = await readSettings(revision);
    return { texts: current ? await translator.fields(texts, current) : texts };
  });
  server.handle(originalRpc, async (request) => ({
    text: await translator.original(request),
  }));
  server.handle(checkRpc, async ({ provider, model }) => ({
    text: await translator.translate("The connection is ready.", "Simplified Chinese", {
      provider,
      model,
    }),
  }));
  return () => {
    remove();
    translator.close();
  };
}
