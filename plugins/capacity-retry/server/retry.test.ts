import { expect, test } from "vitest";
import { createRetry, isCapacityError } from "./retry.js";
import { preferences } from "../shared/settings.js";

function fixture(maxRetries = 3) {
  const notices: string[] = [];
  const sent: string[] = [];
  const timers = new Set<() => Promise<void>>();
  const delays: number[] = [];
  const errors: unknown[] = [];
  let available = true;
  let failedSend = false;
  const retry = createRetry({
    settings: async () => ({ maxRetries, intervalSeconds: 7 }),
    schedule(callback, milliseconds) {
      timers.add(callback);
      delays.push(milliseconds);
      return () => {
        timers.delete(callback);
      };
    },
    available: async () => available,
    async send(agentId, messageId) {
      if (failedSend) throw new Error("offline");
      retry.prompt(agentId, messageId);
      sent.push(messageId);
    },
    async notice(_agentId, text) {
      notices.push(text);
    },
    report(error) {
      errors.push(error);
    },
  });
  return {
    retry,
    sent,
    notices,
    timers,
    delays,
    errors,
    busy() {
      available = false;
    },
    failSend() {
      failedSend = true;
    },
    ended: (turnId: string | null, capacity = true, canceled = false) =>
      retry.ended("a", turnId, async () => capacity, canceled),
    async tick() {
      const callbacks = [...timers];
      timers.clear();
      for (const callback of callbacks) await callback();
    },
  };
}

test("only matches the capacity error, not quotes, auth errors or ordinary replies", () => {
  expect(
    isCapacityError("[System Error] Selected model is at capacity. Please try a different model."),
  ).toBe(true);
  expect(isCapacityError("Selected model is at capacity.")).toBe(true);
  expect(isCapacityError("Example: [System Error] Selected model is at capacity.")).toBe(false);
  expect(isCapacityError("Unauthorized")).toBe(false);
  expect(isCapacityError("Done")).toBe(false);
});

test("uses the configured interval and stops after the exact retry budget", async () => {
  const f = fixture(2);
  await f.ended("initial");
  expect(f.sent).toHaveLength(0);
  expect(f.delays).toEqual([7000]);
  await f.tick();
  await f.ended("retry-1");
  await f.tick();
  await f.ended("retry-2");
  await f.tick();
  expect(f.sent).toHaveLength(2);
  expect(f.timers.size).toBe(0);
  expect(f.notices.at(-1)).toContain("已用完 2 次");
});

test("supports providers without turn ids and reminds when retries finish", async () => {
  const f = fixture();
  await f.ended(null);
  await f.tick();
  await f.ended(null);
  await f.tick();
  await f.ended(null, false);
  expect(f.sent).toHaveLength(2);
  expect(f.notices.at(-1)).toContain("已重试 2 次");
  expect(f.timers.size).toBe(0);
});

test.each(["initial", null])(
  "duplicate hooks with turn id %s do not schedule duplicate retries",
  async (turnId) => {
    const f = fixture();
    await Promise.all([f.ended(turnId), f.ended(turnId)]);
    expect(f.timers.size).toBe(1);
  },
);

test.each(["prompt", "cancel", "closed", "settings", "dispose", "busy"])(
  "%s stops a pending retry",
  async (action) => {
    const f = fixture();
    await f.ended("initial");
    if (action === "prompt") f.retry.prompt("a", "human-message");
    if (action === "cancel") await f.ended("initial", false, true);
    if (action === "closed") f.retry.cancel("a");
    if (action === "settings") f.retry.clear();
    if (action === "dispose") f.retry.dispose();
    if (action === "busy") f.busy();
    await f.tick();
    expect(f.sent).toHaveLength(0);
  },
);

test("manual input during asynchronous inspection cancels scheduling", async () => {
  const f = fixture();
  let finish: (value: boolean) => void = () => {};
  const pending = f.retry.ended(
    "a",
    "turn",
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
    false,
  );
  f.retry.prompt("a", "human-message");
  finish(true);
  await pending;
  expect(f.timers.size).toBe(0);
});

test("send failure stops and leaves a reminder", async () => {
  const f = fixture();
  await f.ended("initial");
  f.failSend();
  await f.tick();
  expect(f.errors).toHaveLength(1);
  expect(f.notices.at(-1)).toContain("发送失败");
  expect(f.timers.size).toBe(0);
});

test("settings reject fractional counts and invalid intervals", () => {
  expect(preferences.schema.parse({})).toEqual({ maxRetries: 3, intervalSeconds: 30 });
  for (const values of [
    { maxRetries: 0 },
    { maxRetries: 1.5 },
    { intervalSeconds: 0 },
    { intervalSeconds: 86401 },
  ]) {
    expect(preferences.schema.safeParse(values).success).toBe(false);
  }
});
