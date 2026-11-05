import { z } from "zod";
import { deviceIdSchema, udidSchema, type Device } from "../shared/contracts.js";

export interface DeviceCatalog {
  devices: Device[];
  excluded: string[];
}
export interface AndroidInstance {
  serial: string;
  avd: string;
}
export const emulatorSerial = /^emulator-[0-9]{1,10}$/;

export function parseAvds(text: string): string[] {
  return [...new Set(text.split(/\r?\n/).filter((id) => deviceIdSchema.safeParse(id).success))];
}

export function parseAdbDevices(text: string) {
  const serials: string[] = [];
  const excluded: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("List of devices") || line.startsWith("*")) continue;
    const [serial, state] = line.trim().split(/\s+/);
    if (!serial || !emulatorSerial.test(serial)) {
      excluded.push("已排除真机或非 emulator 序列号的设备");
    } else if (state !== "device") {
      excluded.push("已排除未就绪或离线的模拟器实例");
    } else {
      serials.push(serial);
    }
  }
  return { serials: [...new Set(serials)], excluded };
}

export function matchAndroid(avds: string[], instances: AndroidInstance[]) {
  const grouped = new Map<string, string[]>();
  const excluded: string[] = [];
  for (const instance of instances) {
    if (!emulatorSerial.test(instance.serial) || !avds.includes(instance.avd)) {
      excluded.push("已排除非模拟器或无法对应到已配置 AVD 的实例");
      continue;
    }
    const serials = grouped.get(instance.avd) ?? [];
    serials.push(instance.serial);
    grouped.set(instance.avd, serials);
  }
  const serials = new Map<string, string>();
  const devices: Device[] = avds.map((id) => {
    const matches = grouped.get(id) ?? [];
    if (matches.length > 1)
      return {
        id,
        name: id,
        state: "unavailable",
        reason: "同一个 AVD 有多个实例，已排除",
        occupied: false,
      };
    if (matches[0]) serials.set(id, matches[0]);
    return {
      id,
      name: id,
      state: matches.length === 1 ? "booted" : "shutdown",
      reason: "",
      occupied: false,
    };
  });
  return { devices, excluded, serials };
}

const simctlSchema = z.object({
  devices: z.record(
    z.string(),
    z.array(
      z.object({
        udid: z.string(),
        name: z.string().max(200),
        state: z.string(),
        isAvailable: z.boolean(),
      }),
    ),
  ),
});

export function parseSimctl(text: string): DeviceCatalog {
  const parsed = simctlSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error("simctl 返回的设备列表无效");
  const devices: Device[] = [];
  const excluded: string[] = [];
  const seen = new Set<string>();
  for (const device of Object.values(parsed.data.devices).flat()) {
    const valid = udidSchema.safeParse(device.udid).success;
    if (!device.isAvailable || !valid || seen.has(device.udid)) {
      excluded.push("已排除不可用、重复或标识无效的 iOS 设备");
      continue;
    }
    seen.add(device.udid);
    let state: Device["state"] = "unavailable";
    if (device.state === "Booted") state = "booted";
    if (device.state === "Shutdown") state = "shutdown";
    devices.push({
      id: device.udid,
      name: device.name,
      state,
      reason: state === "unavailable" ? "设备正在切换状态，请刷新" : "",
      occupied: false,
    });
  }
  return { devices, excluded };
}
