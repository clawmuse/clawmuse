import { lightHighlightColors } from "@getpaseo/highlight";

const testTheme = {
  colorScheme: "light",
  colors: {
    syntax: lightHighlightColors,
    foreground: "#111111",
    foregroundMuted: "#666666",
    statusSuccess: "#15803d",
    statusDanger: "#b91c1c",
    statusWarning: "#d97706",
    statusMerged: "#7c3aed",
    // Same rule as the real theme: the status color at 12%.
    statusSuccessTint: "#15803d1f",
    statusDangerTint: "#b91c1c1f",
    statusWarningTint: "#d977061f",
    // The light band's values, so a test can name the colour it expects.
    statusDotSuccess: "#299f51",
    statusDotDanger: "#f12e2f",
    statusDotWarning: "#b37824",
    statusDotRunning: "#268ae0",
    accent: "#2563eb",
    accentForeground: "#ffffff",
    destructive: "#dc2626",
    destructiveForeground: "#ffffff",
    surface1: "#fafafa",
    surface2: "#f4f4f5",
    surface3: "#e4e4e7",
    border: "#e4e4e7",
    borderAccent: "#a1a1aa",
    palette: {
      amber: { 500: "#f59e0b" },
      blue: { 300: "#93c5fd" },
      green: { 500: "#22c55e" },
      red: { 300: "#fca5a5" },
      white: "#ffffff",
      zinc: { 600: "#52525b" },
    },
  },
  borderWidth: { 1: 1 },
  spacing: [0, 4, 8, 12, 16, 20, 24, 28, 32],
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
  },
  fontFamily: {
    ui: "sans-serif",
    mono: "monospace",
  },
  fontWeight: {
    normal: "400",
    medium: "500",
  },
  borderRadius: {
    base: 4,
    md: 6,
    lg: 8,
    xl: 12,
    full: 9999,
  },
  iconSize: { sm: 16, md: 20 },
  opacity: { 50: 0.5 },
  shadow: {
    sm: {
      shadowColor: "rgba(0, 0, 0, 0.02)",
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 8,
      elevation: 2,
    },
    md: {
      shadowColor: "rgba(0, 0, 0, 0.04)",
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 16,
      elevation: 4,
    },
    lg: {
      shadowColor: "rgba(0, 0, 0, 0.08)",
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 24,
      elevation: 8,
    },
  },
};

type StyleFactory<T> = (theme: typeof testTheme) => T;

function isStyleFactory<T>(styles: T | StyleFactory<T>): styles is StyleFactory<T> {
  return typeof styles === "function";
}

// Resolve responsive values before React Native Web sees them. Passing an object as a
// font size leaves the browser default in place and hides the authored size hierarchy.
function resolveBreakpoints(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const entries = Object.entries(value);
  const breakpoints: Record<string, number> = { xs: 0, sm: 576, md: 600, lg: 992, xl: 1200 };
  if (entries.length > 0 && entries.every(([key]) => key in breakpoints)) {
    const width = typeof window === "undefined" ? 1024 : window.innerWidth;
    const active = entries
      .filter(([key]) => breakpoints[key] <= width)
      .sort(([a], [b]) => breakpoints[b] - breakpoints[a])[0];
    return resolveBreakpoints(active?.[1]);
  }
  return Object.fromEntries(entries.map(([key, child]) => [key, resolveBreakpoints(child)]));
}

export const StyleSheet = {
  absoluteFill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  create: <T>(styles: T | StyleFactory<T>): T =>
    resolveBreakpoints(isStyleFactory(styles) ? styles(testTheme) : styles) as T,
};

export const withUnistyles = <T>(Component: T): T => Component;

export const useUnistyles = () => ({
  theme: testTheme,
  rt: {},
  breakpoint: undefined,
});

export const UnistylesRuntime = {
  setTheme: () => undefined,
  themeName: "light",
};
