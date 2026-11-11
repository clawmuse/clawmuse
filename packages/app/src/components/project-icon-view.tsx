import { useMemo } from "react";
import { type StyleProp, Text, type TextStyle, View } from "react-native";
import { ProjectIconImage } from "@/components/project-icon-image";
import { deriveIdentityColorName, identityColor } from "@/styles/identity-colors";

const WHITE_TEXT = { color: "#ffffff" } as const;
const FALLBACK_LAYOUT = { alignItems: "center", justifyContent: "center" } as const;

/**
 * Corner radius of project images and generated initial icons as a
 * fraction of the box, so it reads as the same shape at 16pt in the sidebar and 40pt in the edit
 * sheet. Fixed tokens did not give that: the radius scale is coarse at the bottom, so small icons
 * landed on 2pt and looked square while large ones were visibly rounder.
 */
const RADIUS_RATIO = 0.25;

export function projectIconRadius(size: number): number {
  return Math.round(size * RADIUS_RATIO);
}

// The initial fills ~60% of the icon height — large enough to read at 16pt, small enough to
// leave a visible color border at 40pt. Below this the letter was getting lost in the tile.
const FALLBACK_FONT_RATIO = 0.6;

function fallbackFontSize(size: number): number {
  return Math.max(Math.round(size * FALLBACK_FONT_RATIO), 8);
}

/**
 * A project's icon: its chosen image, or a colored square carrying its initial.
 *
 * Geometry lives here, not at the call site. It used to be five copies of the same
 * width/height/radius/centering block, which is how the radius drifted apart in the first
 * place — pass a `size` and the shape follows.
 *
 * The fallback letter's size and weight are set here too — a `textStyle` prop can still
 * override them, but callers that don't care get the same bold, centered look everywhere.
 */

export function ProjectIconView({
  iconDataUri,
  initial,
  projectViewKey,
  size,
  textStyle,
}: {
  iconDataUri: string | null;
  initial: string;
  projectViewKey: string;
  size: number;
  textStyle: StyleProp<TextStyle>;
}) {
  const box = useMemo(
    () =>
      ({
        width: size,
        height: size,
        borderRadius: projectIconRadius(size),
        overflow: "hidden",
      }) as const,
    [size],
  );
  const fallbackStyles = useMemo(
    () => [
      box,
      FALLBACK_LAYOUT,
      { backgroundColor: identityColor(deriveIdentityColorName(projectViewKey)) },
    ],
    [box, projectViewKey],
  );
  const textStyles = useMemo(
    () => [{ fontSize: fallbackFontSize(size), fontWeight: "600" as const }, textStyle, WHITE_TEXT],
    [size, textStyle],
  );

  const fallback = useMemo(
    () => (
      <View style={fallbackStyles}>
        <Text style={textStyles}>{initial}</Text>
      </View>
    ),
    [fallbackStyles, initial, textStyles],
  );

  return iconDataUri ? (
    <ProjectIconImage dataUri={iconDataUri} fallback={fallback} style={box} />
  ) : (
    fallback
  );
}
