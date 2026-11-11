import { isCompactBreakpoint } from "@/constants/layout";
import {
  ICON_SIZE,
  SPACING,
  MOBILE_CONTENT_FONT_SIZE,
  MOBILE_TYPOGRAPHY,
  MOBILE_UI_FONT_SIZE,
  type Theme,
} from "@/styles/theme";

/**
 * Density sizes for surfaces that opt into touch sizing: rows and icons grow on compact
 * layouts and keep their desktop sizes from the `md` breakpoint up. Plain theme tokens stay
 * desktop-sized everywhere, so a surface migrates by swapping its sizes for these.
 *
 * Style values are Unistyles breakpoint values, resolved inside `StyleSheet.create`. Icon sizes
 * are props, so icons take them through `DensityIcon` or a `densityIconProps` mapping.
 */

export type DensityIconSize = keyof typeof ICON_SIZE;

const COMPACT_ICON_SIZE: Record<DensityIconSize, number> = { xs: 14, sm: 18, md: 20, lg: 24 };

// Compact layouts end where `md` begins; see `isCompactBreakpoint`.
function byLayout<T>(compact: T, desktop: T) {
  return { xs: compact, md: desktop };
}

export const density = {
  /** A list row such as a sidebar entry. */
  rowHeight: byLayout(44, 36),
  /** A row in a tight group, such as the sidebar's navigation rows. */
  tightRowHeight: byLayout(36, 28),
  /** A square icon-only button that sits in a row or toolbar. */
  iconButton: byLayout(44, 28),
  /** The sidebar's top icon navigation line: compact and balanced on desktop. */
  navIconButton: byLayout(44, 30),
  navIconGlyph: byLayout(COMPACT_ICON_SIZE.md, 17),
  /**
   * Sidebar list rows on the phone trade padding for rows on screen. Rows sit flush, so the whole
   * row is still the tap target.
   */
  listRowHeight: byLayout(36, 30),
  listRowPaddingVertical: byLayout(SPACING[1], SPACING[1]),
  /** Between a row's title line and its meta line. */
  listRowLineGap: byLayout(SPACING[0.5], SPACING[1]),
  /** Under an expanded group, before the next group's header. */
  listGroupGap: byLayout(SPACING[1.5], SPACING[2]),
  /** The space between two blocks of rich text, such as Markdown paragraphs, code and images. */
  blockGap: byLayout(20, 20),
};

/** Resolves a density value for a prop, which Unistyles cannot resolve on its own. */
export function resolveDensity<T>(rt: { breakpoint?: string }, value: { xs: T; md: T }): T {
  return isCompactBreakpoint(rt.breakpoint) ? value.xs : value.md;
}

/** Compact text roles scale from the rendered 16px default, not the authored 14px ramp. */
export function densityText(theme: Theme, role: keyof typeof MOBILE_TYPOGRAPHY) {
  const mobile = MOBILE_TYPOGRAPHY[role];
  const isContent = role === "content";
  const scale = isContent
    ? theme.fontSize.content / MOBILE_CONTENT_FONT_SIZE
    : theme.fontSize.base / MOBILE_UI_FONT_SIZE;
  const isSmall = role === "caption" || role === "footnote";
  const desktopInterfaceSize = isSmall ? theme.fontSize.sm : theme.fontSize.base;
  const desktopFontSize = isContent ? theme.fontSize.content : desktopInterfaceSize;
  return {
    fontFamily: theme.fontFamily.ui,
    fontSize: byLayout(Math.round(mobile.fontSize * scale), desktopFontSize),
    lineHeight: byLayout(
      isContent ? Math.round(theme.fontSize.content * 1.6) : Math.round(mobile.lineHeight * scale),
      Math.round(desktopFontSize * (isContent ? 1.6 : 1.4)),
    ),
    fontWeight: byLayout(mobile.fontWeight, theme.fontWeight.normal),
  };
}

/** The width or height of a slot that holds an icon of `size`. */
export function densityIconBox(size: DensityIconSize) {
  return byLayout(COMPACT_ICON_SIZE[size], ICON_SIZE[size]);
}

export function densityIconSize(rt: { breakpoint?: string }, size: DensityIconSize): number {
  return resolveDensity(rt, densityIconBox(size));
}

/** Extends a `withUnistyles` icon mapping so the icon also takes its density size. */
export function densityIconProps<P extends object>(
  size: DensityIconSize,
  mapping: (theme: Theme) => P,
) {
  return (theme: Theme, rt: { breakpoint?: string }) => ({
    ...mapping(theme),
    size: densityIconSize(rt, size),
  });
}
