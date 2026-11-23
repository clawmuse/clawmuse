import type { MutableRefObject, ReactElement, RefObject } from "react";
import type { ScrollView, StyleProp, ViewStyle } from "react-native";
import type { GestureType } from "react-native-gesture-handler";
import type { SharedValue } from "react-native-reanimated";
import type { DraggableRenderItemInfo } from "./draggable-list.types";

export interface SortableInlineListProps<T> {
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  renderItem: (info: DraggableRenderItemInfo<T>) => ReactElement;
  onDragEnd?: (data: T[], movedKey: string) => void;
  style?: StyleProp<ViewStyle>;
  useDragHandle?: boolean;
  disabled?: boolean;
  activationDistance?: number;
  onDragBegin?: () => void;
  onDragRelease?: () => void;
  externalDndContext?: boolean;
  activeId?: string | null;
  getItemData?: (item: T, index: number) => Record<string, unknown>;
  /** Native-only: external gesture (such as the compact sidebar close pan) blocked while dragging. */
  panelGestureRef?: MutableRefObject<GestureType | undefined>;
  /** Native-only: horizontal scroll container and layout metrics for edge auto-scrolling. */
  scrollViewRef?: RefObject<ScrollView | null>;
  scrollOffset?: SharedValue<number>;
  viewportWidth?: number;
  contentWidth?: number;
}
