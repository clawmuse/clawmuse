import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AppState, Text, View } from "react-native";
import { useRpc, type PluginWorkspacePanelProps } from "@getpaseo/plugin/client";
import {
  startRpc,
  statusRpc,
  frameRpc,
  inputRpc,
  stopRpc,
  type Action,
  type Device,
  type DevicePlatform,
} from "../shared/contracts.js";
import { PreviewSession } from "./session.js";
import { previewStyles } from "./styles.js";
import { PreviewToolbar } from "./controls.js";
import { DeviceList } from "./devices.js";
import { PreviewViewer } from "./viewer.js";
import { useDeviceCatalog } from "./use-catalog.js";

export function DevicePreviewPanel({ theme, layout, host }: PluginWorkspacePanelProps) {
  const start = useRpc(startRpc);
  const status = useRpc(statusRpc);
  const frame = useRpc(frameRpc);
  const input = useRpc(inputRpc);
  const stop = useRpc(stopRpc);
  const session = useMemo(
    () => new PreviewSession({ start, status, frame, input, stop }),
    [start, status, frame, input, stop],
  );
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );
  const [platform, setPlatform] = useState<DevicePlatform>("android");
  const [selected, setSelected] = useState("");
  const busy = snapshot.phase === "preparing" || snapshot.phase === "ready";
  const { availability, catalog, loading, error, refresh } = useDeviceCatalog(platform, busy);
  const styles = useMemo(() => previewStyles({ theme, layout }), [theme, layout]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") void session.stop();
    });
    return () => {
      subscription.remove();
      void session.stop();
    };
  }, [session]);
  const switchPlatform = useCallback(
    async (next: DevicePlatform) => {
      await session.stop();
      setSelected("");
      setPlatform(next);
    },
    [session],
  );
  const onStop = useCallback(() => {
    void session.stop().then(() => {
      refresh();
      return undefined;
    });
  }, [session, refresh]);
  const onAction = useCallback(
    (action: Action) => {
      void session.input(action);
    },
    [session],
  );
  const onSelect = useCallback(
    (device: Device) => {
      setSelected(device.name);
      void session.connect(platform, device.id);
    },
    [session, platform],
  );
  const capability = availability?.[platform];
  const message = error || snapshot.error;
  return (
    <View style={styles.root}>
      <Text style={styles.text}>设备预览 · {host.label}</Text>
      <Text style={styles.detail}>模拟器始终运行在此主机；手机只接收截图。约每秒 1 张。</Text>
      <PreviewToolbar
        theme={theme}
        layout={layout}
        styles={styles}
        platform={platform}
        snapshot={snapshot}
        loading={loading}
        onPlatform={switchPlatform}
        onRefresh={refresh}
        onStop={onStop}
        onAction={onAction}
      />
      <Text style={styles.detail}>{capability?.reason ?? "正在检查工具…"}</Text>
      <Text style={styles.text}>
        {snapshot.message}
        {selected && busy ? ` · ${selected}` : ""}
      </Text>
      {!!message && (
        <Text accessibilityRole="alert" style={styles.error}>
          {message}
        </Text>
      )}
      {!busy && (
        <DeviceList
          theme={theme}
          layout={layout}
          styles={styles}
          catalog={catalog}
          loading={loading}
          available={capability?.available ?? false}
          onSelect={onSelect}
        />
      )}
      <PreviewViewer platform={platform} snapshot={snapshot} session={session} styles={styles} />
      <Text style={styles.detail}>
        {platform === "ios"
          ? "iOS：仅观看、深色和浅色；不支持点击或手势。"
          : "Android：单指点击和滑动；不支持双指及以上手势或键盘。"}{" "}
        停止预览不会关闭模拟器。
      </Text>
    </View>
  );
}
