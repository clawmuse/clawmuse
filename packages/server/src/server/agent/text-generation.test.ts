import { access } from "node:fs/promises";
import { expect, test } from "vitest";
import { generateProviderText } from "./text-generation.js";
import type {
  AgentClient,
  AgentRunResult,
  AgentSession,
  AgentStreamEvent,
} from "./agent-sdk-types.js";

const request = {
  provider: "grok",
  model: "vendor/model",
  prompt: "Translate hello",
  systemPrompt: "Translate only",
};

function harness(
  run: AgentSession["run"] = async () => ({
    sessionId: "temporary",
    finalText: "你好",
    timeline: [],
  }),
) {
  const launches: Parameters<AgentClient["createSession"]>[] = [];
  const listeners = new Set<(event: AgentStreamEvent) => void>();
  let closed = 0;
  const client = {
    async createSession(...args: Parameters<AgentClient["createSession"]>) {
      launches.push(args);
      return {
        run,
        subscribe(listener: (event: AgentStreamEvent) => void) {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        async close() {
          closed++;
        },
      };
    },
  };
  return { client, launches, listeners, closed: () => closed };
}

test("text generation uses the configured provider and model without a public agent or MCP tools", async () => {
  const fake = harness(async (prompt) => {
    expect(prompt).toBe(request.prompt);
    await access(fake.launches[0]![0].cwd);
    return { sessionId: "temporary", finalText: "你好", timeline: [] };
  });
  await expect(generateProviderText({ client: fake.client, request })).resolves.toBe("你好");
  expect(fake.launches).toEqual([
    [
      {
        provider: "grok",
        model: "vendor/model",
        systemPrompt: "Translate only",
        cwd: expect.stringContaining("paseo-generation-"),
        internal: true,
        mcpServers: {},
      },
      undefined,
      { persistSession: false },
    ],
  ]);
  expect(fake.closed()).toBe(1);
  expect(fake.listeners.size).toBe(0);
  await expect(access(fake.launches[0]![0].cwd)).rejects.toMatchObject({ code: "ENOENT" });
});

test.each(["failure", "empty", "canceled"])(
  "text generation cleans up after %s without selecting a different model",
  async (kind) => {
    const fake = harness(async () => {
      if (kind === "failure") throw new Error("Provider unavailable");
      return { sessionId: "temporary", finalText: "", timeline: [], canceled: kind === "canceled" };
    });
    await expect(generateProviderText({ client: fake.client, request })).rejects.toThrow();
    expect(fake.launches).toHaveLength(1);
    expect(fake.closed()).toBe(1);
    expect(fake.listeners.size).toBe(0);
    await expect(access(fake.launches[0]![0].cwd)).rejects.toMatchObject({ code: "ENOENT" });
  },
);

test("aborting a translation closes its active provider session", async () => {
  const controller = new AbortController();
  const fake = harness(async () => {
    controller.abort(new Error("translation disabled"));
    return new Promise<AgentRunResult>(() => {});
  });
  await expect(
    generateProviderText({ client: fake.client, request, signal: controller.signal }),
  ).rejects.toThrow("translation disabled");
  expect(fake.closed()).toBe(1);
  expect(fake.listeners.size).toBe(0);
});

test("a canceled translation never launches a provider", async () => {
  const fake = harness();
  await expect(
    generateProviderText({ client: fake.client, request, signal: AbortSignal.abort() }),
  ).rejects.toThrow();
  expect(fake.launches).toEqual([]);
});

test("permission requests stop translation instead of waiting for an invisible approval", async () => {
  const fake = harness(async () => {
    for (const listener of fake.listeners)
      listener({
        type: "permission_requested",
        provider: "grok",
        request: { id: "tool-request", provider: "grok", name: "shell", kind: "tool" },
      });
    return new Promise<AgentRunResult>(() => {});
  });
  await expect(generateProviderText({ client: fake.client, request })).rejects.toThrow(
    "cannot request tool permissions",
  );
  expect(fake.closed()).toBe(1);
});
