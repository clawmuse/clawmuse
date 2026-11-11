import { readControlledOnlyPolicy } from "../daemon/remote-access-policy.js";
import { resolvePaseoHome } from "@getpaseo/server/daemon-control";
import { app, ipcMain, safeStorage } from "electron";
import { readFile, writeFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { brand } from "../brand.generated.js";
import { assertTrustedRendererCaller } from "./trusted-renderer.js";

const paths = new Set([
  "/clawmuse/official",
  "/clawmuse/official/session",
  "/sign-in/email",
  "/sign-up/email",
  "/request-password-reset",
  "/sign-out",
  "/delete-user",
  "/get-session",
  "/clawmuse/devices",
  "/clawmuse/devices/authorize",
  "/clawmuse/devices/remove",
  "/clawmuse/devices/rename",
  "/clawmuse/devices/visibility",
  "/clawmuse/cloud",
  "/clawmuse/cloud/start",
  "/clawmuse/cloud/pause",
]);

function requestTimeout(path: string): number {
  return path === "/delete-user" ? 90000 : 20000;
}

async function readAccountResponse(response: Response): Promise<unknown> {
  const data: unknown = await response.json();
  if (data && typeof data === "object" && "token" in data) delete data.token;
  return data;
}

function rejectControlledAccount(path: string): boolean {
  return path !== "/sign-out" && readControlledOnlyPolicy(resolvePaseoHome(process.env));
}

export function registerClawMuseAccount(devOrigin: string): void {
  const file = join(app.getPath("userData"), "clawmuse-session.enc");
  let pending = Promise.resolve();
  ipcMain.handle("clawmuse:account", (event, input: unknown) => {
    assertTrustedRendererCaller(event, devOrigin);
    if (
      !input ||
      typeof input !== "object" ||
      !("path" in input) ||
      typeof input.path !== "string" ||
      !paths.has(input.path)
    )
      throw new Error("Invalid account operation");
    const path = input.path;
    const body = "body" in input ? input.body : undefined;
    const execute = async () => {
      if (rejectControlledAccount(path)) {
        await rm(file, { force: true });
        return {
          status: 403,
          data: {
            error: "controlled_only",
            message: "此电脑仅允许本机使用和接受远程控制，不能登录账号获取其他设备。",
          },
        };
      }
      if (
        !safeStorage.isEncryptionAvailable() ||
        (process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text")
      )
        throw new Error("请先启用系统钥匙串，再登录 ClawMuse");
      let token: string | undefined;
      try {
        token = safeStorage.decryptString(await readFile(file));
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
      if (path === "/sign-out") await rm(file, { force: true });
      const response = await fetch(`${brand.hubOrigin}/api/auth${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: brand.hubOrigin,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(requestTimeout(path)),
        redirect: "error",
      });
      if (rejectControlledAccount(path)) {
        await rm(file, { force: true });
        return { status: 403, data: { error: "controlled_only" } };
      }
      const nextToken = response.headers.get("set-auth-token");
      if (response.ok && nextToken) {
        await writeFile(`${file}.tmp`, safeStorage.encryptString(nextToken), { mode: 0o600 });
        await rename(`${file}.tmp`, file);
      }
      if (
        response.status === 401 ||
        ((path === "/sign-out" || path === "/delete-user") && response.ok)
      )
        await rm(file, { force: true });
      const data = await readAccountResponse(response);
      return { status: response.status, data };
    };
    const result = pending.then(execute);
    pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  });
}
