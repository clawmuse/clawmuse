import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PluginTextGenerationRequest } from "@getpaseo/plugin/server";
import type { AgentClient, AgentSession, AgentRunResult } from "./agent-sdk-types.js";

export type HostTextGenerator = (
  request: PluginTextGenerationRequest,
  options?: {
    signal?: AbortSignal;
    sessionPool?: TextGenerationSessionPool;
    prepareOnly?: boolean;
  },
) => Promise<string>;

interface TextGenerationOptions {
  client: {
    createSession(
      ...args: Parameters<AgentClient["createSession"]>
    ): Promise<Pick<AgentSession, "run" | "subscribe" | "close">>;
  };
  request: PluginTextGenerationRequest;
  signal?: AbortSignal;
  sessionPool?: TextGenerationSessionPool;
  prepareOnly?: boolean;
}

export async function generateProviderText(options: TextGenerationOptions): Promise<string> {
  if (options.prepareOnly && (!options.request.sessionKey || !options.sessionPool))
    throw new Error("Text preparation requires a reusable session");
  if (options.request.sessionKey && options.sessionPool)
    return options.sessionPool.generate(options);
  return runTextGeneration(options);
}

interface ResidentSession {
  session: Pick<AgentSession, "run" | "subscribe" | "close">;
  directory: string;
  turns: number;
  characters: number;
}

async function closeSession(resident: ResidentSession): Promise<void> {
  try {
    await resident.session.close();
  } finally {
    await rm(resident.directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

// Owned by one loaded plugin, never shared with another plugin or a chat agent.
export class TextGenerationSessionPool {
  private resident?: ResidentSession;
  private key?: string;
  private client?: TextGenerationOptions["client"];
  private tail: Promise<void> = Promise.resolve();
  private idle?: ReturnType<typeof setTimeout>;
  private lifetime = new AbortController();

  generate(options: TextGenerationOptions): Promise<string> {
    const result = this.tail.then(async () => {
      const signal = AbortSignal.any([
        this.lifetime.signal,
        ...(options.signal ? [options.signal] : []),
      ]);
      signal.throwIfAborted();
      clearTimeout(this.idle);
      const { provider, model, systemPrompt, thinkingOptionId, sessionKey } = options.request;
      const key = JSON.stringify([provider, model, systemPrompt, thinkingOptionId, sessionKey]);
      if (
        this.key !== key ||
        this.client !== options.client ||
        (this.resident &&
          (this.resident.turns >= 16 ||
            this.resident.characters + options.request.prompt.length > 32000))
      ) {
        await this.release();
      }
      this.key = key;
      this.client = options.client;
      try {
        const existing = this.resident;
        this.resident = undefined;
        return await runTextGeneration({ ...options, signal }, existing, (resident) => {
          this.resident = resident;
        });
      } catch (error) {
        await this.release().catch(() => undefined);
        throw error;
      } finally {
        if (!this.lifetime.signal.aborted) {
          this.idle = setTimeout(() => {
            this.tail = this.tail.then(() => this.release()).catch(() => undefined);
          }, 60000);
          this.idle.unref();
        }
      }
    });
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async close(): Promise<void> {
    this.lifetime.abort();
    clearTimeout(this.idle);
    await this.tail;
    await this.release();
  }

  private async release(): Promise<void> {
    const resident = this.resident;
    this.resident = undefined;
    if (resident) await closeSession(resident);
  }
}

async function runTextGeneration(
  options: TextGenerationOptions,
  existing?: ResidentSession,
  retain?: (resident: ResidentSession) => void,
): Promise<string> {
  const permissionDenied = new AbortController();
  const signal = AbortSignal.any([
    permissionDenied.signal,
    AbortSignal.timeout(22000),
    ...(options.signal ? [options.signal] : []),
  ]);
  const directory = existing?.directory ?? (await mkdtemp(join(tmpdir(), "paseo-generation-")));
  let session = existing?.session;
  let retained = false;
  let unsubscribe: (() => void) | undefined;
  let abort: (() => void) | undefined;
  try {
    signal.throwIfAborted();
    session ??= await createGenerationSession(options, directory);
    signal.throwIfAborted();
    if (options.prepareOnly) {
      retain!({
        session,
        directory,
        turns: existing?.turns ?? 0,
        characters: existing?.characters ?? 0,
      });
      retained = true;
      return "";
    }
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
    const text = generationText(result);
    if (retain) {
      retain({
        session,
        directory,
        turns: (existing?.turns ?? 0) + 1,
        characters: (existing?.characters ?? 0) + options.request.prompt.length + text.length,
      });
      retained = true;
    }
    return text;
  } finally {
    if (abort) signal.removeEventListener("abort", abort);
    unsubscribe?.();
    if (!retained) {
      if (session) await closeSession({ session, directory, turns: 0, characters: 0 });
      else await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }
}

function createGenerationSession(options: TextGenerationOptions, directory: string) {
  return options.client.createSession(
    {
      provider: options.request.provider,
      model: options.request.model,
      systemPrompt: options.request.systemPrompt,
      ...(options.request.thinkingOptionId
        ? { thinkingOptionId: options.request.thinkingOptionId }
        : {}),
      cwd: directory,
      internal: true,
      mcpServers: {},
    },
    undefined,
    { persistSession: false },
  );
}

function generationText(result: AgentRunResult): string {
  if (result.canceled) throw new Error("Text generation was canceled");
  const text =
    result.finalText || result.timeline.findLast((item) => item.type === "assistant_message")?.text;
  if (!text?.trim()) throw new Error("Text generation returned no text");
  if (text.length > 200000) throw new Error("Text generation response is too large");
  return text;
}
