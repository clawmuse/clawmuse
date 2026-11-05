import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditingKeepAwake } from "./editing-keep-awake";

function createHarness(idleTimeoutMs?: number | null) {
  const events: string[] = [];
  const errors: unknown[] = [];
  const controller = new EditingKeepAwake(
    {
      activate: async () => {
        events.push("awake");
      },
      deactivate: async () => {
        events.push("released");
      },
      subscribeToForeground: () => () => {},
      onError: (error) => {
        errors.push(error);
      },
    },
    idleTimeoutMs,
  );
  return { controller, events, errors };
}

describe("composer editing keep-awake", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps dictation awake through long recording and final processing without text or timer updates", async () => {
    const { controller, events } = createHarness(null);
    await controller.setEligible(true);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(events).toEqual(["awake"]);
    expect(vi.getTimerCount()).toBe(0);
    await controller.setEligible(true);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(events).toEqual(["awake"]);
    await controller.setEligible(false);
    expect(events).toEqual(["awake", "released"]);
    await controller.dispose();
  });

  it("releases dictation when hidden and reacquires it when the active recording returns", async () => {
    const { controller, events } = createHarness(null);
    await controller.setEligible(true);
    await controller.setEligible(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(events).toEqual(["awake", "released"]);
    await controller.setEligible(true);
    expect(events).toEqual(["awake", "released", "awake"]);
    await controller.dispose();
    expect(events).toEqual(["awake", "released", "awake", "released"]);
  });

  it("keeps focus awake while the keyboard waits for its first dictated text, then expires", async () => {
    const { controller, events } = createHarness();
    await controller.setEligible(true);
    expect(events).toEqual(["awake"]);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(events).toEqual(["awake"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(events).toEqual(["awake", "released"]);
    await controller.dispose();
  });

  it("extends the deadline for ongoing dictation without repeatedly activating the native lock", async () => {
    const { controller, events } = createHarness();
    await controller.setEligible(true);
    for (let update = 0; update < 4; update += 1) {
      await vi.advanceTimersByTimeAsync(45_000);
      await controller.recordActivity();
    }
    expect(events).toEqual(["awake"]);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(events).toEqual(["awake"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(events).toEqual(["awake", "released"]);
    await controller.dispose();
  });

  it("does not extend an unchanged focus state when a draft rerenders or restores", async () => {
    const { controller, events } = createHarness();
    await controller.setEligible(true);
    await vi.advanceTimersByTimeAsync(45_000);
    await controller.setEligible(true);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(events).toEqual(["awake", "released"]);
    await controller.setEligible(true);
    expect(events).toEqual(["awake", "released"]);
    await controller.recordActivity();
    expect(events).toEqual(["awake", "released", "awake"]);
    await controller.dispose();
  });

  it("releases when editing becomes ineligible and ignores updates while hidden or unfocused", async () => {
    const { controller, events } = createHarness();
    await controller.recordActivity();
    expect(events).toEqual([]);
    await controller.setEligible(true);
    await controller.setEligible(false);
    await controller.recordActivity();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(events).toEqual(["awake", "released"]);
    expect(vi.getTimerCount()).toBe(0);
    await controller.dispose();
  });

  it("releases on submission even while focused, and wakes again for a new edit", async () => {
    const { controller, events } = createHarness();
    await controller.setEligible(true);
    await controller.finish();
    expect(events).toEqual(["awake", "released"]);
    expect(vi.getTimerCount()).toBe(0);
    await controller.recordActivity();
    expect(events).toEqual(["awake", "released", "awake"]);
    await controller.dispose();
  });

  it("does not restart after reset restores the same editing focus, but does for a new focus", async () => {
    const { controller, events } = createHarness();
    await controller.setEligible(true);
    await controller.finish();
    await controller.setEligible(true);
    expect(events).toEqual(["awake", "released"]);
    expect(vi.getTimerCount()).toBe(0);
    await controller.setEligible(false);
    await controller.setEligible(true);
    expect(events).toEqual(["awake", "released", "awake"]);
    await controller.dispose();
  });

  it("releases an activation that completes after unmount and rejects later activity", async () => {
    let finishActivation!: () => void;
    const activation = new Promise<void>((resolve) => {
      finishActivation = resolve;
    });
    const events: string[] = [];
    const errors: unknown[] = [];
    const controller = new EditingKeepAwake({
      activate: async () => {
        events.push("activating");
        await activation;
        events.push("awake");
      },
      deactivate: async () => {
        events.push("released");
      },
      subscribeToForeground: () => () => {},
      onError: (error) => {
        errors.push(error);
      },
    });
    const opening = controller.setEligible(true);
    await Promise.resolve();
    expect(events).toEqual(["activating"]);
    const closing = controller.dispose();
    finishActivation();
    await opening;
    await closing;
    await controller.setEligible(true);
    await controller.recordActivity();
    expect(events).toEqual(["activating", "awake", "released"]);
    expect(errors).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps a new composer and the voice lock awake when another composer closes", async () => {
    const awakeTags = new Set(["voice"]);
    const errors: unknown[] = [];
    const create = (tag: string) =>
      new EditingKeepAwake({
        activate: async () => {
          awakeTags.add(tag);
        },
        deactivate: async () => {
          awakeTags.delete(tag);
        },
        subscribeToForeground: () => () => {},
        onError: (error) => {
          errors.push(error);
        },
      });
    const previous = create("previous-composer");
    const current = create("current-composer");
    await previous.setEligible(true);
    await current.setEligible(true);
    await previous.dispose();
    expect([...awakeTags]).toEqual(["voice", "current-composer"]);
    await current.dispose();
    expect([...awakeTags]).toEqual(["voice"]);
    expect(errors).toEqual([]);
  });

  it("reports native activation failures and retries on the next text edit", async () => {
    const failure = new Error("No native activity");
    const errors: unknown[] = [];
    let attempts = 0;
    let awake = false;
    const controller = new EditingKeepAwake({
      activate: async () => {
        attempts += 1;
        if (attempts === 1) throw failure;
        awake = true;
      },
      deactivate: async () => {
        awake = false;
      },
      subscribeToForeground: () => () => {},
      onError: (error) => {
        errors.push(error);
      },
    });
    await controller.setEligible(true);
    expect(errors).toEqual([failure]);
    expect(awake).toBe(false);
    await controller.recordActivity();
    expect(attempts).toBe(2);
    expect(awake).toBe(true);
    await controller.dispose();
    expect(awake).toBe(false);
  });

  it.each(["finish", "foreground"] as const)(
    "retries a failed release on %s, including after unmount",
    async (retry) => {
      const failure = new Error("No native activity");
      const errors: unknown[] = [];
      const foregroundListeners = new Set<() => void>();
      let available = true;
      let awake = false;
      let releaseAttempts = 0;
      const controller = new EditingKeepAwake({
        activate: async () => {
          awake = true;
        },
        deactivate: async () => {
          releaseAttempts += 1;
          if (!available) throw failure;
          awake = false;
        },
        subscribeToForeground: (listener) => {
          foregroundListeners.add(listener);
          return () => {
            foregroundListeners.delete(listener);
          };
        },
        onError: (error) => {
          errors.push(error);
        },
      });
      await controller.setEligible(true);
      available = false;
      if (retry === "foreground") await controller.dispose();
      else await controller.finish();
      expect(errors).toEqual([failure]);
      expect(awake).toBe(true);
      expect(foregroundListeners.size).toBe(1);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(releaseAttempts).toBe(1);
      expect(vi.getTimerCount()).toBe(0);

      available = true;
      if (retry === "foreground") {
        for (const listener of foregroundListeners) listener();
        await vi.advanceTimersByTimeAsync(0);
      } else {
        await controller.finish();
      }
      expect(releaseAttempts).toBe(2);
      expect(awake).toBe(false);
      expect(foregroundListeners.size).toBe(0);
      await controller.dispose();
    },
  );
});
