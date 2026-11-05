import type { Ref } from "react";
import { View, type ViewProps } from "react-native";

export interface GlassSurfaceProps extends ViewProps {
  ref?: Ref<View>;
  enabled?: boolean;
  isInteractive?: boolean;
}

export function GlassSurface({
  enabled: _enabled,
  isInteractive: _isInteractive,
  ...props
}: GlassSurfaceProps) {
  return <View {...props} />;
}
