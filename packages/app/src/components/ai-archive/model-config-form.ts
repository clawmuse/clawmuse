import type { MutableDaemonConfig, MutableDaemonConfigPatch } from "@getpaseo/protocol/messages";

type MetadataSettings = MutableDaemonConfig["metadataGeneration"];

export interface ArchiveModelItem {
  key: string;
  provider: string;
  model?: string;
  thinkingOptionId?: string;
}

export type AiArchiveSaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "error"; message: string };

export interface AiArchiveModelFormState {
  mode: "default" | "custom";
  models: ArchiveModelItem[];
  save: AiArchiveSaveState;
}

export interface AiArchiveModelFormOptions {
  initial: MetadataSettings;
  patch: (patch: MutableDaemonConfigPatch) => Promise<MutableDaemonConfig | undefined>;
}

function buildWireArchiveProvider(entry: ArchiveModelItem) {
  const result: { provider: string; model?: string; thinkingOptionId?: string } = {
    provider: entry.provider,
  };
  if (entry.model) result.model = entry.model;
  if (entry.thinkingOptionId) result.thinkingOptionId = entry.thinkingOptionId;
  return result;
}

export function openAiArchiveModelForm(options: AiArchiveModelFormOptions) {
  let saved = options.initial;
  let closed = false;
  let nextModelKey = 0;
  const listeners = new Set<() => void>();

  function fromSettings(settings: MetadataSettings): AiArchiveModelFormState {
    const entries = settings.aiArchiveProviders ?? [];
    const mode = entries.length > 0 ? "custom" : "default";
    const models: ArchiveModelItem[] = [];
    for (const entry of entries) {
      const item: ArchiveModelItem = {
        key: `archive-model-${++nextModelKey}`,
        provider: entry.provider,
      };
      if (entry.model) item.model = entry.model;
      if (entry.thinkingOptionId) item.thinkingOptionId = entry.thinkingOptionId;
      models.push(item);
    }
    return { mode, models, save: { status: "idle" } };
  }

  let state = fromSettings(saved);

  function publish(next: AiArchiveModelFormState) {
    if (closed) return;
    state = next;
    for (const listener of listeners) listener();
  }

  async function save(entries: ArchiveModelItem[], next: AiArchiveModelFormState) {
    if (state.save.status === "saving") return;
    publish({ ...next, save: { status: "saving" } });
    try {
      const sanitized = entries.filter((entry) => entry.provider).map(buildWireArchiveProvider);
      const response = await options.patch({
        metadataGeneration: { aiArchiveProviders: sanitized },
      });
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
    applySettings(settings: MetadataSettings) {
      if (state.save.status === "saving" || settings === saved) return;
      saved = settings;
      publish(fromSettings(settings));
    },
    setMode(mode: AiArchiveModelFormState["mode"]) {
      if (state.save.status === "saving") return;
      if (mode === "default") {
        void save([], { ...state, mode, models: [] });
        return;
      }
      const models = state.models.length
        ? state.models
        : [{ provider: "", key: `archive-model-${++nextModelKey}` }];
      publish({ ...state, mode, models });
    },
    addModel() {
      if (
        state.save.status === "saving" ||
        state.models.length >= 3 ||
        state.models.some((model) => !model.provider)
      ) {
        return;
      }
      publish({
        ...state,
        models: [...state.models, { provider: "", key: `archive-model-${++nextModelKey}` }],
      });
    },
    selectModel(index: number, provider: string, model: string) {
      if (state.save.status === "saving" || index < 0 || index >= state.models.length) return;
      const models = [...state.models];
      models[index] = {
        provider,
        ...(model ? { model } : {}),
        key: models[index].key,
      };
      void save(models, { ...state, models });
    },
    removeModel(index: number) {
      if (state.save.status === "saving") return;
      const models = state.models.filter((_, position) => position !== index);
      void save(models, { ...state, models });
    },
    close() {
      closed = true;
      listeners.clear();
    },
  };
}
