import { DaemonPermissionSchema } from "@getpaseo/protocol/messages";
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  ControllerCredentialSchema,
  type RemoteAccessState,
} from "@getpaseo/protocol/remote-access";
import { OWNER_PERMISSIONS, type DaemonPermission } from "./authorization/index.js";

const INVITATION_MS = 10 * 60_000;
const TEMPORARY_ACCESS_MS = 60 * 60_000;
const operatorPermissions: readonly DaemonPermission[] = [
  "daemon.read",
  "workspace.read",
  "workspace.write",
  "workspace.manage",
  "automation.manage",
];
const InvitationSchema = z.object({
  hash: z.string(),
  expiresAt: z.number(),
  permissions: z.array(DaemonPermissionSchema),
  bootstrap: z.boolean(),
});
const ControllerSchema = z.object({
  id: z.string(),
  hash: z.string(),
  label: z.string(),
  permissions: z.array(DaemonPermissionSchema),
  bootstrap: z.boolean(),
  status: z.enum(["pending", "authorized", "revoked"]),
  createdAt: z.number(),
  expiresAt: z.number().nullable(),
  accountId: z.string().optional(),
});
const AccountBindingSchema = z.object({
  accountId: z.string(),
  serverId: z.string(),
  key: z.string(),
  permissions: z.array(DaemonPermissionSchema),
});
const AccountAuthorizationSchema = z.tuple([
  z.literal("clawmuse-account-v1"),
  z.string(),
  z.string(),
  z.string().regex(/^[a-f0-9]{64}$/),
  z.number().int(),
]);
const SavedSchema = z.object({
  version: z.literal(1),
  receiving: z.boolean().default(true),
  enabled: z.boolean(),
  controlledOnly: z.boolean(),
  invitations: z.array(InvitationSchema),
  controllers: z.array(ControllerSchema),
  account: AccountBindingSchema.optional(),
});
type Saved = z.infer<typeof SavedSchema>;
type Controller = Saved["controllers"][number];
export interface AccessActor {
  permissions?: readonly DaemonPermission[];
  principalId: string;
  local: boolean;
  manager: boolean;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hasManagement(row: { permissions: readonly DaemonPermission[] }): boolean {
  return row.permissions.includes("access.manage");
}

function verifyAccountAuthorization(
  binding: z.infer<typeof AccountBindingSchema>,
  input: z.infer<typeof ControllerCredentialSchema>,
  now: number,
): string {
  const [encoded, signature, extra] = (input.accountAuthorization ?? "").split(".");
  if (!encoded || !signature || extra !== undefined)
    throw new Error("Invalid account authorization");
  const expected = createHmac("sha256", Buffer.from(binding.key, "base64url"))
    .update(encoded)
    .digest();
  const supplied = Buffer.from(signature, "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
    throw new Error("Invalid account authorization");
  const [, serverId, accountId, tokenHash, expiresAt] = AccountAuthorizationSchema.parse(
    JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")),
  );
  if (
    serverId !== binding.serverId ||
    accountId !== binding.accountId ||
    tokenHash !== digest(input.token) ||
    expiresAt <= now ||
    expiresAt > now + 120_000
  )
    throw new Error("Account authorization expired or does not match this controller");
  return tokenHash;
}

/** No account sessions or other hosts' credentials are stored on a controlled installation. */
export class RemoteAccess {
  private saved: Saved;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<() => void>();
  private pairingAttempts = 0;
  private pairingWindowAt = 0;

  constructor(
    private readonly home: string,
    private readonly now: () => number = Date.now,
  ) {
    try {
      this.saved = SavedSchema.parse(
        JSON.parse(readFileSync(join(home, "remote-access.json"), "utf8")),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw new Error("Cannot read remote access policy", { cause: error });
      this.saved = {
        version: 1,
        receiving: true,
        enabled: false,
        controlledOnly: false,
        invitations: [],
        controllers: [],
      };
    }
  }
  get enabled(): boolean {
    return this.saved.enabled;
  }
  get controlledOnly(): boolean {
    return this.saved.controlledOnly;
  }
  observe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private active(row: Controller): boolean {
    return row.status === "authorized" && (row.expiresAt === null || row.expiresAt > this.now());
  }
  canManage(actor: AccessActor): boolean {
    if (!actor.manager) return false;
    if (!this.controlledOnly) return true;
    return (
      !actor.local &&
      this.saved.controllers.some(
        (row) => row.id === actor.principalId && hasManagement(row) && this.active(row),
      )
    );
  }
  state(actor: AccessActor): RemoteAccessState {
    const canManage = this.canManage(actor);
    return {
      enabled: this.enabled,
      controlledOnly: this.controlledOnly,
      receiving: this.saved.receiving,
      canToggleReceiving: actor.local || canManage,
      canManage,
      canPair: (actor.local || canManage) && (this.enabled || actor.local),
      controllers:
        actor.local || canManage
          ? this.saved.controllers
              .filter(
                (row) =>
                  row.status !== "revoked" &&
                  (row.expiresAt === null || row.expiresAt > this.now()),
              )
              .map((row) => ({
                id: row.id,
                label: row.label,
                fingerprint: row.hash.slice(0, 12),
                manager: hasManagement(row),
                status: row.status as "pending" | "authorized",
                createdAt: new Date(row.createdAt).toISOString(),
                expiresAt: row.expiresAt === null ? null : new Date(row.expiresAt).toISOString(),
              }))
          : [],
    };
  }
  authenticate(
    token: string,
  ): { principalId: string; permissions: readonly DaemonPermission[] } | null {
    if (!this.saved.receiving) return null;
    const hash = digest(token);
    const row = this.saved.controllers.find((entry) => entry.hash === hash);
    return row && this.active(row) ? { principalId: row.id, permissions: row.permissions } : null;
  }
  isAuthorized(id: string): boolean {
    return (
      this.saved.receiving &&
      this.saved.controllers.some((row) => row.id === id && this.active(row))
    );
  }
  localPermissions(): readonly DaemonPermission[] {
    return this.controlledOnly
      ? OWNER_PERMISSIONS.filter(
          (permission) => permission !== "access.manage" && permission !== "tunnel.manage",
        )
      : OWNER_PERMISSIONS;
  }

  private mutate<T>(operation: (next: Saved) => T): Promise<T> {
    const result = this.commit(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }
  private async commit<T>(operation: (next: Saved) => T): Promise<T> {
    await this.queue;
    const next = structuredClone(this.saved);
    const value = operation(next);
    await mkdir(this.home, { recursive: true });
    const temp = join(this.home, `.remote-access-${randomUUID()}.tmp`);
    try {
      await writeFile(temp, JSON.stringify(next), { mode: 0o600 });
      await rename(temp, join(this.home, "remote-access.json"));
    } finally {
      await rm(temp, { force: true });
    }
    this.saved = next;
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* The durable mutation already committed. */
      }
    }
    return value;
  }
  private isFullLocalSession(actor: AccessActor): boolean {
    if (!actor.local) return false;
    return (
      !actor.permissions ||
      this.localPermissions().every((permission) => actor.permissions!.includes(permission))
    );
  }
  private delegationPermissions(
    actor: AccessActor,
    bootstrap: boolean,
    manager: boolean,
  ): DaemonPermission[] {
    let ceiling = actor.permissions;
    if (bootstrap) ceiling = OWNER_PERMISSIONS;
    if (!ceiling && actor.local) ceiling = this.localPermissions();
    if (!ceiling)
      ceiling =
        this.saved.controllers.find((row) => row.id === actor.principalId)?.permissions ?? [];
    const permissions = (manager ? OWNER_PERMISSIONS : operatorPermissions).filter((permission) =>
      ceiling.includes(permission),
    );
    if (manager && !permissions.includes("access.manage"))
      throw new Error("Requires management authorization");
    return permissions;
  }
  bindAccount(actor: AccessActor, accountId: string, serverId: string): Promise<string> {
    return this.mutate((next) => {
      if (next.controlledOnly || !this.isFullLocalSession(actor) || !this.canManage(actor))
        throw new Error("Account binding requires the local owner session");
      if (next.account?.accountId === accountId && next.account.serverId === serverId)
        return next.account.key;
      for (const row of next.controllers) {
        if (row.accountId) {
          row.status = "revoked";
          row.expiresAt = this.now();
        }
      }
      next.account = {
        accountId,
        serverId,
        key: randomBytes(32).toString("base64url"),
        permissions: this.delegationPermissions(actor, false, true),
      };
      next.enabled = true;
      return next.account.key;
    });
  }
  authorizeAccount(input: z.infer<typeof ControllerCredentialSchema>): Promise<void> {
    return this.mutate((next) => {
      this.consumePairingAttempt();
      const binding = next.account;
      if (!binding || next.controlledOnly || !next.receiving)
        throw new Error("Account access is unavailable on this computer");
      input = ControllerCredentialSchema.parse(input);
      const tokenHash = verifyAccountAuthorization(binding, input, this.now());
      // A replay must never undo an explicit revocation or upgrade an invitation principal.
      const existing = next.controllers.find((row) => row.hash === tokenHash);
      if (existing?.accountId === binding.accountId && this.active(existing)) return;
      if (existing) throw new Error("Controller already exists; use its current authorization");
      if (next.controllers.filter((row) => this.active(row)).length >= 128)
        throw new Error("Too many controllers; revoke an existing authorization");
      next.controllers.push({
        id: `controller_${randomUUID()}`,
        hash: tokenHash,
        label: input.label ?? "ClawMuse account",
        permissions: binding.permissions,
        bootstrap: false,
        status: "authorized",
        createdAt: this.now(),
        expiresAt: null,
        accountId: binding.accountId,
      });
    });
  }
  createInvitation(actor: AccessActor, input: { bootstrap?: boolean; manager?: boolean }) {
    return this.mutate((next) => {
      const bootstrap = input.bootstrap === true;
      if (bootstrap && !this.isFullLocalSession(actor))
        throw new Error("Initial management pairing requires an unattenuated local session");
      if (!next.enabled && !actor.local)
        throw new Error("Initialize remote access on the controlled computer");
      if (!(actor.local || this.canManage(actor)))
        throw new Error("Pairing requires local or management authorization");
      if (
        bootstrap &&
        (!actor.local || next.controllers.some((row) => hasManagement(row) && this.active(row)))
      )
        throw new Error("Management pairing has already been initialized");
      if (bootstrap) {
        next.invitations = next.invitations.filter((row) => !row.bootstrap);
        next.controllers = next.controllers.filter((row) => !row.bootstrap || this.active(row));
      }
      const manager = bootstrap || input.manager === true;
      if (manager && !bootstrap && !this.canManage(actor))
        throw new Error("Requires management authorization");
      next.invitations = next.invitations.filter((row) => row.expiresAt > this.now());
      if (next.invitations.length >= 16)
        throw new Error("Too many active pairing links; wait for them to expire");
      const token = randomBytes(32).toString("base64url");
      const expiresAt = this.now() + INVITATION_MS;
      next.enabled = true;
      if (bootstrap) next.controlledOnly = true;
      const permissions = this.delegationPermissions(actor, bootstrap, manager);
      next.invitations.push({ hash: digest(token), expiresAt, permissions, bootstrap });
      return { token, expiresAt: new Date(expiresAt).toISOString() };
    });
  }
  private consumePairingAttempt(): void {
    if (this.now() - this.pairingWindowAt >= 60_000) {
      this.pairingWindowAt = this.now();
      this.pairingAttempts = 0;
    }
    if (++this.pairingAttempts > 30)
      throw new Error("Too many pairing attempts; retry in one minute");
  }
  requestPairing(input: z.infer<typeof ControllerCredentialSchema>): Promise<Controller> {
    return this.mutate((next) => {
      this.consumePairingAttempt();
      if (!next.receiving) throw new Error("Remote access is paused on this computer");
      input = ControllerCredentialSchema.parse(input);
      const hash = digest(input.token);
      const existing = next.controllers.find((row) => row.hash === hash);
      if (
        existing &&
        existing.status !== "revoked" &&
        (existing.expiresAt === null || existing.expiresAt > this.now())
      )
        return existing;
      const invitation = next.invitations.find(
        (row) => row.hash === digest(input.invitation ?? "") && row.expiresAt > this.now(),
      );
      if (!invitation) throw new Error("Pairing link expired or already used");
      next.controllers = next.controllers.filter(
        (row) =>
          row.accountId ||
          (row.status !== "revoked" && (row.expiresAt === null || row.expiresAt > this.now())),
      );
      if (next.controllers.filter((row) => row.status !== "revoked").length >= 128)
        throw new Error("Too many controllers; revoke an existing authorization");
      const controller: Controller = {
        id: `controller_${randomUUID()}`,
        hash,
        label: input.label ?? "New controller",
        permissions: invitation.permissions,
        bootstrap: invitation.bootstrap,
        status: "pending",
        createdAt: this.now(),
        expiresAt: invitation.expiresAt,
      };
      next.invitations = next.invitations.filter((row) => row !== invitation);
      next.controllers.push(controller);
      return controller;
    });
  }
  decide(actor: AccessActor, id: string, approve: boolean, persistent: boolean): Promise<void> {
    return this.mutate((next) => {
      const row = next.controllers.find(
        (entry) => entry.id === id && entry.status === "pending" && entry.expiresAt! > this.now(),
      );
      if (!row) throw new Error("Pairing request expired or was already handled");
      if (!this.canManage(actor) && !(actor.local && (!hasManagement(row) || row.bootstrap)))
        throw new Error("Requires management authorization");
      const bootstrapApproval = row.bootstrap && this.isFullLocalSession(actor);
      if (
        approve &&
        !bootstrapApproval &&
        actor.permissions &&
        !row.permissions.every((permission) => actor.permissions!.includes(permission))
      )
        throw new Error("Cannot approve permissions beyond this session's authority");
      if (approve && hasManagement(row) && !persistent)
        throw new Error("Management authorization requires persistent access");
      row.status = approve ? "authorized" : "revoked";
      row.expiresAt = this.now();
      if (approve) row.expiresAt = persistent ? null : this.now() + TEMPORARY_ACCESS_MS;
    });
  }
  revoke(actor: AccessActor, id: string): Promise<void> {
    return this.mutate((next) => {
      if (!this.canManage(actor)) throw new Error("Requires management authorization");
      const row = next.controllers.find((entry) => entry.id === id);
      if (!row) throw new Error("Controller not found");
      if (
        next.controlledOnly &&
        hasManagement(row) &&
        !next.controllers.some(
          (other) => other.id !== id && hasManagement(other) && this.active(other),
        )
      )
        throw new Error("Authorize another manager before revoking the last manager");
      row.status = "revoked";
      row.expiresAt = this.now();
    });
  }
  setReceiving(actor: AccessActor, receiving: boolean): Promise<void> {
    return this.mutate((next) => {
      if (!actor.local && !this.canManage(actor))
        throw new Error("Requires local or management authorization");
      next.receiving = receiving;
    });
  }
  setMode(actor: AccessActor, controlledOnly: boolean): Promise<void> {
    return this.mutate((next) => {
      if (!this.canManage(actor)) throw new Error("Requires management authorization");
      if (controlledOnly && !next.controllers.some((row) => hasManagement(row) && this.active(row)))
        throw new Error("Pair a manager before enabling controlled-only mode");
      next.controlledOnly = controlledOnly;
      if (controlledOnly) {
        // This mode accepts invitations only. It must not retain the account authority.
        if (
          !next.controllers.some((row) => !row.accountId && hasManagement(row) && this.active(row))
        )
          throw new Error("Pair an independent manager before enabling controlled-only mode");
        delete next.account;
        for (const row of next.controllers) {
          if (row.accountId) {
            row.status = "revoked";
            row.expiresAt = this.now();
          }
        }
      }
    });
  }
}
