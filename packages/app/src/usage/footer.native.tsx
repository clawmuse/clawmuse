import { useCallback, type ReactNode } from "react";
import type { LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";

export function UsageFooter({ children }: { children: ReactNode }) {
  const { bottom } = useSafeAreaInsets();
  const height = useSharedValue(0);
  const measure = useCallback(
    (event: LayoutChangeEvent) => {
      height.value = event.nativeEvent.layout.height;
    },
    [height],
  );
  const style = useAnimatedStyle(() => ({
    // The composer supplies a 16px sibling gap; metadata needs only 6px.
    marginTop: -6,
    // The translated dock retains its safe-area padding with the keyboard open.
    // Keep this reclaim constant so keyboard settlement cannot resize the composer.
    // Leave 16px at the screen edge and never move the input below its original
    // safe-area boundary: only the footer and its 6px gap may occupy that space.
    marginBottom: -Math.min(Math.max(0, bottom - 12), height.value + 6),
  }));
  return (
    <Animated.View style={style} onLayout={measure}>
      {children}
    </Animated.View>
  );
}
