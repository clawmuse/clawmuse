import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PNG } from "pngjs";
import { LocalDeviceAdapter } from "./adapter.js";
import { DevicePreviewService } from "./service.js";

const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

test.skipIf(process.platform === "win32")(
  "a fake SDK exercises discovery, boot, capture, input and cleanup without shutting down any emulator",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "device-preview-sdk-"));
    directories.push(directory);
    const log = join(directory, "argv.jsonl");
    const booted = join(directory, "booted");
    const offline = join(directory, "offline");
    const png = PNG.sync
      .write({ width: 2, height: 2, data: Buffer.alloc(16, 255) })
      .toString("base64");
    const prelude = `#!${process.execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(args)+'\\n');const booted=${JSON.stringify(booted)};const offline=${JSON.stringify(offline)};`;
    const emulator = `${prelude}if(args[0]==='-list-avds')process.stdout.write('Pixel\\nCold\\n');else if(args[0]==='-avd'&&args[1]==='Cold')fs.writeFileSync(booted,'1');else process.exitCode=1;`;
    const adb = `${prelude}
if(args[0]==='devices')process.stdout.write('List of devices attached\\nemulator-5554 device\\n'+(fs.existsSync(booted)?'emulator-5556 device\\n':'')+(fs.existsSync(offline)?'emulator-5558 offline\\n':''));
else if(args.slice(2).join(' ')==='emu avd name')process.stdout.write(args[1]==='emulator-5554'?'Pixel\\nOK\\n':'Cold\\nOK\\n');
else if(args.slice(2).join(' ')==='shell getprop sys.boot_completed')process.stdout.write('1');
else if(args.slice(2).join(' ')==='exec-out screencap -p')process.stdout.write(Buffer.from(${JSON.stringify(png)},'base64'));
else if(args.slice(2).join(' ')==='shell input tap 1 1'){}else process.exitCode=1;`;
    await mkdir(join(directory, "platform-tools"));
    await mkdir(join(directory, "emulator"));
    await writeFile(join(directory, "platform-tools", "adb"), adb, { mode: 0o700 });
    await writeFile(join(directory, "emulator", "emulator"), emulator, { mode: 0o700 });
    vi.stubEnv("ANDROID_HOME", directory);
    vi.stubEnv("ANDROID_SDK_ROOT", directory);
    const service = new DevicePreviewService(new LocalDeviceAdapter());
    try {
      expect((await service.capabilities()).android.available).toBe(true);
      expect((await service.list("android")).devices.map((device) => device.state)).toEqual([
        "booted",
        "shutdown",
      ]);
      const listing = (await readFile(log, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(listing.some((args) => args[0] === "-avd")).toBe(false);
      await expect(service.start("android", "not-listed")).rejects.toThrow("列表");
      const operation = await service.start("android", "Cold");
      await vi.waitFor(() => expect(service.status(operation.operationId).phase).toBe("ready"), {
        timeout: 5000,
      });
      const frame = await service.frame(operation.operationId);
      expect(frame.image).toMatchObject({ width: 2, height: 2 });
      await service.input(operation.operationId, { type: "tap", point: { x: 1, y: 1 } });
      await service.stop(operation.operationId);
      expect(await readFile(booted, "utf8")).toBe("1");
      await writeFile(offline, "1");
      const ambiguous = await service.list("android");
      expect(ambiguous.devices.map((device) => device.state)).toEqual([
        "unavailable",
        "unavailable",
      ]);
      expect(ambiguous.devices[0]?.reason).toContain("重复 AVD");
      await expect(service.start("android", "Pixel")).rejects.toThrow("列表");
      await service.close();
      const commands: string[][] = (await readFile(log, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(commands).toContainEqual(["-avd", "Cold", "-no-snapshot-save", "-no-boot-anim"]);
      expect(commands).toContainEqual(["-s", "emulator-5556", "shell", "input", "tap", "1", "1"]);
      expect(commands.flat()).not.toContain("shutdown");
      expect(commands.flat()).not.toContain("kill-server");
      expect(commands.flat()).not.toContain("kill");
    } finally {
      await service.close();
    }
  },
  10_000,
);
