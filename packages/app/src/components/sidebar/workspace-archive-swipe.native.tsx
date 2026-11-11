import { type ReactNode, useCallback, useEffect, useMemo } from "react";
import { StyleSheet as RNStyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Archive } from "@/components/icons/app-icons";
import { useTranslation } from "react-i18next";
import { useRetainedPanelActive } from "@/components/retained-panel";
import { useMobilePanelsRuntime } from "@/mobile-panels/provider";
import { BORDER_RADIUS, ICON_SIZE, SPACING, type Theme } from "@/styles/theme";
import { shouldArchiveWorkspaceSwipe } from "@/utils/sidebar-gesture-arbitration";

const SWIPE_ACTIVATION_OFFSET = 12;
const SWIPE_FAIL_OFFSET = 14;
const SWIPE_DURATION = 220;
const SWIPE_EASING = Easing.bezier(0.25, 0.1, 0.25, 1);
const ThemedArchive = withUnistyles(Archive);
const archiveIconMapping = (theme: Theme) => ({ color: theme.colors.destructiveForeground });

export function WorkspaceArchiveSwipe({
  children,
  disabled,
  onArchive,
}: {
  children: ReactNode;
  disabled?: boolean;
  onArchive: () => void;
}) {
  const { t } = useTranslation();
  const active = useRetainedPanelActive();
  const { leftCloseGestureRef } = useMobilePanelsRuntime();
  const width = useSharedValue(0);
  const translation = useSharedValue(0);
  const startTranslation = useSharedValue(0);
  const committing = useSharedValue(false);
  const gestureEnabled = !disabled && active;
  const measure = useCallback(
    (event: LayoutChangeEvent) => {
      const nextWidth = event.nativeEvent.layout.width;
      if (nextWidth > 0) width.value = nextWidth;
    },
    [width],
  );
  const archive = useCallback(() => {
    if (!committing.value) return;
    // A worktree confirmation can be canceled, and a failed archive restores the row.
    translation.value = withTiming(0, { duration: SWIPE_DURATION });
    committing.value = false;
    onArchive();
  }, [committing, onArchive, translation]);

  useEffect(() => {
    if (!gestureEnabled) {
      cancelAnimation(translation);
      translation.value = 0;
      committing.value = false;
    }
    return () => {
      cancelAnimation(translation);
      committing.value = false;
    };
  }, [committing, gestureEnabled, translation]);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-SWIPE_ACTIVATION_OFFSET, SWIPE_ACTIVATION_OFFSET])
        .failOffsetY([-SWIPE_FAIL_OFFSET, SWIPE_FAIL_OFFSET])
        .maxPointers(1)
        // A swipe starting on a workspace belongs to the row, not the panel.
        .blocksExternalGesture(leftCloseGestureRef)
        .enabled(gestureEnabled)
        .onTouchesDown((_event, manager) => {
          if (committing.value) manager.fail();
        })
        .onStart(() => {
          cancelAnimation(translation);
          startTranslation.value = translation.value;
        })
        .onUpdate((event) => {
          const nextTranslation = startTranslation.value + event.translationX;
          translation.value = Math.max(-width.value, Math.min(0, nextTranslation));
        })
        .onEnd((event, success) => {
          const shouldArchive = shouldArchiveWorkspaceSwipe({
            translationX: translation.value,
            velocityX: event.velocityX,
            width: width.value,
            success,
          });
          if (!shouldArchive) return;
          committing.value = true;
          // Finish the visible swipe before the optimistic archive unmounts the gesture host.
          translation.value = withTiming(
            -width.value,
            { duration: SWIPE_DURATION, easing: SWIPE_EASING },
            (finished) => {
              if (finished) scheduleOnRN(archive);
            },
          );
        })
        .onFinalize(() => {
          if (!committing.value) {
            translation.value = withTiming(0, { duration: SWIPE_DURATION, easing: SWIPE_EASING });
          }
        }),
    [
      archive,
      committing,
      gestureEnabled,
      leftCloseGestureRef,
      startTranslation,
      translation,
      width,
    ],
  );
  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translation.value }],
    pointerEvents: committing.value ? "none" : "auto",
  }));
  const actionStyle = useAnimatedStyle(() => {
    const distance = -translation.value;
    return {
      width: Math.max(0, distance - SPACING[2]),
      opacity: interpolate(distance, [0, 24, 64], [0, 0.6, 1], "clamp"),
      transform: [{ scale: interpolate(distance, [0, 64], [0.85, 1], "clamp") }],
    };
  });

  return (
    <GestureDetector gesture={gesture} touchAction="pan-y">
      <View collapsable={false} style={styles.container} onLayout={measure}>
        <Animated.View
          style={[staticStyles.action, actionStyle]}
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <View style={styles.actionFill}>
            <ThemedArchive size={ICON_SIZE.lg} uniProps={archiveIconMapping} />
            <Text style={styles.actionLabel}>{t("sidebar.workspace.actions.archive")}</Text>
          </View>
        </Animated.View>
        <Animated.View style={rowStyle}>
          <View style={styles.rowSurface}>{children}</View>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const staticStyles = RNStyleSheet.create({
  action: {
    position: "absolute",
    right: SPACING[1],
    top: SPACING[1],
    bottom: SPACING[1],
    overflow: "hidden",
    borderRadius: BORDER_RADIUS.full,
  },
});

const styles = StyleSheet.create((theme) => ({
  container: { overflow: "hidden", borderRadius: theme.borderRadius.lg },
  rowSurface: { backgroundColor: theme.colors.surfaceSidebar },
  actionFill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    backgroundColor: theme.colors.destructive,
  },
  actionLabel: {
    color: theme.colors.destructiveForeground,
    fontSize: theme.fontSize.sm,
    flexShrink: 0,
  },
}));
