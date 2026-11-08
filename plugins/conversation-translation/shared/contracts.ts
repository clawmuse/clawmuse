import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const configuredPreferencesSchema = z.object({
  provider: z.string().trim().min(1, "请选择翻译工具").max(200),
  model: z.string().trim().min(1, "请选择翻译模型").max(200),
});

export const preferences = defineSettings({
  id: "translation",
  scope: "host",
  version: 1,
  schema: z.object({
    provider: z.string().trim().max(200).default(""),
    model: z.string().trim().max(200).default(""),
  }),
});

export type Preferences = z.output<typeof configuredPreferencesSchema>;
export const translationRpc = defineRpc({
  name: "translation.reply",
  input: z.object({
    text: z.string().max(100000),
    agentId: z.string().max(200).optional(),
    revision: z.string().optional(),
  }),
  output: z.object({ text: z.string() }),
});
export const fieldsRpc = defineRpc({
  name: "translation.fields.request",
  input: z.object({
    texts: z
      .array(z.string().max(100000))
      .max(256)
      .refine(
        (texts) => texts.reduce((length, text) => length + text.length, 0) <= 100000,
        "翻译内容过长",
      ),
    revision: z.string(),
  }),
  output: z.object({ texts: z.array(z.string()) }),
});
export const repliesRpc = defineRpc({
  name: "translation.replies",
  input: z.object({
    texts: z.array(z.string().max(24000)).min(1).max(16),
    agentId: z.string().min(1).max(200),
    revision: z.string().optional(),
  }),
  output: z.object({ texts: z.array(z.string()).min(1).max(16) }),
});
export const prepareRpc = defineRpc({
  name: "translation.prepare",
  input: z.object({ agentId: z.string().min(1).max(200), revision: z.string().optional() }),
  output: z.object({}),
});
export const originalRpc = defineRpc({
  name: "translation.original",
  input: z.object({
    agentId: z.string(),
    text: z.string().max(100000),
    clientMessageId: z.string().optional(),
  }),
  output: z.object({ text: z.string().nullable() }),
});
export const checkRpc = defineRpc({
  name: "translation.check",
  input: configuredPreferencesSchema,
  output: z.object({ text: z.string() }),
});
export const rowSchema = z.object({
  clientMessageId: z.string().optional(),
  text: z.string(),
  role: z.enum(["user", "assistant"]),
  phase: z.enum(["streaming", "complete"]),
});
