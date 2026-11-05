import type { PluginHostProps } from "@getpaseo/plugin/client";

export function previewStyles({ theme, layout }: Pick<PluginHostProps, "theme" | "layout">) {
  const colors = theme.colors;
  return {
    root: {
      flex: 1,
      padding: layout.compact ? 8 : 16,
      gap: layout.compact ? 8 : 12,
      backgroundColor: colors.surface0,
    },
    row: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      gap: layout.compact ? 6 : 8,
      alignItems: "center" as const,
    },
    text: { color: colors.foreground },
    detail: { color: colors.foregroundMuted, fontSize: 12 },
    error: {
      color: colors.foreground,
      backgroundColor: colors.surface2,
      padding: layout.compact ? 8 : 12,
    },
    list: { maxHeight: layout.compact ? 180 : 220 },
    listContent: { gap: layout.compact ? 6 : 8 },
    viewer: {
      flex: 1,
      minHeight: 100,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: colors.surface1,
      overflow: "hidden" as const,
    },
  };
}
export type PreviewStyles = ReturnType<typeof previewStyles>;
