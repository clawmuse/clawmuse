import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import {
  type HostRuntimeConnectionStatus,
  useHostRuntimeConnectionStatus,
} from "@/runtime/host-runtime";

export function HostStatusDot({ serverId, size = 8 }: { serverId: string; size?: number }) {
  const { t } = useTranslation();
  const status = useHostRuntimeConnectionStatus(serverId);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={t(`common.connectionStatus.${status}`)}
      style={[styles.dot, { width: size, height: size }, statusStyle(status)]}
    />
  );
}

function statusStyle(status: HostRuntimeConnectionStatus) {
  if (status === "online") return styles.dotOnline;
  if (status === "connecting") return styles.dotConnecting;
  return styles.dotOffline;
}

const styles = StyleSheet.create((theme) => ({
  dot: {
    borderRadius: theme.borderRadius.full,
  },
  dotOnline: {
    backgroundColor: theme.colors.statusSuccess,
  },
  dotConnecting: {
    backgroundColor: theme.colors.statusWarning,
  },
  dotOffline: {
    backgroundColor: theme.colors.statusDanger,
  },
}));
