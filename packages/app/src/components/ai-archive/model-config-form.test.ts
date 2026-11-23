import { describe, expect, it, vi } from "vitest";
import { MutableDaemonConfigSchema } from "@getpaseo/protocol/messages";
import { openAiArchiveModelForm } from "./model-config-form";

function config() {
  return MutableDaemonConfigSchema.parse({ mcp: { injectIntoAgents: false } });
}

describe("AI archive model settings form", () => {
  it("starts in default mode when aiArchiveProviders is absent or empty", () => {
    const initial = config();
    initial.metadataGeneration = { providers: [{ provider: "claude", model: "haiku" }] };
    const form = openAiArchiveModelForm({
      initial: initial.metadataGeneration,
      patch: async () => initial,
    });
    expect(form.getState().mode).toBe("default");
    expect(form.getState().models).toEqual([]);
  });

  it("saves custom aiArchiveProviders without overwriting shared metadataGeneration fields", async () => {
    const initial = config();
    initial.metadataGeneration = {
      providers: [{ provider: "claude", model: "haiku" }],
      promptPredictions: false,
    };
    const response = {
      ...initial,
      metadataGeneration: {
        ...initial.metadataGeneration,
        aiArchiveProviders: [{ provider: "codex", model: "gpt-5.4-mini" }],
      },
    };
    const patch = vi.fn(async () => response);
    const form = openAiArchiveModelForm({ initial: initial.metadataGeneration, patch });

    form.setMode("custom");
    expect(form.getState().mode).toBe("custom");
    expect(form.getState().models).toHaveLength(1);
    expect(patch).not.toHaveBeenCalled();

    form.selectModel(0, "codex", "gpt-5.4-mini");
    expect(form.getState().save.status).toBe("saving");
    await Promise.resolve();

    expect(patch).toHaveBeenCalledWith({
      metadataGeneration: {
        aiArchiveProviders: [{ provider: "codex", model: "gpt-5.4-mini" }],
      },
    });
    expect(form.getState().mode).toBe("custom");
    expect(form.getState().models[0]).toMatchObject({
      provider: "codex",
      model: "gpt-5.4-mini",
    });
    expect(form.getState().save.status).toBe("idle");
  });

  it("adds and removes fallback models up to three and reverts on save error", async () => {
    const initial = config();
    initial.metadataGeneration = {
      providers: [],
      aiArchiveProviders: [{ provider: "claude", model: "haiku" }],
    };
    const patch = vi.fn(async () => ({
      ...initial,
      metadataGeneration: {
        ...initial.metadataGeneration,
        aiArchiveProviders: [
          { provider: "claude", model: "haiku" },
          { provider: "codex", model: "gpt-5.4-mini" },
        ],
      },
    }));
    const form = openAiArchiveModelForm({ initial: initial.metadataGeneration, patch });
    expect(form.getState().mode).toBe("custom");

    form.addModel();
    expect(form.getState().models).toHaveLength(2);
    form.selectModel(1, "codex", "gpt-5.4-mini");
    await Promise.resolve();
    expect(form.getState().models).toHaveLength(2);

    patch.mockRejectedValueOnce(new Error("Host rejected config"));
    form.setMode("default");
    await Promise.resolve();
    expect(form.getState().save).toEqual({ status: "error", message: "Host rejected config" });
    expect(form.getState().mode).toBe("custom");
    expect(form.getState().models).toHaveLength(2);
  });

  it("resets aiArchiveProviders to empty when switching back to default mode", async () => {
    const initial = config();
    initial.metadataGeneration = {
      providers: [],
      aiArchiveProviders: [{ provider: "claude", model: "haiku" }],
    };
    const patch = vi.fn(async () => ({
      ...initial,
      metadataGeneration: { providers: [], aiArchiveProviders: [] },
    }));
    const form = openAiArchiveModelForm({ initial: initial.metadataGeneration, patch });

    form.setMode("default");
    await Promise.resolve();

    expect(patch).toHaveBeenCalledWith({
      metadataGeneration: { aiArchiveProviders: [] },
    });
    expect(form.getState().mode).toBe("default");
    expect(form.getState().models).toEqual([]);
  });
});
