import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import type pino from "pino";
import { z } from "zod";

import { writePrivateFileAtomicSync } from "../private-files.js";
import type { RegionalRelaySelection } from "../regional-relay.js";
import type { ClawMuseStatusClient, ClawMuseStatusHostSession } from "./client.js";

const PENDING_FILENAME = "clawmuse-status-relay-selection.json";
/** The service rejects older selections; holding them longer is pointless. */
const MAX_PENDING_AGE_MS = 30 * 86_400_000;

const relaySelectionReportSchema = z
  .object({
    id: z.string().uuid(),
    selected: z.string().min(1).max(255),
    probes: z
      .array(
        z
          .object({
            endpoint: z.string().min(1).max(255),
            ms: z.number().int().min(0).nullable(),
            ok: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(8),
    selectedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

/** Body of `POST /v1/host/telemetry/relay-selections`. */
export type RelaySelectionReport = z.infer<typeof relaySelectionReportSchema>;

function pendingPath(paseoHome: string): string {
  return path.join(paseoHome, PENDING_FILENAME);
}

/**
 * Keeps the first-run selection until a status host session can report it.
 * Endpoints are the brand's relay `host:port` list, never a resolved address.
 */
export function savePendingRelaySelection(
  paseoHome: string,
  selection: RegionalRelaySelection,
  now: Date = new Date(),
): void {
  const report: RelaySelectionReport = {
    id: randomUUID(),
    selected: selection.selected,
    probes: selection.probes.slice(0, 8),
    selectedAt: now.toISOString(),
  };
  writePrivateFileAtomicSync(pendingPath(paseoHome), `${JSON.stringify(report)}\n`);
}

async function readPendingRelaySelection(
  paseoHome: string,
  now: Date,
): Promise<RelaySelectionReport | null> {
  let raw: string;
  try {
    raw = await readFile(pendingPath(paseoHome), "utf8");
  } catch {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    value = null;
  }
  const parsed = relaySelectionReportSchema.safeParse(value);
  if (!parsed.success || now.getTime() - Date.parse(parsed.data.selectedAt) > MAX_PENDING_AGE_MS) {
    await rm(pendingPath(paseoHome), { force: true });
    return null;
  }
  return parsed.data;
}

export interface ReportPendingRelaySelectionInput {
  paseoHome: string;
  session: ClawMuseStatusHostSession;
  client: Pick<ClawMuseStatusClient, "reportRelaySelection">;
  signal: AbortSignal;
  logger: pino.Logger;
  now?: Date;
}

/**
 * Best effort, one attempt per pending selection: the file is removed before
 * the request, so a failure is logged and never retried or surfaced. A server
 * that does not advertise the endpoint leaves the selection pending.
 */
export async function reportPendingRelaySelection(
  input: ReportPendingRelaySelectionInput,
): Promise<void> {
  if (!input.session.relaySelectionTelemetry) {
    return;
  }
  const report = await readPendingRelaySelection(input.paseoHome, input.now ?? new Date());
  if (!report) {
    return;
  }
  await rm(pendingPath(input.paseoHome), { force: true });
  try {
    await input.client.reportRelaySelection({
      accessToken: input.session.accessToken,
      report,
      signal: input.signal,
    });
    input.logger.debug({ selected: report.selected }, "Reported the regional relay selection");
  } catch (error) {
    input.logger.warn({ err: error }, "Failed to report the regional relay selection");
  }
}
