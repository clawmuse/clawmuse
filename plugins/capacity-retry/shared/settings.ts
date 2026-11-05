import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const preferences = defineSettings({
  id: "retry",
  scope: "host",
  version: 1,
  schema: z.object({
    maxRetries: z.number().int().min(1).max(100).default(3),
    intervalSeconds: z.number().int().min(1).max(86400).default(30),
  }),
});

export type Preferences = z.output<typeof preferences.schema>;
export const noticeSchema = z.object({ text: z.string() });
