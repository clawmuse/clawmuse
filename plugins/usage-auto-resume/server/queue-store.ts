import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { defaultStorePath } from "./store";

const QueueRecordSchema = z.object({
  agentId: z.string(),
  provider: z.string(),
  model: z.string().optional(),
  identity: z.string().optional(),
  baseline: z.string().nullable(),
  status: z.enum(["waiting", "ready", "running", "paused"]),
  reason: z.string().nullable(),
  messages: z.array(z.object({ id: z.string(), text: z.string(), createdAt: z.string() })),
  /** Recent accepted IDs also deduplicate a client retry after a message has completed. */
  acceptedIds: z.array(z.string()),
  handledTurns: z.array(z.string()).default([]),
  /** A queued turn hit quota; the next successful continue completes this item. */
  resumeMessageId: z.string().optional(),
  active: z
    .object({
      kind: z.enum(["continue", "message"]),
      messageId: z.string(),
      queuedMessageId: z.string().optional(),
      turnId: z.string().nullable().optional(),
      started: z.boolean(),
      baseline: z.string().nullable().optional(),
    })
    .optional(),
});

export type QueueRecord = z.infer<typeof QueueRecordSchema>;
const FileSchema = z.object({ version: z.literal(1), queues: z.array(QueueRecordSchema) });

/** Read errors fail closed: a broken file must never be replaced with an empty queue. */
export function createQueueStore(path = join(dirname(defaultStorePath()), "queues.json")) {
  let tail: Promise<unknown> = Promise.resolve();
  const serialize = <T>(work: () => Promise<T>): Promise<T> => {
    const next = tail.then(work, work);
    tail = next.catch(() => undefined);
    return next;
  };

  async function read(): Promise<QueueRecord[]> {
    try {
      return FileSchema.parse(JSON.parse(await readFile(path, "utf8"))).queues;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw new Error("Could not read the saved follow-up queue; existing messages were kept.", {
        cause: error,
      });
    }
  }

  async function write(queues: QueueRecord[]): Promise<void> {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temp = `${path}.${randomUUID()}.tmp`;
    const file = await open(temp, "wx", 0o600);
    try {
      await file.writeFile(
        JSON.stringify(FileSchema.parse({ version: 1, queues }), null, 2),
        "utf8",
      );
      await file.sync();
    } finally {
      await file.close();
    }
    try {
      await rename(temp, path);
    } finally {
      await unlink(temp).catch(() => undefined);
    }
  }

  return {
    list: () => serialize(read),
    update: (
      agentId: string,
      change: (current: QueueRecord | null) => QueueRecord | null | undefined,
    ) =>
      serialize(async () => {
        const queues = await read();
        const current = queues.find((queue) => queue.agentId === agentId) ?? null;
        const next = change(current);
        if (next === undefined) return current;
        await write([
          ...queues.filter((queue) => queue.agentId !== agentId),
          ...(next ? [next] : []),
        ]);
        return next;
      }),
  };
}

export type QueueStore = ReturnType<typeof createQueueStore>;
