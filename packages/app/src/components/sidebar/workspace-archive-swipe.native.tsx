import * as Haptics from "expo-haptics";
import { type ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
import { StyleSheet as RNStyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { scheduleOnRN } from "react-native-worklets";
import { useTranslation } from "react-i18next";
import { Archive } from "@/components/icons/app-icons";
import { useRetainedPanelActive } from "@/components/retained-panel";
import { useMobilePanelsRuntime } from "@/mobile-panels/provider";
import { densityText } from "@/styles/density";
import { ICON_SIZE, SPACING, type Theme } from "@/styles/theme";
import {
  getWorkspaceArchiveSwipeThreshold,
  shouldArchiveWorkspaceSwipe,
} from "@/utils/sidebar-gesture-arbitration";
import type { WorkspaceArchiveSwipeAction } from "./workspace-archive-swipe";

const SWIPE_LEFT_ACTIVATION_OFFSET = -10;
const SWIPE_RIGHT_ACTIVATION_OFFSET = 12;
const SWIPE_FAIL_OFFSET_Y = 12;
const ARMED_TRANSITION_DURATION = 140;

const SNAP_BACK_SPRING = {
  mass: 0.8,
  stiffness: 400,
  damping: 34,
  overshootClamping: true,
} as const;

const COMMIT_EXIT_SPRING = {
  mass: 0.8,
  stiffness: 380,
  damping: 30,
  overshootClamping: true,
} as const;

const ICON_POP_SETTLE_SPRING = {
  mass: 0.6,
  stiffness: 340,
  damping: 16,
} as const;

const ThemedArchive = withUnistyles(Archive);
const archiveIconMapping = (theme: Theme) => ({ color: theme.colors.foreground });

function triggerSwipeThresholdHaptic(armed: boolean) {
  if (armed) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  } else {
    void Haptics.selectionAsync().catch(() => {});
  }
}

export function WorkspaceArchiveSwipe({
  children,
  disabled,
  onArchive,
}: {
  children: ReactNode;
  disabled?: boolean;
  onArchive: WorkspaceArchiveSwipeAction;
}) {
  const { t } = useTranslation();
  const active = useRetainedPanelActive();
  const { leftCloseGestureRef } = useMobilePanelsRuntime();
  const mountedRef = useRef(true);
  const width = useSharedValue(0);
  const translation = useSharedValue(0);
  const startTranslation = useSharedValue(0);
  const committing = useSharedValue(false);
  const armed = useSharedValue(false);
  const armedProgress = useSharedValue(0);
  const iconPop = useSharedValue(1);
  const gestureEnabled = !disabled && active;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const measure = useCallback(
    (event: LayoutChangeEvent) => {
      const nextWidth = event.nativeEvent.layout.width;
      if (nextWidth > 0) width.value = nextWidth;
    },
    [width],
  );

  const resetSwipeToRest = useCallback(
    (animated: boolean) => {
      committing.value = false;
      armed.value = false;
      iconPop.value = 1;
      if (animated) {
        armedProgress.value = withTiming(0, {
          duration: ARMED_TRANSITION_DURATION,
          easing: Easing.out(Easing.quad),
        });
        translation.value = withSpring(0, SNAP_BACK_SPRING);
      } else {
        cancelAnimation(translation);
        cancelAnimation(armedProgress);
        cancelAnimation(iconPop);
        armedProgress.value = 0;
        translation.value = 0;
      }
    },
    [armed, armedProgress, committing, iconPop, translation],
  );

  const archive = useCallback(() => {
    if (!committing.value) return;
    // Keep the row parked off-screen while the archive starts and React commits the optimistic
    // removal. Only spring back when a worktree confirmation is canceled or the archive aborts.
    void (async () => {
      try {
        const result = await onArchive();
        if (result === false && mountedRef.current) {
          resetSwipeToRest(true);
        }
      } catch {
        if (mountedRef.current) {
          resetSwipeToRest(true);
        }
      }
    })();
  }, [committing, onArchive, resetSwipeToRest]);

  useEffect(() => {
    if (!active) {
      resetSwipeToRest(false);
      return;
    }
    if (disabled && !committing.value) {
      resetSwipeToRest(false);
    }
  }, [active, committing, disabled, resetSwipeToRest]);

  useEffect(
    () => () => {
      cancelAnimation(translation);
      cancelAnimation(armedProgress);
      cancelAnimation(iconPop);
      committing.value = false;
    },
    [armedProgress, committing, iconPop, translation],
  );

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([SWIPE_LEFT_ACTIVATION_OFFSET, SWIPE_RIGHT_ACTIVATION_OFFSET])
        .failOffsetY([-SWIPE_FAIL_OFFSET_Y, SWIPE_FAIL_OFFSET_Y])
        .maxPointers(1)
        // A swipe starting on a workspace belongs to the row, not the panel.
        .blocksExternalGesture(leftCloseGestureRef)
        .enabled(gestureEnabled)
        .onTouchesDown((_event, manager) => {
          if (committing.value) manager.fail();
        })
        .onStart((event) => {
          cancelAnimation(translation);
          // Anchor to the activation delta so crossing activeOffsetX peels smoothly from 0
          // instead of snapping by 10pt on the first frame.
          if (translation.value === 0 && event.translationX > 0) {
            startTranslation.value = 0;
          } else {
            startTranslation.value = translation.value - event.translationX;
          }
          const currentThreshold = getWorkspaceArchiveSwipeThreshold(width.value);
          armed.value = currentThreshold > 0 && -translation.value >= currentThreshold;
        })
        .onUpdate((event) => {
          const rowWidth = width.value;
          if (rowWidth <= 0) return;
          const nextTranslation = Math.max(
            -rowWidth,
            Math.min(0, startTranslation.value + event.translationX),
          );
          translation.value = nextTranslation;

          const distance = -nextTranslation;
          const threshold = getWorkspaceArchiveSwipeThreshold(rowWidth);
          const nextArmed = distance >= threshold;
          if (nextArmed !== armed.value) {
            armed.value = nextArmed;
            armedProgress.value = withTiming(nextArmed ? 1 : 0, {
              duration: ARMED_TRANSITION_DURATION,
              easing: Easing.out(Easing.quad),
            });
            if (nextArmed) {
              iconPop.value = withSequence(
                withTiming(1.12, { duration: 85, easing: Easing.out(Easing.quad) }),
                withSpring(1, ICON_POP_SETTLE_SPRING),
              );
            }
            scheduleOnRN(triggerSwipeThresholdHaptic, nextArmed);
          }
        })
        .onEnd((event, success) => {
          const rowWidth = width.value;
          const shouldArchive = shouldArchiveWorkspaceSwipe({
            translationX: translation.value,
            velocityX: event.velocityX,
            width: rowWidth,
            success,
          });
          if (!shouldArchive) return;

          if (!armed.value) {
            armed.value = true;
            armedProgress.value = withTiming(1, {
              duration: 100,
              easing: Easing.out(Easing.quad),
            });
            scheduleOnRN(triggerSwipeThresholdHaptic, true);
          }

          committing.value = true;
          // Finish the visible slide-out with finger momentum before optimistic removal unmounts the host.
          translation.value = withSpring(
            -rowWidth,
            {
              ...COMMIT_EXIT_SPRING,
              velocity: event.velocityX,
            },
            (finished) => {
              if (finished) {
                scheduleOnRN(archive);
              } else {
                committing.value = false;
                armed.value = false;
                armedProgress.value = 0;
                translation.value = 0;
              }
            },
          );
        })
        .onFinalize((event) => {
          if (committing.value) return;
          armed.value = false;
          if (armedProgress.value !== 0) {
            armedProgress.value = withTiming(0, {
              duration: ARMED_TRANSITION_DURATION,
              easing: Easing.out(Easing.quad),
            });
          }
          if (translation.value !== 0) {
            translation.value = withSpring(0, {
              ...SNAP_BACK_SPRING,
              velocity: event.velocityX,
            });
          }
        }),
    [
      archive,
      armed,
      armedProgress,
      committing,
      gestureEnabled,
      iconPop,
      leftCloseGestureRef,
      startTranslation,
      translation,
      width,
    ],
  );

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translation.value }],
  }));

  // Compositor-only transforms and opacities: never animate layout width/height on Fabric.
  const trayVisibilityStyle = useAnimatedStyle(() => {
    const distance = -translation.value;
    return {
      opacity: distance <= 0.5 ? 0 : interpolate(distance, [0.5, 10], [0, 1], "clamp"),
    };
  });

  const armedFillStyle = useAnimatedStyle(() => {
    const distance = -translation.value;
    const threshold = getWorkspaceArchiveSwipeThreshold(width.value);
    const dragHint = threshold > 0 ? interpolate(distance, [0, threshold], [0, 0.35], "clamp") : 0;
    return {
      opacity: Math.max(dragHint, armedProgress.value),
    };
  });

  const actionContentStyle = useAnimatedStyle(() => {
    const distance = -translation.value;
    const threshold = Math.max(48, getWorkspaceArchiveSwipeThreshold(width.value));
    const revealOpacity = interpolate(distance, [4, 28, threshold], [0, 0.5, 0.72], "clamp");
    const translateX = interpolate(distance, [0, threshold], [12, 0], "clamp");
    const dragScale = interpolate(distance, [0, threshold], [0.9, 1], "clamp");
    return {
      opacity: revealOpacity + (1 - revealOpacity) * armedProgress.value,
      transform: [{ translateX }, { scale: dragScale * iconPop.value }],
    };
  });

  return (
    <GestureDetector gesture={gesture} touchAction="pan-y">
      <View collapsable={false} style={styles.container} onLayout={measure}>
        <Animated.View
          style={[staticStyles.trayOverlay, trayVisibilityStyle]}
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <View style={styles.trayBase}>
            <Animated.View style={[staticStyles.fill, armedFillStyle]}>
              <View style={styles.trayArmedFill} />
            </Animated.View>
            <Animated.View style={[staticStyles.actionContent, actionContentStyle]}>
              <ThemedArchive size={ICON_SIZE.md} uniProps={archiveIconMapping} />
              <Text numberOfLines={1} style={styles.actionLabel}>
                {t("sidebar.workspace.actions.archive")}
              </Text>
            </Animated.View>
          </View>
        </Animated.View>
        <Animated.View style={rowStyle}>
          <View style={styles.rowSurface}>{children}</View>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

// Plain React Native styles for Reanimated nodes; Unistyles theme tokens live on inner Views.
const staticStyles = RNStyleSheet.create({
  trayOverlay: {
    ...RNStyleSheet.absoluteFill,
  },
  fill: {
    ...RNStyleSheet.absoluteFill,
  },
  actionContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: SPACING[1.5],
    paddingHorizontal: SPACING[3.5],
  },
});

const styles = StyleSheet.create((theme) => ({
  container: {
    overflow: "hidden",
    borderRadius: theme.borderRadius.lg,
  },
  rowSurface: {
    backgroundColor: theme.colors.surfaceSidebar,
    borderRadius: theme.borderRadius.lg,
  },
  trayBase: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSidebarHover,
    overflow: "hidden",
  },
  trayArmedFill: {
    flex: 1,
    backgroundColor: theme.colors.surface3,
  },
  actionLabel: {
    ...densityText(theme, "footnote"),
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foreground,
    flexShrink: 0,
  },
}));
