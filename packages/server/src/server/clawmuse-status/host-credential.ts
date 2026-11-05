import { readFileSync, rmSync } from "node:fs";
import path from "node:path";

import { ensurePrivateFile, writePrivateFileAtomicSync } from "../private-files.js";

const HOST_TOKEN_FILENAME = "clawmuse-status-host-token";

/** Mirrors the service's `STATUS_STATIC_HOST_TOKEN` floor. */
export const CLAWMUSE_STATUS_HOST_TOKEN_MIN_LENGTH = 32;

export function getClawMuseStatusHostTokenPath(paseoHome: string): string {
  return path.join(paseoHome, HOST_TOKEN_FILENAME);
}

/**
 * The host token never goes into `config.json`: that file is readable by every
 * tool that parses daemon configuration, and the token authorizes publishing as
 * this host. `CLAWMUSE_STATUS_HOST_TOKEN` wins so a container can inject it
 * without a writable home.
 */
export function readClawMuseStatusHostToken(
  paseoHome: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const fromEnv = env.CLAWMUSE_STATUS_HOST_TOKEN?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const tokenPath = getClawMuseStatusHostTokenPath(paseoHome);
  try {
    const fromFile = readFileSync(tokenPath, "utf8").trim();
    ensurePrivateFile(tokenPath);
    return fromFile.length > 0 ? fromFile : null;
  } catch {
    return null;
  }
}

export function writeClawMuseStatusHostToken(paseoHome: string, token: string): void {
  writePrivateFileAtomicSync(getClawMuseStatusHostTokenPath(paseoHome), `${token.trim()}\n`);
}

export function removeClawMuseStatusHostToken(paseoHome: string): void {
  rmSync(getClawMuseStatusHostTokenPath(paseoHome), { force: true });
}
