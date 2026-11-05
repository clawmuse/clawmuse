import type { SpeechSettings, SpeechSettingsPatch } from "@getpaseo/protocol/speech-config";

export type SpeechProvider = SpeechSettings["dictation"]["provider"];
type RemoteSpeechProvider = Exclude<SpeechProvider, "local">;

export const SPEECH_DEFAULTS = {
  local: { model: "parakeet-tdt-0.6b-v2-int8", baseUrl: "", language: "en" },
  openai: { model: "gpt-4o-mini-transcribe", baseUrl: "https://api.openai.com/v1", language: "zh" },
  stepfun: {
    model: "stepaudio-2.5-asr",
    baseUrl: "https://api.stepfun.com/step_plan/v1",
    language: "zh",
  },
};

interface EndpointDraft {
  baseUrl: string;
  apiKey: string;
  hasApiKey: boolean;
  mode: "official" | "custom";
}
interface SpeechFormState {
  service?: "official" | "custom";
  provider: SpeechProvider;
  enabled: boolean;
  model: string;
  language: string;
  endpoints: Record<RemoteSpeechProvider, EndpointDraft>;
  status: "editing" | "saving" | "saved" | "failed";
  error: string | null;
  validation: "keyRequired" | "invalidUrl" | "modelRequired" | null;
  savedRevision: number;
}

export function openSpeechForm(snapshot: SpeechSettings) {
  let state: SpeechFormState = {
    ...snapshot.dictation,
    endpoints: {
      openai: {
        ...snapshot.openai,
        apiKey: "",
        mode: snapshot.openai.baseUrl === SPEECH_DEFAULTS.openai.baseUrl ? "official" : "custom",
      },
      stepfun: {
        ...snapshot.stepfun,
        apiKey: "",
        mode: snapshot.stepfun.baseUrl === SPEECH_DEFAULTS.stepfun.baseUrl ? "official" : "custom",
      },
    },
    status: "editing",
    error: null,
    validation: null,
    savedRevision: 0,
  };
  const selections = new Map<SpeechProvider, { model: string; language: string }>();
  const listeners = new Set<() => void>();
  let closed = false;
  function publish(next: Partial<SpeechFormState>) {
    if (closed) return;
    state = { ...state, status: "editing", error: null, validation: null, ...next };
    for (const listener of listeners) listener();
  }
  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close() {
      closed = true;
      listeners.clear();
    },
    setProvider(provider: SpeechProvider) {
      selections.set(state.provider, { model: state.model, language: state.language });
      const selected = selections.get(provider) ?? SPEECH_DEFAULTS[provider];
      publish({ service: "custom", provider, model: selected.model, language: selected.language });
    },
    setService: (service: "official" | "custom") => publish({ service }),
    setEnabled(enabled: boolean) {
      publish({ enabled });
    },
    setModel(model: string) {
      publish({ model });
    },
    setLanguage(language: string) {
      publish({ language });
    },
    setEndpoint(provider: RemoteSpeechProvider, patch: Partial<EndpointDraft>) {
      publish({
        endpoints: { ...state.endpoints, [provider]: { ...state.endpoints[provider], ...patch } },
      });
    },
    setEndpointMode(provider: RemoteSpeechProvider, mode: "official" | "custom") {
      const baseUrl = mode === "official" ? SPEECH_DEFAULTS[provider].baseUrl : "";
      publish({
        endpoints: {
          ...state.endpoints,
          [provider]: { ...state.endpoints[provider], baseUrl, mode },
        },
      });
    },
    async save(persist: (patch: SpeechSettingsPatch) => Promise<void>) {
      if (state.status === "saving" || closed) return;
      const dictation = {
        service: state.service ?? "official",
        enabled: state.enabled,
        provider: state.provider,
        model: state.model.trim(),
        language: state.language.trim(),
      };
      if (!dictation.model || !dictation.language) {
        publish({ validation: "modelRequired" });
        return;
      }
      const patch: SpeechSettingsPatch = { dictation };
      if (state.service === "custom" && state.provider !== "local") {
        const endpoint = state.endpoints[state.provider];
        if (state.enabled && !endpoint.hasApiKey && !endpoint.apiKey.trim()) {
          publish({ validation: "keyRequired" });
          return;
        }
        try {
          const url = new URL(endpoint.baseUrl.trim());
          if (url.protocol !== "https:" && url.protocol !== "http:")
            throw new Error("invalid protocol");
        } catch {
          publish({ validation: "invalidUrl" });
          return;
        }
        patch[state.provider] = {
          baseUrl: endpoint.baseUrl.trim(),
          ...(endpoint.apiKey.trim() ? { apiKey: endpoint.apiKey.trim() } : {}),
        };
      }
      publish({ status: "saving" });
      try {
        await persist(patch);
        const endpoints = { ...state.endpoints };
        if (state.provider !== "local") {
          const endpoint = endpoints[state.provider];
          endpoints[state.provider] = {
            ...endpoint,
            hasApiKey: endpoint.hasApiKey || Boolean(endpoint.apiKey.trim()),
            apiKey: "",
          };
        }
        publish({ status: "saved", endpoints, savedRevision: state.savedRevision + 1 });
      } catch (error) {
        publish({
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}

export const ASSISTANT_PRESETS = {
  plan: { model: "stepaudio-2.5-realtime", baseUrl: "wss://api.stepfun.com/step_plan/v1/realtime" },
  preview: { model: "stepaudio-3-realtime-preview", baseUrl: "wss://api.stepfun.com/v1/realtime" },
} as const;

export function openVoiceAssistantForm(snapshot: NonNullable<SpeechSettings["assistant"]>) {
  let state = {
    ...snapshot,
    apiKey: "",
    maxSessionMinutes: String(snapshot.maxSessionMinutes ?? 60),
    status: "editing" as "editing" | "saving" | "saved" | "failed",
    error: null as string | null,
    validation: null as "keyRequired" | "assistantInvalid" | null,
    revision: 0,
  };
  const listeners = new Set<() => void>();
  let closed = false;
  function publish(patch: Partial<typeof state>) {
    if (closed) return;
    state = { ...state, status: "editing", error: null, validation: null, ...patch };
    for (const listener of listeners) listener();
  }
  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close() {
      closed = true;
      listeners.clear();
    },
    setEnabled: (enabled: boolean) => publish({ enabled }),
    setPreset: (preset: keyof typeof ASSISTANT_PRESETS) => publish(ASSISTANT_PRESETS[preset]),
    setVoice: (voice: string) => publish({ voice }),
    setApiKey: (apiKey: string) => publish({ apiKey }),
    setMinutes: (maxSessionMinutes: string) => publish({ maxSessionMinutes }),
    setService: (service: "official" | "custom") => publish({ service }),
    async save(persist: (patch: SpeechSettingsPatch) => Promise<void>) {
      if (closed || state.status === "saving") return;
      const minutes = Number(state.maxSessionMinutes);
      if (!state.voice.trim() || !Number.isInteger(minutes) || minutes < 1 || minutes > 480) {
        publish({ validation: "assistantInvalid" });
        return;
      }
      if (state.enabled && state.service === "custom" && !state.hasApiKey && !state.apiKey.trim()) {
        publish({ validation: "keyRequired" });
        return;
      }
      const patch = {
        service: state.service ?? "official",
        enabled: state.enabled,
        model: state.model,
        baseUrl: state.baseUrl,
        voice: state.voice.trim(),
        maxSessionMinutes: minutes,
        ...(state.apiKey.trim() ? { apiKey: state.apiKey.trim() } : {}),
      };
      publish({ status: "saving" });
      try {
        await persist({ assistant: patch });
        publish({
          status: "saved",
          hasApiKey: state.hasApiKey || Boolean(patch.apiKey),
          apiKey: "",
          revision: state.revision + 1,
        });
      } catch (error) {
        publish({
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}
