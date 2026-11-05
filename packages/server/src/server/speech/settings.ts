import type { SpeechSettings, SpeechSettingsPatch } from "@getpaseo/protocol/speech-config";
import { SpeechSttConfigSchema, type PersistedConfig } from "../persisted-config.js";
import { STEP_PLAN_ASR_MODEL, STEP_PLAN_BASE_URL } from "./providers/stepfun/config.js";

export function resolveVoiceAssistantConfig(persisted: PersistedConfig, env: NodeJS.ProcessEnv) {
  const config = persisted.features?.voiceMode?.assistant ?? {};
  return {
    service: config.service ?? "official",
    enabled: config.enabled ?? config.service !== "custom",
    model: config.model ?? "stepaudio-2.5-realtime",
    maxSessionMinutes: config.maxSessionMinutes ?? 60,
    voice: config.voice ?? "cixingnansheng",
    baseUrl: config.baseUrl ?? "wss://api.stepfun.com/step_plan/v1/realtime",
    apiKey: config.apiKey || persisted.providers?.stepfun?.apiKey || env.STEP_API_KEY?.trim() || "",
  };
}

function readDictationSettings(persisted: PersistedConfig): SpeechSettings["dictation"] {
  const dictation = persisted.features?.dictation;
  const provider = dictation?.stt?.provider ?? "local";
  const defaultModels = {
    local: "parakeet-tdt-0.6b-v2-int8",
    openai: "whisper-1",
    stepfun: STEP_PLAN_ASR_MODEL,
  };
  return {
    service: dictation?.service ?? "official",
    enabled: dictation?.enabled ?? true,
    provider,
    model: dictation?.stt?.model ?? defaultModels[provider],
    language: dictation?.stt?.language ?? "en",
  };
}

function readOpenAiEndpoint(
  persisted: PersistedConfig,
  env: NodeJS.ProcessEnv,
): SpeechSettings["openai"] {
  const openai = persisted.providers?.openai;
  const { stt: legacy = {}, ...shared } = openai ?? {};
  const site = persisted.features?.dictation?.stt;
  const stt = site?.provider === "openai" ? site : legacy;
  return {
    baseUrl:
      stt.baseUrl ||
      env.OPENAI_STT_BASE_URL?.trim() ||
      shared.baseUrl ||
      env.OPENAI_BASE_URL?.trim() ||
      "https://api.openai.com/v1",
    hasApiKey: Boolean(
      stt.apiKey || env.OPENAI_STT_API_KEY?.trim() || shared.apiKey || env.OPENAI_API_KEY?.trim(),
    ),
  };
}

function readStepEndpoint(
  persisted: PersistedConfig,
  env: NodeJS.ProcessEnv,
): SpeechSettings["stepfun"] {
  const stepfun = persisted.providers?.stepfun;
  return {
    baseUrl: stepfun?.baseUrl || env.STEP_STT_BASE_URL?.trim() || STEP_PLAN_BASE_URL,
    hasApiKey: Boolean(stepfun?.apiKey || env.STEP_API_KEY?.trim()),
  };
}

export function readSpeechSettings(
  persisted: PersistedConfig,
  env: NodeJS.ProcessEnv,
): SpeechSettings {
  const { apiKey, ...assistant } = resolveVoiceAssistantConfig(persisted, env);
  return {
    assistant: { ...assistant, hasApiKey: Boolean(apiKey) },
    dictation: readDictationSettings(persisted),
    openai: readOpenAiEndpoint(persisted, env),
    stepfun: readStepEndpoint(persisted, env),
  };
}

function applyDictationSettings(persisted: PersistedConfig, patch: SpeechSettingsPatch) {
  const current = persisted.features?.dictation;
  const { enabled, service, ...stt } = patch.dictation ?? {};
  const provider = stt.provider ?? current?.stt?.provider ?? "local";
  const previous = provider === current?.stt?.provider ? current.stt : {};
  const endpoint = provider === "openai" ? patch.openai : undefined;
  return {
    ...current,
    ...(enabled !== undefined ? { enabled } : {}),
    ...(service !== undefined ? { service } : {}),
    stt: SpeechSttConfigSchema.parse({ ...previous, ...stt, ...endpoint, provider }),
  };
}

export function applySpeechSettings(
  persisted: PersistedConfig,
  patch: SpeechSettingsPatch,
): PersistedConfig {
  const { dictation, openai, stepfun, assistant } = patch;
  const features = { ...persisted.features };
  if (assistant)
    features.voiceMode = {
      ...features.voiceMode,
      assistant: { ...features.voiceMode?.assistant, ...assistant },
    };
  if (dictation || (openai && features.dictation?.stt?.provider === "openai")) {
    features.dictation = applyDictationSettings(persisted, patch);
  }
  return {
    ...persisted,
    features,
    providers: {
      ...persisted.providers,
      ...(openai
        ? {
            openai: {
              ...persisted.providers?.openai,
              stt: { ...persisted.providers?.openai?.stt, ...openai },
            },
          }
        : {}),
      ...(stepfun ? { stepfun: { ...persisted.providers?.stepfun, ...stepfun } } : {}),
    },
  };
}
