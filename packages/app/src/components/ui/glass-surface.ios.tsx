import { useEffect, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import { BlurView } from "expo-blur";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
import type { GlassSurfaceProps } from "./glass-surface";

const supportsLiquidGlass = isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
const ThemedGlassView = withUnistyles(GlassView);
const ThemedBlurView = withUnistyles(BlurView);
const glassAppearance = (theme: Theme) => ({ colorScheme: theme.colorScheme });
const blurAppearance = (theme: Theme) => ({ tint: theme.colorScheme });

/** Children live inside the system material so its rim and shadow remain unclipped. */
export function GlassSurface({
  enabled = true,
  isInteractive = false,
  style,
  ...props
}: GlassSurfaceProps) {
  const [reduceTransparency, setReduceTransparency] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceTransparencyEnabled().then(
      (reduced) => {
        if (active) setReduceTransparency(reduced);
        return reduced;
      },
      () => true,
    );
    const subscription = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      setReduceTransparency,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  const glass = enabled && !reduceTransparency;
  if (!supportsLiquidGlass) {
    return (
      <View {...props} style={[style, enabled && styles.legacyFrame, glass && styles.frosted]}>
        <ThemedBlurView
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          intensity={glass ? 70 : 0}
          uniProps={blurAppearance}
        />
        {props.children}
      </View>
    );
  }
  // Keep the native host (and its editor/focus) when fullscreen or accessibility changes.
  return (
    <ThemedGlassView
      {...props}
      style={[style, glass && styles.material]}
      glassEffectStyle={glass ? "regular" : "none"}
      isInteractive={isInteractive}
      uniProps={glassAppearance}
    />
  );
}

const styles = StyleSheet.create({
  // Older iOS uses blur within its keyline; Liquid Glass draws beyond the contour.
  legacyFrame: { overflow: "hidden" },
  frosted: { backgroundColor: "transparent" },
  material: {
    backgroundColor: "transparent",
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
    overflow: "visible",
  },
});
