import { getDesktopHost } from "@/desktop/host";
import { getIsElectron, isWeb } from "@/constants/platform";

/**
 * Electron keeps the status session in the main process, encrypted with the OS
 * keychain (`packages/desktop/src/features/clawmuse-status-vault.ts`). A plain
 * browser uses a tab-local volatile session on secure origins. Refresh tokens
 * never go into Web Storage, IndexedDB, a URL, or a service-worker cache.
 */
export const statusSessionIsEphemeral =
  isWeb && typeof window !== "undefined" && window.isSecureContext && !getIsElectron();
export const secureStoreSupported =
  !!getDesktopHost()?.clawmuseStatusVault || statusSessionIsEphemeral;
const tabSession = new Map<string, string>();

function requireVault() {
  const vault = getDesktopHost()?.clawmuseStatusVault;
  if (!vault) {
    throw new Error("请使用 ClawMuse 桌面端或手机 App 关联 ClawMuse Status");
  }
  return vault;
}

export function getSecureItem(key: string): Promise<string | null> {
  if (statusSessionIsEphemeral) return Promise.resolve(tabSession.get(key) ?? null);
  return requireVault()({ op: "get", key });
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  if (statusSessionIsEphemeral) {
    tabSession.set(key, value);
    return;
  }
  await requireVault()({ op: "set", key, value });
}

export async function deleteSecureItem(key: string): Promise<void> {
  if (statusSessionIsEphemeral) {
    tabSession.delete(key);
    return;
  }
  await requireVault()({ op: "delete", key });
}
