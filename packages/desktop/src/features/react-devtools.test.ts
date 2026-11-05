import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({ getPath: vi.fn(), request: vi.fn() }));
vi.mock("electron", () => ({
  app: { getPath: electron.getPath },
  net: { request: electron.request },
  session: { defaultSession: { extensions: { loadExtension: vi.fn() } } },
}));
import { loadReactDevTools } from "./react-devtools.js";

let userData: string;
beforeEach(async () => {
  vi.stubEnv("CI", "");
  userData = await mkdtemp(path.join(tmpdir(), "react-devtools-test-"));
  electron.getPath.mockReturnValue(userData);
  electron.request.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(userData, { recursive: true, force: true });
});

it("does not download a developer extension in CI", async () => {
  vi.stubEnv("CI", "true");
  await loadReactDevTools();
  expect(electron.request).not.toHaveBeenCalled();
});

it("allows startup to continue after a failed download", async () => {
  const request = Object.assign(new EventEmitter(), {
    end: () => request.emit("error", new Error("connection refused")),
    abort: vi.fn(),
  });
  electron.request.mockReturnValue(request);
  await expect(loadReactDevTools()).resolves.toBeUndefined();
  expect(console.warn).toHaveBeenCalledWith(
    "[DevTools] Failed to load React DevTools:",
    expect.objectContaining({ message: "connection refused" }),
  );
});

it("aborts a stalled download so startup can continue", async () => {
  vi.useFakeTimers();
  let started!: () => void;
  const requestStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  const request = Object.assign(new EventEmitter(), { end: started, abort: vi.fn() });
  electron.request.mockReturnValue(request);
  const loading = loadReactDevTools();
  await requestStarted;
  await vi.advanceTimersByTimeAsync(5_000);
  await expect(loading).resolves.toBeUndefined();
  expect(request.abort).toHaveBeenCalledOnce();
  expect(console.warn).toHaveBeenCalledWith(
    "[DevTools] Failed to load React DevTools:",
    expect.objectContaining({ message: "React DevTools download timed out" }),
  );
});
