import { z } from "zod";

// Kept apart from messages.ts so daemon configuration can import it without loading the wire schemas.
export const UsageMonitoringModeSchema = z.enum(["auto", "always", "off"]);
export type UsageMonitoringMode = z.infer<typeof UsageMonitoringModeSchema>;
export const UsageMonitoringConfigSchema = z.record(z.string(), UsageMonitoringModeSchema);
