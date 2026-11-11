import { access } from "node:fs/promises";
import { expect, test, vi } from "vitest";
import { generateProviderText, TextGenerationSessionPool } from "./text-generation.js";
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

test("reuses a plugin session, selects low thinking, and closes it with its owner", async () => {
  const fake = harness();
  const sessionPool = new TextGenerationSessionPool();
  const options = {
    client: fake.client,
    request: { ...request, sessionKey: "translation", thinkingOptionId: "low" },
    sessionPool,
  };
  try {
    await expect(generateProviderText(options)).resolves.toBe("你好");
    await expect(generateProviderText(options)).resolves.toBe("你好");
    expect(fake.launches).toHaveLength(1);
    expect(fake.launches[0]?.[0].thinkingOptionId).toBe("low");
    expect(fake.closed()).toBe(0);
  } finally {
    await sessionPool.close();
  }
  expect(fake.closed()).toBe(1);
  await expect(access(fake.launches[0]![0].cwd)).rejects.toMatchObject({ code: "ENOENT" });
  await expect(generateProviderText(options)).rejects.toThrow();
});

test("serializes overlapping requests and replaces a failed resident session", async () => {
  let finish!: () => void;
  let calls = 0;
  const fake = harness(async () => {
    calls++;
    if (calls === 1)
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    if (calls === 2) throw new Error("provider failed");
    return { sessionId: "temporary", finalText: "你好", timeline: [] };
  });
  const sessionPool = new TextGenerationSessionPool();
  const options = {
    client: fake.client,
    request: { ...request, sessionKey: "translation" },
    sessionPool,
  };
  try {
    const first = generateProviderText(options);
    await vi.waitFor(() => expect(calls).toBe(1));
    const second = generateProviderText(options);
    const rejected = expect(second).rejects.toThrow("provider failed");
    expect(calls).toBe(1);
    finish();
    await first;
    await rejected;
    expect(fake.closed()).toBe(1);
    await generateProviderText(options);
    expect(fake.launches).toHaveLength(2);
  } finally {
    await sessionPool.close();
  }
  expect(fake.closed()).toBe(2);
});

test("rotates bounded context and never shares sessions across plugin owners or model selections", async () => {
  const fake = harness();
  const first = new TextGenerationSessionPool();
  const second = new TextGenerationSessionPool();
  const options = {
    client: fake.client,
    request: { ...request, sessionKey: "translation" },
    sessionPool: first,
  };
  try {
    for (let i = 0; i < 17; i++) await generateProviderText(options);
    expect(fake.launches).toHaveLength(2);
    await generateProviderText({ ...options, sessionPool: second });
    expect(fake.launches).toHaveLength(3);
    await generateProviderText({
      ...options,
      request: { ...options.request, model: "different-model" },
    });
    expect(fake.launches).toHaveLength(4);
    await generateProviderText({
      ...options,
      request: { ...options.request, sessionKey: "another-agent" },
    });
    expect(fake.launches).toHaveLength(5);
  } finally {
    await Promise.all([first.close(), second.close()]);
  }
  expect(fake.closed()).toBe(5);
});

test("plugin shutdown cancels an active reused generation and releases its session", async () => {
  let started = false;
  const fake = harness(async () => {
    started = true;
    return new Promise<AgentRunResult>(() => {});
  });
  const sessionPool = new TextGenerationSessionPool();
  const result = generateProviderText({
    client: fake.client,
    request: { ...request, sessionKey: "translation" },
    sessionPool,
  });
  const rejected = expect(result).rejects.toThrow();
  await vi.waitFor(() => expect(started).toBe(true));
  await sessionPool.close();
  await rejected;
  expect(fake.closed()).toBe(1);
});

test("releases an idle resident and creates a fresh session for the next paragraph", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const fake = harness();
  const sessionPool = new TextGenerationSessionPool();
  const options = {
    client: fake.client,
    request: { ...request, sessionKey: "agent-1" },
    sessionPool,
  };
  try {
    await generateProviderText(options);
    await vi.advanceTimersByTimeAsync(60000);
    await generateProviderText(options);
    expect(fake.launches).toHaveLength(2);
    expect(fake.closed()).toBe(1);
  } finally {
    await sessionPool.close();
    vi.useRealTimers();
  }
});

test("preparing a text session starts no model turn and repeated prepares reuse it", async () => {
  const run = vi.fn(async () => ({ sessionId: "temporary", finalText: "你好", timeline: [] }));
  const fake = harness(run);
  const sessionPool = new TextGenerationSessionPool();
  const options = {
    client: fake.client,
    request: { ...request, sessionKey: "agent-1" },
    sessionPool,
  };
  try {
    await generateProviderText({ ...options, prepareOnly: true });
    await generateProviderText({ ...options, prepareOnly: true });
    expect(run).not.toHaveBeenCalled();
    expect(fake.launches).toHaveLength(1);
    await expect(generateProviderText(options)).resolves.toBe("你好");
    expect(run).toHaveBeenCalledTimes(1);
    expect(fake.launches).toHaveLength(1);
  } finally {
    await sessionPool.close();
  }
  expect(fake.closed()).toBe(1);
});
