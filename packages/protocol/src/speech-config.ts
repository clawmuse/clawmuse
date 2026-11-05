import { z } from "zod";

const SpeechEndpointSchema = z.object({
  baseUrl: z.string(),
  hasApiKey: z.boolean(),
});

const DictationSettingsSchema = z.object({
  service: z.enum(["official", "custom"]).optional(),
  enabled: z.boolean(),
  provider: z.enum(["local", "openai", "stepfun"]),
  model: z.string().min(1),
  language: z.string().min(1),
});

export const VoiceAssistantSettingsSchema = z.object({
  service: z.enum(["official", "custom"]).optional(),
  maxSessionMinutes: z.number().int().min(1).max(480).optional(),
  enabled: z.boolean(),
  model: z.string().min(1),
  voice: z.string().min(1),
  baseUrl: z.string().url(),
  hasApiKey: z.boolean(),
});

export const VoiceAssistantPatchSchema = VoiceAssistantSettingsSchema.omit({ hasApiKey: true })
  .partial()
  .extend({ apiKey: z.string().min(1).optional() });

export const SpeechSettingsSchema = z.object({
  dictation: DictationSettingsSchema,
  assistant: VoiceAssistantSettingsSchema.optional(),
  openai: SpeechEndpointSchema,
  stepfun: SpeechEndpointSchema,
});

const SpeechEndpointPatchSchema = z.object({
  baseUrl: z.string().url().optional(),
  apiKey: z.string().min(1).optional(),
});

export const SpeechSettingsPatchSchema = z.object({
  dictation: DictationSettingsSchema.partial().optional(),
  assistant: VoiceAssistantPatchSchema.optional(),
  openai: SpeechEndpointPatchSchema.optional(),
  stepfun: SpeechEndpointPatchSchema.optional(),
});

export type SpeechSettings = z.infer<typeof SpeechSettingsSchema>;
export type SpeechSettingsPatch = z.infer<typeof SpeechSettingsPatchSchema>;
