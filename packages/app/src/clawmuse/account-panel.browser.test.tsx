import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n } from "@/i18n/i18next";
import { AccountModel, type AccountDependencies } from "./account-model";
import { ClawMuseAccountPanel } from "./account-panel";

const account = vi.hoisted(() => ({ current: null as AccountModel | null }));
vi.mock("./account-provider", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useClawMuseAccount() {
      const model = account.current!;
      return { model, state: useSyncExternalStore(model.subscribe, model.getState) };
    },
  };
});
vi.mock("@/runtime/host-runtime", () => ({
  useHosts: () => [],
  useHostRuntimeIsConnected: () => false,
}));
vi.mock("./device-label", () => ({
  useClawMuseDeviceLabel: () => (_id: string, label: string) => label,
}));
vi.mock("@/desktop/daemon/desktop-daemon", () => ({ shouldUseDesktopDaemon: () => false }));
vi.mock("./transport", () => ({ accountSupported: true }));
vi.mock("@/utils/confirm-dialog", () => ({ confirmDialog: async () => false }));

let root: Root;
let container: HTMLDivElement;
let calls: { path: string; body: unknown }[];
let respond: AccountDependencies["request"];

beforeEach(async () => {
  vi.stubGlobal("React", React);
  await i18n.changeLanguage("zh-CN");
  calls = [];
  respond = async (path) => {
    if (path === "/request-password-reset") return { status: 200, data: { status: true } };
    if (path === "/sign-up/email") return { status: 200, data: {} };
    return { status: 200, data: null };
  };
  account.current = new AccountModel({
    beforeAccountChange: async () => {},
    request: async (path, body) => {
      calls.push({ path, body });
      return respond(path, body);
    },
    readManagedHosts: async () => [],
    writeManagedHosts: async () => {},
    existingHostIds: () => [],
    addHost: async () => {},
    authorizeHost: async () => {},
    renameHost: async () => {},
    setHostHidden: async () => {},
    removeHost: async () => {},
    clearAccountCredentials: async () => {},
    bindLocalAccount: async () => null,
    localDevice: async () => null,
  });
  container = document.createElement("div");
  container.style.width = "390px";
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<ClawMuseAccountPanel />));
});

afterEach(async () => {
  act(() => root.unmount());
  container.remove();
  await i18n.changeLanguage("en");
  vi.unstubAllGlobals();
});

function element<T extends HTMLElement>(id: string): T {
  const result = container.querySelector<T>(`[data-testid="${id}"]`);
  if (!result) throw new Error(`Missing control: ${id}`);
  return result;
}

function type(id: string, value: string) {
  const input = element<HTMLInputElement>(id);
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, data: value }));
  });
}

it("registers with two fields and clears the password when switching back to sign in", async () => {
  act(() => element("clawmuse-switch-auth-mode").click());
  expect(container.textContent).not.toContain("昵称");
  expect(container.querySelectorAll("input")).toHaveLength(2);
  type("clawmuse-email", "new@example.test");
  type("clawmuse-password", "long-enough-password");
  expect(element("clawmuse-sign-in").getAttribute("aria-disabled")).not.toBe("true");
  await act(async () => element("clawmuse-sign-in").click());
  expect(calls[0]).toEqual({
    path: "/sign-up/email",
    body: { email: "new@example.test", password: "long-enough-password", name: "new@example.test" },
  });
  act(() => element("clawmuse-switch-auth-mode").click());
  expect(element<HTMLInputElement>("clawmuse-password").value).toBe("");
  expect(element<HTMLInputElement>("clawmuse-email").value).toBe("new@example.test");
});

it("opens recovery, sends the email and returns to sign in with no password retained", async () => {
  type("clawmuse-email", "owner@example.test");
  type("clawmuse-password", "old-password");
  act(() => element("clawmuse-forgot-password").click());
  expect(container.querySelectorAll("input")).toHaveLength(1);
  expect(container.textContent).toContain("发送重置链接");
  await act(async () => element("clawmuse-send-reset").click());
  expect(calls).toHaveLength(1);
  expect(calls[0]?.path).toBe("/request-password-reset");
  expect(element("clawmuse-reset-sent").textContent).toContain("如果该邮箱已注册");
  act(() => element("clawmuse-switch-auth-mode").click());
  expect(element<HTMLInputElement>("clawmuse-email").value).toBe("owner@example.test");
  expect(element<HTMLInputElement>("clawmuse-password").value).toBe("");
  expect(element("clawmuse-forgot-password").textContent).toContain("忘记密码");
});

it("shows incorrect credentials beside the submit button and preserves them across refresh", async () => {
  respond = async (path) =>
    path === "/sign-in/email"
      ? {
          status: 401,
          data: { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" },
        }
      : { status: 200, data: null };
  type("clawmuse-email", "owner@example.test");
  type("clawmuse-password", "wrong-password");
  await act(async () => element("clawmuse-sign-in").click());
  const error = element("clawmuse-auth-error");
  expect(error.textContent).toBe("邮箱或密码错误，请重试或找回密码。");
  expect(error.getAttribute("role")).toBe("alert");
  expect(
    error.compareDocumentPosition(element("clawmuse-sign-in")) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(element<HTMLInputElement>("clawmuse-email").value).toBe("owner@example.test");
  await act(async () => account.current!.refresh());
  expect(element("clawmuse-auth-error").textContent).toBe("邮箱或密码错误，请重试或找回密码。");
  act(() => element("clawmuse-forgot-password").click());
  expect(container.querySelector('[data-testid="clawmuse-auth-error"]')).toBeNull();
});

it("explains invalid email and short registration passwords next to the fields", () => {
  act(() => element("clawmuse-switch-auth-mode").click());
  type("clawmuse-email", "invalid");
  act(() => {
    element("clawmuse-email").focus();
    element("clawmuse-email").blur();
  });
  expect(element("clawmuse-email-field-error").textContent).toBe("请输入有效的邮箱地址。");
  type("clawmuse-password", "short");
  act(() => {
    element("clawmuse-password").focus();
    element("clawmuse-password").blur();
  });
  expect(element("clawmuse-password-field-error").textContent).toBe("密码至少需要 8 位。");
  type("clawmuse-email", "owner@example.test");
  type("clawmuse-password", "long-enough-password");
  expect(container.querySelector('[data-testid="clawmuse-email-field-error"]')).toBeNull();
  expect(container.querySelector('[data-testid="clawmuse-password-field-error"]')).toBeNull();
  expect(element("clawmuse-sign-in").getAttribute("aria-disabled")).not.toBe("true");
});

it("shows duplicate registration feedback with a path back to sign in", async () => {
  respond = async () => ({ status: 422, data: { code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" } });
  act(() => element("clawmuse-switch-auth-mode").click());
  type("clawmuse-email", "owner@example.test");
  type("clawmuse-password", "long-enough-password");
  await act(async () => element("clawmuse-sign-in").click());
  expect(element("clawmuse-auth-error").textContent).toBe("该邮箱已注册，请登录或找回密码。");
  act(() => element("clawmuse-switch-auth-mode").click());
  expect(container.querySelector('[data-testid="clawmuse-auth-error"]')).toBeNull();
  expect(element("clawmuse-forgot-password").textContent).toBe("忘记密码？");
});

it.each([
  [new TypeError("Failed to fetch"), "无法连接账号服务，请检查网络后重试。"],
  [new DOMException("Aborted", "AbortError"), "请求超时，请重试。"],
])("shows network failure and allows password recovery to retry: %s", async (failure, message) => {
  respond = async () => {
    throw failure;
  };
  type("clawmuse-email", "owner@example.test");
  act(() => element("clawmuse-forgot-password").click());
  await act(async () => element("clawmuse-send-reset").click());
  expect(element("clawmuse-auth-error").textContent).toBe(message);
  expect(element("clawmuse-send-reset").getAttribute("aria-disabled")).not.toBe("true");
  respond = async () => ({ status: 200, data: { status: true } });
  await act(async () => element("clawmuse-send-reset").click());
  expect(element("clawmuse-reset-sent").textContent).toContain("如果该邮箱已注册");
  expect(container.querySelector('[data-testid="clawmuse-auth-error"]')).toBeNull();
});

it("keeps pending login visible and prevents duplicate submissions", async () => {
  let finish!: () => void;
  respond = async () => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    return { status: 401, data: {} };
  };
  type("clawmuse-email", "owner@example.test");
  type("clawmuse-password", "wrong-password");
  await act(async () => element("clawmuse-sign-in").click());
  expect(element("clawmuse-sign-in").getAttribute("aria-disabled")).toBe("true");
  expect(element<HTMLInputElement>("clawmuse-email").readOnly).toBe(true);
  expect(element<HTMLInputElement>("clawmuse-password").readOnly).toBe(true);
  act(() => element("clawmuse-sign-in").click());
  expect(calls).toHaveLength(1);
  await act(async () => finish());
  expect(element("clawmuse-auth-error").textContent).toBe("邮箱或密码错误，请重试或找回密码。");
  type("clawmuse-password", "corrected-password");
  expect(element("clawmuse-sign-in").getAttribute("aria-disabled")).not.toBe("true");
});

it("shows the account after a successful retry and returns to the form on sign out", async () => {
  respond = async () => ({ status: 401, data: {} });
  type("clawmuse-email", "owner@example.test");
  type("clawmuse-password", "wrong-password");
  await act(async () => element("clawmuse-sign-in").click());
  expect(element("clawmuse-auth-error").textContent).toContain("邮箱或密码错误");
  respond = async (path) => {
    if (path === "/clawmuse/devices")
      return {
        status: 200,
        data: {
          account: { id: "owner", name: "Owner", email: "owner@example.test" },
          devices: [],
        },
      };
    return { status: 200, data: { success: true } };
  };
  type("clawmuse-password", "correct-password");
  await act(async () => element("clawmuse-sign-in").click());
  expect(container.querySelector('[data-testid="clawmuse-sign-in"]')).toBeNull();
  expect(container.textContent).toContain("owner@example.test");
  expect(element("clawmuse-sign-out").textContent).toBe("退出登录");
  respond = async () => {
    throw new TypeError("Failed to fetch");
  };
  await act(async () => element("clawmuse-refresh-devices").click());
  expect(element("clawmuse-account-error").textContent).toBe(
    "无法连接账号服务，请检查网络后重试。",
  );
  expect(element("clawmuse-refresh-devices").getAttribute("aria-disabled")).not.toBe("true");
  respond = async () => ({ status: 200, data: { success: true } });
  await act(async () => element("clawmuse-sign-out").click());
  expect(element("clawmuse-sign-in")).toBeDefined();
  expect(container.querySelector('[data-testid="clawmuse-account-error"]')).toBeNull();
});

it("shows registration requiring verification as success and offers sign in", async () => {
  act(() => element("clawmuse-switch-auth-mode").click());
  type("clawmuse-email", "owner@example.test");
  type("clawmuse-password", "long-enough-password");
  await act(async () => element("clawmuse-sign-in").click());
  expect(element("clawmuse-verification-sent").textContent).toBe(
    "注册成功，请查收验证邮件。验证邮箱后，返回这里登录。",
  );
  expect(container.querySelector('[data-testid="clawmuse-auth-error"]')).toBeNull();
  expect(container.querySelector('[data-testid="clawmuse-sign-in"]')).toBeNull();
  act(() => element("clawmuse-switch-auth-mode").click());
  expect(element<HTMLInputElement>("clawmuse-email").value).toBe("owner@example.test");
  expect(element<HTMLInputElement>("clawmuse-password").value).toBe("");
  expect(element("clawmuse-sign-in").textContent).toBe("登录并连接");
});

it("shows pending cloud configuration after login without offering a paid start", async () => {
  respond = async (path) => {
    if (path === "/clawmuse/devices")
      return {
        status: 200,
        data: {
          account: { id: "alice", email: "a@example.test", name: "Alice" },
          devices: [],
          cloud: { enabled: true },
        },
      };
    if (path === "/clawmuse/cloud")
      return {
        status: 200,
        data: { state: "pending_configuration", models: [], balance: null, offer: null },
      };
    return { status: 200, data: {} };
  };
  await act(async () => account.current!.refresh());
  expect(element("clawmuse-cloud-space").textContent).toContain("等待平台配置模型");
  expect(container.querySelector('[data-testid="clawmuse-cloud-start"]')).toBeNull();
  expect(calls.some((call) => call.path === "/clawmuse/cloud/start")).toBe(false);
});
