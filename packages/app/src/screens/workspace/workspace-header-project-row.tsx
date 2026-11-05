import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useHostBadges } from "@/hosts/use-host-badges";

/**
 * Which project the workspace belongs to, and which machine it runs on.
 *
 * Compact gets both, on their own line under the workspace name: this header is the only thing on
 * screen that says where the workspace lives, because the sidebar that normally carries the host
 * badge is closed. It still follows the host's own badge setting, so a purely local setup stays
 * quiet. A project name that only repeats the workspace name is dropped on wide, where the two sit
 * side by side, and kept on compact, where the line exists for the host anyway.
 */
export function WorkspaceHeaderProjectRow({
  subtitle,
  isSubtitleDistinct,
  serverId,
}: {
  subtitle: string;
  isSubtitleDistinct: boolean;
  serverId: string;
}) {
  const isCompact = useIsCompactFormFactor();
  const hostBadge = useHostBadges({ enabled: isCompact }).get(serverId) ?? null;
  const showProject = isSubtitleDistinct || isCompact;
  if (!showProject && !hostBadge) {
    return null;
  }
  return (
    <View style={styles.row}>
      {showProject ? (
        <Text testID="workspace-header-subtitle" style={styles.project} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
      {showProject && hostBadge ? <Text style={styles.separator}>·</Text> : null}
      {hostBadge ? (
        <Text style={styles.project} numberOfLines={1} accessibilityLabel={hostBadge.label}>
          {hostBadge.label}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  // The compact header stretches this row to its available title width. Within that width,
  // the project and server names truncate together without adding a second icon style.
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    minWidth: 0,
    flexShrink: 1,
  },
  project: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base * 0.875,
    fontWeight: theme.fontWeight.normal,
    flexShrink: 1,
    minWidth: 0,
  },
  separator: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    flexShrink: 0,
  },
}));
