import { afterEach, expect, test, vi } from "vitest";
import { PreviewSession } from "./session.js";

afterEach(() => vi.useRealTimers());
test("cancelling before start returns stops the late operation and never reconnects", async () => {
  let finish = (_value: { operationId: string; phase: "preparing" }) => {};
  const stop = vi.fn(async () => ({ phase: "stopped" as const }));
  const session = new PreviewSession({
    start: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    status: vi.fn(),
    frame: vi.fn(),
    input: vi.fn(),
    stop,
  });
  const connecting = session.connect("android", "Pixel");
  await Promise.resolve();
  await session.stop();
  finish({ operationId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", phase: "preparing" });
  await connecting;
  expect(stop).toHaveBeenCalledWith({ operationId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" });
  expect(session.getSnapshot().phase).toBe("stopped");
  session.close();
});

test("late frame and input failure cannot change a stopped viewer", async () => {
  let finish = (_value: { phase: "ready"; message: string; image: null }) => {};
  const session = new PreviewSession({
    start: async () => ({
      operationId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      phase: "preparing",
    }),
    status: async () => ({ phase: "preparing", message: "" }),
    frame: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    input: vi.fn(),
    stop: async () => ({ phase: "stopped" }),
  });
  await session.connect("android", "Pixel");
  await Promise.resolve();
  await session.stop();
  finish({ phase: "ready", message: "late", image: null });
  await Promise.resolve();
  expect(session.getSnapshot()).toMatchObject({ phase: "stopped", image: null });
  session.close();
});
