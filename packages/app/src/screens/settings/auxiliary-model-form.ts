import type { MutableDaemonConfig, MutableDaemonConfigPatch } from "@getpaseo/protocol/messages";

type Settings = MutableDaemonConfig["metadataGeneration"];
type Model = Settings["providers"][number] & { key: string };
type SaveState = { status: "idle" } | { status: "saving" } | { status: "error"; message: string };

export interface AuxiliaryModelFormState {
  mode: "automatic" | "preferred";
  models: Model[];
  promptPredictions: boolean;
  save: SaveState;
}

interface AuxiliaryModelFormOptions {
  initial: Settings;
  patch: (patch: MutableDaemonConfigPatch) => Promise<MutableDaemonConfig | undefined>;
}

export function openAuxiliaryModelForm(options: AuxiliaryModelFormOptions) {
  let saved = options.initial;
  let closed = false;
  let nextModelKey = 0;
  const listeners = new Set<() => void>();
  function fromSettings(settings: Settings): AuxiliaryModelFormState {
    const mode = settings.providers.length ? "preferred" : "automatic";
    // Keep longer chains already configured through config.json intact.
    const models = settings.providers.map((entry) =>
      Object.assign({ key: `model-${++nextModelKey}` }, entry),
    );
    return {
      mode,
      models,
      promptPredictions: settings.promptPredictions !== false,
      save: { status: "idle" },
    };
  }
  let state = fromSettings(saved);
  function publish(next: AuxiliaryModelFormState) {
    if (closed) return;
    state = next;
    for (const listener of listeners) listener();
  }
  async function save(patch: Partial<Settings>, next: AuxiliaryModelFormState) {
    if (state.save.status === "saving") return;
    publish({ ...next, save: { status: "saving" } });
    try {
      const sanitized = { ...patch };
      if (patch.providers)
        sanitized.providers = patch.providers
          .filter((entry) => entry.provider)
          .map(({ provider, model, thinkingOptionId }) => ({ provider, model, thinkingOptionId }));
      const response = await options.patch({ metadataGeneration: sanitized });
      if (!response) throw new Error("Host disconnected");
      saved = response.metadataGeneration;
      publish(fromSettings(saved));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      publish({ ...fromSettings(saved), save: { status: "error", message } });
    }
  }
  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    applySettings(settings: Settings) {
      if (state.save.status === "saving" || settings === saved) return;
      saved = settings;
      publish(fromSettings(settings));
    },
    setMode(mode: AuxiliaryModelFormState["mode"]) {
      if (state.save.status === "saving") return;
      if (mode === "automatic") {
        void save({ providers: [] }, { ...state, mode, models: [] });
        return;
      }
      const models = state.models.length
        ? state.models
        : [{ provider: "", key: `model-${++nextModelKey}` }];
      publish({ ...state, mode, models });
    },
    addModel() {
      if (
        state.save.status === "saving" ||
        state.models.length >= 3 ||
        state.models.some((model) => !model.provider)
      )
        return;
      publish({
        ...state,
        models: [...state.models, { provider: "", key: `model-${++nextModelKey}` }],
      });
    },
    selectModel(index: number, provider: string, model: string) {
      if (state.save.status === "saving") return;
      const models = [...state.models];
      models[index] = { provider, ...(model ? { model } : {}), key: models[index].key };
      void save({ providers: models }, { ...state, models });
    },
    removeModel(index: number) {
      if (state.save.status === "saving") return;
      const models = state.models.filter((_, position) => position !== index);
      void save({ providers: models }, { ...state, models });
    },
    setPromptPredictions(enabled: boolean) {
      void save({ promptPredictions: enabled }, { ...state, promptPredictions: enabled });
    },
    close() {
      closed = true;
      listeners.clear();
    },
  };
}
