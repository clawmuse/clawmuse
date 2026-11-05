import { access, constants, mkdtemp, open, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { RpcOutput } from "@getpaseo/plugin";
import {
  capabilitiesRpc,
  deviceIdSchema,
  pixelPoint,
  type Action,
  type DevicePlatform,
} from "../shared/contracts.js";
import {
  matchAndroid,
  parseAdbDevices,
  parseAvds,
  parseSimctl,
  type DeviceCatalog,
} from "./discovery.js";
import { compressFrame } from "./image.js";
import { CommandRunner, launchEmulator } from "./process.js";

export interface CapturedFrame {
  base64: string;
  width: number;
  height: number;
  screenWidth: number;
  screenHeight: number;
}
export interface ScreenSize {
  width: number;
  height: number;
}
export interface DeviceAdapter {
  capabilities(signal: AbortSignal): Promise<RpcOutput<typeof capabilitiesRpc>>;
  list(platform: DevicePlatform, signal: AbortSignal): Promise<DeviceCatalog>;
  prepare(platform: DevicePlatform, id: string, signal: AbortSignal): Promise<void>;
  capture(platform: DevicePlatform, id: string, signal: AbortSignal): Promise<CapturedFrame>;
  input(
    platform: DevicePlatform,
    id: string,
    action: Action,
    size: ScreenSize | null,
    signal: AbortSignal,
  ): Promise<void>;
  close(): Promise<void>;
}
interface AndroidTools {
  adb: string;
  emulator: string;
}

async function executable(file: string) {
  try {
    await access(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function androidTools(): Promise<AndroidTools | null> {
  const roots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    join(homedir(), "Library", "Android", "sdk"),
    join(homedir(), "Android", "Sdk"),
  ];
  if (process.env.LOCALAPPDATA) roots.push(join(process.env.LOCALAPPDATA, "Android", "Sdk"));
  const suffix = process.platform === "win32" ? ".exe" : "";
  for (const root of roots) {
    if (!root) continue;
    const tools = {
      adb: join(root, "platform-tools", `adb${suffix}`),
      emulator: join(root, "emulator", `emulator${suffix}`),
    };
    if ((await executable(tools.adb)) && (await executable(tools.emulator))) return tools;
  }
  return null;
}

export function androidInputArgs(action: Action, size: ScreenSize | null): string[] {
  if (action.type === "tap" || action.type === "swipe") {
    if (!size) throw new Error("请等待新的截图后再操作");
    if (action.type === "tap")
      return ["shell", "input", "tap", ...pixelPoint(action.point, size.width, size.height)];
    return [
      "shell",
      "input",
      "swipe",
      ...pixelPoint(action.from, size.width, size.height),
      ...pixelPoint(action.to, size.width, size.height),
      String(action.durationMs),
    ];
  }
  if (action.type === "night")
    return ["shell", "cmd", "uimode", "night", action.enabled ? "yes" : "no"];
  if (action.type === "rotate") return ["emu", "rotate"];
  if (action.type === "appearance") throw new Error("Android 不支持此动作");
  const keys = { back: "4", home: "3", recents: "187" };
  return ["shell", "input", "keyevent", keys[action.type]];
}

export class LocalDeviceAdapter implements DeviceAdapter {
  private readonly runner = new CommandRunner();
  private readonly shutdown = new AbortController();
  private tools: AndroidTools | null = null;
  private iosAvailable = false;
  private readonly serials = new Map<string, string>();

  async capabilities(signal = this.shutdown.signal): Promise<RpcOutput<typeof capabilitiesRpc>> {
    signal.throwIfAborted();
    this.tools = await androidTools();
    let iosReason = "仅支持 Apple Silicon Mac";
    this.iosAvailable = false;
    if (process.platform === "darwin" && process.arch === "arm64") {
      iosReason = "缺少可用的 Xcode / xcrun simctl";
      if (await executable("/usr/bin/xcrun")) {
        try {
          await this.runner.run("/usr/bin/xcrun", ["--find", "simctl"], { signal });
          this.iosAvailable = true;
          iosReason = "仅观看和切换明暗模式，不支持触摸";
        } catch {
          this.iosAvailable = false;
        }
      }
    }
    return {
      ios: { available: this.iosAvailable, reason: iosReason },
      android: {
        available: this.tools !== null,
        reason: this.tools ? "支持单指点击、滑动和有限按键" : "缺少 Android SDK 的 adb 或 emulator",
      },
    };
  }

  private async androidCatalog(signal: AbortSignal) {
    const tools = this.tools;
    if (!tools) throw new Error("缺少 Android SDK 的 adb 或 emulator");
    const avds = parseAvds(
      (await this.runner.run(tools.emulator, ["-list-avds"], { signal })).toString(),
    );
    const adb = parseAdbDevices(
      (await this.runner.run(tools.adb, ["devices", "-l"], { signal })).toString(),
    );
    const instances = [];
    let unresolved = false;
    for (const serial of adb.serials) {
      try {
        const name =
          (await this.runner.run(tools.adb, ["-s", serial, "emu", "avd", "name"], { signal }))
            .toString()
            .split(/\r?\n/)[0] ?? "";
        if (deviceIdSchema.safeParse(name).success) instances.push({ serial, avd: name });
        else {
          unresolved = true;
          adb.excluded.push("模拟器实例名称无效，无法确认设备归属");
        }
      } catch {
        unresolved = true;
        adb.excluded.push("模拟器实例无法识别，请等待设备就绪后刷新");
      }
    }
    const matched = matchAndroid(avds, instances);
    this.serials.clear();
    for (const [id, serial] of matched.serials) this.serials.set(id, serial);
    const unknownInstances = unresolved || adb.excluded.some((reason) => reason.includes("离线"));
    if (unknownInstances) {
      for (const device of matched.devices) {
        if (device.state === "unavailable") continue;
        device.state = "unavailable";
        device.reason = "存在无法识别的实例，无法排除重复 AVD，请等待就绪后刷新";
      }
      this.serials.clear();
    }
    return { devices: matched.devices, excluded: [...adb.excluded, ...matched.excluded] };
  }

  async list(platform: DevicePlatform, signal: AbortSignal): Promise<DeviceCatalog> {
    const capabilities = await this.capabilities(signal);
    if (!capabilities[platform].available) throw new Error(capabilities[platform].reason);
    if (platform === "android") return this.androidCatalog(signal);
    const bytes = await this.runner.run(
      "/usr/bin/xcrun",
      ["simctl", "list", "devices", "available", "--json"],
      { signal },
    );
    return parseSimctl(bytes.toString());
  }

  async prepare(platform: DevicePlatform, id: string, signal: AbortSignal) {
    const catalog = await this.list(platform, signal);
    const device = catalog.devices.find((item) => item.id === id);
    if (!device || device.state === "unavailable") throw new Error("设备状态不可用，请刷新列表");
    if (platform === "ios") {
      if (device.state === "shutdown")
        await this.runner.run("/usr/bin/xcrun", ["simctl", "boot", id], {
          signal,
          timeoutMs: 30_000,
        });
      return;
    }
    const tools = this.tools;
    if (!tools) throw new Error("缺少 Android SDK");
    signal.throwIfAborted();
    if (device.state === "shutdown") await launchEmulator(tools.emulator, id);
    const deadline = Date.now() + 120_000;
    while (!signal.aborted && Date.now() < deadline) {
      const latest = await this.androidCatalog(signal);
      const current = latest.devices.find((item) => item.id === id);
      if (current?.reason.includes("多个")) throw new Error("同一个 AVD 有多个实例，已排除");
      const serial = this.serials.get(id);
      if (serial) {
        const boot = await this.runner.run(
          tools.adb,
          ["-s", serial, "shell", "getprop", "sys.boot_completed"],
          { signal },
        );
        if (boot.toString().trim() === "1") return;
      }
      await delay(750, undefined, { signal });
    }
    throw new Error("模拟器准备超时或已取消");
  }

  private async androidSerial(id: string, signal: AbortSignal) {
    await this.androidCatalog(signal);
    const serial = this.serials.get(id);
    if (!serial) throw new Error("设备已离线或有多个实例，请刷新列表");
    return serial;
  }

  async capture(platform: DevicePlatform, id: string, signal: AbortSignal) {
    let bytes: Buffer;
    if (platform === "ios") bytes = await this.iosScreenshot(id, signal);
    else {
      const serial = await this.androidSerial(id, signal);
      if (!this.tools) throw new Error("缺少 adb");
      bytes = await this.runner.run(this.tools.adb, ["-s", serial, "exec-out", "screencap", "-p"], {
        signal,
        maxBytes: 16 * 1024 * 1024,
      });
    }
    return compressFrame(bytes);
  }

  private async iosScreenshot(id: string, signal: AbortSignal) {
    const directory = await mkdtemp(join(tmpdir(), "clawmuse-device-preview-"));
    const file = join(directory, "frame.png");
    try {
      await this.runner.run(
        "/usr/bin/xcrun",
        ["simctl", "io", id, "screenshot", "--type=png", file],
        { signal },
      );
      const handle = await open(file, "r");
      try {
        const info = await handle.stat();
        if (info.size > 16 * 1024 * 1024) throw new Error("截图字节超过上限");
        const bytes = Buffer.alloc(info.size);
        const result = await handle.read(bytes, 0, bytes.length, 0);
        if (result.bytesRead !== info.size) throw new Error("截图读取未完成");
        return bytes;
      } finally {
        await handle.close();
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  async input(
    platform: DevicePlatform,
    id: string,
    action: Action,
    size: ScreenSize | null,
    signal: AbortSignal,
  ) {
    if (platform === "ios") {
      if (action.type !== "appearance") throw new Error("iOS 仅支持明暗模式");
      await this.runner.run("/usr/bin/xcrun", ["simctl", "ui", id, "appearance", action.mode], {
        signal,
      });
      return;
    }
    const serial = await this.androidSerial(id, signal);
    if (!this.tools) throw new Error("缺少 adb");
    await this.runner.run(this.tools.adb, ["-s", serial, ...androidInputArgs(action, size)], {
      signal,
    });
  }

  async close() {
    this.shutdown.abort();
    await this.runner.close();
  }
}
