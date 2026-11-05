import { z } from "zod";
import { ConnectionOfferSchema, type ConnectionOffer } from "@getpaseo/protocol/connection-offer";
import { brand } from "@/brand.generated";
import { i18n } from "@/i18n/i18next";
import { cloudSpaceSchema, type CloudSpace } from "./cloud-schema";

const directorySchema = z.object({
  account: z.object({ id: z.string(), name: z.string(), email: z.string() }),
  devices: z.array(
    z.object({
      serverId: z.string(),
      label: z.string(),
      offer: ConnectionOfferSchema,
      accountAuthorization: z.boolean().optional(),
    }),
  ),
  cloud: z.object({ enabled: z.boolean() }).optional(),
});
type Directory = z.infer<typeof directorySchema>;
type AccountAction =
  | "refresh"
  | "connectLocal"
  | "signOut"
  | "deleteAccount"
  | "startCloud"
  | "pauseCloud"
  | `removeDevice:${string}`;
interface AccountOperationOptions {
  propagateError?: boolean;
  action?: AccountAction | null;
  background?: boolean;
}
export interface AccountState {
  initialized: boolean;
  account: Directory["account"] | null;
  devices: Directory["devices"];
  deleted?: boolean;
  busy: boolean;
  pendingAction: AccountAction | null;
  error: string | null;
  cloud?: CloudSpace | null;
  cloudEnabled?: boolean;
  cloudError?: string | null;
}
export interface AccountDependencies {
  beforeAccountChange: () => Promise<void>;
  controlledOnly?: () => Promise<boolean>;
  request: (path: string, body?: unknown) => Promise<{ status: number; data: unknown }>;
  readManagedHosts: () => Promise<string[]>;
  writeManagedHosts: (ids: string[]) => Promise<void>;
  existingHostIds: () => string[];
  addHost: (offer: ConnectionOffer, label: string) => Promise<unknown>;
  authorizeHost: (
    offer: ConnectionOffer,
    label: string,
    authorize: (controllerHash: string) => Promise<string>,
  ) => Promise<unknown>;
  renameHost: (id: string, label: string) => Promise<void>;
  removeHost: (id: string) => Promise<void>;
  clearAccountCredentials: (keep: string[]) => Promise<void>;
  localDevice: () => Promise<{ offer: ConnectionOffer; label: string } | null>;
  bindLocalAccount: (accountId: string) => Promise<string | null>;
}

const errors: Record<string, string> = {
  registration_closed: "当前暂未开放注册，请联系管理员开通。",
  device_already_owned: "这台电脑已绑定其他账号，请先在原账号移除。",
  password_change_required: "请先在云端控制台修改初始密码。",
  invalid_device: "电脑的中转地址与 ClawMuse 服务不一致。",
  device_limit: "账号最多可以绑定 20 台电脑。",
  device_not_found: "这台服务器已不在当前账号中，请刷新设备列表。",
  account_authorization_unavailable: "请在这台电脑上更新 ClawMuse，并登录账号启用账号连接。",
  device_identity_changed: "这台电脑的身份已变化，请在电脑上重新登录后再连接。",
};

/** Serializes login, discovery and logout so an old response cannot reconnect a signed-out host. */
export class AccountModel {
  private state: AccountState = {
    initialized: false,
    account: null,
    devices: [],
    busy: false,
    pendingAction: null,
    error: null,
  };
  private listeners = new Set<() => void>();
  private pending: Promise<void> = Promise.resolve();
  private cloudHostId: string | null = null;
  constructor(private readonly deps: AccountDependencies) {}
  getState = () => this.state;
  clearError = () => {
    if (this.state.error !== null) this.publish({ error: null });
  };
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<AccountState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private enqueue(
    operation: () => Promise<void>,
    options: AccountOperationOptions = {},
  ): Promise<void> {
    const run = this.pending.then(() => this.execute(operation, options));
    this.pending = run.catch(() => undefined);
    return run;
  }
  private async execute(
    operation: () => Promise<void>,
    { propagateError = false, action = null, background = false }: AccountOperationOptions,
  ): Promise<void> {
    this.publish({ busy: true, pendingAction: action, ...(background ? {} : { error: null }) });
    try {
      await operation();
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      let message = error instanceof Error ? error.message : i18n.t("clawmuseAccount.requestError");
      if (name === "AbortError" || name === "TimeoutError")
        message = i18n.t("clawmuseAccount.timeoutError");
      else if (name === "TypeError") message = i18n.t("clawmuseAccount.networkError");
      if (!background || !this.state.error) this.publish({ error: message });
      if (propagateError) throw error;
    } finally {
      this.publish({ initialized: true, busy: false, pendingAction: null });
    }
  }
  private async request(path: string, body?: unknown) {
    const response = await this.deps.request(path, body);
    if (response.status >= 400) {
      const detail = z
        .object({
          error: z.string().optional(),
          code: z.string().optional(),
          message: z.string().optional(),
        })
        .safeParse(response.data);
      const code = detail.success ? (detail.data.code ?? detail.data.error) : undefined;
      // Credential rejection is not an expired session (including current-password checks).
      const authErrors = {
        INVALID_EMAIL_OR_PASSWORD: "clawmuseAccount.invalidCredentials",
        INVALID_PASSWORD: "clawmuseAccount.invalidPassword",
        USER_ALREADY_EXISTS: "clawmuseAccount.emailAlreadyExists",
        USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "clawmuseAccount.emailAlreadyExists",
        EMAIL_NOT_VERIFIED: "clawmuseAccount.emailNotVerified",
        INVALID_EMAIL: "clawmuseAccount.emailInvalid",
        PASSWORD_TOO_SHORT: "clawmuseAccount.passwordTooShort",
        PASSWORD_TOO_LONG: "clawmuseAccount.passwordTooLong",
      } as const;
      if (code && Object.hasOwn(authErrors, code))
        throw new Error(i18n.t(authErrors[code as keyof typeof authErrors]));
      if (path === "/sign-in/email" && response.status === 401)
        throw new Error(i18n.t("clawmuseAccount.invalidCredentials"));
      if (response.status === 401) {
        await this.invalidateAccount();
        throw new Error("登录已失效，请重新登录。");
      }
      if (response.status === 429) throw new Error(i18n.t("clawmuseAccount.rateLimited"));
      if (code === "insufficient_credit") throw new Error(i18n.t("cloudSpace.insufficientCredit"));
      if (code === "cloud_capacity_reached") throw new Error(i18n.t("cloudSpace.capacityReached"));
      if (response.status >= 500) throw new Error(i18n.t("clawmuseAccount.serviceError"));
      throw new Error(
        (code && errors[code]) ||
          (detail.success && detail.data.message) ||
          i18n.t("clawmuseAccount.requestError"),
      );
    }
    return response.data;
  }
  private async invalidateAccount() {
    const hadAccount = this.state.account !== null;
    this.clearCloud();
    this.publish({ account: null, devices: [] });
    if (hadAccount) await this.deps.beforeAccountChange();
    await this.clearManagedHosts();
  }
  private async clearManagedHosts(keep: string[] = []) {
    await this.deps.clearAccountCredentials(keep);
    const managed = await this.deps.readManagedHosts();
    for (const id of managed) if (!keep.includes(id)) await this.deps.removeHost(id);
    await this.deps.writeManagedHosts(managed.filter((id) => keep.includes(id)));
  }
  private async ensureController(): Promise<void> {
    if (!(await this.deps.controlledOnly?.())) return;
    await this.invalidateAccount();
    try {
      await this.deps.request("/sign-out", {});
    } catch {
      /* The desktop bridge removes its stored session before sending. */
    }
    throw new Error("此电脑仅允许本机使用和接受远程控制，不能登录账号获取其他设备。");
  }
  private async discover() {
    await this.ensureController();
    const directory = directorySchema.parse(await this.request("/clawmuse/devices"));
    if (this.state.account && this.state.account.id !== directory.account.id) {
      await this.deps.beforeAccountChange();
      this.clearCloud();
    }
    const keep = directory.devices.map((device) => device.serverId);
    if (this.cloudHostId && directory.cloud?.enabled) keep.push(this.cloudHostId);
    await this.clearManagedHosts(keep);
    // Publish discovery before connecting: one unavailable host must not hide the directory.
    this.publish({ account: directory.account, devices: directory.devices });
    const failures: string[] = [];
    for (const device of directory.devices) {
      if (device.serverId !== device.offer.serverId) throw new Error("设备目录无效");
      if (!this.deps.existingHostIds().includes(device.serverId)) {
        // Persist ownership before importing so logout also cleans up after a process crash.
        const managed = await this.deps.readManagedHosts();
        await this.deps.writeManagedHosts([...new Set([...managed, device.serverId])]);
      }
      try {
        if (device.accountAuthorization) {
          await this.deps.authorizeHost(device.offer, device.label, async (controllerHash) => {
            const result = z.object({ authorization: z.string().max(2048) }).parse(
              await this.request("/clawmuse/devices/authorize", {
                serverId: device.serverId,
                daemonPublicKeyB64: device.offer.daemonPublicKeyB64,
                controllerHash,
              }),
            );
            return result.authorization;
          });
        } else {
          await this.deps.addHost(device.offer, device.label);
        }
        await this.deps.renameHost(device.serverId, device.label);
      } catch (error) {
        if (!this.state.account) throw error;
        failures.push(
          `${device.label}: ${error instanceof Error ? error.message : i18n.t("clawmuseAccount.requestError")}`,
        );
      }
    }
    if (directory.cloud?.enabled) await this.syncCloud();
    else if (this.state.cloudEnabled) this.clearCloud();
    if (failures.length) this.publish({ error: failures.join("\n") });
  }

  private clearCloud() {
    this.cloudHostId = null;
    if (this.state.cloudEnabled || this.state.cloud)
      this.publish({ cloud: null, cloudEnabled: false, cloudError: null });
  }

  private async syncCloud(operation: "" | "/start" | "/pause" = "") {
    const accountId = this.state.account?.id;
    if (!accountId) return;
    this.publish({ cloudEnabled: true });
    try {
      let snapshot = cloudSpaceSchema.parse(
        await this.request(`/clawmuse/cloud${operation}`, operation ? {} : undefined),
      );
      if (!operation && snapshot.state === "not_created")
        snapshot = cloudSpaceSchema.parse(await this.request("/clawmuse/cloud/start", {}));
      if (this.state.account?.id !== accountId) return;
      await this.importCloud(snapshot);
      this.publish({ cloud: snapshot, cloudError: null });
    } catch (error) {
      if (this.state.account?.id === accountId)
        this.publish({
          cloudError: error instanceof Error ? error.message : i18n.t("cloudSpace.unavailable"),
        });
    }
  }

  private async importCloud(snapshot: CloudSpace) {
    const offer = snapshot.state === "running" ? snapshot.offer : null;
    if (
      offer &&
      (offer.pairing ||
        offer.requiresAuthorization ||
        !offer.relay.useTls ||
        !brand.relayEndpoints.some((endpoint) => endpoint === offer.relay.endpoint))
    )
      throw new Error(i18n.t("cloudSpace.unavailable"));
    if (this.cloudHostId && this.cloudHostId !== offer?.serverId) {
      await this.deps.removeHost(this.cloudHostId);
      const managed = await this.deps.readManagedHosts();
      await this.deps.writeManagedHosts(managed.filter((id) => id !== this.cloudHostId));
      this.cloudHostId = null;
    }
    if (offer) {
      const managed = await this.deps.readManagedHosts();
      await this.deps.writeManagedHosts([...new Set([...managed, offer.serverId])]);
      this.cloudHostId = offer.serverId;
      const label = i18n.t("cloudSpace.title");
      await this.deps.addHost(offer, label);
      await this.deps.renameHost(offer.serverId, label);
    }
  }

  startCloud = () => this.enqueue(() => this.syncCloud("/start"), { action: "startCloud" });
  pauseCloud = () => this.enqueue(() => this.syncCloud("/pause"), { action: "pauseCloud" });
  private refreshDirectory = async () => {
    await this.ensureController();
    const response = await this.deps.request("/get-session");
    if (response.status === 401 || (response.status === 200 && response.data === null)) {
      await this.invalidateAccount();
      return;
    }
    if (response.status >= 400) throw new Error(i18n.t("clawmuseAccount.serviceError"));
    await this.discover();
  };
  refresh = () => this.enqueue(this.refreshDirectory, { action: "refresh" });
  refreshInBackground = () => this.enqueue(this.refreshDirectory, { background: true });
  signIn = (email: string, password: string, register = false) =>
    this.enqueue(async () => {
      await this.deps.beforeAccountChange();
      await this.ensureController();
      await this.clearManagedHosts();
      this.clearCloud();
      this.publish({ account: null, devices: [], deleted: false });
      await this.request(register ? "/sign-up/email" : "/sign-in/email", {
        email: email.trim(),
        password,
        // Better Auth requires a name; ClawMuse identifies accounts by email.
        ...(register ? { name: email.trim() } : {}),
      });
      if (register) {
        const session = await this.request("/get-session");
        if (session === null) return;
      }
      await this.discover();
      await this.publishLocal();
      await this.discover();
    });
  requestPasswordReset = (email: string) =>
    this.enqueue(async () => {
      await this.request("/request-password-reset", {
        email: email.trim(),
        redirectTo: `${brand.hubOrigin}/?auth=password-reset`,
      });
    });
  private async publishLocal() {
    if (!this.state.account) return;
    const local = await this.deps.localDevice();
    if (!local) return;
    // Check directory ownership before changing the host's account authority.
    await this.request("/clawmuse/devices", local);
    const accountKey = await this.deps.bindLocalAccount(this.state.account.id);
    if (accountKey) {
      const managed = await this.deps.localDevice();
      if (!managed) throw new Error("本机服务已断开，请重新连接本机。");
      await this.request("/clawmuse/devices", { ...managed, accountKey });
    }
  }
  connectLocal = () =>
    this.enqueue(
      async () => {
        if (!this.state.account) return;
        await this.publishLocal();
        await this.discover();
      },
      { action: "connectLocal" },
    );
  registerDevice = (offer: ConnectionOffer, label: string) =>
    this.enqueue(
      async () => {
        await this.ensureController();
        if (!this.state.account) throw new Error("请先登录 ClawMuse 账号。");
        if (offer.pairing) throw new Error("配对邀请不能保存到账号设备目录。");
        await this.request("/clawmuse/devices", { offer, label });
        await this.discover();
      },
      { propagateError: true },
    );
  renameHost = (serverId: string, label: string) =>
    this.enqueue(
      async () => {
        const nextLabel = label.trim();
        if (!nextLabel || nextLabel.length > 100) throw new Error("名称需要为 1–100 个字符。");
        const managed = await this.deps.readManagedHosts();
        const isAccountDevice =
          serverId !== this.cloudHostId &&
          (this.state.devices.some((device) => device.serverId === serverId) ||
            managed.includes(serverId));
        if (isAccountDevice) {
          // Confirm the account write before changing the local cache or closing the rename dialog.
          await this.request("/clawmuse/devices/rename", { serverId, label: nextLabel });
        }
        await this.deps.renameHost(serverId, nextLabel);
        if (isAccountDevice) {
          this.publish({
            devices: this.state.devices.map((device) =>
              device.serverId === serverId ? { ...device, label: nextLabel } : device,
            ),
          });
        }
      },
      { propagateError: true },
    );
  removeDevice = (serverId: string) =>
    this.enqueue(
      async () => {
        await this.request("/clawmuse/devices/remove", { serverId });
        // Drop the local connection import immediately; the next discover() would
        // otherwise re-add the entry until the Hub directory propagates the removal.
        const managed = await this.deps.readManagedHosts();
        await this.deps.removeHost(serverId);
        await this.deps.writeManagedHosts(managed.filter((id) => id !== serverId));
        this.publish({ devices: this.state.devices.filter((d) => d.serverId !== serverId) });
      },
      { action: `removeDevice:${serverId}` },
    );
  deleteAccount = (password: string) =>
    this.enqueue(
      async () => {
        if (!this.state.account) throw new Error("请先登录 ClawMuse 账号。");
        if (!password) throw new Error("请输入当前密码以确认删除。");
        await this.deps.beforeAccountChange();
        const result = z
          .object({ success: z.literal(true), message: z.literal("User deleted") })
          .parse(await this.request("/delete-user", { password }));
        if (result.success) {
          // Publish irreversible success even if local connection cleanup needs a retry.
          this.publish({ account: null, devices: [], deleted: true });
          this.clearCloud();
          await this.clearManagedHosts();
        }
      },
      { action: "deleteAccount" },
    );
  signOut = () =>
    this.enqueue(
      async () => {
        await this.deps.beforeAccountChange();
        try {
          await this.request("/sign-out", {});
        } finally {
          await this.clearManagedHosts();
          this.clearCloud();
          this.publish({ account: null, devices: [] });
        }
      },
      { action: "signOut" },
    );
}
