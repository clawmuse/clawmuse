import { randomUUID } from "node:crypto";
import {
  LEASE_MS,
  deviceIdSchema,
  actionSchema,
  udidSchema,
  type Action,
  type DevicePlatform,
  type PreviewFrame,
  type PreviewStatus,
} from "../shared/contracts.js";
import type { DeviceAdapter, ScreenSize } from "./adapter.js";
import type { DeviceCatalog } from "./discovery.js";

interface Operation {
  id: string;
  platform: DevicePlatform;
  deviceId: string;
  phase: PreviewStatus["phase"];
  message: string;
  lastPoll: number;
  controller: AbortController;
  preparation: Promise<void>;
  capture: Promise<PreviewFrame> | null;
  input: Promise<unknown>;
  screen: ScreenSize | null;
  lastImage: string;
  lastCapture: number;
  stopping: Promise<void> | null;
}

export class DevicePreviewService {
  private readonly operations = new Map<string, Operation>();
  private readonly leases = new Map<string, string>();
  private readonly catalogs = new Map<DevicePlatform, DeviceCatalog>();
  private readonly shutdown = new AbortController();
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(private readonly adapter: DeviceAdapter) {
    this.timer = setInterval(() => {
      for (const operation of this.operations.values()) {
        if (Date.now() - operation.lastPoll < LEASE_MS) continue;
        if (operation.phase === "stopped" || operation.phase === "failed")
          this.operations.delete(operation.id);
        else void this.stop(operation.id).catch(() => {});
      }
    }, 1000);
  }

  capabilities() {
    return this.adapter.capabilities(
      AbortSignal.any([this.shutdown.signal, AbortSignal.timeout(15_000)]),
    );
  }

  async list(platform: DevicePlatform) {
    let catalog: DeviceCatalog;
    const signal = AbortSignal.any([this.shutdown.signal, AbortSignal.timeout(15_000)]);
    try {
      catalog = await this.adapter.list(platform, signal);
    } catch {
      throw new Error("无法读取设备列表，请检查主机工具和设备状态");
    }
    this.catalogs.set(platform, catalog);
    return {
      devices: catalog.devices.map((device) => ({
        ...device,
        occupied: this.leases.has(`${platform}:${device.id}`),
      })),
      excluded: catalog.excluded,
    };
  }

  async start(platform: DevicePlatform, deviceId: string) {
    if (this.shutdown.signal.aborted) throw new Error("插件已停止");
    deviceIdSchema.parse(deviceId);
    if (platform === "ios") udidSchema.parse(deviceId);
    const device = this.catalogs.get(platform)?.devices.find((item) => item.id === deviceId);
    if (!device || device.state === "unavailable") throw new Error("请从最近的可用设备列表中选择");
    const key = `${platform}:${deviceId}`;
    if (this.leases.has(key)) throw new Error("设备已占用，请等待另一面板停止预览");
    const id = randomUUID();
    const operation: Operation = {
      id,
      platform,
      deviceId,
      phase: "preparing",
      message: "正在准备设备",
      lastPoll: Date.now(),
      controller: new AbortController(),
      preparation: Promise.resolve(),
      capture: null,
      input: Promise.resolve(),
      screen: null,
      lastImage: "",
      lastCapture: 0,
      stopping: null,
    };
    this.leases.set(key, id);
    this.operations.set(id, operation);
    operation.preparation = this.prepare(operation);
    return { operationId: id, phase: "preparing" as const };
  }

  private async prepare(operation: Operation) {
    try {
      const signal = AbortSignal.any([operation.controller.signal, AbortSignal.timeout(120_000)]);
      await this.adapter.prepare(operation.platform, operation.deviceId, signal);
      if (!operation.controller.signal.aborted) {
        operation.phase = "ready";
        operation.message = "已连接，等待截图";
      }
    } catch {
      if (operation.controller.signal.aborted) return;
      operation.phase = "failed";
      operation.message = "设备准备失败，请检查工具和设备状态后刷新重试";
      this.leases.delete(`${operation.platform}:${operation.deviceId}`);
    }
  }

  private operation(id: string) {
    const operation = this.operations.get(id);
    if (!operation) throw new Error("预览操作无效或已过期");
    return operation;
  }

  status(id: string): PreviewStatus {
    const operation = this.operation(id);
    return { phase: operation.phase, message: operation.message };
  }

  async frame(id: string): Promise<PreviewFrame> {
    const operation = this.operation(id);
    if (operation.controller.signal.aborted) return { ...this.status(id), image: null };
    operation.lastPoll = Date.now();
    if (operation.capture) return operation.capture;
    if (operation.phase !== "ready" || Date.now() - operation.lastCapture < 650)
      return { ...this.status(id), image: null };
    operation.capture = operation.input
      .then(() => this.capture(operation))
      .finally(() => {
        operation.capture = null;
      });
    operation.input = operation.capture.catch(() => {});
    return operation.capture;
  }

  private async capture(operation: Operation): Promise<PreviewFrame> {
    try {
      if (operation.controller.signal.aborted) return { ...this.status(operation.id), image: null };
      const signal = AbortSignal.any([operation.controller.signal, AbortSignal.timeout(15_000)]);
      const frame = await this.adapter.capture(operation.platform, operation.deviceId, signal);
      if (operation.controller.signal.aborted) return { ...this.status(operation.id), image: null };
      operation.screen = { width: frame.screenWidth, height: frame.screenHeight };
      operation.lastCapture = Date.now();
      operation.message = "已连接 · 低频截图";
      const unchanged = operation.lastImage === frame.base64;
      operation.lastImage = frame.base64;
      const image = unchanged
        ? null
        : { base64: frame.base64, width: frame.width, height: frame.height };
      return { ...this.status(operation.id), image };
    } catch {
      operation.screen = null;
      if (!operation.controller.signal.aborted)
        operation.message = "截图失败，请检查设备状态；正在重试";
      return { ...this.status(operation.id), image: null };
    }
  }

  async input(id: string, action: Action) {
    actionSchema.parse(action);
    const operation = this.operation(id);
    if (operation.phase !== "ready") throw new Error("预览尚未就绪");
    if (operation.platform === "ios" && action.type !== "appearance")
      throw new Error("iOS 仅支持切换明暗模式");
    if (operation.platform === "android" && action.type === "appearance")
      throw new Error("Android 不支持此动作");
    if ((action.type === "tap" || action.type === "swipe") && !operation.screen)
      throw new Error("请等待新的截图后再操作");
    const pending = operation.input.then(async () => {
      if (operation.controller.signal.aborted) throw new Error("预览已停止");
      const signal = AbortSignal.any([operation.controller.signal, AbortSignal.timeout(15_000)]);
      await this.adapter.input(
        operation.platform,
        operation.deviceId,
        action,
        operation.screen,
        signal,
      );
      if (action.type === "rotate") operation.screen = null;
      return undefined;
    });
    operation.input = pending.catch(() => {});
    await pending;
    return { accepted: true as const };
  }

  async stop(id: string) {
    const operation = this.operation(id);
    operation.controller.abort();
    operation.phase = "stopped";
    operation.message = "预览已停止，模拟器继续运行";
    operation.lastPoll = Date.now();
    operation.screen = null;
    if (!operation.stopping)
      operation.stopping = (async () => {
        await Promise.allSettled([operation.preparation, operation.capture, operation.input]);
        operation.lastImage = "";
        const key = `${operation.platform}:${operation.deviceId}`;
        if (this.leases.get(key) === id) this.leases.delete(key);
      })();
    await operation.stopping;
    return { phase: "stopped" as const };
  }

  async close() {
    clearInterval(this.timer);
    this.shutdown.abort();
    await Promise.all([...this.operations.keys()].map((id) => this.stop(id)));
    await this.adapter.close();
    this.operations.clear();
    this.catalogs.clear();
    this.leases.clear();
  }
}
