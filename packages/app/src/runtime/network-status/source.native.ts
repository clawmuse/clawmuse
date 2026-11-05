import type { NetworkStatus, NetworkStatusSource, NetworkType } from "./model";

/** The slice of `@react-native-community/netinfo` this source reads. */
interface NetInfoState {
  type: string;
  isConnected: boolean | null;
  isInternetReachable: boolean | null | undefined;
}

interface NetInfoModule {
  addEventListener(listener: (state: NetInfoState) => void): () => void;
}

function loadNetInfo(): NetInfoModule | null {
  // A development build made before the NetInfo dependency was added has no native
  // module; Metro treats a require inside try as optional. Without it the app keeps
  // its timer-based reconnect and foreground verification.
  try {
    const loaded: { default?: NetInfoModule } = require("@react-native-community/netinfo");
    return loaded.default ?? null;
  } catch (error) {
    console.warn("[network-status] NetInfo is unavailable", error);
    return null;
  }
}

function toNetworkType(type: string): NetworkType {
  switch (type) {
    case "wifi":
      return "wifi";
    case "cellular":
      return "cellular";
    case "ethernet":
      return "ethernet";
    case "none":
      return "none";
    case "unknown":
      return "unknown";
    default:
      return "other";
  }
}

function toNetworkStatus(state: NetInfoState): NetworkStatus {
  // isInternetReachable is null until NetInfo has probed; only a definite false is offline.
  const online = state.isConnected !== false && state.isInternetReachable !== false;
  return { online, type: online ? toNetworkType(state.type) : "none" };
}

export const networkStatusSource: NetworkStatusSource = {
  subscribe(listener) {
    const netInfo = loadNetInfo();
    if (!netInfo) return () => undefined;
    return netInfo.addEventListener((state) => listener(toNetworkStatus(state)));
  },
};
