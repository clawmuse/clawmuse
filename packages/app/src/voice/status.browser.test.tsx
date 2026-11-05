import React, { act } from "react";
import { page } from "vitest/browser";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VoiceProvider } from "@/contexts/voice-context";
import { VoiceAssistantPanel } from "@/components/voice-assistant-panel";
import { useAssistantPanel } from "./assistant-panel-store";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n } from "@/i18n/i18next";
import { RealtimeVoiceStatus } from "./status";
import { createAudioEngine } from "@/audio/audio-engine.web";
import { createVoiceRuntime, type VoiceRuntime, type VoiceRuntimeSnapshot } from "./voice-runtime";

let root: Root;
let container: HTMLDivElement;
let runtime: VoiceRuntime;
let unsubscribe: () => void;
let uploadError: Error | null;
function renderSnapshot(snapshot: VoiceRuntimeSnapshot) {
  act(() => root.render(<RealtimeVoiceStatus snapshot={snapshot} />));
}
beforeEach(async () => {
  uploadError = null;
  vi.stubGlobal("React", React);
  await i18n.changeLanguage("zh-CN");
  container = document.createElement("div");
  container.style.width = "360px";
  document.body.appendChild(container);
  root = createRoot(container);
  runtime = createVoiceRuntime({
    engine: {
      initialize: async () => {},
      destroy: async () => {},
      streamPcm: async () => {},
      startCapture: async () => {},
      stopCapture: async () => {},
      toggleMute: () => true,
      isMuted: () => false,
      play: async () => 0,
      stop: () => {},
      clearQueue: () => {},
      isPlaying: () => false,
    },
    getServerInfo: () => ({
      serverId: "host",
      hostname: "host",
      version: "1.0.0",
      features: { voiceAssistant: true },
      capabilities: {
        voice: { voice: { enabled: true, reason: "" }, dictation: { enabled: true, reason: "" } },
      },
    }),
    activateKeepAwake: async () => {},
    deactivateKeepAwake: async () => {},
  });
  runtime.registerSession({
    serverId: "host",
    setVoiceMode: async () => {},
    sendVoiceAudioChunk: async () => {
      if (uploadError) throw uploadError;
    },
    audioPlayed: async () => {},
    abortRequest: async () => {},
    setAssistantAudioPlaying: () => {},
  });
  unsubscribe = runtime.subscribe(() =>
    root.render(<RealtimeVoiceStatus snapshot={runtime.getSnapshot()} />),
  );
  await act(() => runtime.startVoice("host", "agent"));
});
afterEach(async () => {
  unsubscribe();
  await runtime.destroy();
  act(() => root.unmount());
  container.remove();
  await i18n.changeLanguage("en");
  vi.unstubAllGlobals();
});

it("shows listening, recognition, the full transcript, thinking and reading in the browser", () => {
  expect(container.textContent).toContain("正在听");
  act(() => runtime.onServerSpeechStateChanged("host", true, "speaking"));
  expect(container.textContent).toContain("检测到说话");
  act(() => runtime.onServerSpeechStateChanged("host", false, "transcribing"));
  expect(container.textContent).toContain("说完了，正在识别");
  const transcript = "第一句不要丢。第二句请检查语音识别。".repeat(20);
  act(() => runtime.onTranscriptionResult("host", transcript));
  expect(container.textContent).toContain(`识别结果：${transcript}`);
  act(() => runtime.onTurnEvent("host", "agent", "turn_started"));
  expect(container.textContent).toContain("已发给 agent，正在思考");
  act(() => runtime.onAssistantAudioStarted("host"));
  expect(container.textContent).toContain("正在回复（朗读中）");
  expect(container.getBoundingClientRect().height).toBeLessThan(220);
});

it("keeps a recognition failure visible and recovers on speech or reconnection", async () => {
  act(() => runtime.onServerSpeechStateChanged("host", false, "recognition_failed"));
  expect(container.textContent).toContain("语音识别失败，请再说一遍");
  act(() => runtime.onTurnEvent("host", "agent", "turn_canceled"));
  expect(container.textContent).toContain("语音识别失败，请再说一遍");
  act(() => runtime.onServerSpeechStateChanged("host", true, "speaking"));
  expect(container.textContent).toContain("检测到说话");
  act(() => runtime.updateSessionConnection("host", false));
  expect(container.textContent).toContain("连接断开，正在重连");
  await act(async () => runtime.updateSessionConnection("host", true));
  expect(container.textContent).toContain("正在听");
  act(() => runtime.onCaptureAvailabilityChange(false));
  expect(container.textContent).toContain("麦克风被中断，结束后或回到 ClawMuse 会自动恢复");
  act(() => runtime.onCaptureAvailabilityChange(true));
  act(() => runtime.toggleMute());
  expect(container.textContent).toContain("已静音");
});

it("labels the independent assistant without saying it sent speech to a coding agent", async () => {
  await act(() => runtime.stopVoice());
  await act(() => runtime.startVoice("host", "", undefined, true));
  act(() => runtime.onAssistantAudioStarted("host"));
  expect(container.textContent).toContain("说话中");
  expect(container.textContent).not.toContain("朗读");
});

it("shows an actionable assistant failure when microphone upload fails", async () => {
  await act(() => runtime.stopVoice());
  await act(() => runtime.startVoice("host", "", undefined, true));
  uploadError = new Error("connection lost");
  await act(async () => {
    runtime.handleCapturePcm(new Uint8Array([1, 2]));
  });
  expect(container.textContent).toContain(
    i18n.t("speechSettings.assistantPhase.connection_failed"),
  );
  expect(container.textContent).not.toContain("正在听");
  expect(runtime.getSnapshot().assistantMessage).toBe(
    i18n.t("realtimeVoice.status.connection_failed"),
  );
});

it("queues PCM continuously in a real AudioContext and stops every queued chunk on interruption", async () => {
  const engine = createAudioEngine({ onCaptureData() {}, onVolumeLevel() {} });
  try {
    const button = document.createElement("button");
    button.textContent = "Enable test audio";
    document.body.appendChild(button);
    const initialized = new Promise<void>((resolve, reject) => {
      button.addEventListener(
        "click",
        () => {
          void engine.initialize().then(resolve, reject);
        },
        { once: true },
      );
    });
    await page.getByRole("button", { name: "Enable test audio" }).click();
    await initialized;
    button.remove();
    const pcm = new Uint8Array(4800);
    const first = engine.streamPcm(pcm, 24000);
    const second = engine.streamPcm(pcm, 24000);
    expect(engine.isPlaying()).toBe(true);
    await Promise.all([first, second]);
    expect(engine.isPlaying()).toBe(false);
    const interrupted = engine.streamPcm(new Uint8Array(48000), 24000);
    const queued = engine.streamPcm(new Uint8Array(48000), 24000);
    const results = Promise.allSettled([interrupted, queued]);
    engine.stop();
    expect((await results).map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(engine.isPlaying()).toBe(false);
  } finally {
    await engine.destroy();
  }
});

it("opens and closes the global assistant panel without a selected task", async () => {
  const queryClient = new QueryClient();
  try {
    act(() =>
      root.render(
        <QueryClientProvider client={queryClient}>
          <VoiceProvider>
            <VoiceAssistantPanel />
          </VoiceProvider>
        </QueryClientProvider>,
      ),
    );
    act(() => useAssistantPanel.getState().setOpen(true));
    await expect.element(page.getByTestId("voice-assistant-panel")).toBeVisible();
    await expect.element(page.getByTestId("assistant-start")).toBeDisabled();
    await expect.element(page.getByText("语音助理", { exact: true })).toBeVisible();
    await page.screenshot({ path: "../../.vitest-screenshots/voice-assistant-panel.png" });
    await page.getByRole("button", { name: "关闭", exact: true }).click();
    await expect.element(page.getByTestId("voice-assistant-panel")).not.toBeInTheDocument();
  } finally {
    queryClient.clear();
  }
});

it("shows Apple preparation, partial text, timing and actionable native errors", () => {
  const snapshot = { ...runtime.getSnapshot(), inputSource: "apple" as const };
  const preparing = { ...snapshot, preparingLocalInput: true };
  renderSnapshot(preparing);
  expect(container.textContent).toContain(i18n.t("speechSettings.applePreparing"));
  expect(container.textContent).toContain(i18n.t("speechSettings.appleLocal"));
  const recognized = {
    ...snapshot,
    lastTranscript: "正在检查",
    firstPartialMs: 234,
    finalizationMs: 89,
    endpointMs: 650,
  };
  renderSnapshot(recognized);
  expect(container.textContent).toContain("正在检查");
  expect(container.textContent).toContain(
    i18n.t("speechSettings.appleTiming", { first: 234, final: 89 }),
  );
  expect(container.textContent).not.toContain(i18n.t("speechSettings.applePreparing"));
  expect(container.textContent).toContain(
    i18n.t("speechSettings.appleEndpointTiming", { endpoint: 650 }),
  );
  const failed: VoiceRuntimeSnapshot = {
    ...snapshot,
    phase: "recognition_failed",
    inputError: "本地语言模型不可用",
  };
  renderSnapshot(failed);
  expect(container.textContent).toContain("本地语言模型不可用");
});
