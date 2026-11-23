import { describe, expect, it } from "vitest";
import { computeInlineItemShift, resolveInlineTargetIndex } from "./inline-drop";

describe("inline-drop", () => {
  const slots = [
    { x: 0, width: 60 },
    { x: 62, width: 80 },
    { x: 144, width: 40 },
  ];

  it("advances target index past subsequent centers when dragging right", () => {
    expect(resolveInlineTargetIndex(slots, 0, 20)).toBe(0);
    expect(resolveInlineTargetIndex(slots, 0, 43)).toBe(1);
    expect(resolveInlineTargetIndex(slots, 0, 105)).toBe(2);
  });

  it("moves target index before preceding centers when dragging left", () => {
    expect(resolveInlineTargetIndex(slots, 2, -20)).toBe(2);
    expect(resolveInlineTargetIndex(slots, 2, -43)).toBe(1);
    expect(resolveInlineTargetIndex(slots, 2, -115)).toBe(0);
  });

  it("shifts intervening variable-width items accurately while keeping gap spacing", () => {
    expect(computeInlineItemShift(slots, 0, 0, 2)).toBe(0);
    expect(computeInlineItemShift(slots, 1, 0, 2)).toBe(-62);
    expect(computeInlineItemShift(slots, 2, 0, 2)).toBe(-62);

    expect(computeInlineItemShift(slots, 0, 2, 0)).toBe(42);
    expect(computeInlineItemShift(slots, 1, 2, 0)).toBe(42);
    expect(computeInlineItemShift(slots, 2, 2, 0)).toBe(0);
  });

  it("returns safe fallbacks for out-of-range indices", () => {
    expect(resolveInlineTargetIndex(slots, -1, 50)).toBe(-1);
    expect(computeInlineItemShift(slots, 0, -1, 1)).toBe(0);
    expect(computeInlineItemShift(slots, 1, 1, 1)).toBe(0);
  });
});
