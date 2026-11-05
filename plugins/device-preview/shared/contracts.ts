import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const MAX_FRAME_BYTES = 512 * 1024 - 1;
export const LEASE_MS = 30_000;
export const platformSchema = z.enum(["ios", "android"]);
export const deviceIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_.-]{1,200}$/)
  .refine((value) => value.trim() === value);
export const udidSchema = z
  .string()
  .length(36)
  .regex(/^[A-Fa-f0-9]{8}(?:-[A-Fa-f0-9]{4}){3}-[A-Fa-f0-9]{12}$/);
const operationIdSchema = z.uuid().length(36);
const phaseSchema = z.enum(["preparing", "ready", "failed", "stopped"]);
const capabilitySchema = z.object({ available: z.boolean(), reason: z.string().max(200) }).strict();
export const deviceSchema = z
  .object({
    id: deviceIdSchema,
    name: z.string().max(200),
    state: z.enum(["booted", "shutdown", "unavailable"]),
    reason: z.string().max(200),
    occupied: z.boolean(),
  })
  .strict();
const pointSchema = z
  .object({ x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1) })
  .strict();
export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("tap"), point: pointSchema }).strict(),
  z
    .object({
      type: z.literal("swipe"),
      from: pointSchema,
      to: pointSchema,
      durationMs: z.number().int().min(100).max(1500),
    })
    .strict(),
  z.object({ type: z.enum(["back", "home", "recents", "rotate"]) }).strict(),
  z.object({ type: z.literal("night"), enabled: z.boolean() }).strict(),
  z.object({ type: z.literal("appearance"), mode: z.enum(["dark", "light"]) }).strict(),
]);
const operationInput = z.object({ operationId: operationIdSchema }).strict();
export const statusSchema = z.object({ phase: phaseSchema, message: z.string().max(200) }).strict();
export const capabilitiesRpc = defineRpc({
  name: "device-preview.capabilities",
  input: z.object({}).strict(),
  output: z.object({ ios: capabilitySchema, android: capabilitySchema }).strict(),
});
export const listRpc = defineRpc({
  name: "device-preview.list",
  input: z.object({ platform: platformSchema }).strict(),
  output: z
    .object({
      devices: z.array(deviceSchema).max(1000),
      excluded: z.array(z.string().max(200)).max(1000),
    })
    .strict(),
});
export const startRpc = defineRpc({
  name: "device-preview.start",
  input: z.object({ platform: platformSchema, deviceId: deviceIdSchema }).strict(),
  output: z.object({ operationId: operationIdSchema, phase: z.literal("preparing") }).strict(),
});
export const statusRpc = defineRpc({
  name: "device-preview.status",
  input: operationInput,
  output: statusSchema,
});
export const frameSchema = statusSchema
  .extend({
    image: z
      .object({
        base64: z
          .string()
          .min(4)
          .max(4 * Math.ceil(MAX_FRAME_BYTES / 3))
          .regex(/^[A-Za-z0-9+/]*={0,2}$/)
          .refine((value) => {
            const padding = value.endsWith("==") ? 2 : Number(value.endsWith("="));
            return value.length % 4 === 0 && (value.length / 4) * 3 - padding <= MAX_FRAME_BYTES;
          }),
        width: z.number().int().positive().max(4096),
        height: z.number().int().positive().max(4096),
      })
      .strict()
      .nullable(),
  })
  .strict();
export const frameRpc = defineRpc({
  name: "device-preview.frame",
  input: operationInput,
  output: frameSchema,
});
export const inputRpc = defineRpc({
  name: "device-preview.input",
  input: operationInput.extend({ action: actionSchema }).strict(),
  output: z.object({ accepted: z.literal(true) }).strict(),
});
export const stopRpc = defineRpc({
  name: "device-preview.stop",
  input: operationInput,
  output: z.object({ phase: z.literal("stopped") }).strict(),
});
export type DevicePlatform = z.infer<typeof platformSchema>;
export type Device = z.infer<typeof deviceSchema>;
export type Action = z.infer<typeof actionSchema>;
export type PreviewStatus = z.infer<typeof statusSchema>;
export type PreviewFrame = z.infer<typeof frameSchema>;

export function pixelPoint(point: z.infer<typeof pointSchema>, width: number, height: number) {
  return [Math.round(point.x * (width - 1)), Math.round(point.y * (height - 1))].map(String);
}
