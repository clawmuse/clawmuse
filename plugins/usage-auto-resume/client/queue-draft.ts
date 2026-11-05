import { queueErrorMessage } from "./queue-error";

export interface QueueDraftSnapshot {
  text: string;
  pending: boolean;
  error: string | null;
  attempt: { id: string; text: string } | null;
}

// An idempotency key, not a credential. Plugin clients also run without Web Crypto on native.
function messageId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === "x" ? value : (value & 3) | 8).toString(16);
  });
}

export function createQueueDraft(createId: () => string = messageId) {
  let snapshot: QueueDraftSnapshot = { text: "", pending: false, error: null, attempt: null };
  const listeners = new Set<() => void>();
  const update = (next: QueueDraftSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    edit(text: string) {
      if (!snapshot.attempt) update({ ...snapshot, text, error: null });
    },
    async submit(
      send: (input: { id: string; text: string }) => Promise<unknown>,
      failureLabel: () => string,
      translate?: Parameters<typeof queueErrorMessage>[2],
    ): Promise<boolean> {
      if (snapshot.pending || !snapshot.text.trim()) return false;
      const attempt = snapshot.attempt ?? { id: createId(), text: snapshot.text.trim() };
      update({ ...snapshot, attempt, pending: true, error: null });
      try {
        await send(attempt);
        update({ text: "", pending: false, error: null, attempt: null });
        return true;
      } catch (error) {
        // A timeout may follow a successful write. Keep both payload and ID for the retry.
        update({
          ...snapshot,
          pending: false,
          error: queueErrorMessage(error, failureLabel(), translate),
        });
        return false;
      }
    },
  };
}

const drafts = new Map<string, ReturnType<typeof createQueueDraft>>();

/** Closing a sheet must not discard a failed or in-flight submission. */
export function getQueueDraft(hostId: string, agentId: string) {
  const key = JSON.stringify([hostId, agentId]);
  let draft = drafts.get(key);
  if (!draft) {
    draft = createQueueDraft();
    drafts.set(key, draft);
  }
  return draft;
}
