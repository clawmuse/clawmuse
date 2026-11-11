import { StyleSheet } from "react-native-unistyles";
import { SPACING } from "@/styles/theme";
import { COMPACT_ACTION_BUTTON_SIZE } from "@/components/ui/control-geometry";

export const COMPOSER_PILL_CLEARANCE = {
  compact: SPACING[2],
  wide: 10,
} as const;
export const COMPOSER_PILL_MIN_HEIGHT = 32;

export function resolveComposerPillClearance(isCompact: boolean): number {
  return isCompact ? COMPOSER_PILL_CLEARANCE.compact : COMPOSER_PILL_CLEARANCE.wide;
}

export function resolveComposerTrackTailClearance(isCompact: boolean): number {
  const composerClearance = resolveComposerPillClearance(isCompact);
  const transcriptClearance = isCompact ? SPACING[6] : 20;
  return transcriptClearance + COMPOSER_PILL_MIN_HEIGHT + composerClearance;
}

export function resolveComposerTrackControlClearance(isCompact: boolean): number {
  const clearance = resolveComposerPillClearance(isCompact);
  return clearance + COMPOSER_PILL_MIN_HEIGHT + clearance;
}

/** Shared visual contract for the compact pills immediately above the composer. */
export const composerPillStyles = StyleSheet.create((theme) => ({
  body: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minHeight: COMPOSER_PILL_MIN_HEIGHT,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    // Match the composer's 16px tangent point. The 32px floor prevents short labels from
    // clamping the radius and pulling the point where the curve meets the straight edge inward.
    borderRadius: theme.borderRadius["2xl"],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
    // The bar floats over the transcript. A solid fill like the jump-to-bottom button: a blur
    // re-sampled the scrolling text underneath and flickered on every frame.
    backgroundColor: theme.colors.surface2,
    ...theme.shadow.sm,
  },
  bodyActive: {
    backgroundColor: theme.colors.surface3,
  },
  /**
   * Pill variant for the composer's action rail, matching the rail's icon buttons
   * (`chatActionButton` in agent-panel.tsx): a borderless solid round ground instead of the
   * floating-over-transcript frame `body` wears. The shadow comes off too — the icon buttons
   * read flat at this size, and a wide pill wearing their shadow picks up a blur they don't.
   */
  railBody: {
    minHeight: 28,
    borderWidth: 0,
    borderRadius: theme.borderRadius.full,
    shadowColor: "transparent",
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  denseBody: {
    paddingHorizontal: { xs: theme.spacing[2], md: theme.spacing[3] },
    paddingVertical: { xs: theme.spacing[0.5], md: theme.spacing[1] },
  },
  compactActionBody: {
    minHeight: { xs: COMPACT_ACTION_BUTTON_SIZE, md: COMPOSER_PILL_MIN_HEIGHT },
  },
  denseLabel: {
    fontSize: { xs: (theme.fontSize.sm * 11) / 12, md: theme.fontSize.sm },
  },
  label: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  labelActive: {
    color: theme.colors.foreground,
  },
}));
