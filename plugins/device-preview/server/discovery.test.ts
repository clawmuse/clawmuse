import { expect, test } from "vitest";
import { deviceIdSchema } from "../shared/contracts.js";
import { parseAdbDevices, parseAvds, parseSimctl, matchAndroid } from "./discovery.js";

test("AVDs are bounded safe names; duplicates and invalid names are rejected", () => {
  expect(parseAvds("Pixel_9\nPhone.API-35\nPixel_9\nbad name\nbad;name\n")).toEqual([
    "Pixel_9",
    "Phone.API-35",
  ]);
  for (const id of [
    "",
    "bad name",
    "a'b",
    'a"b',
    "a;b",
    "a|b",
    "a\nb",
    "Pixel\n",
    "Pixel\r",
    "Pixel\u2028",
    "../foo",
    "a".repeat(201),
  ]) {
    expect(deviceIdSchema.safeParse(id).success).toBe(false);
  }
});

test("adb accepts only emulator-number serials and excludes physical/offline devices", () => {
  const result = parseAdbDevices(
    "List of devices attached\nUSB123\tdevice product:phone\n192.168.1.2:5555 device\nemulator-5554 device product:sdk\nemulator-5556 offline\nemulator-x device\n",
  );
  expect(result.serials).toEqual(["emulator-5554"]);
  expect(result.excluded).toHaveLength(4);
});

test("multiple instances of one AVD are unavailable and unknown AVDs are excluded", () => {
  const result = matchAndroid(
    ["Pixel", "Tablet"],
    [
      { serial: "emulator-5554", avd: "Pixel" },
      { serial: "emulator-5556", avd: "Pixel" },
      { serial: "emulator-5558", avd: "Missing" },
      { serial: "USB123", avd: "Tablet" },
    ],
  );
  expect(result.devices[0]).toMatchObject({ id: "Pixel", state: "unavailable" });
  expect(result.devices[0]?.reason).toContain("多个");
  expect(result.devices[1]).toMatchObject({ id: "Tablet", state: "shutdown" });
  expect(result.serials.size).toBe(0);
  expect(result.excluded).toHaveLength(2);
});

test("simctl lists available devices only and validates every UDID", () => {
  const udid = "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE";
  const result = parseSimctl(
    JSON.stringify({
      devices: {
        "com.apple.CoreSimulator.SimRuntime.iOS-26-0": [
          { udid, name: "iPhone", state: "Booted", isAvailable: true },
          {
            udid: "11111111-2222-3333-4444-555555555555",
            name: "iPad",
            state: "Shutdown",
            isAvailable: true,
          },
          {
            udid: "22222222-2222-3333-4444-555555555555",
            name: "Old",
            state: "Shutdown",
            isAvailable: false,
          },
          { udid: "bad;id", name: "Unsafe", state: "Booted", isAvailable: true },
        ],
      },
    }),
  );
  expect(result.devices.map((device) => device.state)).toEqual(["booted", "shutdown"]);
  expect(result.devices[0]?.id).toBe(udid);
  expect(result.excluded).toHaveLength(2);
});
