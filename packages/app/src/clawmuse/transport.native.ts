import * as SecureStore from "expo-secure-store";
import { brand } from "@/brand.generated";

const key = "clawmuse.account.session";
export const accountSupported = true;

async function readResponseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    if (response.ok) throw error;
    return null;
  }
}

export async function accountRequest(
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const token = await SecureStore.getItemAsync(key);
  if (path === "/get-session" && !token) return { status: 200, data: null };
  if (path === "/sign-out") await SecureStore.deleteItemAsync(key);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), path === "/delete-user" ? 90000 : 20000);
  try {
    const response = await fetch(`${brand.hubOrigin}/api/auth${path}`, {
      credentials: "omit",
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: brand.hubOrigin,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    const next = response.headers.get("set-auth-token");
    if (response.ok && next)
      await SecureStore.setItemAsync(key, next, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    if (
      response.status === 401 ||
      ((path === "/sign-out" || path === "/delete-user") && response.ok)
    )
      await SecureStore.deleteItemAsync(key);
    return { status: response.status, data: await readResponseJson(response) };
  } finally {
    clearTimeout(timeout);
  }
}
