import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginTextGenerationRequest } from "@getpaseo/plugin/server";
import type { AgentClient, AgentSession } from "./agent-sdk-types.js";

interface TextGenerationOptions {
  client: {
    createSession(
      ...args: Parameters<AgentClient["createSession"]>
    ): Promise<Pick<AgentSession, "run" | "subscribe" | "close">>;
  };
  request: PluginTextGenerationRequest;
  signal?: AbortSignal;
}

export async function generateProviderText(options: TextGenerationOptions): Promise<string> {
  const permissionDenied = new AbortController();
  const signal = AbortSignal.any([
    permissionDenied.signal,
    AbortSignal.timeout(22000),
    ...(options.signal ? [options.signal] : []),
  ]);
  signal.throwIfAborted();
  const directory = await mkdtemp(join(tmpdir(), "paseo-generation-"));
  let session: Pick<AgentSession, "run" | "subscribe" | "close"> | undefined;
  let unsubscribe: (() => void) | undefined;
  let abort: (() => void) | undefined;
  try {
    signal.throwIfAborted();
    session = await options.client.createSession(
      {
        provider: options.request.provider,
        model: options.request.model,
        systemPrompt: options.request.systemPrompt,
        cwd: directory,
        internal: true,
        mcpServers: {},
      },
      undefined,
      { persistSession: false },
    );
    signal.throwIfAborted();
    // This session never enters AgentManager: no workspace, timeline persistence,
    // prompt hooks, or injected host tools. Permission requests cannot wait on UI.
    unsubscribe = session.subscribe((event) => {
      if (event.type === "permission_requested") {
        permissionDenied.abort(new Error("Text generation cannot request tool permissions"));
      }
    });
    const aborted = new Promise<never>((_, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
    });
    const result = await Promise.race([session.run(options.request.prompt), aborted]);
    signal.throwIfAborted();
    if (result.canceled) throw new Error("Text generation was canceled");
    const text =
      result.finalText ||
      result.timeline.findLast((item) => item.type === "assistant_message")?.text;
    if (!text?.trim()) throw new Error("Text generation returned no text");
    if (text.length > 200000) throw new Error("Text generation response is too large");
    return text;
  } finally {
    if (abort) signal.removeEventListener("abort", abort);
    unsubscribe?.();
    try {
      await session?.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
