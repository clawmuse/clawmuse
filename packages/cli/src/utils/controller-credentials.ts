import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  ControllerCredentialSchema,
  type ControllerCredential,
} from "@getpaseo/protocol/remote-access";
import type { ConnectionOffer } from "@getpaseo/protocol/connection-offer";

export async function prepareControllerCredential(
  home: string,
  offer: ConnectionOffer | undefined,
) {
  if (!offer) return null;
  // Pin credentials to both host identity and key; a directory cannot redirect an existing grant.
  const id = createHash("sha256")
    .update(JSON.stringify([offer.serverId, offer.daemonPublicKeyB64]))
    .digest("hex");
  const file = join(home, "controllers", `${id}.json`);
  const savedSchema = z.object({
    authorized: ControllerCredentialSchema.optional(),
    pending: ControllerCredentialSchema.optional(),
    invitationHash: z.string().optional(),
  });
  let saved: z.infer<typeof savedSchema> = {};
  try {
    saved = savedSchema.parse(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      throw new Error("Cannot read controller credential", { cause: error });
  }
  const persist = async () => {
    await mkdir(join(home, "controllers"), { recursive: true, mode: 0o700 });
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, JSON.stringify(saved), { mode: 0o600 });
      await rename(temp, file);
    } finally {
      await rm(temp, { force: true });
    }
  };
  let credential: ControllerCredential | undefined = saved.authorized;
  if (
    offer.pairing &&
    (!saved.authorized ||
      saved.invitationHash !== createHash("sha256").update(offer.pairing.token).digest("hex"))
  ) {
    credential = saved.pending;
    if (credential?.invitation !== offer.pairing.token) {
      credential = {
        token: randomBytes(32).toString("base64url"),
        invitation: offer.pairing.token,
        label: "ClawMuse CLI",
      };
      saved.pending = credential;
      await persist();
    }
  }
  if (!credential) return null;
  return {
    credential,
    async accept() {
      saved = {
        authorized: { token: credential.token },
        invitationHash: offer.pairing
          ? createHash("sha256").update(offer.pairing.token).digest("hex")
          : saved.invitationHash,
      };
      await persist();
    },
  };
}

export async function assertOutboundControlAllowed(home: string, isLocal: boolean): Promise<void> {
  if (isLocal) return;
  try {
    const value: unknown = JSON.parse(await readFile(join(home, "remote-access.json"), "utf8"));
    const policy = z.object({ controlledOnly: z.boolean() }).parse(value);
    if (policy.controlledOnly)
      throw new Error("This computer is controlled-only; outbound control is disabled");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
