import { brand } from "@/brand.generated";
import { getDesktopHost } from "@/desktop/host";

const key = "clawmuse.account.session";
const desktop = getDesktopHost();

// Electron keeps its session behind the main-process bridge and safeStorage; an Electron build
// without the bridge stays unsupported rather than falling back to plaintext localStorage.
export const accountSupported = desktop ? !!desktop.clawmuseAccount : true;

export async function accountRequest(
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  if (desktop) {
    const bridge = desktop.clawmuseAccount;
    if (!bridge) throw new Error("请使用 ClawMuse 桌面端或手机 App 登录");
    return bridge({ path, ...(body === undefined ? {} : { body }) });
  }
  return browserRequest(path, body);
}

/** The Hub serves the browser client a bearer session only; cookies are never sent. */
async function browserRequest(
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const token = localStorage.getItem(key);
  if (path === "/sign-out") localStorage.removeItem(key);
  const response = await fetch(`${brand.hubOrigin}/api/auth${path}`, {
    credentials: "omit",
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(path === "/delete-user" ? 90000 : 20000),
    redirect: "error",
  });
  const next = response.headers.get("set-auth-token");
  if (response.ok && next) localStorage.setItem(key, next);
  if (response.status === 401 || ((path === "/sign-out" || path === "/delete-user") && response.ok))
    localStorage.removeItem(key);
  return { status: response.status, data: await response.json() };
}
