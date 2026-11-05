import { describe, expect, it, vi } from "vitest";
import { MutableDaemonConfigSchema } from "@getpaseo/protocol/messages";
import { openAuxiliaryModelForm } from "./auxiliary-model-form";

function config() {
  return MutableDaemonConfigSchema.parse({ mcp: { injectIntoAgents: false } });
}

describe("auxiliary model settings", () => {
  it("saves predictions without replacing the shared model chain", async () => {
    const initial = config();
    initial.metadataGeneration = { providers: [{ provider: "claude", model: "haiku" }] };
    const response = {
      ...initial,
      metadataGeneration: { ...initial.metadataGeneration, promptPredictions: false },
    };
    const patch = vi.fn(async () => response);
    const form = openAuxiliaryModelForm({ initial: initial.metadataGeneration, patch });
    form.setPromptPredictions(false);
    expect(form.getState().save.status).toBe("saving");
    await Promise.resolve();
    expect(patch).toHaveBeenCalledWith({ metadataGeneration: { promptPredictions: false } });
    expect(form.getState().models[0].model).toBe("haiku");
    expect(form.getState().promptPredictions).toBe(false);
    expect(form.getState().save.status).toBe("idle");
  });

  it("keeps a visible error and restores saved settings after a failed save", async () => {
    const patch = vi.fn(async () => {
      throw new Error("Disconnected");
    });
    const form = openAuxiliaryModelForm({ initial: config().metadataGeneration, patch });
    form.setPromptPredictions(false);
    await Promise.resolve();
    expect(form.getState().save).toEqual({ status: "error", message: "Disconnected" });
    expect(form.getState().promptPredictions).toBe(true);
  });

  it("applies changes from another client without reconstructing the form", () => {
    const initial = config();
    const form = openAuxiliaryModelForm({
      initial: initial.metadataGeneration,
      patch: async () => initial,
    });
    form.setMode("preferred");
    expect(form.getState().models).toHaveLength(1);
    form.applySettings({
      providers: [{ provider: "codex", model: "fast" }],
      promptPredictions: false,
    });
    expect(form.getState().models[0].provider).toBe("codex");
    expect(form.getState().promptPredictions).toBe(false);
  });
});
