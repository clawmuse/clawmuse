import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import {
  computeInlineItemShift,
  resolveInlineTargetIndex,
  type InlineItemSlot,
} from "./drag-reorder/inline-drop";
import type { DraggableRenderItemInfo } from "./draggable-list.types";
import type { SortableInlineListProps } from "./sortable-inline-list.types";

export type { SortableInlineListProps };

const DEFAULT_ACTIVATION_DISTANCE = 6;
const VERTICAL_FAIL_THRESHOLD = 14;
const DIRECTIONAL_DOMINANCE_RATIO = 1.5;
const EDGE_AUTO_SCROLL_THRESHOLD = 28;
const EDGE_AUTO_SCROLL_MAX_STEP = 6;

function moveArrayItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  if (moved !== undefined) {
    next.splice(to, 0, moved);
  }
  return next;
}

function SortableInlineNativeItem<T>({
  id,
  item,
  index,
  generation,
  slots,
  activeIndex,
  targetIndex,
  dragTranslationX,
  isDraggingActive,
  onMeasure,
  onArm,
  renderItem,
}: {
  id: string;
  item: T;
  index: number;
  generation: number;
  slots: SharedValue<InlineItemSlot[]>;
  activeIndex: SharedValue<number>;
  targetIndex: SharedValue<number>;
  dragTranslationX: SharedValue<number>;
  isDraggingActive: boolean;
  onMeasure: (index: number, x: number, width: number) => void;
  onArm: (index: number) => void;
  renderItem: (info: DraggableRenderItemInfo<T>) => ReactElement;
}): ReactElement {
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { x, width } = event.nativeEvent.layout;
      onMeasure(index, x, width);
    },
    [index, onMeasure],
  );

  const drag = useCallback(() => {
    onArm(index);
  }, [index, onArm]);

  const animatedStyle = useAnimatedStyle(() => {
    const from = activeIndex.value;
    const to = targetIndex.value;
    if (from === index) {
      return {
        zIndex: 100,
        opacity: 0.94,
        transform: [{ translateX: dragTranslationX.value }, { scale: 1.03 }],
      };
    }
    const shift = computeInlineItemShift(slots.value, index, from, to);
    return {
      zIndex: 1,
      opacity: 1,
      transform: [
        { translateX: from >= 0 ? withTiming(shift, { duration: 150 }) : 0 },
        { scale: 1 },
      ],
    };
  }, [index]);

  const info: DraggableRenderItemInfo<T> = {
    item,
    index,
    drag,
    isActive: isDraggingActive,
  };

  return (
    <View onLayout={handleLayout}>
      <Animated.View key={`${id}:${generation}`} collapsable={false} style={animatedStyle}>
        {renderItem(info)}
      </Animated.View>
    </View>
  );
}

export function SortableInlineList<T>({
  data,
  keyExtractor,
  renderItem,
  onDragEnd,
  style,
  disabled = false,
  activationDistance = DEFAULT_ACTIVATION_DISTANCE,
  onDragBegin,
  onDragRelease,
  panelGestureRef,
  scrollViewRef,
  scrollOffset,
  viewportWidth = 0,
  contentWidth = 0,
}: SortableInlineListProps<T>): ReactElement {
  const keys = useMemo(
    () => data.map((item, index) => keyExtractor(item, index)),
    [data, keyExtractor],
  );
  const keysSignature = keys.join("\u0000");

  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [transformGen, setTransformGen] = useState<ReadonlyMap<string, number>>(() => new Map());

  const dataRef = useRef(data);
  const keysRef = useRef(keys);
  const draggingKeyRef = useRef<string | null>(null);
  const onDragReleaseRef = useRef(onDragRelease);
  dataRef.current = data;
  keysRef.current = keys;
  draggingKeyRef.current = draggingKey;
  onDragReleaseRef.current = onDragRelease;

  const commitFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slotsRef = useRef<InlineItemSlot[]>([]);
  const slotsShared = useSharedValue<InlineItemSlot[]>([]);
  const armedIndex = useSharedValue(-1);
  const activeIndex = useSharedValue(-1);
  const targetIndex = useSharedValue(-1);
  const manualActivated = useSharedValue(false);
  const touchStartX = useSharedValue(0);
  const touchStartY = useSharedValue(0);
  const startScrollOffset = useSharedValue(0);
  const dragTranslationX = useSharedValue(0);
  const holdingDrop = useSharedValue(false);

  const dragVisualEdgeRef = useRef<{ left: number; right: number } | null>(null);
  const viewportWidthRef = useRef(viewportWidth);
  const contentWidthRef = useRef(contentWidth);
  viewportWidthRef.current = viewportWidth;
  contentWidthRef.current = contentWidth;

  const handleMeasure = useCallback(
    (index: number, x: number, width: number) => {
      const current = slotsRef.current[index];
      if (current && current.x === x && current.width === width) return;
      const next = slotsRef.current.slice(0, keysRef.current.length);
      next[index] = { x, width };
      slotsRef.current = next;
      slotsShared.value = next;
    },
    [slotsShared],
  );

  useEffect(() => {
    if (slotsRef.current.length > keys.length) {
      const trimmed = slotsRef.current.slice(0, keys.length);
      slotsRef.current = trimmed;
      slotsShared.value = trimmed;
    }
  }, [keys.length, slotsShared]);

  useLayoutEffect(() => {
    if (commitFallbackTimerRef.current) {
      clearTimeout(commitFallbackTimerRef.current);
      commitFallbackTimerRef.current = null;
    }
    if (holdingDrop.value) {
      holdingDrop.value = false;
      activeIndex.value = -1;
      targetIndex.value = -1;
      dragTranslationX.value = 0;
      armedIndex.value = -1;
      manualActivated.value = false;
    }
  }, [
    keysSignature,
    holdingDrop,
    activeIndex,
    targetIndex,
    dragTranslationX,
    armedIndex,
    manualActivated,
  ]);

  useEffect(
    () => () => {
      if (commitFallbackTimerRef.current) {
        clearTimeout(commitFallbackTimerRef.current);
      }
      if (draggingKeyRef.current !== null) {
        draggingKeyRef.current = null;
        onDragReleaseRef.current?.();
      }
    },
    [],
  );

  const handleArm = useCallback(
    (index: number) => {
      if (disabled || index < 0 || index >= keysRef.current.length) return;
      armedIndex.value = index;
      activeIndex.value = index;
      targetIndex.value = index;
      dragTranslationX.value = 0;
      startScrollOffset.value = scrollOffset?.value ?? 0;
    },
    [
      activeIndex,
      armedIndex,
      disabled,
      dragTranslationX,
      scrollOffset,
      startScrollOffset,
      targetIndex,
    ],
  );

  const notifyDragBegin = useCallback(
    (index: number) => {
      const key = keysRef.current[index] ?? null;
      setDraggingKey(key);
      onDragBegin?.();
    },
    [onDragBegin],
  );

  const notifyDragRelease = useCallback(() => {
    dragVisualEdgeRef.current = null;
    setDraggingKey(null);
    onDragRelease?.();
  }, [onDragRelease]);

  const updateDragVisualEdge = useCallback((left: number, right: number) => {
    dragVisualEdgeRef.current = { left, right };
  }, []);

  const commitDrop = useCallback(
    (from: number, to: number) => {
      dragVisualEdgeRef.current = null;
      setDraggingKey(null);
      const currentData = dataRef.current;
      const currentKeys = keysRef.current;
      const movedKey = currentKeys[from];
      if (
        movedKey !== undefined &&
        from >= 0 &&
        to >= 0 &&
        from < currentData.length &&
        to < currentData.length &&
        from !== to
      ) {
        const reordered = moveArrayItem(currentData, from, to);
        const reorderedKeys = moveArrayItem(currentKeys, from, to);
        const prevIndices = new Map(currentKeys.map((key, idx) => [key, idx]));
        setTransformGen((previous) => {
          const next = new Map<string, number>();
          reorderedKeys.forEach((key, idx) => {
            const gen = previous.get(key) ?? 0;
            next.set(key, gen + (prevIndices.get(key) !== idx ? 1 : 0));
          });
          return next;
        });
        onDragEnd?.(reordered, movedKey);
        if (commitFallbackTimerRef.current) {
          clearTimeout(commitFallbackTimerRef.current);
        }
        commitFallbackTimerRef.current = setTimeout(() => {
          commitFallbackTimerRef.current = null;
          if (holdingDrop.value) {
            holdingDrop.value = false;
            activeIndex.value = -1;
            targetIndex.value = -1;
            dragTranslationX.value = 0;
            armedIndex.value = -1;
            manualActivated.value = false;
          }
        }, 50);
      } else {
        holdingDrop.value = false;
        activeIndex.value = -1;
        targetIndex.value = -1;
        dragTranslationX.value = 0;
        armedIndex.value = -1;
        manualActivated.value = false;
      }
      onDragRelease?.();
    },
    [
      activeIndex,
      armedIndex,
      dragTranslationX,
      holdingDrop,
      manualActivated,
      onDragEnd,
      onDragRelease,
      targetIndex,
    ],
  );

  useEffect(() => {
    if (!draggingKey) return;
    const interval = setInterval(() => {
      const edge = dragVisualEdgeRef.current;
      const scroll = scrollViewRef?.current;
      const vpWidth = viewportWidthRef.current;
      const fullWidth = contentWidthRef.current;
      if (!edge || !scroll || vpWidth <= 0 || fullWidth <= vpWidth) return;

      const currentOffset = scrollOffset?.value ?? 0;
      const maxOffset = Math.max(0, fullWidth - vpWidth);
      const visibleLeft = edge.left - currentOffset;
      const visibleRight = edge.right - currentOffset;

      let step = 0;
      if (visibleRight > vpWidth - EDGE_AUTO_SCROLL_THRESHOLD && currentOffset < maxOffset) {
        const ratio = Math.min(
          1,
          (visibleRight - (vpWidth - EDGE_AUTO_SCROLL_THRESHOLD)) / EDGE_AUTO_SCROLL_THRESHOLD,
        );
        step = Math.max(1, Math.round(ratio * EDGE_AUTO_SCROLL_MAX_STEP));
      } else if (visibleLeft < EDGE_AUTO_SCROLL_THRESHOLD && currentOffset > 0) {
        const ratio = Math.min(
          1,
          (EDGE_AUTO_SCROLL_THRESHOLD - visibleLeft) / EDGE_AUTO_SCROLL_THRESHOLD,
        );
        step = -Math.max(1, Math.round(ratio * EDGE_AUTO_SCROLL_MAX_STEP));
      }

      if (step === 0) return;
      const nextOffset = Math.min(maxOffset, Math.max(0, currentOffset + step));
      if (nextOffset !== currentOffset) {
        scroll.scrollTo({ x: nextOffset, animated: false });
      }
    }, 16);

    return () => clearInterval(interval);
  }, [draggingKey, scrollOffset, scrollViewRef]);

  const panGesture = useMemo(() => {
    let gesture = Gesture.Pan()
      .enabled(!disabled && data.length > 1)
      .manualActivation(true)
      .onBegin(() => {
        manualActivated.value = false;
      })
      .onTouchesDown((event) => {
        const touch = event.changedTouches[0];
        if (touch) {
          touchStartX.value = touch.absoluteX;
          touchStartY.value = touch.absoluteY;
        }
      })
      .onTouchesMove((event, stateManager) => {
        if (manualActivated.value) return;
        const touch = event.changedTouches[0];
        if (!touch || event.numberOfTouches !== 1) {
          stateManager.fail();
          return;
        }
        const absDx = Math.abs(touch.absoluteX - touchStartX.value);
        const absDy = Math.abs(touch.absoluteY - touchStartY.value);

        if (armedIndex.value < 0) {
          if (absDx > activationDistance || absDy > activationDistance) {
            stateManager.fail();
          }
          return;
        }

        if (absDy > VERTICAL_FAIL_THRESHOLD && absDy > absDx * DIRECTIONAL_DOMINANCE_RATIO) {
          armedIndex.value = -1;
          activeIndex.value = -1;
          targetIndex.value = -1;
          stateManager.fail();
          return;
        }

        if (Math.sqrt(absDx * absDx + absDy * absDy) >= activationDistance) {
          manualActivated.value = true;
          stateManager.activate();
          runOnJS(notifyDragBegin)(armedIndex.value);
        }
      })
      .onUpdate((event) => {
        if (!manualActivated.value || activeIndex.value < 0) return;
        const scrollDelta = scrollOffset ? scrollOffset.value - startScrollOffset.value : 0;
        const translationX = event.translationX + scrollDelta;
        dragTranslationX.value = translationX;
        const currentSlots = slotsShared.value;
        targetIndex.value = resolveInlineTargetIndex(currentSlots, activeIndex.value, translationX);
        const activeSlot = currentSlots[activeIndex.value];
        if (activeSlot && contentWidth > viewportWidth) {
          runOnJS(updateDragVisualEdge)(
            activeSlot.x + translationX,
            activeSlot.x + activeSlot.width + translationX,
          );
        }
      })
      .onEnd((_event, success) => {
        if (!manualActivated.value) return;
        const from = activeIndex.value;
        const to = targetIndex.value;
        if (success && from >= 0 && to >= 0 && from !== to) {
          holdingDrop.value = true;
          runOnJS(commitDrop)(from, to);
        } else {
          activeIndex.value = -1;
          targetIndex.value = -1;
          dragTranslationX.value = 0;
          armedIndex.value = -1;
          manualActivated.value = false;
          runOnJS(notifyDragRelease)();
        }
      })
      .onTouchesUp((event, stateManager) => {
        if (event.numberOfTouches === 0 && !manualActivated.value) {
          armedIndex.value = -1;
          activeIndex.value = -1;
          targetIndex.value = -1;
          stateManager.fail();
        }
      })
      .onTouchesCancelled((_event, stateManager) => {
        if (!manualActivated.value) {
          armedIndex.value = -1;
          activeIndex.value = -1;
          targetIndex.value = -1;
          stateManager.fail();
        }
      })
      .onFinalize(() => {
        if (!holdingDrop.value) {
          const wasActivated = manualActivated.value;
          manualActivated.value = false;
          armedIndex.value = -1;
          activeIndex.value = -1;
          targetIndex.value = -1;
          dragTranslationX.value = 0;
          if (wasActivated) {
            runOnJS(notifyDragRelease)();
          }
        }
      });

    if (panelGestureRef) {
      gesture = gesture.blocksExternalGesture(panelGestureRef);
    }
    return gesture;
  }, [
    activationDistance,
    activeIndex,
    armedIndex,
    commitDrop,
    contentWidth,
    data.length,
    disabled,
    dragTranslationX,
    holdingDrop,
    manualActivated,
    notifyDragBegin,
    notifyDragRelease,
    panelGestureRef,
    scrollOffset,
    slotsShared,
    startScrollOffset,
    targetIndex,
    touchStartX,
    touchStartY,
    updateDragVisualEdge,
    viewportWidth,
  ]);

  return (
    <GestureDetector gesture={panGesture}>
      <View collapsable={false} style={style}>
        {data.map((item, index) => {
          const id = keys[index] ?? keyExtractor(item, index);
          return (
            <SortableInlineNativeItem
              key={id}
              id={id}
              item={item}
              index={index}
              generation={transformGen.get(id) ?? 0}
              slots={slotsShared}
              activeIndex={activeIndex}
              targetIndex={targetIndex}
              dragTranslationX={dragTranslationX}
              isDraggingActive={draggingKey === id}
              onMeasure={handleMeasure}
              onArm={handleArm}
              renderItem={renderItem}
            />
          );
        })}
      </View>
    </GestureDetector>
  );
}
