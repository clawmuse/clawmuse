import { expect, test } from "vitest";
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

test("RPC objects reject extra fields, arbitrary commands and unbounded coordinates", () => {
  const operation = { operationId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" };
  for (const [contract, valid] of [
    [capabilitiesRpc, {}],
    [listRpc, { platform: "android" }],
    [startRpc, { platform: "android", deviceId: "Pixel", quality: "balanced" }],
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
    { type: "touch", phase: "down", points: [{ x: NaN, y: 0 }], geometry: 1 },
    { type: "touch", phase: "down", points: [{ x: 0, y: Infinity }], geometry: 1 },
    { type: "home", args: "anything" },
    { type: "appearance", mode: "dark;shutdown" },
  ])
    expect(actionSchema.safeParse(action).success).toBe(false);
  expect(MAX_FRAME_BYTES).toBeLessThan(512 * 1024);
  expect(4 * Math.ceil(MAX_FRAME_BYTES / 3) + 4096).toBeLessThan(32 * 1024 * 1024);
});
