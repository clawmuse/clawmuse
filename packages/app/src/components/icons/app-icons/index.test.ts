import { describe, expect, it } from "vitest";
import { resolveIconStrokeWidth } from "./index";

const pixels = (strokeWidth: number, size: number) =>
  (resolveIconStrokeWidth(strokeWidth, size) * size) / 24;

describe("resolveIconStrokeWidth", () => {
  it("keeps the full stroke at sidebar and inline sizes", () => {
    expect(resolveIconStrokeWidth(2.5, 14)).toBe(2.5);
    expect(resolveIconStrokeWidth(2.5, 18)).toBe(2.5);
  });

  it("grows the drawn stroke slowly past 18px instead of in proportion", () => {
    expect(pixels(2.5, 44)).toBeCloseTo(2.785, 3);
    // Proportional scaling would draw 8.3px at 80px.
    expect(pixels(2.5, 80)).toBeCloseTo(4.045, 3);
    expect(pixels(2.5, 44)).toBeGreaterThan(pixels(2.5, 24));
  });

  it("never thickens a stroke the caller already thinned", () => {
    expect(resolveIconStrokeWidth(1.25, 44)).toBeLessThanOrEqual(1.25);
    expect(resolveIconStrokeWidth(1.25, 16)).toBe(1.25);
  });

  it("leaves non-numeric sizes alone", () => {
    expect(resolveIconStrokeWidth(2.5, Number.NaN)).toBe(2.5);
  });
});
