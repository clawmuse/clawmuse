import { expect, test } from "vitest";
import { androidInputArgs } from "./adapter.js";
import {
  actionSchema,
  capabilitiesRpc,
  frameRpc,
  inputRpc,
  listRpc,
  startRpc,
  statusRpc,
  stopRpc,
  MAX_FRAME_BYTES,
} from "../shared/contracts.js";

test("normalized coordinates use screenshot pixels and fixed argv only", () => {
  const size = { width: 1080, height: 1920 };
  expect(androidInputArgs({ type: "tap", point: { x: 0, y: 1 } }, size)).toEqual([
    "shell",
    "input",
    "tap",
    "0",
    "1919",
  ]);
  expect(
    androidInputArgs(
      { type: "swipe", from: { x: 0, y: 0.5 }, to: { x: 1, y: 1 }, durationMs: 300 },
      size,
    ),
  ).toEqual(["shell", "input", "swipe", "0", "960", "1079", "1919", "300"]);
  expect(() => androidInputArgs({ type: "tap", point: { x: 0, y: 0 } }, null)).toThrow("截图");
  expect(androidInputArgs({ type: "back" }, null)).toEqual(["shell", "input", "keyevent", "4"]);
  expect(androidInputArgs({ type: "home" }, null)).toEqual(["shell", "input", "keyevent", "3"]);
  expect(androidInputArgs({ type: "recents" }, null)).toEqual([
    "shell",
    "input",
    "keyevent",
    "187",
  ]);
  expect(androidInputArgs({ type: "rotate" }, null)).toEqual(["emu", "rotate"]);
  expect(androidInputArgs({ type: "night", enabled: false }, null)).toEqual([
    "shell",
    "cmd",
    "uimode",
    "night",
    "no",
  ]);
  expect(androidInputArgs({ type: "night", enabled: true }, null)).toEqual([
    "shell",
    "cmd",
    "uimode",
    "night",
    "yes",
  ]);
});

test("RPC objects reject extra fields, arbitrary commands and unbounded coordinates", () => {
  const operation = { operationId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" };
  for (const [contract, valid] of [
    [capabilitiesRpc, {}],
    [listRpc, { platform: "android" }],
    [startRpc, { platform: "android", deviceId: "Pixel" }],
    [statusRpc, operation],
    [frameRpc, operation],
    [inputRpc, { ...operation, action: { type: "home" } }],
    [stopRpc, operation],
  ] as const) {
    expect(contract.input.safeParse(valid).success).toBe(true);
    expect(contract.input.safeParse({ ...valid, shell: "anything" }).success).toBe(false);
  }
  for (const action of [
    { type: "shell", command: "ls" },
    { type: "tap", point: { x: -1, y: 0 } },
    { type: "tap", point: { x: 1.1, y: 0 } },
    { type: "tap", point: { x: NaN, y: 0 } },
    { type: "tap", point: { x: 0, y: Infinity } },
    { type: "home", args: "anything" },
    { type: "appearance", mode: "dark;shutdown" },
  ])
    expect(actionSchema.safeParse(action).success).toBe(false);
  expect(MAX_FRAME_BYTES).toBeLessThan(512 * 1024);
  expect(4 * Math.ceil(MAX_FRAME_BYTES / 3) + 4096).toBeLessThan(32 * 1024 * 1024);
});
