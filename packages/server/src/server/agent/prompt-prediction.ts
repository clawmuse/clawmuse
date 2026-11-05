// Context selection and prediction lifecycle adapted from Cindy (Apache-2.0).
import { buildConversationContext } from "./prompt-prediction-text.js";
interface PredictionMessage {
  role: "user" | "assistant";
  text: string;
}

export interface PredictionSource {
  cwd: string;
  provider: string;
  model?: string;
  thinkingOptionId?: string;
  settingsKey: string;
  messages: PredictionMessage[];
}

interface PredictionInput {
  agentId: string;
  sourceTurnId?: string;
  locale?: string;
}

export interface PromptPrediction {
  sourceTurnId: string | null;
  prompt: string | null;
}

export interface PredictionGeneration {
  source: PredictionSource;
  context: string;
  signal: AbortSignal;
  locale: string;
  beforeDispatch: () => boolean;
}

interface PredictionOptions {
  readSource: (agentId: string) => PredictionSource | null;
  generate: (input: PredictionGeneration) => Promise<string | null>;
  onError?: (error: unknown) => void;
}

interface Completion {
  turnId: string;
  createdAt: number;
  controller: AbortController;
  sourceKey?: string;
  promise?: Promise<PromptPrediction>;
}

export function buildPredictionContext(messages: readonly PredictionMessage[]): string {
  return buildConversationContext(
    messages.map(({ role, text }) => ({ role, content: text })),
    3,
  );
}

export class PromptPredictions {
  private readonly completions = new Map<string, Completion>();
  private activeRequests = 0;

  constructor(private readonly options: PredictionOptions) {}

  completed(agentId: string, turnId: string): void {
    if (this.completions.get(agentId)?.turnId === turnId) return;
    this.invalidate(agentId);
    if (this.completions.size >= 256) {
      const oldest = this.completions.keys().next().value;
      if (oldest) this.invalidate(oldest);
    }
    this.completions.set(agentId, {
      turnId,
      createdAt: Date.now(),
      controller: new AbortController(),
    });
  }

  invalidate(agentId: string): void {
    this.completions.get(agentId)?.controller.abort();
    this.completions.delete(agentId);
  }

  async predict(input: PredictionInput): Promise<PromptPrediction> {
    const completion = this.completions.get(input.agentId);
    const sourceTurnId = input.sourceTurnId ?? completion?.turnId ?? null;
    const empty = { sourceTurnId, prompt: null };
    if (!completion || completion.turnId !== sourceTurnId) return empty;
    if (Date.now() - completion.createdAt > 10 * 60_000) {
      this.invalidate(input.agentId);
      return empty;
    }
    const source = this.options.readSource(input.agentId);
    if (!source) return empty;
    if (completion.promise) {
      if (completion.sourceKey !== JSON.stringify(source)) return empty;
      return completion.promise;
    }
    // Historical navigation may reuse a result, but never starts paid generation.
    if (!input.sourceTurnId || this.activeRequests >= 2) return empty;
    const context = buildPredictionContext(source.messages);
    if (!context.trim()) return empty;
    const sourceKey = JSON.stringify(source);
    completion.sourceKey = sourceKey;
    this.activeRequests += 1;
    const signal = AbortSignal.any([completion.controller.signal, AbortSignal.timeout(12_000)]);
    const beforeDispatch = () =>
      !signal.aborted &&
      this.completions.get(input.agentId) === completion &&
      JSON.stringify(this.options.readSource(input.agentId)) === sourceKey;
    completion.promise = this.generate(
      { source, context, signal, locale: input.locale ?? "auto", beforeDispatch },
      signal,
    )
      .then((prompt) => {
        const latest = this.options.readSource(input.agentId);
        const current = this.completions.get(input.agentId) === completion;
        if (!current || signal.aborted || JSON.stringify(latest) !== sourceKey) return empty;
        const normalized = prompt?.replace(/\s+/gu, " ").trim() ?? "";
        return {
          sourceTurnId,
          prompt: normalized ? Array.from(normalized).slice(0, 140).join("") : null,
        };
      })
      .catch((error: unknown) => {
        if (!signal.aborted) this.options.onError?.(error);
        return empty;
      })
      .finally(() => {
        this.activeRequests -= 1;
      });
    return completion.promise;
  }

  private async generate(input: PredictionGeneration, signal: AbortSignal): Promise<string | null> {
    const pending = this.options.generate(input);
    return new Promise((resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    });
  }
}
