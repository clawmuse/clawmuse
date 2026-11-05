import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { RemoteAccess } from "./remote-access.js";

const local = { principalId: "local", local: true, manager: true };
const homes: string[] = [];
async function setup() {
  const home = await mkdtemp(join(tmpdir(), "paseo-access-"));
  homes.push(home);
  let now = Date.parse("2026-10-26T00:00:00Z");
  return {
    access: new RemoteAccess(home, () => now),
    home,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

describe("remote access", () => {
  it("requires local approval before a single-use management link grants authority", async () => {
    const { access, home } = await setup();
    const invite = await access.createInvitation(local, { bootstrap: true });
    const token = randomBytes(32).toString("base64url");
    const pending = await access.requestPairing({
      token,
      invitation: invite.token,
      label: "Phone",
    });
    expect(access.authenticate(token)).toBeNull();
    expect(access.state(local)).toMatchObject({
      enabled: true,
      controlledOnly: true,
      canManage: false,
    });
    await access.decide(local, pending.id, true, true);
    expect(access.authenticate(token)).toMatchObject({
      principalId: pending.id,
      permissions: expect.arrayContaining(["access.manage"]),
    });
    await expect(
      access.requestPairing({
        token: randomBytes(32).toString("base64url"),
        invitation: invite.token,
      }),
    ).rejects.toThrow("expired or already used");
    const saved = await readFile(join(home, "remote-access.json"), "utf8");
    expect(saved).not.toContain(token);
    expect(saved).not.toContain(invite.token);
    expect(new RemoteAccess(home).authenticate(token)).toMatchObject({ principalId: pending.id });
    await expect(access.setMode(local, false)).rejects.toThrow("management authorization");
  });
  it("expires unused links, recovers unfinished setup and admits only one concurrent redemption", async () => {
    const { access, advance } = await setup();
    const expired = await access.createInvitation(local, { bootstrap: true });
    advance(10 * 60_000 + 1);
    await expect(
      access.requestPairing({
        token: randomBytes(32).toString("base64url"),
        invitation: expired.token,
      }),
    ).rejects.toThrow("expired or already used");
    const recovered = await access.createInvitation(local, { bootstrap: true });
    const attempts = await Promise.allSettled(
      [1, 2].map(() =>
        access.requestPairing({
          token: randomBytes(32).toString("base64url"),
          invitation: recovered.token,
        }),
      ),
    );
    expect(attempts.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
  });

  it("does not let local operators or attenuated managers delegate management authority", async () => {
    const { access } = await setup();
    const invite = await access.createInvitation(local, { bootstrap: true });
    const token = randomBytes(32).toString("base64url");
    const controller = await access.requestPairing({ token, invitation: invite.token });
    await access.decide(local, controller.id, true, true);
    await expect(access.createInvitation(local, { manager: true })).rejects.toThrow(
      "management authorization",
    );
    const attenuated = { principalId: controller.id, local: false, manager: false };
    await expect(access.createInvitation(attenuated, { manager: true })).rejects.toThrow(
      "authorization",
    );
    const manager = { ...attenuated, manager: true };
    await access.setMode(manager, false);
    expect(access.controlledOnly).toBe(false);
    await access.setMode(manager, true);
    await expect(access.revoke(manager, controller.id)).rejects.toThrow("last manager");
  });

  it("expires temporary access and pauses receiving without widening local authority", async () => {
    const { access, advance, home } = await setup();
    await access.createInvitation(local, { bootstrap: true });
    const invite = await access.createInvitation(local, {});
    const token = randomBytes(32).toString("base64url");
    const entry = await access.requestPairing({ token, invitation: invite.token });
    await access.decide(local, entry.id, true, false);
    expect(access.authenticate(token)?.permissions).toEqual([
      "daemon.read",
      "workspace.read",
      "workspace.write",
      "workspace.manage",
      "automation.manage",
    ]);
    await access.setReceiving(local, false);
    expect(access.authenticate(token)).toBeNull();
    expect(access.controlledOnly).toBe(true);
    await access.setReceiving(local, true);
    expect(access.authenticate(token)?.principalId).toBe(entry.id);
    advance(60 * 60_000);
    expect(access.authenticate(token)).toBeNull();
    expect((await stat(join(home, "remote-access.json"))).mode & 0o777).toBe(0o600);
  });

  it("refuses corrupt policy rather than restoring legacy owner access", async () => {
    const { home } = await setup();
    await writeFile(join(home, "remote-access.json"), "{}");
    expect(() => new RemoteAccess(home)).toThrow("Cannot read remote access policy");
  });

  it("limits pairing attempts and allows retry after the window", async () => {
    const { access, advance } = await setup();
    const invitation = await access.createInvitation(local, { bootstrap: true });
    for (let i = 0; i < 30; i++)
      await expect(
        access.requestPairing({
          token: randomBytes(32).toString("base64url"),
          invitation: "x".repeat(43),
        }),
      ).rejects.toThrow("expired or already used");
    await expect(
      access.requestPairing({
        token: randomBytes(32).toString("base64url"),
        invitation: invitation.token,
      }),
    ).rejects.toThrow("Too many pairing attempts");
    advance(60_000);
    const controller = await access.requestPairing({
      token: randomBytes(32).toString("base64url"),
      invitation: invitation.token,
    });
    expect(controller.status).toBe("pending");
  });

  it("does not widen an attenuated local session through first-manager pairing", async () => {
    const { access } = await setup();
    await expect(
      access.createInvitation(
        { ...local, permissions: ["daemon.read", "workspace.write"] },
        { bootstrap: true },
      ),
    ).rejects.toThrow("unattenuated local session");
    expect(access.enabled).toBe(false);
  });
});

function accountProof(
  key: string,
  token: string,
  options: { accountId?: string; serverId?: string; expiresAt?: number } = {},
) {
  const encoded = Buffer.from(
    JSON.stringify([
      "clawmuse-account-v1",
      options.serverId ?? "srv_account",
      options.accountId ?? "alice",
      createHash("sha256").update(token).digest("hex"),
      options.expiresAt ?? Date.parse("2026-10-26T00:01:30Z"),
    ]),
  ).toString("base64url");
  return `${encoded}.${createHmac("sha256", Buffer.from(key, "base64url")).update(encoded).digest("base64url")}`;
}

it("authorizes independent same-account devices without an invitation and preserves revocations", async () => {
  const { access, home } = await setup();
  const key = await access.bindAccount(local, "alice", "srv_account");
  expect(await access.bindAccount(local, "alice", "srv_account")).toBe(key);
  const phone = randomBytes(32).toString("base64url");
  const desktop = randomBytes(32).toString("base64url");
  await access.authorizeAccount({
    token: phone,
    label: "Phone",
    accountAuthorization: accountProof(key, phone),
  });
  await access.authorizeAccount({
    token: desktop,
    label: "Desktop",
    accountAuthorization: accountProof(key, desktop),
  });
  const admission = access.authenticate(phone)!;
  expect(admission.permissions).toContain("access.manage");
  expect(new RemoteAccess(home).authenticate(phone)).toEqual(admission);
  await access.revoke(local, admission.principalId);
  expect(access.authenticate(phone)).toBeNull();
  expect(access.authenticate(desktop)).not.toBeNull();
  const invitation = await access.createInvitation(local, {});
  await access.requestPairing({
    token: randomBytes(32).toString("base64url"),
    invitation: invitation.token,
  });
  await expect(
    access.authorizeAccount({ token: phone, accountAuthorization: accountProof(key, phone) }),
  ).rejects.toThrow("already exists");
  expect(await readFile(join(home, "remote-access.json"), "utf8")).not.toContain(phone);
});

it("rejects wrong accounts, hosts, controllers, signatures, and expired account proofs", async () => {
  const { access, advance } = await setup();
  const key = await access.bindAccount(local, "alice", "srv_account");
  const token = randomBytes(32).toString("base64url");
  const other = randomBytes(32).toString("base64url");
  for (const proof of [
    accountProof(key, token, { accountId: "bob" }),
    accountProof(key, token, { serverId: "srv_other" }),
    accountProof(key, other),
    accountProof(other, token),
    accountProof(key, token, { expiresAt: Date.parse("2026-10-26T00:10:00Z") }),
    "invalid.proof",
  ]) {
    await expect(access.authorizeAccount({ token, accountAuthorization: proof })).rejects.toThrow();
    expect(access.authenticate(token)).toBeNull();
  }
  advance(90_000);
  await expect(
    access.authorizeAccount({ token, accountAuthorization: accountProof(key, token) }),
  ).rejects.toThrow("expired");
});

it("limits account binding to the full local owner and invalidates the previous account on replacement", async () => {
  const { access } = await setup();
  await expect(
    access.bindAccount({ ...local, local: false }, "alice", "srv_account"),
  ).rejects.toThrow("local owner");
  await expect(
    access.bindAccount({ ...local, permissions: ["access.manage"] }, "alice", "srv_account"),
  ).rejects.toThrow("local owner");
  const key = await access.bindAccount(local, "alice", "srv_account");
  const token = randomBytes(32).toString("base64url");
  await access.authorizeAccount({ token, accountAuthorization: accountProof(key, token) });
  await access.bindAccount(local, "bob", "srv_account");
  expect(access.authenticate(token)).toBeNull();
  await expect(
    access.authorizeAccount({ token, accountAuthorization: accountProof(key, token) }),
  ).rejects.toThrow();
});

it("keeps account authorization disabled while receiving is paused or controlled-only is enabled", async () => {
  const { access } = await setup();
  const key = await access.bindAccount(local, "alice", "srv_account");
  const token = randomBytes(32).toString("base64url");
  await access.setReceiving(local, false);
  await expect(
    access.authorizeAccount({ token, accountAuthorization: accountProof(key, token) }),
  ).rejects.toThrow("unavailable");
  await access.setReceiving(local, true);
  await access.authorizeAccount({ token, accountAuthorization: accountProof(key, token) });
  await expect(access.setMode(local, true)).rejects.toThrow("independent manager");
  const invite = await access.createInvitation(local, { manager: true });
  const managerToken = randomBytes(32).toString("base64url");
  const manager = await access.requestPairing({ token: managerToken, invitation: invite.token });
  await access.decide(local, manager.id, true, true);
  await access.setMode(local, true);
  expect(access.authenticate(token)).toBeNull();
  expect(access.authenticate(managerToken)).not.toBeNull();
  await expect(access.bindAccount(local, "alice", "srv_account")).rejects.toThrow("local owner");
  await expect(
    access.authorizeAccount({ token, accountAuthorization: accountProof(key, token) }),
  ).rejects.toThrow("unavailable");
});
