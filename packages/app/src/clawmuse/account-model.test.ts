import { describe, expect, it } from "vitest";
import { resetAccountActivity, subscribeAccountChange } from "./account-activity";
import { AccountModel, type AccountDependencies } from "./account-model";
import { AccountAuthFormModel } from "./account-auth-form-model";
import { brand } from "@/brand.generated";

function fixture(request?: AccountDependencies["request"]) {
  const hosts = new Set(["manual"]);
  const labels = new Map([["manual", "Manual host"]]);
  let directoryLabel = "Computer";
  let managed: string[] = [];
  let signedIn = true;
  let offline = false;
  let removed: string[] = [];
  let accountChanges = 0;
  const offer = {
    v: 2 as const,
    serverId: "srv_phone",
    daemonPublicKeyB64: "test-public-key",
    relay: { endpoint: "agent-relay.ppb.cn:443", useTls: true },
  };
  const deps: AccountDependencies = {
    beforeAccountChange: async () => {
      accountChanges += 1;
    },
    request:
      request ??
      (async (path, body) => {
        if (offline) throw new Error("network offline");
        if (path === "/sign-out") {
          signedIn = false;
          return { status: 200, data: { success: true } };
        }
        if (path === "/clawmuse/devices/remove") {
          removed.push((body as { serverId: string }).serverId);
          return { status: 200, data: { ok: true } };
        }
        if (path === "/get-session")
          return { status: 200, data: signedIn ? { user: { id: "alice" } } : null };
        if (path === "/clawmuse/devices/rename" && signedIn) {
          directoryLabel = (body as { label: string }).label;
          return { status: 200, data: { ok: true } };
        }
        return signedIn
          ? {
              status: 200,
              data: {
                account: { id: "alice", email: "alice@example.test", name: "Alice" },
                devices: [{ serverId: offer.serverId, label: directoryLabel, offer }],
              },
            }
          : { status: 401, data: {} };
      }),
    readManagedHosts: async () => [...managed],
    writeManagedHosts: async (ids) => {
      managed = ids;
    },
    existingHostIds: () => [...hosts],
    addHost: async (device, label) => {
      hosts.add(device.serverId);
      // Connection upserts preserve an existing local name in the host runtime.
      if (!labels.has(device.serverId)) labels.set(device.serverId, label);
    },
    renameHost: async (id, label) => {
      labels.set(id, label);
    },
    removeHost: async (id) => {
      hosts.delete(id);
    },
    authorizeHost: async (device, label, authorize) => {
      await authorize("a".repeat(64));
      hosts.add(device.serverId);
      labels.set(device.serverId, label);
    },
    clearAccountCredentials: async () => {},
    bindLocalAccount: async () => null,
    localDevice: async () => null,
  };
  return {
    model: new AccountModel(deps),
    deps,
    changed: () => accountChanges,
    hosts,
    labels,
    removed: () => [...removed],
    expire: () => {
      signedIn = false;
    },
    offline: () => {
      offline = true;
    },
    online: () => {
      offline = false;
    },
    changeDirectoryLabel: (label: string) => {
      directoryLabel = label;
    },
  };
}

describe("ClawMuse account discovery", () => {
  it("reports successful registration requiring email verification without an error or duplicate signup", async () => {
    const calls: string[] = [];
    const sample = fixture(async (path) => {
      calls.push(path);
      return { status: 200, data: path === "/get-session" ? null : {} };
    });
    const form = new AccountAuthFormModel(sample.model);
    form.setMode("register");
    form.setEmail("alice@example.test");
    form.setPassword("long-enough-password");
    await form.submit();
    expect(sample.model.getState()).toMatchObject({ error: null, account: null });
    expect(form.getState()).toMatchObject({
      verificationSent: true,
      error: null,
      canSubmit: false,
      password: "",
    });
    await form.submit();
    expect(calls).toEqual(["/sign-up/email", "/get-session"]);
    form.setMode("login");
    expect(form.getState().verificationSent).toBe(false);
  });

  it.each([
    [
      403,
      { code: "EMAIL_NOT_VERIFIED" },
      "Verify your email before signing in. Check your inbox for the verification link.",
    ],
    [429, {}, "Too many attempts. Wait a moment and try again."],
    [
      503,
      { message: "internal service detail" },
      "The account service is unavailable. Please try again later.",
    ],
  ])("gives actionable feedback for a rejected request (%s)", async (status, data, message) => {
    const sample = fixture(async () => ({ status, data }));
    await sample.model.signIn("alice@example.test", "password");
    expect(sample.model.getState()).toMatchObject({
      error: message,
      busy: false,
      pendingAction: null,
    });
  });

  it("marks only an explicit refresh as pending and preserves errors during background sync", async () => {
    const sample = fixture();
    await sample.model.refresh();
    const request = sample.deps.request;
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    sample.deps.request = async (path, body) => {
      if (path === "/get-session") {
        markStarted();
        await gate;
      }
      return request(path, body);
    };
    const pending = sample.model.refresh();
    await started;
    expect(sample.model.getState()).toMatchObject({ busy: true, pendingAction: "refresh" });
    finish();
    await pending;
    expect(sample.model.getState()).toMatchObject({ busy: false, pendingAction: null });
    sample.offline();
    await sample.model.refresh();
    expect(sample.model.getState().error).toBe("network offline");
    sample.online();
    sample.deps.request = request;
    await sample.model.refreshInBackground();
    expect(sample.model.getState().error).toBe("network offline");
    await sample.model.refresh();
    expect(sample.model.getState().error).toBeNull();
  });

  it("reports incorrect login credentials and keeps the form error after background refresh", async () => {
    const sample = fixture(async (path) =>
      path === "/sign-in/email"
        ? {
            status: 401,
            data: { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" },
          }
        : { status: 200, data: null },
    );
    const form = new AccountAuthFormModel(sample.model);
    form.setEmail("alice@example.test");
    form.setPassword("wrong-password");
    await form.submit();
    expect(form.getState()).toMatchObject({
      busy: false,
      error: "Incorrect email or password. Try again or reset your password.",
    });
    await sample.model.refreshInBackground();
    expect(sample.model.getState().error).toBe(
      "Incorrect email or password. Try again or reset your password.",
    );
    expect(form.getState().error).toBe(
      "Incorrect email or password. Try again or reset your password.",
    );
    form.setPassword("corrected-password");
    expect(form.getState().error).toBeNull();
  });

  it("distinguishes login rejection from an expired authenticated session", async () => {
    const sample = fixture(async () => ({ status: 401, data: {} }));
    await sample.model.signIn("alice@example.test", "wrong-password");
    expect(sample.model.getState().error).toBe(
      "Incorrect email or password. Try again or reset your password.",
    );
  });

  it("registers with email and password without asking for a nickname", async () => {
    const sample = fixture();
    const request = sample.deps.request;
    const calls: { path: string; body: unknown }[] = [];
    sample.deps.request = async (path, body) => {
      calls.push({ path, body });
      return request(path, body);
    };
    const form = new AccountAuthFormModel(sample.model);
    form.setMode("register");
    form.setEmail("  alice@example.test  ");
    form.setPassword("short");
    expect(form.getState().canSubmit).toBe(false);
    form.setPassword("long-enough-password");
    expect(form.getState().canSubmit).toBe(true);
    await form.submit();
    expect(calls[0]).toEqual({
      path: "/sign-up/email",
      body: {
        email: "alice@example.test",
        password: "long-enough-password",
        name: "alice@example.test",
      },
    });
    expect(sample.model.getState().account?.email).toBe("alice@example.test");
    expect(form.getState().password).toBe("");
  });

  it("sends a reset link without a password, importing devices or signing in", async () => {
    const calls: { path: string; body: unknown }[] = [];
    const sample = fixture(async (path, body) => {
      calls.push({ path, body });
      return { status: 200, data: { status: true } };
    });
    const form = new AccountAuthFormModel(sample.model);
    form.setEmail("alice@example.test");
    form.setPassword("previous-password");
    form.setMode("recover");
    expect(form.getState()).toMatchObject({ password: "", canSubmit: true });
    await form.submit();
    expect(calls).toEqual([
      {
        path: "/request-password-reset",
        body: {
          email: "alice@example.test",
          redirectTo: `${brand.hubOrigin}/?auth=password-reset`,
        },
      },
    ]);
    expect(form.getState()).toMatchObject({ busy: false, resetSent: true, canSubmit: false });
    expect(sample.model.getState().account).toBeNull();
    expect(sample.changed()).toBe(0);
    expect([...sample.hosts]).toEqual(["manual"]);
    await form.submit();
    expect(calls).toHaveLength(1);
    form.setMode("login");
    expect(form.getState()).toMatchObject({
      email: "alice@example.test",
      password: "",
      resetSent: false,
      canSubmit: false,
    });
    form.close();
    expect(new AccountAuthFormModel(sample.model).getState().mode).toBe("login");
  });

  it("shows reset failures and lets the same email retry", async () => {
    let failure = true;
    const sample = fixture(async () => {
      if (failure) throw new Error("network offline");
      return { status: 200, data: { status: true } };
    });
    const form = new AccountAuthFormModel(sample.model);
    form.setMode("recover");
    form.setEmail("invalid");
    expect(form.getState().canSubmit).toBe(false);
    form.setEmail("alice@example.test");
    await form.submit();
    expect(sample.model.getState().error).toBe("network offline");
    expect(form.getState()).toMatchObject({ resetSent: false, busy: false, canSubmit: true });
    failure = false;
    await form.submit();
    expect(sample.model.getState().error).toBeNull();
    expect(form.getState().resetSent).toBe(true);
  });

  it("keeps the reset form stable and prevents duplicate requests while sending", async () => {
    let finish!: () => void;
    let requests = 0;
    const sample = fixture(async () => {
      requests += 1;
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return { status: 200, data: { status: true } };
    });
    const form = new AccountAuthFormModel(sample.model);
    form.setMode("recover");
    form.setEmail("alice@example.test");
    const pending = form.submit();
    await Promise.resolve();
    form.setMode("register");
    await form.submit();
    expect(form.getState()).toMatchObject({ mode: "recover", busy: true, canSubmit: false });
    finish();
    await pending;
    expect(requests).toBe(1);
    expect(form.getState().resetSent).toBe(true);
  });

  it("clears imported devices and refuses account sign-in on a controlled-only computer", async () => {
    const sample = fixture();
    await sample.model.refresh();
    expect(sample.hosts.has("srv_phone")).toBe(true);
    sample.deps.controlledOnly = async () => true;
    await sample.model.signIn("owner@example.test", "password");
    expect(sample.model.getState()).toMatchObject({
      account: null,
      devices: [],
      error: "此电脑仅允许本机使用和接受远程控制，不能登录账号获取其他设备。",
    });
    expect([...sample.hosts]).toEqual(["manual"]);
  });

  it("keeps protected devices visible even before account authorization is supported", async () => {
    const sample = fixture(async (path) =>
      path === "/get-session"
        ? { status: 200, data: { user: { id: "alice" } } }
        : {
            status: 200,
            data: {
              account: { id: "alice", name: "Alice", email: "alice@example.test" },
              devices: [
                {
                  serverId: "srv_protected",
                  label: "Protected",
                  offer: {
                    v: 2,
                    serverId: "srv_protected",
                    daemonPublicKeyB64: "public-key",
                    relay: { endpoint: "agent-relay.ppb.cn:443", useTls: true },
                    requiresAuthorization: true,
                  },
                },
              ],
            },
          },
    );
    await sample.model.refresh();
    expect(sample.model.getState().devices.map((device) => device.serverId)).toEqual([
      "srv_protected",
    ]);
    expect([...sample.hosts]).toEqual(["manual", "srv_protected"]);
  });

  it("applies directory renames to an existing local host without changing manual hosts", async () => {
    const { model, labels, changeDirectoryLabel } = fixture();
    await model.refresh();
    labels.set("srv_phone", "Stale local name");
    changeDirectoryLabel("New account name");
    await model.refresh();
    expect(labels.get("srv_phone")).toBe("New account name");
    expect(labels.get("manual")).toBe("Manual host");
  });

  it("shares renames between clients and keeps them when the desktop republishes", async () => {
    let label = "Computer";
    const requests: string[] = [];
    const offer = {
      v: 2 as const,
      serverId: "srv_phone",
      daemonPublicKeyB64: "test-public-key",
      relay: { endpoint: "agent-relay.ppb.cn:443", useTls: true },
    };
    const request: AccountDependencies["request"] = async (path, body) => {
      requests.push(path);
      if (path === "/get-session") return { status: 200, data: { user: { id: "alice" } } };
      if (path === "/clawmuse/devices/rename") {
        label = (body as { label: string }).label;
        return { status: 200, data: { ok: true } };
      }
      if (body !== undefined) return { status: 200, data: { ok: true } };
      return {
        status: 200,
        data: {
          account: { id: "alice", name: "Alice", email: "alice@example.test" },
          devices: [{ serverId: offer.serverId, label, offer }],
        },
      };
    };
    const desktop = fixture(request);
    const phone = fixture(request);
    desktop.deps.localDevice = async () => ({ offer, label: "Stale enrollment name" });
    await desktop.model.refresh();
    await phone.model.refresh();
    await desktop.model.renameHost("srv_phone", "  Office Mac  ");
    expect(desktop.labels.get("srv_phone")).toBe("Office Mac");
    await phone.model.refresh();
    expect(phone.labels.get("srv_phone")).toBe("Office Mac");
    await phone.model.renameHost("srv_phone", "Home Mac");
    await desktop.model.connectLocal();
    expect(desktop.labels.get("srv_phone")).toBe("Home Mac");
    expect(desktop.model.getState().devices[0]?.label).toBe("Home Mac");
    expect(requests.filter((path) => path === "/clawmuse/devices/rename")).toHaveLength(2);
  });

  it("rejects a failed account rename without changing the cache and allows retry", async () => {
    const { model, labels, offline, online } = fixture();
    await model.refresh();
    offline();
    await expect(model.renameHost("srv_phone", "New name")).rejects.toThrow("network offline");
    expect(labels.get("srv_phone")).toBe("Computer");
    expect(model.getState().devices[0]?.label).toBe("Computer");
    expect(model.getState().busy).toBe(false);
    online();
    await model.renameHost("srv_phone", "New name");
    expect(labels.get("srv_phone")).toBe("New name");
    expect(model.getState().error).toBeNull();
  });

  it("does not turn cached account devices into local-only renames before discovery", async () => {
    const { model, deps, labels, offline } = fixture();
    await deps.writeManagedHosts(["srv_phone"]);
    labels.set("srv_phone", "Cached name");
    offline();
    await expect(model.renameHost("srv_phone", "New name")).rejects.toThrow("network offline");
    expect(labels.get("srv_phone")).toBe("Cached name");
  });

  it("renames manual hosts locally while signed out and offline", async () => {
    const { model, labels, offline } = fixture();
    offline();
    await model.renameHost("manual", "Local name");
    expect(labels.get("manual")).toBe("Local name");
    expect(model.getState().account).toBeNull();
  });

  it("rejects blank and oversized names before changing a host", async () => {
    const { model, labels } = fixture();
    await expect(model.renameHost("manual", "   ")).rejects.toThrow();
    await expect(model.renameHost("manual", "x".repeat(101))).rejects.toThrow();
    expect(labels.get("manual")).toBe("Manual host");
  });

  it("imports the account's computer and removes only imported hosts on logout", async () => {
    const { model, hosts } = fixture();
    await model.refresh();
    expect([...hosts]).toEqual(["manual", "srv_phone"]);
    await model.signOut();
    expect([...hosts]).toEqual(["manual"]);
    expect(model.getState().account).toBeNull();
  });
  it("does not let an in-flight refresh reconnect after logout", async () => {
    const { model, hosts } = fixture();
    await Promise.all([model.refresh(), model.signOut(), model.refresh()]);
    expect([...hosts]).toEqual(["manual"]);
    expect(model.getState().account).toBeNull();
  });
  it("cleans imported connections when a saved session expires", async () => {
    const { model, hosts, expire } = fixture();
    await model.refresh();
    expire();
    await model.refresh();
    expect([...hosts]).toEqual(["manual"]);
  });
  it("preserves existing connections across transient Hub downtime", async () => {
    const { model, hosts, offline } = fixture();
    await model.refresh();
    offline();
    await model.refresh();
    expect(hosts.has("srv_phone")).toBe(true);
    expect(model.getState().account?.id).toBe("alice");
    expect(model.getState().error).toBe("network offline");
  });

  it("disconnects imported hosts even when logout cannot reach the Hub", async () => {
    const { model, hosts, offline } = fixture();
    await model.refresh();
    offline();
    await model.signOut();
    expect([...hosts]).toEqual(["manual"]);
    expect(model.getState().account).toBeNull();
  });

  it("removes a device from the directory and the local host list", async () => {
    const { model, hosts, removed } = fixture();
    await model.refresh();
    expect(hosts.has("srv_phone")).toBe(true);
    await model.removeDevice("srv_phone");
    expect(removed()).toEqual(["srv_phone"]);
    expect(hosts.has("srv_phone")).toBe(false);
    expect(model.getState().devices).toEqual([]);
  });

  it("preserves the device and reports an error when directory removal fails", async () => {
    const { model, hosts, removed, offline } = fixture();
    await model.refresh();
    offline();
    await model.removeDevice("srv_phone");
    expect(removed()).toEqual([]);
    expect([...hosts]).toEqual(["manual", "srv_phone"]);
    expect(model.getState().devices.map((device) => device.serverId)).toEqual(["srv_phone"]);
    expect(model.getState().error).toBe("network offline");
    expect(model.getState().busy).toBe(false);
  });

  it("keeps other devices when removing one device", async () => {
    const { model, hosts } = fixture();
    await model.refresh();
    await model.removeDevice("srv_other");
    expect(hosts.has("srv_phone")).toBe(true);
    expect(model.getState().devices.map((d) => d.serverId)).toEqual(["srv_phone"]);
  });
});

describe("ClawMuse account deletion", () => {
  it("requires a confirmed deletion response before clearing imported hosts", async () => {
    const sample = fixture();
    await sample.model.refresh();
    const requests: unknown[] = [];
    sample.deps.request = async (path, body) => {
      requests.push({ path, body });
      return { status: 503, data: { message: "Status cleanup unavailable" } };
    };
    await sample.model.deleteAccount("current-password");
    expect(sample.model.getState().account?.id).toBe("alice");
    expect(sample.model.getState().deleted).not.toBe(true);
    expect(sample.hosts.has("srv_phone")).toBe(true);
    expect(requests).toEqual([{ path: "/delete-user", body: { password: "current-password" } }]);
    sample.deps.request = async () => ({
      status: 200,
      data: { success: true, message: "Verification email sent" },
    });
    await sample.model.deleteAccount("current-password");
    expect(sample.model.getState().deleted).not.toBe(true);
    sample.deps.request = async () => ({
      status: 200,
      data: { success: true, message: "User deleted" },
    });
    await sample.model.deleteAccount("current-password");
    expect(sample.model.getState()).toMatchObject({
      account: null,
      devices: [],
      deleted: true,
      error: null,
    });
    expect([...sample.hosts]).toEqual(["manual"]);
  });

  it("keeps deletion confirmed when local host cleanup fails", async () => {
    const sample = fixture();
    await sample.model.refresh();
    sample.deps.request = async () => ({
      status: 200,
      data: { success: true, message: "User deleted" },
    });
    sample.deps.removeHost = async () => {
      throw new Error("local cleanup failed");
    };
    await sample.model.deleteAccount("password");
    expect(sample.model.getState()).toMatchObject({
      account: null,
      devices: [],
      deleted: true,
      error: "local cleanup failed",
    });
  });

  it("rejects an empty password without calling the server", async () => {
    const sample = fixture();
    await sample.model.refresh();
    sample.deps.request = async () => {
      throw new Error("must not request");
    };
    await sample.model.deleteAccount("");
    expect(sample.model.getState().error).toBe("请输入当前密码以确认删除。");
  });
});

describe("account activity cleanup", () => {
  it("runs cleanup before signing into another account", async () => {
    const sample = fixture();
    await sample.model.refresh();
    const request = sample.deps.request;
    sample.deps.request = async (path, body) => {
      if (path === "/sign-in/email") expect(sample.changed()).toBe(1);
      return request(path, body);
    };
    await sample.model.signIn("alice@example.test", "password");
    expect(sample.changed()).toBe(1);
  });
  it("runs cleanup before sign-out and confirmed deletion requests", async () => {
    const sample = fixture();
    await sample.model.refresh();
    sample.deps.request = async (path) => {
      expect(sample.changed()).toBe(1);
      expect(path).toBe("/delete-user");
      return { status: 200, data: { success: true, message: "User deleted" } };
    };
    await sample.model.deleteAccount("password");
    expect(sample.model.getState().deleted).toBe(true);
    const logout = fixture();
    await logout.model.refresh();
    const request = logout.deps.request;
    logout.deps.request = async (path, body) => {
      if (path === "/sign-out") expect(logout.changed()).toBe(1);
      return request(path, body);
    };
    await logout.model.signOut();
  });
  it("runs cleanup when a refreshed account session expires", async () => {
    const sample = fixture();
    await sample.model.refresh();
    sample.expire();
    await sample.model.refresh();
    expect(sample.changed()).toBe(1);
    expect(sample.model.getState().account).toBeNull();
  });
  it("does not start account-changing requests when cleanup fails", async () => {
    const sample = fixture();
    sample.deps.beforeAccountChange = async () => {
      throw new Error("account cleanup unavailable");
    };
    let requests = 0;
    sample.deps.request = async () => {
      requests += 1;
      return { status: 200, data: null };
    };
    await sample.model.signIn("new@example.test", "password");
    expect(requests).toBe(0);
    expect(sample.model.getState().error).toBe("account cleanup unavailable");
  });
});

it("does not reset guest activity on repeated empty session refresh", async () => {
  const sample = fixture();
  sample.expire();
  await sample.model.refresh();
  await sample.model.refresh();
  expect(sample.changed()).toBe(0);
  expect(sample.model.getState().account).toBeNull();
});

it("stops account activity on an externally switched authenticated account", async () => {
  const sample = fixture();
  await sample.model.refresh();
  const request = sample.deps.request;
  sample.deps.request = async (path, body) => {
    const response = await request(path, body);
    if (path === "/clawmuse/devices") {
      const data = response.data as { account: { id: string }; devices: unknown[] };
      return {
        ...response,
        data: { ...data, account: { id: "bob", name: "Bob", email: "bob@example.test" } },
      };
    }
    return response;
  };
  await sample.model.refresh();
  expect(sample.changed()).toBe(1);
  expect(sample.model.getState().account?.id).toBe("bob");
});

it("automatically prepares a cloud space, keeps it across directory refresh, and clears it on logout", async () => {
  const offer = {
    v: 2 as const,
    serverId: "srv_cloud",
    daemonPublicKeyB64: "test-key",
    relay: { endpoint: "agent-relay.ppb.cn:443", useTls: true },
  };
  let running = false;
  const paths: string[] = [];
  const f = fixture(async (path) => {
    paths.push(path);
    if (path === "/get-session") return { status: 200, data: { user: { id: "alice" } } };
    if (path === "/clawmuse/devices")
      return {
        status: 200,
        data: {
          account: { id: "alice", email: "a@example.test", name: "Alice" },
          devices: [],
          cloud: { enabled: true },
        },
      };
    if (path === "/clawmuse/cloud/start") running = true;
    if (path === "/clawmuse/cloud/pause") running = false;
    return {
      status: 200,
      data: {
        state: running ? "running" : "not_created",
        models: [],
        balance: { availableMicros: 1000, spentMicros: 0, reservedMicros: 0 },
        offer: running ? offer : null,
      },
    };
  });
  await f.model.refresh();
  expect(paths).toContain("/clawmuse/cloud/start");
  expect(f.hosts.has("srv_cloud")).toBe(true);
  await f.model.refreshInBackground();
  expect(f.hosts.has("srv_cloud")).toBe(true);
  await f.model.pauseCloud();
  expect(f.hosts.has("srv_cloud")).toBe(false);
  await f.model.startCloud();
  await f.model.signOut();
  expect(f.hosts.has("srv_cloud")).toBe(false);
  expect(f.hosts.has("manual")).toBe(true);
  expect(f.model.getState().cloudEnabled).toBe(false);
});

it("keeps cloud configuration pending and cloud failures separate from account login", async () => {
  let fail = false;
  const paths: string[] = [];
  const f = fixture(async (path) => {
    paths.push(path);
    if (path === "/get-session") return { status: 200, data: {} };
    if (path === "/clawmuse/devices")
      return {
        status: 200,
        data: {
          account: { id: "alice", email: "a@example.test", name: "Alice" },
          devices: [],
          cloud: { enabled: true },
        },
      };
    return fail
      ? { status: 503, data: { error: "cloud_unavailable" } }
      : {
          status: 200,
          data: { state: "pending_configuration", models: [], balance: null, offer: null },
        };
  });
  await f.model.refresh();
  expect(f.model.getState().cloud?.state).toBe("pending_configuration");
  expect(paths).not.toContain("/clawmuse/cloud/start");
  fail = true;
  await f.model.refresh();
  expect(f.model.getState().account?.id).toBe("alice");
  expect(f.model.getState().error).toBeNull();
  expect(f.model.getState().cloudError).toBeTruthy();
});

describe("account credential cleanup", () => {
  it("keeps a new account from signing in if previous Status credentials cannot be cleared", async () => {
    const requests: string[] = [];
    const h = fixture(async (requestPath) => {
      requests.push(requestPath);
      return { status: 200, data: {} };
    });
    h.deps.beforeAccountChange = resetAccountActivity;
    const unsubscribe = subscribeAccountChange(async () => {
      throw new Error("secure store unavailable");
    });
    try {
      await h.model.signIn("second@example.test", "password");
      expect(requests).toEqual([]);
      expect(h.model.getState()).toMatchObject({
        account: null,
        error: "Failed to clear account activity",
      });
    } finally {
      unsubscribe();
    }
  });
});

it("authorizes same-account devices and rediscovers a removed direct connection", async () => {
  const calls: string[] = [];
  const offer = {
    v: 2,
    serverId: "srv_silicon",
    daemonPublicKeyB64: "public-key",
    relay: { endpoint: "agent-relay.ppb.cn:443", useTls: true },
    requiresAuthorization: true,
    minimumSecurityMode: "protected",
  };
  const sample = fixture(async (path, body) => {
    calls.push(path);
    if (path === "/clawmuse/devices/authorize") {
      expect(body).toEqual({
        serverId: offer.serverId,
        daemonPublicKeyB64: offer.daemonPublicKeyB64,
        controllerHash: "a".repeat(64),
      });
      return { status: 200, data: { authorization: "signed-proof" } };
    }
    return {
      status: 200,
      data: {
        account: { id: "alice", name: "Alice", email: "alice@example.test" },
        devices: [{ serverId: offer.serverId, label: "硅谷16", offer, accountAuthorization: true }],
      },
    };
  });
  await sample.model.refresh();
  expect(sample.model.getState().error).toBeNull();
  expect(sample.hosts.has(offer.serverId)).toBe(true);
  sample.hosts.delete(offer.serverId);
  await sample.model.refresh();
  expect(sample.hosts.has(offer.serverId)).toBe(true);
  expect(sample.labels.get(offer.serverId)).toBe("硅谷16");
  expect(calls.filter((path) => path.endsWith("/authorize"))).toHaveLength(2);
});

it("shows discovered devices and continues importing others when account authorization fails", async () => {
  const sample = fixture(async (path) => {
    if (path.endsWith("/authorize")) return { status: 503, data: {} };
    return {
      status: 200,
      data: {
        account: { id: "alice", name: "Alice", email: "alice@example.test" },
        devices: [true, false].map((accountAuthorization) => {
          const serverId = accountAuthorization ? "srv_protected" : "srv_legacy";
          return {
            serverId,
            label: serverId,
            accountAuthorization,
            offer: {
              v: 2,
              serverId,
              daemonPublicKeyB64: "key",
              relay: { endpoint: "agent-relay.ppb.cn:443", useTls: true },
            },
          };
        }),
      },
    };
  });
  await sample.model.refresh();
  expect(sample.model.getState().devices).toHaveLength(2);
  expect(sample.model.getState().error).toContain("srv_protected:");
  expect(sample.hosts.has("srv_legacy")).toBe(true);
});

it("checks device ownership before binding a local account and republishes the managed offer", async () => {
  const sample = fixture();
  await sample.model.refresh();
  const calls: string[] = [];
  const localOffer = {
    v: 2 as const,
    serverId: "srv_local",
    daemonPublicKeyB64: "local-key",
    relay: { endpoint: "agent-relay.ppb.cn:443", useTls: true },
  };
  let bound = false;
  sample.deps.localDevice = async () => ({
    label: "Local",
    offer: { ...localOffer, requiresAuthorization: bound },
  });
  sample.deps.bindLocalAccount = async (accountId) => {
    expect(accountId).toBe("alice");
    calls.push("bind");
    bound = true;
    return "account-key";
  };
  const request = sample.deps.request;
  sample.deps.request = async (path, body) => {
    if (path === "/clawmuse/devices" && body) {
      calls.push(bound ? "publish" : "ownership");
      if (bound)
        expect(body).toMatchObject({
          accountKey: "account-key",
          offer: { requiresAuthorization: true },
        });
    }
    return request(path, body);
  };
  await sample.model.connectLocal();
  expect(calls).toEqual(["ownership", "bind", "publish"]);
  calls.length = 0;
  sample.deps.request = async () => ({ status: 409, data: { error: "device_already_owned" } });
  await sample.model.connectLocal();
  expect(calls).toEqual([]);
  expect(sample.model.getState().error).toContain("其他账号");
});
