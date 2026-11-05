import { z } from "zod";

export const PluginTextGenerationRequestSchema = z.object({
  provider: z.string().trim().min(1).max(200),
  model: z.string().trim().min(1).max(200),
  prompt: z.string().min(1).max(100000),
  systemPrompt: z.string().max(16000).optional(),
});

export type PluginTextGenerationRequest = z.infer<typeof PluginTextGenerationRequestSchema>;

/** Uses the host's configured provider in an isolated, non-persistent session. */
export type PluginTextGenerator = (
  request: PluginTextGenerationRequest,
  options?: { signal?: AbortSignal },
) => Promise<string>;
