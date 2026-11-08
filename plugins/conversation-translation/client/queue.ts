interface TranslationJob<T> {
  run(): Promise<T>;
  prepare?(): Promise<unknown>;
  signal: AbortSignal;
  onStart(): void;
  priority?: boolean;
}

export function createTranslationQueue() {
  const waiting: (() => Promise<void>)[] = [];
  let running = false;
  let closed = false;
  const cancelPending = new Set<() => void>();
  async function drain() {
    if (running) return;
    running = true;
    try {
      while (waiting.length) await waiting.shift()!();
    } finally {
      running = false;
    }
  }
  return {
    enqueue<T>({ run, prepare, signal, onStart, priority }: TranslationJob<T>): Promise<T> {
      if (closed || signal.aborted) return Promise.reject(new Error("翻译已取消"));
      return new Promise<T>((resolve, reject) => {
        let settled = false;
        let timer = setTimeout(() => fail("等待翻译超时，请点击重试翻译"), 15_000);
        function cleanup() {
          settled = true;
          clearTimeout(timer);
          signal.removeEventListener("abort", cancel);
          cancelPending.delete(cancel);
        }
        function fail(message: string) {
          if (settled) return;
          cleanup();
          reject(new Error(message));
        }
        function cancel() {
          fail("翻译已取消");
        }
        signal.addEventListener("abort", cancel, { once: true });
        cancelPending.add(cancel);
        const job = async () => {
          await Promise.resolve();
          if (settled) return;
          try {
            // Startup shares the queue budget; generation gets its own deadline.
            if (prepare) await prepare();
            if (settled) return;
            clearTimeout(timer);
            timer = setTimeout(() => fail("翻译超时，请检查主机连接后重试翻译"), 8_000);
            onStart();
            // Retain the slot until RPC settles, even after a UI timeout or unmount.
            const result = await run();
            if (!settled) {
              cleanup();
              resolve(result);
            }
          } catch (error) {
            if (!settled) {
              cleanup();
              reject(error);
            }
          }
        };
        if (priority) waiting.unshift(job);
        else waiting.push(job);
        void drain();
      });
    },
    close() {
      closed = true;
      for (const cancel of cancelPending) cancel();
    },
  };
}

export const sharedTranslationQueue = createTranslationQueue();

// Questions and complete replies share one queue; questions precede waiting history.
export function enqueueTranslation<T>(
  run: () => Promise<T>,
  signal: AbortSignal,
  priority = false,
): Promise<T> {
  return sharedTranslationQueue.enqueue({ run, signal, priority, onStart() {} });
}
