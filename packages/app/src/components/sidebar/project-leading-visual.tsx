import { ActivityIndicator, View, type ViewStyle } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, CircleAlert } from "@/components/icons/app-icons";
import { ProjectIconView } from "@/components/project-icon-view";
import { getStatusBucketLabel } from "@/hooks/sidebar-status-view-model";
import { densityIconBox, densityIconProps } from "@/styles/density";
import type { Theme } from "@/styles/theme";
import type { SidebarStateBucket } from "@/utils/sidebar-agent-state";
import {
  getProjectStatusBadgeContent,
  type ProjectStatusBadgeContent,
  type ProjectStatusBadgeDotBucket,
} from "@/utils/project-status-badge-content";
import { projectIconPlaceholderLabelFromDisplayName } from "@/utils/project-display-name";
import { getStatusDotColor } from "@/utils/status-dot-color";
import {
  STATUS_INDICATOR_ALERT_SIZE,
  STATUS_INDICATOR_FILLED_DOT_SIZE,
} from "@/utils/status-indicator-geometry";
import { StatusRing } from "@/components/status-ring";
import { getStatusRingOffset } from "@/components/status-ring/geometry";
import type { SidebarSurfaceBackdrop } from "@/styles/surface-backdrop";

// Every surfaced status shares one badge shell, so the badge never changes size or position
// between states. Only the thing inside it changes.
const STATUS_BADGE_SIZE = 12;
// How far the badge overhangs the icon's bottom-right corner. Well short of half the badge:
// centered on the corner it reads as hanging off the icon rather than sitting on it, and the
// sidebar row has no padding there to absorb the overhang.
const STATUS_BADGE_OFFSET = -4;
// Both glyphs must be EVEN. A centered glyph of size N sits at a (12 - N) / 2 offset — fractional
// for odd N, which the browser snaps to a device-pixel boundary and renders visibly off-center (an
// odd size measured 1.5 device px right and down at 3x, ~3px of asymmetry between opposite gaps).
// Even sizes divide the shell into whole pixels and land dead center with no correction.
//
// The filled alert occupies the full badge shell so needs-input remains more prominent than
// the passive status dots.
const DensityProjectIconView = withUnistyles(ProjectIconView);
const projectIconProps = densityIconProps("md", () => ({}));
export function twoLineIconGeometry(theme: Theme) {
  const titleLineHeight = Math.round(theme.fontSize.content * 1.6);
  // Top-and-bottom flush with the title's letterforms: the tile is exactly the font's glyph
  // height — the font's body — not its line box. Any bigger and the corners overshoot the
  // cap and baseline.
  // Measured in the running app: the title glyph's bbox at fontSize 17 / lineHeight 26 is
  // ~19.5px tall with its top ~4px below the line's top. size = fontSize*1.15 lands the tile
  // edge on the cap top and descender bottom at once — smaller leaves the tile floating short
  // of the baseline, larger overshoots it.
  const glyphHeight = Math.round(theme.fontSize.content * 1.15);
  return {
    slotHeight: titleLineHeight,
    size: glyphHeight,
    // The glyph box's cap top sits ~half the line-leading below the line's top — at
    // fontSize 17 / lineHeight 26 that's ~4px, not the geometric center. offset lands the
    // tile's top edge exactly on the cap height so it reads flush with the letterforms.
    // The glyph's cap top sits ~2px above the geometric middle of a 26px line holding a 19.5px
    // glyph (measured: glyph top ≈ line top + ~3.5px). offset lands the tile's top there.
    offset: Math.round((titleLineHeight - glyphHeight) / 2) - 1,
  };
}

const twoLineProjectIconProps = (theme: Theme) => ({
  // Match the title line on every layout — the icon is the row's title's leading glyph, not
  // a summary of the whole row. Letting compact take a different size from desktop was the
  // split that made the same row read two ways.
  size: twoLineIconGeometry(theme).size,
});

const ThemedActivityIndicator = withUnistyles(ActivityIndicator);
const ThemedCircleAlert = withUnistyles(CircleAlert);

const foregroundMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});
const needsInputColorMapping = (theme: Theme) => ({
  color: theme.colors.surface0,
  fill: getStatusDotColor({ theme, bucket: "needs_input" }) ?? undefined,
});

/**
 * Leading slot of a sidebar project row: chevron on hover, archive spinner while removing,
 * otherwise the project icon carrying the project's aggregate workspace status.
 */
export function ProjectLeadingVisual({
  displayName,
  iconDataUri,
  statusBucket,
  projectViewKey,
  backdrop,
  chevron = null,
  showChevron = false,
  isArchiving = false,
}: {
  displayName: string;
  iconDataUri: string | null;
  /** Aggregate status of the project's workspaces; null when it shouldn't be surfaced. */
  statusBucket: SidebarStateBucket | null;
  projectViewKey: string;
  /** The row's current background, so the status badge can knock out of it. */
  backdrop: SidebarSurfaceBackdrop;
  chevron?: "expand" | "collapse" | null;
  showChevron?: boolean;
  isArchiving?: boolean;
}) {
  if (showChevron && chevron !== null) {
    return (
      <View style={styles.projectLeadingVisualSlot}>
        <ProjectInlineChevron chevron={chevron} />
      </View>
    );
  }

  if (isArchiving) {
    return (
      <View style={styles.projectLeadingVisualSlot} testID="project-status-indicator-archiving">
        <ThemedActivityIndicator size={8} uniProps={foregroundMutedColorMapping} />
      </View>
    );
  }

  return (
    <ProjectStatusIndicator
      iconDataUri={iconDataUri}
      displayName={displayName}
      projectViewKey={projectViewKey}
      statusBucket={statusBucket}
      backdrop={backdrop}
    />
  );
}

// The project icon (the lettered box) is what marks a row as a *project* rather than a
// workspace, so it always stays and status annotates it instead of replacing it. Every
// surfaced bucket lands in the identical corner badge — an amber alert glyph for needs_input,
// a colored disc for the rest, nothing for done — so the badge reads as one fixed shell and
// only its contents change.
export function ProjectStatusIndicator({
  iconDataUri,
  displayName,
  projectViewKey,
  statusBucket,
  backdrop,
  loading = false,
  twoLine = false,
  testID,
}: {
  iconDataUri: string | null;
  displayName: string;
  projectViewKey: string;
  statusBucket: SidebarStateBucket | null;
  /** The row's current background, so the status badge can knock out of it. */
  backdrop: SidebarSurfaceBackdrop;
  loading?: boolean;
  twoLine?: boolean;
  testID?: string;
}) {
  const placeholderInitial = projectIconPlaceholderLabelFromDisplayName(displayName)
    .charAt(0)
    .toUpperCase();
  // A row that's still starting up and a row that's working are both "busy", and at this size
  // there's no room to draw the difference — so `loading` just resolves to the running bucket
  // and they share one badge.
  const badgeBucket = loading ? "running" : statusBucket;
  const badgeContent = getProjectStatusBadgeContent(badgeBucket);

  return (
    <View
      style={twoLine ? styles.twoLineLeadingVisualSlot : styles.projectLeadingVisualSlot}
      testID={
        testID ??
        (statusBucket && statusBucket !== "done"
          ? `project-status-indicator-${statusBucket}`
          : "project-icon-only")
      }
    >
      <View style={twoLine ? styles.twoLineProjectIconBox : styles.projectIconBox}>
        <ProjectIcon
          iconDataUri={iconDataUri}
          placeholderInitial={placeholderInitial}
          projectViewKey={projectViewKey}
          twoLine={twoLine}
        />
        {badgeContent === null || badgeBucket === null ? null : (
          <ProjectStatusBadge
            content={badgeContent}
            statusBucket={badgeBucket}
            backdrop={backdrop}
          />
        )}
      </View>
    </View>
  );
}

function ProjectStatusBadge({
  content,
  statusBucket,
  backdrop,
}: {
  content: ProjectStatusBadgeContent;
  statusBucket: SidebarStateBucket;
  backdrop: SidebarSurfaceBackdrop;
}) {
  const { t } = useTranslation();
  // Running skips the shell. The ring is wider than the 12pt shell and carries its own knockout,
  // so nesting it inside would clip it against the very thing that was meant to separate it from
  // the icon. It anchors to the same corner instead, growing around the centre the dot had.
  if (content.kind === "dot" && content.bucket === "running") {
    return (
      <View
        role="status"
        accessibilityLabel={getStatusBucketLabel(statusBucket, t)}
        style={styles.statusRingAnchor}
        testID="project-status-badge"
      >
        <StatusRing backdrop={backdrop} />
      </View>
    );
  }
  return (
    <View
      role="status"
      accessibilityLabel={getStatusBucketLabel(statusBucket, t)}
      style={[styles.statusBadge, getStatusBadgeBackdropStyle(backdrop)]}
      testID="project-status-badge"
    >
      {content.kind === "alert" ? (
        <ThemedCircleAlert size={STATUS_INDICATOR_ALERT_SIZE} uniProps={needsInputColorMapping} />
      ) : (
        <ProjectStatusDot bucket={content.bucket} />
      )}
    </View>
  );
}

function getStatusBadgeBackdropStyle(backdrop: SidebarSurfaceBackdrop): ViewStyle {
  switch (backdrop) {
    case "surfaceSidebar":
      return styles.statusBadgeOnSidebar;
    case "surfaceSidebarHover":
      return styles.statusBadgeOnSidebarHover;
    case "surfaceSidebarSelected":
      return styles.statusBadgeOnSidebarSelected;
    case "surface2":
      return styles.statusBadgeOnSurface2;
  }
}

function ProjectStatusDot({ bucket }: { bucket: ProjectStatusBadgeDotBucket }) {
  return <View testID="project-status-dot" style={getStatusDotColorStyle(bucket)} />;
}

function ProjectIcon({
  iconDataUri,
  placeholderInitial,
  projectViewKey,
  twoLine,
}: {
  iconDataUri: string | null;
  placeholderInitial: string;
  projectViewKey: string;
  twoLine: boolean;
}) {
  return (
    <DensityProjectIconView
      iconDataUri={iconDataUri}
      initial={placeholderInitial}
      projectViewKey={projectViewKey}
      textStyle={twoLine ? styles.twoLineProjectIconFallbackText : styles.projectIconFallbackText}
      uniProps={twoLine ? twoLineProjectIconProps : projectIconProps}
    />
  );
}

function ProjectInlineChevron({ chevron }: { chevron: "expand" | "collapse" | null }) {
  if (chevron === null) {
    return null;
  }
  if (chevron === "collapse") {
    return <ChevronDown size={14} color="#9ca3af" />;
  }
  return <ChevronRight size={14} color="#9ca3af" />;
}

function getStatusDotColorStyle(bucket: ProjectStatusBadgeDotBucket): ViewStyle {
  if (bucket === "failed") return styles.statusDotFailed;
  if (bucket === "running") return styles.statusDotRunning;
  return styles.statusDotAttention;
}

const styles = StyleSheet.create((theme) => {
  // Dot statuses sit *inside* the shell rather than replacing it, so they carry the same ring
  // the alert does. The geometry is shared here and baked into each colored variant so the
  // style prop stays a single stable object; the colors come from the one bucket-to-color map
  // so this badge can't drift from the status dots everywhere else.
  const statusDot = (bucket: ProjectStatusBadgeDotBucket) =>
    ({
      width: STATUS_INDICATOR_FILLED_DOT_SIZE,
      height: STATUS_INDICATOR_FILLED_DOT_SIZE,
      borderRadius: theme.borderRadius.full,
      backgroundColor: getStatusDotColor({ theme, bucket }) ?? undefined,
    }) as const;

  const twoLineIcon = twoLineIconGeometry(theme);

  return {
    // Single-line project headers reserve the title's line height around their smaller icon.
    projectLeadingVisualSlot: {
      width: densityIconBox("md"),
      height: Math.round(theme.fontSize.content * 1.6),
      flexShrink: 0,
      alignItems: "center",
      justifyContent: "center",
    },
    // Anchors the corner badge to the icon rather than to the taller slot.
    projectIconBox: {
      position: "relative",
      width: densityIconBox("md"),
      height: densityIconBox("md"),
    },
    // Font size comes from ProjectIconView's size-derived default; only override where the
    // row genuinely needs a different scale.
    projectIconFallbackText: {},
    twoLineLeadingVisualSlot: {
      width: twoLineIcon.size,
      height: twoLineIcon.slotHeight,
      flexShrink: 0,
      alignItems: "center",
      // Push the tile down to the glyph band's top inside the taller line-height box —
      // position:relative + top doesn't beat flexbox justifyContent, so it has to be padding.
      justifyContent: "flex-start",
      paddingTop: twoLineIcon.offset,
    },
    twoLineProjectIconBox: {
      position: "relative",
      width: twoLineIcon.size,
      height: twoLineIcon.size,
    },
    // Same — let the icon size set the letter size. `twoLine` used to need an explicit bump
    // on compact because the tile there was larger than the iconSize token; now the size is
    // the title line's height on every layout, so the default ratio applies everywhere.
    twoLineProjectIconFallbackText: {},
    // The shell the alert and dot statuses share. It straddles the icon's bottom-right corner
    // (half in, half out) so the lettered project box stays readable. The shell is a knockout:
    // it is filled with the colour of the row behind it, which is what makes the ring around the
    // dot read as a gap in the icon rather than as a white halo drawn on top of it.
    statusBadge: {
      position: "absolute",
      right: STATUS_BADGE_OFFSET,
      bottom: STATUS_BADGE_OFFSET,
      width: STATUS_BADGE_SIZE,
      height: STATUS_BADGE_SIZE,
      borderRadius: theme.borderRadius.full,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    // Same corner as the shell, re-centred for the wider ring.
    statusRingAnchor: {
      position: "absolute",
      right: getStatusRingOffset(STATUS_BADGE_OFFSET, STATUS_BADGE_SIZE),
      bottom: getStatusRingOffset(STATUS_BADGE_OFFSET, STATUS_BADGE_SIZE),
    },
    statusBadgeOnSidebar: { backgroundColor: theme.colors.surfaceSidebar },
    statusBadgeOnSidebarHover: { backgroundColor: theme.colors.surfaceSidebarHover },
    statusBadgeOnSidebarSelected: { backgroundColor: theme.colors.surfaceSidebarSelected },
    statusBadgeOnSurface2: { backgroundColor: theme.colors.surface2 },
    statusDotRunning: statusDot("running"),
    statusDotFailed: statusDot("failed"),
    statusDotAttention: statusDot("attention"),
  };
});
