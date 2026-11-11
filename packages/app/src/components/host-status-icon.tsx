import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Laptop, Server } from "@/components/icons/app-icons";
import { withUnistyles } from "react-native-unistyles";
import { useIsLocalDaemon } from "@/hooks/use-is-local-daemon";
import {
  type HostRuntimeConnectionStatus,
  useHostRuntimeConnectionStatus,
} from "@/runtime/host-runtime";
import type { Theme } from "@/styles/theme";

/**
 * The host glyph colored by connection state — green online, red when the host is not up —
 * so a row needs no separate status dot beside the icon. Replaces `HostStatusDot` wherever
 * the icon and its state would otherwise sit side by side.
 */
export function HostStatusIcon({ serverId, size = 14 }: { serverId: string; size?: number }) {
  const { t } = useTranslation();
  const status = useHostRuntimeConnectionStatus(serverId);
  const isLocal = useIsLocalDaemon(serverId);
  const Icon = isLocal ? ThemedLaptop : ThemedServer;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={t(`common.connectionStatus.${status}`)}
    >
      <Icon size={size} uniProps={STATUS_ICON_MAPPINGS[status]} />
    </View>
  );
}

const ThemedServer = withUnistyles(Server);
const ThemedLaptop = withUnistyles(Laptop);

// One stable mapping per status: a fresh `uniProps` identity on every render would make
// withUnistyles re-subscribe each pass — same rule as HOST_ICON_MAPPINGS in hosts/host-badge.
const STATUS_ICON_MAPPINGS: Record<
  HostRuntimeConnectionStatus,
  (theme: Theme) => { color: string }
> = {
  online: (theme) => ({ color: theme.colors.statusSuccess }),
  connecting: (theme) => ({ color: theme.colors.statusWarning }),
  // Never-connected is neutral; the host simply hasn't been asked yet.
  idle: (theme) => ({ color: theme.colors.foregroundMuted }),
  offline: (theme) => ({ color: theme.colors.statusDanger }),
  error: (theme) => ({ color: theme.colors.statusDanger }),
};
