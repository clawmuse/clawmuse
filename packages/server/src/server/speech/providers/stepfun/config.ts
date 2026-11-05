import type { PersistedConfig } from "../../../persisted-config.js";

export const STEP_PLAN_BASE_URL = "https://api.stepfun.com/step_plan/v1";
export const STEP_PLAN_ASR_MODEL = "stepaudio-2.5-asr";

export interface StepSpeechConfig {
  apiKey: string;
  baseUrl: string;
  dictationModel: string;
  voiceModel: string;
}

export function resolveStepSpeechConfig(params: {
  persisted: PersistedConfig;
  env: NodeJS.ProcessEnv;
}): StepSpeechConfig | undefined {
  const { persisted, env } = params;
  const apiKey = persisted.providers?.stepfun?.apiKey?.trim() || env.STEP_API_KEY?.trim();
  if (!apiKey) return undefined;
  return {
    apiKey,
    baseUrl:
      persisted.providers?.stepfun?.baseUrl || env.STEP_STT_BASE_URL?.trim() || STEP_PLAN_BASE_URL,
    dictationModel: persisted.features?.dictation?.stt?.model || STEP_PLAN_ASR_MODEL,
    voiceModel: persisted.features?.voiceMode?.stt?.model || STEP_PLAN_ASR_MODEL,
  };
}
