import type { AttachmentMetadata } from "@/attachments/types";
import type { ComposerSendClient, MessageSubmissionWriter } from "@/composer/actions";
import { i18n } from "@/i18n/i18next";
import { createUserMessage } from "@/types/stream";
import { classifyDeliveryError, OUTBOX_DELIVERY_DEADLINE_MS, type OutboxEntry } from "./model";

export type EncodedImages = Array<{ data: string; mimeType: string }>;

export interface OutboxClient {
  readonly isConnected: boolean;
  sendAgentMessage: ComposerSendClient["sendAgentMessage"];
}

export interface OutboxEntryStore {
  list(): readonly OutboxEntry[];
  /** Insert, or replace the entry with the same client message id. */
  put(entry: OutboxEntry): void;
  remove(clientMessageId: string): void;
}

export interface OutboxDeliveryPorts {
  entries: OutboxEntryStore;
  getClient(serverId: string): OutboxClient | null;
  /** Null while the app has no session for the host, so no timeline to write a row into. */
  submission(serverId: string): MessageSubmissionWriter | null;
  encodeImages(images: AttachmentMetadata[]): Promise<EncodedImages | undefined>;
  /** Keep attachment files alive while a prompt that references them is undelivered. */
  retainImages(images: AttachmentMetadata[]): () => void;
  now(): number;
}

export type HeldMessage = Omit<OutboxEntry, "deadlineAt" | "delivery">;

export interface OutboxDelivery {
  /**
   * Take over a prompt whose optimistic row is already published but whose send
   * failed for connection reasons, or never started because the host is offline.
   */
  hold(message: HeldMessage, encodedImages: EncodedImages | null): void;
  /** Send every waiting prompt for a connected host, in submission order per agent. */
  flush(serverId: string): Promise<void>;
  flushAll(): Promise<void>;
  retry(clientMessageId: string): void;
  /** Drop a prompt and hand its content back, e.g. to edit it in the composer. */
  discard(clientMessageId: string): OutboxEntry | null;
  /** Resume entries persisted by an earlier app run. */
  restore(): void;
  dispose(): void;
}

type DeliveryOutcome = "settled" | "waiting" | "failed";

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : i18n.t("composer.errors.failedToSend");
}

export function createOutboxDelivery(ports: OutboxDeliveryPorts): OutboxDelivery {
  const encodedImages = new Map<string, EncodedImages>();
  const releaseImages = new Map<string, () => void>();
  const deadlineTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const inFlight = new Set<string>();
  /** Prompts whose optimistic row this app run has published and not rolled back. */
  const publishedRows = new Set<string>();
  const flushing = new Map<string, Promise<void>>();
  const flushAgain = new Set<string>();

  function find(clientMessageId: string): OutboxEntry | null {
    return ports.entries.list().find((entry) => entry.clientMessageId === clientMessageId) ?? null;
  }

  function retain(entry: OutboxEntry): void {
    if (releaseImages.has(entry.clientMessageId)) return;
    releaseImages.set(entry.clientMessageId, ports.retainImages(entry.images));
  }

  function forget(clientMessageId: string): void {
    const timer = deadlineTimers.get(clientMessageId);
    if (timer) clearTimeout(timer);
    deadlineTimers.delete(clientMessageId);
    releaseImages.get(clientMessageId)?.();
    releaseImages.delete(clientMessageId);
    encodedImages.delete(clientMessageId);
    publishedRows.delete(clientMessageId);
    ports.entries.remove(clientMessageId);
  }

  function armDeadline(entry: OutboxEntry): void {
    const existing = deadlineTimers.get(entry.clientMessageId);
    if (existing) clearTimeout(existing);
    const delay = Math.max(0, entry.deadlineAt - ports.now());
    deadlineTimers.set(
      entry.clientMessageId,
      setTimeout(() => {
        deadlineTimers.delete(entry.clientMessageId);
        const current = find(entry.clientMessageId);
        if (!current || current.delivery.status !== "waiting") return;
        // An attempt in flight settles the entry itself once it ends.
        if (inFlight.has(entry.clientMessageId)) return;
        fail(current, i18n.t("connectionResilience.outbox.deliveryTimedOut"));
      }, delay),
    );
  }

  function publishRow(entry: OutboxEntry): void {
    if (publishedRows.has(entry.clientMessageId)) return;
    const submission = ports.submission(entry.serverId);
    if (!submission) return;
    try {
      submission.begin(
        entry.agentId,
        createUserMessage({
          clientMessageId: entry.clientMessageId,
          text: entry.text,
          timestamp: new Date(entry.submittedAt),
          images: entry.images,
          attachments: entry.attachments,
          ...(entry.turnId ? { turnId: entry.turnId } : {}),
        }),
      );
    } catch (error) {
      // The canonical row arrived before the restored entry could republish its
      // optimistic one; the resend below settles against the daemon's receipt.
      console.warn("[Outbox] Optimistic row already present", error);
    }
    publishedRows.add(entry.clientMessageId);
  }

  function settle(entry: OutboxEntry): void {
    ports.submission(entry.serverId)?.accept(entry.agentId, entry.clientMessageId);
    forget(entry.clientMessageId);
  }

  function fail(entry: OutboxEntry, error: string): void {
    const outcome = publishedRows.has(entry.clientMessageId)
      ? ports.submission(entry.serverId)?.reject(entry.agentId, entry.clientMessageId)
      : undefined;
    if (outcome === "accepted") {
      // The provider already echoed the prompt; only the RPC answer was lost.
      forget(entry.clientMessageId);
      return;
    }
    const timer = deadlineTimers.get(entry.clientMessageId);
    if (timer) clearTimeout(timer);
    deadlineTimers.delete(entry.clientMessageId);
    publishedRows.delete(entry.clientMessageId);
    ports.entries.put({ ...entry, delivery: { status: "failed", error } });
  }

  async function deliver(entry: OutboxEntry): Promise<DeliveryOutcome> {
    const client = ports.getClient(entry.serverId);
    if (!client?.isConnected) return "waiting";
    publishRow(entry);
    inFlight.add(entry.clientMessageId);
    try {
      const images =
        encodedImages.get(entry.clientMessageId) ?? (await ports.encodeImages(entry.images)) ?? [];
      await client.sendAgentMessage(entry.agentId, entry.text, {
        messageId: entry.clientMessageId,
        ...(entry.activeTurnBehavior ? { activeTurnBehavior: entry.activeTurnBehavior } : {}),
        images,
        attachments: entry.attachments,
      });
      if (find(entry.clientMessageId)) settle(entry);
      return "settled";
    } catch (error) {
      const current = find(entry.clientMessageId);
      if (!current) return "settled";
      const kind = classifyDeliveryError(error);
      if (kind === "outcome_unknown") {
        settle(current);
        return "settled";
      }
      if (kind === "connection" && ports.now() < current.deadlineAt) return "waiting";
      fail(
        current,
        kind === "connection"
          ? i18n.t("connectionResilience.outbox.deliveryTimedOut")
          : errorMessage(error),
      );
      return "failed";
    } finally {
      inFlight.delete(entry.clientMessageId);
    }
  }

  async function flushOnce(serverId: string): Promise<void> {
    const blockedAgents = new Set<string>();
    const waiting = ports.entries
      .list()
      .filter((entry) => entry.serverId === serverId && entry.delivery.status === "waiting");
    for (const entry of waiting) {
      if (blockedAgents.has(entry.agentId) || inFlight.has(entry.clientMessageId)) continue;
      const current = find(entry.clientMessageId);
      if (!current || current.delivery.status !== "waiting") continue;
      // A later prompt must not overtake an earlier one to the same agent.
      if ((await deliver(current)) === "waiting") blockedAgents.add(entry.agentId);
    }
  }

  function flush(serverId: string): Promise<void> {
    const running = flushing.get(serverId);
    if (running) {
      flushAgain.add(serverId);
      return running;
    }
    const run = (async () => {
      do {
        flushAgain.delete(serverId);
        await flushOnce(serverId);
      } while (flushAgain.has(serverId));
    })().finally(() => {
      flushing.delete(serverId);
    });
    flushing.set(serverId, run);
    return run;
  }

  async function flushAll(): Promise<void> {
    const serverIds = new Set(ports.entries.list().map((entry) => entry.serverId));
    await Promise.all(Array.from(serverIds, (serverId) => flush(serverId)));
  }

  return {
    hold(message, images) {
      const entry: OutboxEntry = {
        ...message,
        deadlineAt: ports.now() + OUTBOX_DELIVERY_DEADLINE_MS,
        delivery: { status: "waiting" },
      };
      ports.entries.put(entry);
      publishedRows.add(entry.clientMessageId);
      if (images) encodedImages.set(entry.clientMessageId, images);
      retain(entry);
      armDeadline(entry);
      void flush(entry.serverId);
    },
    flush,
    flushAll,
    retry(clientMessageId) {
      const entry = find(clientMessageId);
      if (!entry || entry.delivery.status !== "failed") return;
      const waiting: OutboxEntry = {
        ...entry,
        deadlineAt: ports.now() + OUTBOX_DELIVERY_DEADLINE_MS,
        delivery: { status: "waiting" },
      };
      ports.entries.put(waiting);
      publishRow(waiting);
      armDeadline(waiting);
      void flush(waiting.serverId);
    },
    discard(clientMessageId) {
      const entry = find(clientMessageId);
      if (!entry) return null;
      if (publishedRows.has(clientMessageId)) {
        ports.submission(entry.serverId)?.reject(entry.agentId, clientMessageId);
      }
      forget(clientMessageId);
      return entry;
    },
    restore() {
      for (const entry of ports.entries.list()) {
        retain(entry);
        if (entry.delivery.status !== "waiting") continue;
        if (ports.now() >= entry.deadlineAt) {
          fail(entry, i18n.t("connectionResilience.outbox.deliveryTimedOut"));
          continue;
        }
        armDeadline(entry);
      }
      void flushAll();
    },
    dispose() {
      for (const timer of deadlineTimers.values()) clearTimeout(timer);
      deadlineTimers.clear();
      for (const release of releaseImages.values()) release();
      releaseImages.clear();
    },
  };
}
