import { X } from "@/components/icons/app-icons";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { HeaderToggleButton } from "@/components/headers/header-toggle-button";
import { GlassSurface } from "@/components/ui/glass-surface";
import {
  foregroundIconColorMapping,
  IconButtonChromeProvider,
  iconButtonChromeGlyphSize,
  mutedIconColorMapping,
} from "@/components/ui/icon-button-chrome";
import { compactChrome } from "@/constants/compact-chrome";
import type { ShortcutKey } from "@/utils/format-shortcut";

const ThemedX = withUnistyles(X);
const NO_SHORTCUT: ShortcutKey[] = [];
const closeIconColorMapping = compactChrome.nativeGlass
  ? foregroundIconColorMapping
  : mutedIconColorMapping;

interface SidebarCloseButtonProps {
  label: string;
  onPress: () => void;
  testID: string;
  nativeID?: string;
  accessibilityState?: { expanded: boolean };
  style?: StyleProp<ViewStyle>;
}

/**
 * The X that closes a compact sidebar overlay. It is the compact header's icon button, so the
 * sidebar's close reads like the header it covers; every compact sidebar uses it.
 */
export function SidebarCloseButton({
  label,
  onPress,
  testID,
  nativeID,
  accessibilityState,
  style,
}: SidebarCloseButtonProps) {
  const button = (
    <IconButtonChromeProvider value="header-island">
      <HeaderToggleButton
        onPress={onPress}
        tooltipLabel={label}
        tooltipKeys={NO_SHORTCUT}
        tooltipSide="bottom"
        style={compactChrome.nativeGlass ? undefined : style}
        testID={testID}
        nativeID={nativeID}
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={accessibilityState}
      >
        <ThemedX size={iconButtonChromeGlyphSize("large")} uniProps={closeIconColorMapping} />
      </HeaderToggleButton>
    </IconButtonChromeProvider>
  );

  if (!compactChrome.nativeGlass) {
    return button;
  }

  return (
    <View style={[styles.islandHost, style]}>
      <GlassSurface
        style={[StyleSheet.absoluteFill, styles.island]}
        pointerEvents="none"
        isInteractive
      />
      {button}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  islandHost: {
    width: compactChrome.controlSize,
    height: compactChrome.controlSize,
    alignItems: "center",
    justifyContent: "center",
  },
  island: {
    borderRadius: compactChrome.controlSize / 2,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface2,
  },
}));
