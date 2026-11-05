import type { NetworkStatus, NetworkStatusSource, NetworkType } from "./model";

interface NavigatorConnection {
  type?: string;
  addEventListener?: (type: "change", listener: () => void) => void;
  removeEventListener?: (type: "change", listener: () => void) => void;
}

function readConnection(): NavigatorConnection | null {
  if (typeof navigator === "undefined" || !("connection" in navigator)) return null;
  const connection: unknown = navigator.connection;
  return connection && typeof connection === "object" ? connection : null;
}

function toNetworkType(type: string | undefined): NetworkType {
  switch (type) {
    case "wifi":
      return "wifi";
    case "cellular":
      return "cellular";
    case "ethernet":
      return "ethernet";
    case "none":
      return "none";
    case undefined:
    case "unknown":
      return "unknown";
    default:
      return "other";
  }
}

function readStatus(): NetworkStatus {
  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  return { online, type: online ? toNetworkType(readConnection()?.type) : "none" };
}

/**
 * Browsers and Electron report reachability through `online`/`offline`; Chromium
 * also exposes the interface type through the Network Information API.
 */
export const networkStatusSource: NetworkStatusSource = {
  subscribe(listener) {
    if (typeof window === "undefined") return () => undefined;
    const emit = () => listener(readStatus());
    const connection = readConnection();
    window.addEventListener("online", emit);
    window.addEventListener("offline", emit);
    connection?.addEventListener?.("change", emit);
    emit();
    return () => {
      window.removeEventListener("online", emit);
      window.removeEventListener("offline", emit);
      connection?.removeEventListener?.("change", emit);
    };
  },
};
