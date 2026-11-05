import { describe, expect, it, vi } from "vitest";
import {
  PromptPredictions,
  buildPredictionContext,
  type PredictionSource,
  type PredictionGeneration,
} from "./prompt-prediction.js";
import { validateTitleOutput } from "./prompt-prediction-output.js";
import { createTestPaseoDaemon } from "../test-utils/paseo-daemon.js";
import { createTestAgentClients } from "../test-utils/fake-agent-client.js";
import { DaemonClient } from "../test-utils/daemon-client.js";

function setup() {
  let source: PredictionSource | null = {
    cwd: "/workspace",
    provider: "copilot",
    model: "test-model",
    settingsKey: "automatic",
    messages: [
      { role: "user", text: "修复登录问题" },
      { role: "assistant", text: "登录问题已修复，可以补充回归测试。" },
    ],
  };
  const generate = vi.fn<(input: PredictionGeneration) => Promise<string | null>>(
    async () => "补充登录的回归测试",
  );
  const predictions = new PromptPredictions({ readSource: () => source, generate });
  return {
    predictions,
    generate,
    setSource: (next: PredictionSource | null) => {
      source = next;
    },
  };
}

describe("prompt predictions", () => {
  it("does not generate when opening history without a live completion", async () => {
    const { predictions, generate } = setup();
    expect(await predictions.predict({ agentId: "a" })).toEqual({
      sourceTurnId: null,
      prompt: null,
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("shares one prediction across clients and supports every source provider", async () => {
    const { predictions, generate } = setup();
    predictions.completed("a", "turn-1");
    const input = { agentId: "a", sourceTurnId: "turn-1" };
    const [first, second] = await Promise.all([
      predictions.predict(input),
      predictions.predict(input),
    ]);
    expect(first).toEqual({ sourceTurnId: "turn-1", prompt: "补充登录的回归测试" });
    expect(second).toEqual(first);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(await predictions.predict({ agentId: "a" })).toEqual(first);
  });

  it("discards a late result after the next turn starts", async () => {
    const { predictions, generate } = setup();
    let finish: (value: string) => void = () => {};
    generate.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    predictions.completed("a", "turn-1");
    const pending = predictions.predict({ agentId: "a", sourceTurnId: "turn-1" });
    predictions.invalidate("a");
    finish("不应显示");
    expect(await pending).toEqual({ sourceTurnId: "turn-1", prompt: null });
  });

  it("does not dispatch when disabled or when a stale completion is requested", async () => {
    const { predictions, generate, setSource } = setup();
    predictions.completed("a", "turn-2");
    expect(await predictions.predict({ agentId: "a", sourceTurnId: "turn-1" })).toEqual({
      sourceTurnId: "turn-1",
      prompt: null,
    });
    setSource(null);
    expect(await predictions.predict({ agentId: "a", sourceTurnId: "turn-2" })).toEqual({
      sourceTurnId: "turn-2",
      prompt: null,
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("discards results when model settings change in flight", async () => {
    const { predictions, generate, setSource } = setup();
    generate.mockImplementation(async () => {
      setSource(null);
      return "过期建议";
    });
    predictions.completed("a", "turn-1");
    expect(await predictions.predict({ agentId: "a", sourceTurnId: "turn-1" })).toEqual({
      sourceTurnId: "turn-1",
      prompt: null,
    });
  });

  it("rechecks authoritative material immediately before model dispatch", async () => {
    const { predictions, generate, setSource } = setup();
    generate.mockImplementation(async (input) => {
      expect(input.beforeDispatch()).toBe(true);
      setSource(null);
      expect(input.beforeDispatch()).toBe(false);
      return null;
    });
    predictions.completed("a", "turn-1");
    expect((await predictions.predict({ agentId: "a", sourceTurnId: "turn-1" })).prompt).toBeNull();
  });

  it("keeps failures quiet and does not retry a completed request", async () => {
    const { predictions, generate } = setup();
    generate.mockRejectedValue(new Error("model unavailable"));
    predictions.completed("a", "turn-1");
    const input = { agentId: "a", sourceTurnId: "turn-1" };
    expect(await predictions.predict(input)).toEqual({ sourceTurnId: "turn-1", prompt: null });
    await predictions.predict(input);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});

it("shares predictions and synchronized settings over two real WebSocket clients", async () => {
  let predictionCalls = 0;
  const host = await createTestPaseoDaemon({
    agentClients: createTestAgentClients({
      onStartTurn: (_prompt, config) => {
        if (config.title === "Prompt prediction") predictionCalls += 1;
      },
    }),
    mcpEnabled: false,
  });
  const clients = [0, 1].map(
    () => new DaemonClient({ url: `ws://127.0.0.1:${host.port}/ws`, appVersion: "0.13.0" }),
  );
  try {
    await Promise.all(
      clients.map(async (client) => {
        await client.connect();
        await client.fetchAgents({ subscribe: {} });
      }),
    );
    await clients[0].patchDaemonConfig({
      metadataGeneration: { providers: [{ provider: "claude", model: "test-model" }] },
    });
    for (const provider of ["codex", "claude", "opencode"]) {
      const agent = await host.daemon.agentManager.createAgent(
        { provider, cwd: host.paseoHome, title: "Prediction source" },
        undefined,
        { workspaceId: undefined },
      );
      const before = predictionCalls;
      expect((await clients[0].predictAgentPrompt(agent.id)).prompt).toBeNull();
      let turnId = "";
      const unsubscribe = host.daemon.agentManager.subscribe(
        (event) => {
          if (
            event.type === "agent_stream" &&
            event.agentId === agent.id &&
            event.event.type === "turn_completed"
          )
            turnId = event.event.turnId ?? "";
        },
        { replayState: false },
      );
      try {
        await host.daemon.agentManager.runAgent(agent.id, "Fix the login page");
      } finally {
        unsubscribe();
      }
      expect(turnId).not.toBe("");
      const predictions = await Promise.all(
        clients.map((client) => client.predictAgentPrompt(agent.id, turnId, "zh-CN")),
      );
      expect(predictions[0]).toMatchObject({ sourceTurnId: turnId, prompt: "Hello world" });
      expect(predictions[1]).toMatchObject({ sourceTurnId: turnId, prompt: predictions[0].prompt });
      expect(predictionCalls).toBe(before + 1);
      expect((await clients[1].predictAgentPrompt(agent.id)).prompt).toBe("Hello world");
      await clients[0].patchDaemonConfig({ pluginsEnabled: false });
      expect((await clients[1].predictAgentPrompt(agent.id, turnId)).prompt).toBeNull();
      expect(predictionCalls).toBe(before + 1);
      await clients[0].patchDaemonConfig({ pluginsEnabled: true });
      await clients[0].patchDaemonConfig({ metadataGeneration: { promptPredictions: false } });
      expect((await clients[1].predictAgentPrompt(agent.id, turnId)).prompt).toBeNull();
      await clients[0].patchDaemonConfig({ metadataGeneration: { promptPredictions: true } });
    }
  } finally {
    await Promise.all(clients.map((client) => client.close()));
    await host.close();
  }
}, 30_000);

it("bounds recent context while retaining the end of the latest assistant reply", () => {
  const context = buildPredictionContext([
    { role: "user", text: "old".repeat(500) },
    { role: "assistant", text: "start".repeat(500) + "最后请确认是否发布" },
  ]);
  expect(context.length).toBeLessThanOrEqual(2000);
  expect(context).toContain("最后请确认是否发布");
});

it.each([
  ["“补充回归测试”", "补充回归测试"],
  ["Assistant: ship the change", null],
  ["# 下一步", null],
  ["first\nsecond", null],
  ["Generate a concise title.", null],
  ["修复标题生成 bug", "修复标题生成 bug"],
])("uses Cindy's output acceptance rules for %s", (raw, expected) => {
  expect(validateTitleOutput(raw, 512)).toBe(expected);
});
