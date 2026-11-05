interface Job {
  run(): Promise<void>;
}
const waiting: Job[] = [];
let running = false;

async function drain() {
  if (running) return;
  running = true;
  try {
    while (waiting.length) await waiting.shift()!.run();
  } finally {
    running = false;
  }
}

// Queue before RPC deadlines start; interactive questions go ahead of history paragraphs.
export function enqueueTranslation<T>(
  run: () => Promise<T>,
  signal: AbortSignal,
  priority = false,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => reject(new Error("翻译已取消"));
    if (signal.aborted) {
      cancel();
      return;
    }
    signal.addEventListener("abort", cancel, { once: true });
    const job: Job = {
      async run() {
        try {
          if (!signal.aborted) resolve(await run());
        } catch (error) {
          reject(error);
        } finally {
          signal.removeEventListener("abort", cancel);
        }
      },
    };
    if (priority) waiting.unshift(job);
    else waiting.push(job);
    void drain();
  });
}
