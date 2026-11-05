import type { Theme } from "@/styles/theme";

export function contentText(
  theme: Theme,
  { compact = false, bold = false }: { compact?: boolean; bold?: boolean } = {},
) {
  const fontSize = compact ? theme.fontSize.base : theme.fontSize.content;
  return {
    fontFamily: theme.fontFamily.ui,
    fontSize,
    fontWeight: bold ? theme.fontWeight.bold : theme.fontWeight.normal,
    lineHeight: Math.round(fontSize * (compact ? 1.4 : 1.6)),
    color: theme.colors.foreground,
  };
}
