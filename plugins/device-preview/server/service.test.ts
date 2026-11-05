import { afterEach, expect, test, vi } from "vitest";
import { DevicePreviewService } from "./service.js";
import type { DeviceAdapter } from "./adapter.js";

function fixture() {
  const prepare = vi.fn(async (_platform, _id, signal: AbortSignal) => {
    if (signal.aborted) throw new Error("cancelled");
  });
  const commands: string[][] = [];
  const adapter: DeviceAdapter = {
    capabilities: async () => ({
      ios: { available: true, reason: "" },
      android: { available: true, reason: "" },
    }),
    list: async () => ({
      devices: [{ id: "Pixel", name: "Pixel", state: "shutdown", reason: "", occupied: false }],
      excluded: [],
    }),
    prepare,
    capture: async () => ({
      base64: "AA==",
      width: 100,
      height: 200,
      screenWidth: 1000,
      screenHeight: 2000,
    }),
    input: async (_platform, _id, action) => {
      commands.push([action.type]);
    },
    close: vi.fn(async () => {}),
  };
  const service = new DevicePreviewService(adapter);
  return { service, adapter, prepare, commands };
}
const services: DevicePreviewService[] = [];
afterEach(async () => {
  for (const service of services.splice(0)) await service.close();
  vi.useRealTimers();
});

test("discovery never prepares a device; start requires the last catalog", async () => {
  const { service, prepare } = fixture();
  services.push(service);
  await expect(service.start("android", "Pixel")).rejects.toThrow("列表");
  await service.list("android");
  expect(prepare).not.toHaveBeenCalled();
  await expect(service.start("android", "not-listed")).rejects.toThrow("列表");
});

test("a device has one lease across panels and expires 30 seconds after frame polling", async () => {
  vi.useFakeTimers();
  const { service } = fixture();
  services.push(service);
  await service.list("android");
  const operation = await service.start("android", "Pixel");
  await expect(service.start("android", "Pixel")).rejects.toThrow("占用");
  expect((await service.list("android")).devices[0]?.occupied).toBe(true);
  await vi.advanceTimersByTimeAsync(29_000);
  await service.frame(operation.operationId);
  await vi.advanceTimersByTimeAsync(29_000);
  expect(service.status(operation.operationId).phase).toBe("ready");
  await vi.advanceTimersByTimeAsync(1_000);
  expect(service.status(operation.operationId).phase).toBe("stopped");
  expect((await service.list("android")).devices[0]?.occupied).toBe(false);
});

test("stop cancels preparation and late completion cannot revive an operation", async () => {
  const { service, adapter, commands } = fixture();
  services.push(service);
  let finish = () => {};
  adapter.prepare = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await service.list("android");
  const operation = await service.start("android", "Pixel");
  await Promise.resolve();
  const stopping = service.stop(operation.operationId);
  finish();
  await stopping;
  expect(service.status(operation.operationId).phase).toBe("stopped");
  expect(commands.flat()).not.toContain("shutdown");
  expect(commands.flat()).not.toContain("kill-server");
  await expect(service.frame("11111111-2222-4333-8444-555555555555")).rejects.toThrow("无效");
  await expect(
    service.input("11111111-2222-4333-8444-555555555555", { type: "home" }),
  ).rejects.toThrow("无效");
});

test("iOS refuses Android input; Android touch requires a recent captured frame", async () => {
  const { service, adapter } = fixture();
  services.push(service);
  adapter.list = async () => ({
    devices: [
      {
        id: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE",
        name: "iPhone",
        state: "booted",
        reason: "",
        occupied: false,
      },
    ],
    excluded: [],
  });
  await service.list("ios");
  const operation = await service.start("ios", "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE");
  await Promise.resolve();
  await Promise.resolve();
  await expect(service.input(operation.operationId, { type: "home" })).rejects.toThrow("iOS");
  await expect(
    service.input(operation.operationId, { type: "appearance", mode: "dark" }),
  ).resolves.toEqual({ accepted: true });
});

test("touch waits for a frame; rotation invalidates old pixel dimensions", async () => {
  const { service, adapter } = fixture();
  services.push(service);
  const inputs = vi.spyOn(adapter, "input");
  await service.list("android");
  const operation = await service.start("android", "Pixel");
  await Promise.resolve();
  await Promise.resolve();
  const tap = { type: "tap", point: { x: 1, y: 1 } } as const;
  await expect(service.input(operation.operationId, tap)).rejects.toThrow("截图");
  await service.frame(operation.operationId);
  await service.input(operation.operationId, tap);
  expect(inputs.mock.calls[0]?.[3]).toEqual({ width: 1000, height: 2000 });
  await service.input(operation.operationId, { type: "rotate" });
  await expect(service.input(operation.operationId, tap)).rejects.toThrow("截图");
});

test("status queries and input do not renew a lease", async () => {
  vi.useFakeTimers();
  const { service } = fixture();
  services.push(service);
  await service.list("android");
  const operation = await service.start("android", "Pixel");
  await vi.advanceTimersByTimeAsync(29_000);
  service.status(operation.operationId);
  await service.input(operation.operationId, { type: "home" });
  await vi.advanceTimersByTimeAsync(1000);
  expect(service.status(operation.operationId).phase).toBe("stopped");
});

test("a failed preparation releases the lease and does not expose command errors", async () => {
  const { service, adapter } = fixture();
  services.push(service);
  adapter.prepare = async () => {
    throw new Error("secret account /Users/private");
  };
  await service.list("android");
  const operation = await service.start("android", "Pixel");
  await Promise.resolve();
  await Promise.resolve();
  expect(service.status(operation.operationId)).toEqual({
    phase: "failed",
    message: "设备准备失败，请检查工具和设备状态后刷新重试",
  });
  expect((await service.list("android")).devices[0]?.occupied).toBe(false);
});

test("stop holds the lease until in-flight capture ends and discards its late image", async () => {
  const { service, adapter } = fixture();
  services.push(service);
  let finish = (_frame: {
    base64: string;
    width: number;
    height: number;
    screenWidth: number;
    screenHeight: number;
  }) => {};
  adapter.capture = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  await service.list("android");
  const operation = await service.start("android", "Pixel");
  await Promise.resolve();
  await Promise.resolve();
  const capturing = service.frame(operation.operationId);
  await Promise.resolve();
  const stopping = service.stop(operation.operationId);
  await expect(service.start("android", "Pixel")).rejects.toThrow("占用");
  finish({ base64: "AA==", width: 100, height: 200, screenWidth: 100, screenHeight: 200 });
  await stopping;
  expect(await capturing).toMatchObject({ phase: "stopped", image: null });
  expect((await service.list("android")).devices[0]?.occupied).toBe(false);
});
