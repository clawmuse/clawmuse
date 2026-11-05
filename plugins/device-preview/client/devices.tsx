import { useCallback } from "react";
import { ScrollView, Text, View } from "react-native";
import type { PluginHostProps } from "@getpaseo/plugin/client";
import type { RpcOutput } from "@getpaseo/plugin";
import { listRpc, type Device } from "../shared/contracts.js";
import type { PreviewStyles } from "./styles.js";
import { PreviewButton } from "./controls.js";

interface DeviceRowProps extends Pick<PluginHostProps, "theme" | "layout"> {
  device: Device;
  styles: PreviewStyles;
  onSelect(device: Device): void;
}
function DeviceRow({ device, styles, onSelect, theme, layout }: DeviceRowProps) {
  const select = useCallback(() => onSelect(device), [onSelect, device]);
  const label = { booted: "已启动", shutdown: "未启动", unavailable: "不可用" }[device.state];
  const action = device.state === "booted" ? "预览" : "启动并预览";
  return (
    <View style={styles.row}>
      <Text style={styles.text}>
        {device.name} · {label}
        {device.occupied ? " · 占用" : ""}
      </Text>
      <PreviewButton
        theme={theme}
        layout={layout}
        title={`${action} ${device.name}`}
        onPress={select}
        disabled={device.occupied || device.state === "unavailable"}
      />
      {!!device.reason && <Text style={styles.detail}>{device.reason}</Text>}
    </View>
  );
}
interface DeviceListProps extends Pick<PluginHostProps, "theme" | "layout"> {
  catalog: RpcOutput<typeof listRpc>;
  styles: PreviewStyles;
  loading: boolean;
  available: boolean;
  onSelect(device: Device): void;
}
export function DeviceList({
  catalog,
  styles,
  loading,
  available,
  onSelect,
  theme,
  layout,
}: DeviceListProps) {
  const empty = !loading && available && catalog.devices.length === 0;
  const excluded = [...new Set(catalog.excluded)];
  return (
    <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
      {empty && (
        <Text style={styles.detail}>没有可用的已配置模拟器。请在主机上自行配置后刷新。</Text>
      )}
      {catalog.devices.map((device) => (
        <DeviceRow
          key={device.id}
          theme={theme}
          layout={layout}
          device={device}
          styles={styles}
          onSelect={onSelect}
        />
      ))}
      {excluded.map((reason) => (
        <Text key={reason} style={styles.detail}>
          {reason}
        </Text>
      ))}
    </ScrollView>
  );
}
