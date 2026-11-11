import { resetAccountActivity } from "@/clawmuse/account-activity";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CryptoDigestAlgorithm, digestStringAsync, getRandomBytes } from "expo-crypto";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import { parseConnectionOfferFromUrl } from "@getpaseo/protocol/connection-offer";
import type { ContextBridge } from "@/components/ui/isolated-bottom-sheet-modal";
import {
  getHostRuntimeStore,
  useHostRegistryLoaded,
  useHostRuntimeIsConnected,
} from "@/runtime/host-runtime";
import { useLocalDaemonServerId } from "@/hooks/use-is-local-daemon";
import {
  getDesktopDaemonStatus,
  readDesktopControlledOnlyPolicy,
  shouldUseDesktopDaemon,
} from "@/desktop/daemon/desktop-daemon";
import { brand } from "@/brand.generated";
import { AccountModel } from "./account-model";
import { accountRequest, accountSupported } from "./transport";

const managedKey = "clawmuse.account.managed-hosts.v1";
const Context = createContext<AccountModel | null>(null);

export function ClawMuseAccountProvider({ children }: { children: ReactNode }) {
  const loaded = useHostRegistryLoaded();
  const localId = useLocalDaemonServerId();
  const connected = useHostRuntimeIsConnected(localId ?? "");
  const [model] = useState(
    () =>
      new AccountModel({
        beforeAccountChange: resetAccountActivity,
        controlledOnly: async () =>
          shouldUseDesktopDaemon() && (await readDesktopControlledOnlyPolicy()),
        request: accountRequest,
        readManagedHosts: async () => {
          const value: unknown = JSON.parse((await AsyncStorage.getItem(managedKey)) ?? "[]");
          if (!Array.isArray(value) || !value.every((id) => typeof id === "string"))
            throw new Error("账号设备缓存无效");
          return value;
        },
        writeManagedHosts: (ids) => AsyncStorage.setItem(managedKey, JSON.stringify(ids)),
        existingHostIds: () =>
          getHostRuntimeStore()
            .getHosts()
            .map((host) => host.serverId),
        addHost: (offer, label) => getHostRuntimeStore().upsertConnectionFromOffer(offer, label),
        authorizeHost: async (offer, label, authorize) => {
          const runtime = getHostRuntimeStore();
          const local = shouldUseDesktopDaemon() ? await getDesktopDaemonStatus() : null;
          if (local?.serverId === offer.serverId)
            return runtime.upsertConnectionFromOffer(offer, label);
          const existing = runtime
            .getHosts()
            .find((host) => host.serverId === offer.serverId)?.controllerCredential;
          if (existing && existing.daemonPublicKeyB64 !== offer.daemonPublicKeyB64)
            throw new Error("主机身份已变化，请在电脑上重新登录后再连接。");
          if (
            existing &&
            (!existing.accountAuthorization || runtime.getClient(offer.serverId)?.isConnected)
          )
            return runtime.upsertConnectionFromOffer(offer, label);
          const token =
            existing?.token ??
            globalThis
              .btoa(String.fromCharCode(...getRandomBytes(32)))
              .replace(/\+/g, "-")
              .replace(/\//g, "_")
              .replace(/=+$/, "");
          const controllerHash = await digestStringAsync(CryptoDigestAlgorithm.SHA256, token);
          const accountAuthorization = await authorize(controllerHash);
          return runtime.upsertConnectionFromOffer(offer, label, undefined, {
            token,
            accountAuthorization,
            daemonPublicKeyB64: offer.daemonPublicKeyB64,
            label: "ClawMuse account",
          });
        },
        renameHost: async (id, label) => {
          const runtime = getHostRuntimeStore();
          if (runtime.getHosts().find((host) => host.serverId === id)?.label !== label) {
            await runtime.renameHost(id, label);
          }
        },
        removeHost: (id) => getHostRuntimeStore().removeHost(id),
        setHostHidden: async ({ serverId, hidden }) => {
          const runtime = getHostRuntimeStore();
          const host = runtime.getHosts().find((entry) => entry.serverId === serverId);
          if (host && host.appearance.hidden !== hidden)
            await runtime.setHostHidden(serverId, hidden);
        },
        clearAccountCredentials: (keep) => getHostRuntimeStore().clearAccountCredentials(keep),
        bindLocalAccount: async (accountId) => {
          if (!shouldUseDesktopDaemon()) return null;
          const status = await getDesktopDaemonStatus();
          const client = getHostRuntimeStore().getClient(status.serverId);
          if (!client) throw new Error("本机服务已断开，请重新连接本机。");
          const { accountKey } = await client.bindClawMuseAccount(accountId);
          return accountKey;
        },
        localDevice: async () => {
          if (!shouldUseDesktopDaemon()) return null;
          const status = await getDesktopDaemonStatus();
          const client = getHostRuntimeStore().getClient(status.serverId);
          if (!client) throw new Error("账号已登录，正在等待本机服务启动。稍后点击连接本机。");
          const { config } = await client.getDaemonConfig();
          if (!config.relay?.enabled) await client.patchDaemonConfig({ relay: { enabled: true } });
          const pairing = await client.getDaemonPairingOffer();
          const offer = parseConnectionOfferFromUrl(pairing.url);
          if (
            !offer ||
            !brand.relayEndpoints.some((endpoint) => endpoint === offer.relay.endpoint) ||
            offer.relay.useTls !== true
          )
            throw new Error("请更新到 ClawMuse 桌面端，以使用专属中转服务。");
          return {
            offer,
            label:
              getHostRuntimeStore()
                .getHosts()
                .find((host) => host.serverId === status.serverId)?.label ?? "我的电脑",
          };
        },
      }),
  );
  const state = useSyncExternalStore(model.subscribe, model.getState, model.getState);
  useEffect(() => {
    if (!loaded || !accountSupported) return;
    void model.refreshInBackground();
    const timer = setInterval(() => {
      if (AppState.currentState === "active" && !model.getState().busy)
        void model.refreshInBackground();
    }, 30000);
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active" && !model.getState().busy) void model.refreshInBackground();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [loaded, model]);
  useEffect(() => {
    if (state.account?.id && localId && connected) void model.connectLocal();
  }, [state.account?.id, localId, connected, model]);
  return <Context.Provider value={model}>{children}</Context.Provider>;
}

export function useClawMuseAccount() {
  const model = useContext(Context);
  if (!model) throw new Error("ClawMuse account provider missing");
  const state = useSyncExternalStore(model.subscribe, model.getState, model.getState);
  return { model, state };
}

/**
 * Carries the account context past a `@gorhom/portal` boundary. A sheet's
 * content renders at the portal host, which sits above this provider, so the
 * context has to be built again from a value read on this side — see
 * `ContextBridge`. Any sheet showing `ClawMuseAccountPanel` needs this.
 */
export function useClawMuseAccountContextBridge(): ContextBridge {
  const model = useContext(Context);
  return useCallback(
    (children) => <Context.Provider value={model}>{children}</Context.Provider>,
    [model],
  );
}
