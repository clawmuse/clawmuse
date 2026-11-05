import { z } from "zod";
import { ConnectionOfferSchema } from "@getpaseo/protocol/connection-offer";

export const cloudSpaceSchema = z.object({
  state: z.enum([
    "pending_configuration",
    "not_created",
    "starting",
    "running",
    "stopping",
    "paused",
    "error",
    "deleted",
  ]),
  models: z.array(
    z.object({ id: z.string(), label: z.string(), tool: z.enum(["codex", "claude"]) }),
  ),
  balance: z
    .object({
      availableMicros: z.number().nonnegative(),
      spentMicros: z.number().nonnegative(),
      reservedMicros: z.number().nonnegative(),
    })
    .nullable(),
  offer: ConnectionOfferSchema.nullable(),
  resources: z.object({ cpus: z.number().positive(), memoryMb: z.number().positive() }).optional(),
});
export type CloudSpace = z.infer<typeof cloudSpaceSchema>;
