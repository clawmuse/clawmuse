import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DaemonConnectionError } from "@getpaseo/client/internal/daemon-client";
import type { MessageSubmissionWriter } from "@/composer/actions";
import type { MessageSubmissionRejectionOutcome } from "@/composer/submission/model";
import {
  createOutboxDelivery,
  type HeldMessage,
  type OutboxClient,
  type OutboxDelivery,
  type OutboxEntryStore,
} from "./delivery";
import { OUTBOX_DELIVERY_DEADLINE_MS, type OutboxEntry } from "./model";

interface SentMessage {
  agentId: string;
  text: string;
  messageId: string;
}

class FakeHost implements OutboxClient {
  isConnected = false;
  readonly sent: SentMessage[] = [];
  private readonly answers: Array<Error | null> = [];

  answerNextWith(answer: Error | null): void {
    this.answers.push(answer);
  }

  async sendAgentMessage(
    agentId: string,
    text: string,
    options: { messageId: string },
  ): Promise<unknown> {
    this.sent.push({ agentId, text, messageId: options.messageId });
    const answer = this.answers.shift() ?? null;
    if (answer) throw answer;
    return {};
  }
}

class MemoryEntries implements OutboxEntryStore {
  entries: OutboxEntry[] = [];
  list(): readonly OutboxEntry[] {
    return this.entries;
  }
  put(entry: OutboxEntry): void {
    const index = this.entries.findIndex((item) => item.clientMessageId === entry.clientMessageId);
    if (index < 0) this.entries = [...this.entries, entry];
    else this.entries = this.entries.map((item, i) => (i === index ? entry : item));
  }
  remove(clientMessageId: string): void {
    this.entries = this.entries.filter((entry) => entry.clientMessageId !== clientMessageId);
  }
}

class FakeTimeline implements MessageSubmissionWriter {
  readonly rows = new Set<string>();
  readonly accepted: string[] = [];
  canonicalEchoed = new Set<string>();

  begin = (_agentId: string, message: { clientMessageId?: string }) => {
    if (message.clientMessageId) this.rows.add(message.clientMessageId);
  };
  accept = (_agentId: string, clientMessageId: string) => {
    this.accepted.push(clientMessageId);
  };
  reject = (_agentId: string, clientMessageId: string): MessageSubmissionRejectionOutcome => {
    if (this.canonicalEchoed.has(clientMessageId)) return "accepted";
    this.rows.delete(clientMessageId);
    return "rejected";
  };
}

function held(clientMessageId: string, agentId = "agent-1"): HeldMessage {
  return {
    serverId: "srv",
    agentId,
    clientMessageId,
    text: `text ${clientMessageId}`,
    images: [],
    attachments: [],
    activeTurnBehavior: null,
    turnId: null,
    submittedAt: Date.now(),
  };
}

function connectionLost(): Error {
  return new DaemonConnectionError("Connection lost", "DAEMON_CONNECTION_LOST");
}

describe("outbox delivery", () => {
  let host: FakeHost;
  let entries: MemoryEntries;
  let timeline: FakeTimeline;
  let delivery: OutboxDelivery;
  let retained: string[];

  function createDelivery(): OutboxDelivery {
    return createOutboxDelivery({
      entries,
      getClient: () => host,
      submission: () => timeline,
      encodeImages: async () => [],
      retainImages: (images) => {
        retained.push(...images.map((image) => image.id));
        return () => {
          retained = retained.filter((id) => !images.some((image) => image.id === id));
        };
      },
      now: () => Date.now(),
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    host = new FakeHost();
    entries = new MemoryEntries();
    timeline = new FakeTimeline();
    retained = [];
    delivery = createDelivery();
  });

  afterEach(() => {
    delivery.dispose();
    vi.useRealTimers();
  });

  test("resends a held prompt with the same message id once the host is back", async () => {
    timeline.rows.add("m1");
    delivery.hold(held("m1"), null);
    await delivery.flush("srv");
    expect(host.sent).toEqual([]);

    host.isConnected = true;
    await delivery.flush("srv");

    expect(host.sent).toEqual([{ agentId: "agent-1", text: "text m1", messageId: "m1" }]);
    expect(timeline.accepted).toEqual(["m1"]);
    expect(entries.entries).toEqual([]);
  });

  test("keeps per-agent order and stops at the first prompt that still cannot be sent", async () => {
    delivery.hold(held("m1"), null);
    delivery.hold(held("m2"), null);
    delivery.hold(held("other", "agent-2"), null);
    host.isConnected = true;
    host.answerNextWith(connectionLost());

    await delivery.flush("srv");

    expect(host.sent.map((message) => message.messageId)).toEqual(["m1", "other"]);
    expect(entries.entries.map((entry) => entry.clientMessageId)).toEqual(["m1", "m2"]);
  });

  test("a rejection from the daemon fails the prompt, rolls back its row and keeps the text", async () => {
    timeline.rows.add("m1");
    delivery.hold(held("m1"), null);
    host.isConnected = true;
    host.answerNextWith(new Error("Agent not found"));

    await delivery.flush("srv");

    expect(timeline.rows.has("m1")).toBe(false);
    expect(entries.entries).toEqual([
      expect.objectContaining({
        clientMessageId: "m1",
        text: "text m1",
        delivery: { status: "failed", error: "Agent not found" },
      }),
    ]);
  });

  test("a prompt still waiting at the deadline is marked failed instead of dropped", async () => {
    timeline.rows.add("m1");
    delivery.hold(held("m1"), null);

    await vi.advanceTimersByTimeAsync(OUTBOX_DELIVERY_DEADLINE_MS);

    expect(timeline.rows.has("m1")).toBe(false);
    expect(entries.entries).toEqual([
      expect.objectContaining({
        clientMessageId: "m1",
        delivery: { status: "failed", error: expect.any(String) },
      }),
    ]);
  });

  test("a deadline reached after the provider already echoed the prompt settles it", async () => {
    timeline.rows.add("m1");
    timeline.canonicalEchoed.add("m1");
    delivery.hold(held("m1"), null);

    await vi.advanceTimersByTimeAsync(OUTBOX_DELIVERY_DEADLINE_MS);

    expect(timeline.rows.has("m1")).toBe(true);
    expect(entries.entries).toEqual([]);
  });

  test("retry republishes the row and sends with the original message id", async () => {
    delivery.hold(held("m1"), null);
    host.isConnected = true;
    host.answerNextWith(new Error("Agent is busy"));
    await delivery.flush("srv");
    expect(timeline.rows.has("m1")).toBe(false);

    delivery.retry("m1");
    await delivery.flush("srv");

    expect(host.sent.map((message) => message.messageId)).toEqual(["m1", "m1"]);
    expect(timeline.rows.has("m1")).toBe(true);
    expect(entries.entries).toEqual([]);
  });

  test("discard hands the content back and releases retained images", () => {
    const image = {
      id: "img-1",
      mimeType: "image/png",
      storageType: "web-indexeddb" as const,
      storageKey: "img-1",
      createdAt: 1,
    };
    delivery.hold({ ...held("m1"), images: [image] }, null);
    expect(retained).toEqual(["img-1"]);

    const discarded = delivery.discard("m1");

    expect(discarded?.text).toBe("text m1");
    expect(retained).toEqual([]);
    expect(entries.entries).toEqual([]);
  });

  test("restore republishes persisted prompts and resends them after an app restart", async () => {
    entries.put({
      ...held("m1"),
      deadlineAt: Date.now() + 60_000,
      delivery: { status: "waiting" },
    });
    host.isConnected = true;

    delivery.restore();
    await delivery.flush("srv");

    expect(timeline.rows.has("m1")).toBe(true);
    expect(host.sent.map((message) => message.messageId)).toEqual(["m1"]);
    expect(entries.entries).toEqual([]);
  });

  test("restore fails persisted prompts whose deadline passed while the app was closed", () => {
    entries.put({
      ...held("m1"),
      deadlineAt: Date.now() - 1,
      delivery: { status: "waiting" },
    });

    delivery.restore();

    expect(entries.entries[0]?.delivery.status).toBe("failed");
    expect(host.sent).toEqual([]);
  });
});
