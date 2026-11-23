export interface InlineItemSlot {
  x: number;
  width: number;
}

/**
 * Resolves the target slot index for a horizontally dragged item based on its
 * measured variable-width slots and current horizontal translation.
 */
export function resolveInlineTargetIndex(
  slots: readonly InlineItemSlot[],
  fromIndex: number,
  translateX: number,
): number {
  "worklet";
  if (fromIndex < 0 || fromIndex >= slots.length) return fromIndex;
  const active = slots[fromIndex];
  if (!active || active.width <= 0) return fromIndex;

  let target = fromIndex;
  if (translateX > 0) {
    const draggedRight = active.x + active.width + translateX;
    for (let index = fromIndex + 1; index < slots.length; index += 1) {
      const slot = slots[index];
      if (!slot || slot.width <= 0) break;
      if (draggedRight > slot.x + slot.width / 2) {
        target = index;
      } else {
        break;
      }
    }
  } else if (translateX < 0) {
    const draggedLeft = active.x + translateX;
    for (let index = fromIndex - 1; index >= 0; index -= 1) {
      const slot = slots[index];
      if (!slot || slot.width <= 0) break;
      if (draggedLeft < slot.x + slot.width / 2) {
        target = index;
      } else {
        break;
      }
    }
  }
  return target;
}

/**
 * Computes the horizontal displacement (`translateX`) for a non-active item
 * between `fromIndex` and `toIndex`.
 */
export function computeInlineItemShift(
  slots: readonly InlineItemSlot[],
  index: number,
  fromIndex: number,
  toIndex: number,
): number {
  "worklet";
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= slots.length ||
    toIndex >= slots.length ||
    fromIndex === toIndex ||
    index === fromIndex
  ) {
    return 0;
  }

  const active = slots[fromIndex];
  if (!active || active.width <= 0) return 0;

  if (fromIndex < toIndex && index > fromIndex && index <= toIndex) {
    const nextSlot = slots[fromIndex + 1];
    if (!nextSlot) return 0;
    return -(nextSlot.x - active.x);
  }

  if (fromIndex > toIndex && index >= toIndex && index < fromIndex) {
    const prevSlot = slots[fromIndex - 1];
    if (!prevSlot) return 0;
    const gap = active.x - (prevSlot.x + prevSlot.width);
    return active.width + gap;
  }

  return 0;
}
