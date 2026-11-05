import { describe, expect, it } from "vitest";
import { openSpeechForm, openVoiceAssistantForm, ASSISTANT_PRESETS } from "./speech-form-model";
import type { SpeechSettings, SpeechSettingsPatch } from "@getpaseo/protocol/speech-config";

const snapshot: SpeechSettings = {
  dictation: {
    enabled: true,
    provider: "local",
    model: "parakeet-tdt-0.6b-v2-int8",
    language: "en",
  },
  openai: { baseUrl: "http://localhost:9000/v1", hasApiKey: true },
  stepfun: { baseUrl: "https://api.stepfun.com/step_plan/v1", hasApiKey: false },
};

describe("speech settings form", () => {
  it("keeps a stable key reset revision while editing after a successful save", async () => {
    const form = openSpeechForm(snapshot);
    form.setProvider("openai");
    await form.save(async () => {});
    const revision = form.getState().savedRevision;
    form.setEndpoint("openai", { apiKey: "n" });
    expect(form.getState().savedRevision).toBe(revision);
    expect(form.getState().endpoints.openai.apiKey).toBe("n");
  });
  it("preserves the previous service and uses the Plan model and Chinese by default", () => {
    const form = openSpeechForm(snapshot);
    form.setProvider("stepfun");
    expect(form.getState()).toMatchObject({ model: "stepaudio-2.5-asr", language: "zh" });
    form.setProvider("local");
    expect(form.getState()).toMatchObject({ model: snapshot.dictation.model, language: "en" });
    expect(form.getState().endpoints.openai.baseUrl).toBe("http://localhost:9000/v1");
  });

  it("requires a key for a new service and clears it from form state after saving", async () => {
    const form = openSpeechForm(snapshot);
    const patches: SpeechSettingsPatch[] = [];
    const persist = async (patch: SpeechSettingsPatch) => {
      patches.push(patch);
    };
    form.setProvider("stepfun");
    await form.save(persist);
    expect(form.getState().validation).toBe("keyRequired");
    expect(patches).toEqual([]);
    form.setEndpoint("stepfun", { apiKey: "plan-key" });
    await form.save(persist);
    expect(patches).toEqual([
      {
        dictation: {
          service: "custom",
          enabled: true,
          provider: "stepfun",
          model: "stepaudio-2.5-asr",
          language: "zh",
        },
        stepfun: { baseUrl: "https://api.stepfun.com/step_plan/v1", apiKey: "plan-key" },
      },
    ]);
    expect(form.getState()).toMatchObject({
      status: "saved",
      endpoints: { stepfun: { apiKey: "", hasApiKey: true } },
    });
  });

  it("keeps saved keys when changing a custom endpoint and exposes save failures for retry", async () => {
    const form = openSpeechForm(snapshot);
    form.setProvider("openai");
    form.setEndpoint("openai", { baseUrl: "http://localhost:8080/v1" });
    await form.save(async () => {
      throw new Error("Host disconnected");
    });
    expect(form.getState()).toMatchObject({ status: "failed", error: "Host disconnected" });
    const patches: SpeechSettingsPatch[] = [];
    await form.save(async (patch) => {
      patches.push(patch);
    });
    expect(patches[0]?.openai).toEqual({ baseUrl: "http://localhost:8080/v1" });
    expect(form.getState().status).toBe("saved");
  });
});

describe("voice assistant settings", () => {
  const configured = {
    enabled: true,
    ...ASSISTANT_PRESETS.plan,
    voice: "cixingnansheng",
    hasApiKey: true,
    maxSessionMinutes: 60,
  };
  it("keeps Plan routing and saved credentials unless the user changes the preset", async () => {
    const form = openVoiceAssistantForm(configured);
    const patches: SpeechSettingsPatch[] = [];
    await form.save(async (patch) => {
      patches.push(patch);
    });
    expect(patches[0]?.assistant).toEqual({
      service: "official",
      enabled: true,
      ...ASSISTANT_PRESETS.plan,
      voice: "cixingnansheng",
      maxSessionMinutes: 60,
    });
    form.setPreset("preview");
    await form.save(async (patch) => {
      patches.push(patch);
    });
    expect(patches[1]?.assistant).toMatchObject(ASSISTANT_PRESETS.preview);
    expect(patches[1]?.assistant).not.toHaveProperty("apiKey");
  });
  it("saves official voice without requiring or persisting an upstream key", async () => {
    const form = openVoiceAssistantForm({ ...configured, service: "official", hasApiKey: false });
    const patches: SpeechSettingsPatch[] = [];
    await form.save(async (patch) => {
      patches.push(patch);
    });
    expect(form.getState().status).toBe("saved");
    expect(patches[0]?.assistant).toMatchObject({ service: "official", enabled: true });
    expect(patches[0]?.assistant).not.toHaveProperty("apiKey");
  });
  it("validates duration and key, and retains edits after a failed save", async () => {
    const form = openVoiceAssistantForm({ ...configured, service: "custom", hasApiKey: false });
    await form.save(async () => {});
    expect(form.getState().validation).toBe("keyRequired");
    form.setApiKey("test-key");
    form.setMinutes("0");
    await form.save(async () => {});
    expect(form.getState().validation).toBe("assistantInvalid");
    form.setMinutes("45");
    await form.save(async () => {
      throw new Error("Offline");
    });
    expect(form.getState()).toMatchObject({
      status: "failed",
      apiKey: "test-key",
      maxSessionMinutes: "45",
    });
    await form.save(async () => {});
    expect(form.getState()).toMatchObject({ status: "saved", apiKey: "", hasApiKey: true });
  });
});
