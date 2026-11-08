import { createTranslationQueue } from "./queue.js";

interface ReplyJob {
  agentId: string;
  revision?: string;
  text: string;
  signal: AbortSignal;
  onStart(): void;
  prepare?(input: { agentId: string; revision?: string }): Promise<unknown>;
  translate(input: {
    agentId: string;
    texts: string[];
    revision?: string;
  }): Promise<{ texts: string[] }>;
}
interface PendingReply extends ReplyJob {
  settled: boolean;
  finish(text?: string, error?: unknown): void;
}

// Rows committed at the end of a turn share one model call. Never split a message.
export function createReplyQueue(queue = createTranslationQueue()) {
  let pending: PendingReply[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  const preparations = new Map<string, Promise<unknown>>();
  function prepare({
    agentId,
    revision,
    prepare: start,
  }: Pick<ReplyJob, "agentId" | "revision" | "prepare">): Promise<unknown> {
    if (closed) return Promise.reject(new Error("翻译已取消"));
    if (!start) return Promise.resolve();
    const key = JSON.stringify([agentId, revision]);
    const existing = preparations.get(key);
    if (existing) return existing;
    const result = start({ agentId, ...(revision !== undefined ? { revision } : {}) }).finally(() =>
      preparations.delete(key),
    );
    preparations.set(key, result);
    return result;
  }

  function dispatch(batch: PendingReply[]) {
    const controller = new AbortController();
    const cancelIfEmpty = () => {
      if (batch.every((job) => job.settled)) controller.abort();
    };
    for (const job of batch) job.signal.addEventListener("abort", cancelIfEmpty);
    void queue
      .enqueue({
        signal: controller.signal,
        prepare: () => prepare(batch[0]!),
        onStart: () => {
          for (const job of batch) if (!job.settled) job.onStart();
        },
        run: () =>
          batch[0]!.translate({
            agentId: batch[0]!.agentId,
            texts: batch.map((job) => job.text),
            ...(batch[0]!.revision !== undefined ? { revision: batch[0]!.revision } : {}),
          }),
      })
      .then(({ texts }) => {
        if (texts.length !== batch.length) throw new Error("翻译结果不完整，请重试");
        for (const [index, job] of batch.entries()) job.finish(texts[index]!);
        return undefined;
      })
      .catch((error: unknown) => {
        for (const job of batch) job.finish(undefined, error);
      })
      .finally(() => {
        for (const job of batch) job.signal.removeEventListener("abort", cancelIfEmpty);
      });
  }

  function flush() {
    timer = undefined;
    const jobs = pending.filter((job) => !job.settled);
    pending = [];
    const groups = new Map<string, PendingReply[]>();
    for (const job of jobs) {
      const key = JSON.stringify([job.agentId, job.revision]);
      const group = groups.get(key) ?? [];
      group.push(job);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      let batch: PendingReply[] = [];
      let length = 0;
      for (const job of group) {
        if (batch.length && (batch.length >= 16 || length + job.text.length > 20000)) {
          dispatch(batch);
          batch = [];
          length = 0;
        }
        batch.push(job);
        length += job.text.length;
      }
      if (batch.length) dispatch(batch);
    }
  }

  return {
    prepare,
    enqueue(job: ReplyJob): Promise<{ text: string }> {
      if (closed || job.signal.aborted) return Promise.reject(new Error("翻译已取消"));
      return new Promise((resolve, reject) => {
        const cancel = () => entry.finish(undefined, new Error("翻译已取消"));
        const entry: PendingReply = {
          ...job,
          settled: false,
          finish(text, error) {
            if (entry.settled) return;
            entry.settled = true;
            job.signal.removeEventListener("abort", cancel);
            if (text === undefined) reject(error);
            else resolve({ text });
          },
        };
        job.signal.addEventListener("abort", cancel, { once: true });
        pending.push(entry);
        timer ??= setTimeout(flush, 25);
      });
    },
    close() {
      closed = true;
      clearTimeout(timer);
      for (const job of pending) job.finish(undefined, new Error("翻译已取消"));
      pending = [];
      queue.close();
    },
  };
}
