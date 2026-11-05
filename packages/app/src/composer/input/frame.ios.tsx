import { View, StyleSheet as NativeStyleSheet } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { GlassSurface, type GlassSurfaceProps } from "@/components/ui/glass-surface";

export function ComposerInputFrame({
  enabled,
  style,
  children,
  isInteractive: _isInteractive,
  ...props
}: GlassSurfaceProps) {
  return (
    <View {...props} style={[style, enabled && styles.frame]}>
      {enabled && (
        <GlassSurface
          enabled
          pointerEvents="none"
          style={[NativeStyleSheet.absoluteFill, styles.material]}
        />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  // Keep Yoga padding and gap on a plain View: GlassView reparents children
  // into UIVisualEffectView.contentView on iOS.
  frame: {
    borderRadius: 30,
    borderCurve: "continuous",
    backgroundColor: "transparent",
    shadowOpacity: 0,
  },
  material: {
    borderRadius: 30,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface1,
  },
}));
