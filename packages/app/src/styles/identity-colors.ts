// Muted tones, all landing in a 4.2-4.8:1 contrast band against the white letter on top.
//
// Two properties matter more than the individual hues. First, low chroma: these squares sit
// in a sidebar row next to a status dot, a PR glyph and a diff stat, and at full saturation
// the project icon wins a fight it shouldn't be in. Second, even luminance: the previous set
// was raw Tailwind 500s spanning 1.9:1 (amber, where the white letter was barely visible) to
// 4.5:1 (indigo), so a project's color decided how loud it was in the list. Holding every
// swatch to one contrast band makes the color identifying rather than ranking.
//
// Retune with the contrast band, not by eye — a hue nudged for looks quietly re-weights that
// project against the other nine.
//
// Order is load-bearing: `deriveIdentityColorName` indexes into this array, so reordering
// silently recolors every existing project icon.
export const IDENTITY_COLOR_NAMES = [
  "violet",
  "sky",
  "emerald",
  "orange",
  "pink",
  "indigo",
  "teal",
  "red",
  "amber",
  "blue",
] as const;

export type IdentityColorName = (typeof IDENTITY_COLOR_NAMES)[number];

const IDENTITY_COLORS: Record<IdentityColorName, string> = {
  // Deeper, more saturated fills — HSL luminance pushed to ~40-55% (the previous set ran
  // 50-60%) and chroma lifted to 42-64%. Contrast band widened to 4.2-5.2:1 to let the
  // darker end in without washing out the white letter. Hues still sit in the space between
  // the status band's (success 150, danger 27, warning 70.5, merged 300, running 250) so a
  // project tile never reads as a status signal.
  violet: "#7a5cc8",
  sky: "#2878a8",
  emerald: "#28885e",
  orange: "#a86830",
  pink: "#b04888",
  indigo: "#4e68cc",
  teal: "#208890",
  red: "#b85048",
  amber: "#987028",
  blue: "#3870b8",
};

export function identityColor(name: IdentityColorName): string {
  return IDENTITY_COLORS[name];
}

// The same ten identities used as *foreground* — a glyph or a label painted directly on the
// row — rather than as a fill with a white letter on top. That is a different contrast
// problem and the fill table cannot solve it: clearing 4.5:1 against a near-white surface
// needs luminance <= 0.183, and against the dark sidebar it needs >= 0.212, so no single hex
// serves both. Hence one set per scheme. The hue is what identifies a host, and the hue is
// unchanged from IDENTITY_COLORS above; only lightness moves.
//
// The geometry is deliberately the status family's, not a band of its own: same lightness,
// same chroma fraction as statusSuccess and friends in theme.ts. A sidebar meta row puts a
// host badge next to a CI check and a diff stat, and if the two families sit at different
// lightness the louder one wins an argument it should not be having — the fill table's
// L=0.571 against status dark's L=0.700 is exactly why a passing check used to shout over a
// host name. Anything that changes the status band has to change this one with it.
const IDENTITY_FOREGROUND_LIGHT: Record<IdentityColorName, string> = {
  // L=0.50, chroma 60% of gamut max — 5.3:1 to 5.8:1 on the light sidebar
  violet: "#6f5aa5",
  sky: "#508baf",
  emerald: "#56a985",
  orange: "#aa7d55",
  pink: "#a05f87",
  indigo: "#5567aa",
  teal: "#4fa9b0",
  red: "#a1635e",
  amber: "#ac8c53",
  blue: "#577aa8",
};

const IDENTITY_FOREGROUND_DARK: Record<IdentityColorName, string> = {
  // L=0.70, chroma 55% of gamut max — 6.3:1 to 7.2:1 on the dark sidebar
  violet: "#a99ec7",
  sky: "#99b9cc",
  emerald: "#9cc9b5",
  orange: "#cab19b",
  pink: "#c4a1b7",
  indigo: "#9ba5ca",
  teal: "#98c9cd",
  red: "#c5a3a0",
  amber: "#cbba9a",
  blue: "#9cb0c9",
};

export function identityForeground(name: IdentityColorName, colorScheme: "light" | "dark"): string {
  return colorScheme === "light" ? IDENTITY_FOREGROUND_LIGHT[name] : IDENTITY_FOREGROUND_DARK[name];
}

/** The same hue at 10% alpha, for fills that sit behind text of the full-strength color. */
export function identityTint(name: IdentityColorName): string {
  return `${IDENTITY_COLORS[name]}1a`;
}

function hashIdentityKey(key: string): number {
  let hash = 0;
  for (const character of key) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash;
}

export function deriveIdentityColorName(key: string): IdentityColorName {
  return IDENTITY_COLOR_NAMES[hashIdentityKey(key) % IDENTITY_COLOR_NAMES.length];
}
