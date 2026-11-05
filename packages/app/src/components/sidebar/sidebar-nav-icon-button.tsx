import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { SidebarFooterIconHighlight } from "@/components/sidebar/sidebar-footer-icon-highlight";
import type { SidebarRowIcon } from "@/components/sidebar/sidebar-header-row";
import { DensityIcon } from "@/components/ui/density-icon";
import { PressHighlight } from "@/components/ui/press-highlight";
import { Shortcut } from "@/components/ui/shortcut";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ShortcutKey } from "@/utils/format-shortcut";
import { isWeb } from "@/constants/platform";
import { density } from "@/styles/density";

interface SidebarNavIconButtonProps {
  icon: SidebarRowIcon;
  label: string;
  onPress: () => void;
  isActive?: boolean;
  testID?: string;
  nativeID?: string;
  shortcutKeys?: ShortcutKey[][] | null;
}

export function SidebarNavIconButton({
  icon,
  label,
  onPress,
  isActive = false,
  testID,
  nativeID = testID,
  shortcutKeys,
}: SidebarNavIconButtonProps) {
  return (
    <Tooltip delayDuration={300} enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger asChild>
        <PressHighlight
          style={styles.iconButton}
          highlightStyle={isActive ? undefined : styles.iconHighlight}
          onPress={onPress}
          testID={testID}
          nativeID={nativeID}
          accessible
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={isActive ? SELECTED_STATE : undefined}
          aria-selected={isActive}
        >
          {({ hovered, pressed }) => (
            <>
              <SidebarFooterIconHighlight visible={(isWeb && pressed) || isActive} />
              <DensityIcon
                icon={icon}
                size={density.navIconGlyph}
                color={hovered || isActive ? "foreground" : "foregroundMuted"}
              />
            </>
          )}
        </PressHighlight>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="center"
        offset={8}
        testID={testID ? `${testID}-tooltip` : undefined}
      >
        <View style={styles.tooltipRow}>
          <Text style={styles.tooltipText}>{label}</Text>
          {shortcutKeys ? <Shortcut chord={shortcutKeys} /> : null}
        </View>
      </TooltipContent>
    </Tooltip>
  );
}

const SELECTED_STATE = { selected: true } as const;

const styles = StyleSheet.create((theme) => ({
  iconButton: {
    width: density.navIconButton,
    height: density.navIconButton,
    alignItems: "center",
    justifyContent: "center",
  },
  tooltipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  tooltipText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.popoverForeground,
  },
  iconHighlight: {
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.interactionHighlight,
  },
}));
