import { useCallback, useEffect, useState } from "react";
import { useRpc } from "@getpaseo/plugin/client";
import type { RpcOutput } from "@getpaseo/plugin";
import { capabilitiesRpc, listRpc, type DevicePlatform } from "../shared/contracts.js";

export function useDeviceCatalog(platform: DevicePlatform, watching: boolean) {
  const capabilities = useRpc(capabilitiesRpc);
  const list = useRpc(listRpc);
  const [availability, setAvailability] = useState<RpcOutput<typeof capabilitiesRpc> | null>(null);
  const [catalog, setCatalog] = useState<RpcOutput<typeof listRpc>>({ devices: [], excluded: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setCatalog({ devices: [], excluded: [] });
    void (async () => {
      try {
        const available = await capabilities({});
        if (cancelled) return;
        setAvailability(available);
        if (available[platform].available) {
          const devices = await list({ platform });
          if (!cancelled) setCatalog(devices);
        }
      } catch {
        if (!cancelled) setError("无法读取设备列表，请检查主机工具后刷新。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [capabilities, list, platform, revision]);
  useEffect(() => {
    if (watching || loading) return;
    const timer = setTimeout(refresh, 5000);
    return () => clearTimeout(timer);
  }, [watching, loading, revision, refresh]);
  return { availability, catalog, loading, error, refresh };
}
