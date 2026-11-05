import { tmpdir } from "node:os";
import { afterEach, expect, test } from "vitest";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { createHostClient } from "@getpaseo/client/node";
import { createTestPaseoDaemon } from "./test-utils/paseo-daemon.js";
import { RemoteAccess } from "./remote-access.js";

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).toReversed()) await close();
});

test("local approval admits an independent controller, revocation closes it, and legacy access stays blocked", async () => {
  const root = await mkdtemp(join(tmpdir(), "paseo-access-e2e-"));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const access = new RemoteAccess(join(root, ".paseo"));
  const managerInvite = await access.createInvitation(
    { principalId: "local", local: true, manager: true },
    { bootstrap: true },
  );
  const operatorInvite = await access.createInvitation(
    { principalId: "local", local: true, manager: false },
    {},
  );
  const operatorToken = randomBytes(32).toString("base64url");
  const operatorEntry = await access.requestPairing({
    token: operatorToken,
    invitation: operatorInvite.token,
  });
  await access.decide(
    { principalId: "local", local: true, manager: false },
    operatorEntry.id,
    true,
    true,
  );
  const instance = await createTestPaseoDaemon({ paseoHomeRoot: root });
  cleanup.push(() => instance.close());
  const endpoint = `127.0.0.1:${instance.port}`;
  const localToken = (await readFile(join(instance.paseoHome, "local-credential"), "utf8")).trim();
  const local = createHostClient(endpoint, {
    clientId: "local",
    localCredential: () => localToken,
    reconnect: { enabled: false },
  });
  cleanup.push(() => local.close());
  await local.connect();
  expect((await fetch(`http://${endpoint}/api/status`)).status).toBe(401);
  expect(
    (
      await fetch(`http://${endpoint}/api/status`, {
        headers: { Authorization: `Bearer ${localToken}` },
      })
    ).status,
  ).toBe(200);

  expect((await local.getRemoteAccessState()).state.canPair).toBe(true);
  const address = endpoint;
  const approver = local;
  const managerToken = randomBytes(32).toString("base64url");
  let pendingId = "";
  const manager = createHostClient(address, {
    clientId: "manager",
    controllerCredential: { token: managerToken, invitation: managerInvite.token },
    onPairingPending: (pending) => {
      pendingId = pending.controllerId;
    },
    reconnect: { enabled: false },
  });
  cleanup.push(() => manager.close());
  const connected = manager.connect();
  await expect.poll(() => pendingId).not.toBe("");
  expect(manager.isConnected).toBe(false);
  await approver.decideRemotePairing({ controllerId: pendingId, approve: true, persistent: true });
  await connected;
  expect((await manager.getRemoteAccessState()).state.canManage).toBe(true);
  await expect(approver.setControlledOnly(false)).rejects.toThrow("management authorization");
  await expect(approver.addHost({ connection: "127.0.0.1:1" })).rejects.toThrow("controlled-only");
  const operator = createHostClient(address, {
    clientId: "operator",
    controllerCredential: { token: operatorToken },
    reconnect: { enabled: false },
  });
  cleanup.push(() => operator.close());
  await operator.connect();
  expect((await operator.getRemoteAccessState()).state.canManage).toBe(false);
  await expect(operator.createRemoteAccessInvitation({ manager: true })).rejects.toThrow(
    "authorization",
  );
  await manager.revokeRemoteController(operatorEntry.id);
  await expect.poll(() => operator.isConnected).toBe(false);
  const revoked = createHostClient(address, {
    clientId: "revoked",
    controllerCredential: { token: operatorToken },
    reconnect: { enabled: false },
  });
  cleanup.push(() => revoked.close());
  await expect(revoked.connect()).rejects.toThrow();
  const uncredentialed = createHostClient(address, {
    clientId: "legacy",
    reconnect: { enabled: false },
  });
  cleanup.push(() => uncredentialed.close());
  await expect(uncredentialed.connect()).rejects.toThrow("Use a new pairing invitation");
});

test("a local account binding admits same-account clients without approval and revokes them independently", async () => {
  const root = await mkdtemp(join(tmpdir(), "paseo-account-access-e2e-"));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const instance = await createTestPaseoDaemon({ paseoHomeRoot: root });
  cleanup.push(() => instance.close());
  const endpoint = `127.0.0.1:${instance.port}`;
  const localToken = (await readFile(join(instance.paseoHome, "local-credential"), "utf8")).trim();
  const local = createHostClient(endpoint, {
    clientId: "local",
    localCredential: () => localToken,
    reconnect: { enabled: false },
  });
  cleanup.push(() => local.close());
  await local.connect();
  const { accountKey } = await local.bindClawMuseAccount("alice");
  const serverId = local.getLastServerInfoMessage()!.serverId;
  const token = randomBytes(32).toString("base64url");
  const encoded = Buffer.from(
    JSON.stringify([
      "clawmuse-account-v1",
      serverId,
      "alice",
      createHash("sha256").update(token).digest("hex"),
      Date.now() + 90_000,
    ]),
  ).toString("base64url");
  const accountAuthorization = `${encoded}.${createHmac("sha256", Buffer.from(accountKey, "base64url")).update(encoded).digest("base64url")}`;
  const controller = createHostClient(endpoint, {
    clientId: "phone",
    controllerCredential: { token, accountAuthorization },
    reconnect: { enabled: false },
  });
  cleanup.push(() => controller.close());
  await controller.connect();
  expect((await controller.getRemoteAccessState()).state.canManage).toBe(true);
  await expect(controller.bindClawMuseAccount("bob")).rejects.toThrow("local owner");
  const state = (await local.getRemoteAccessState()).state;
  expect(state.controllers).toHaveLength(1);
  expect(state.controllers[0]!.status).toBe("authorized");
  await local.revokeRemoteController(state.controllers[0]!.id);
  await expect.poll(() => controller.isConnected).toBe(false);
  const replay = createHostClient(endpoint, {
    clientId: "replay",
    controllerCredential: { token, accountAuthorization },
    reconnect: { enabled: false },
  });
  cleanup.push(() => replay.close());
  await expect(replay.connect()).rejects.toThrow();
});
