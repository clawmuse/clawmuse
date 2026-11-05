import { StyleSheet } from "react-native-unistyles";
import { densityText } from "./density";

export const settingsStyles = StyleSheet.create((theme) => ({
  section: {
    marginBottom: theme.spacing[6],
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: theme.spacing[3],
    marginLeft: theme.spacing[1],
  },
  sectionHeaderTitle: {
    color: theme.colors.foregroundMuted,
    ...densityText(theme, "footnote"),
    fontWeight: { xs: theme.fontWeight.semibold, md: theme.fontWeight.normal },
  },
  sectionHeaderLink: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing[1],
  },
  sectionHeaderLinkText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  card: {
    backgroundColor: theme.colors.surface1,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[4],
  },
  rowBorder: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  rowContent: {
    flex: 1,
    marginRight: theme.spacing[3],
  },
  rowTitle: {
    color: theme.colors.foreground,
    ...densityText(theme, "label"),
  },
  rowHint: {
    color: theme.colors.foregroundMuted,
    ...densityText(theme, "footnote"),
    marginTop: theme.spacing[1],
  },
  rowError: {
    color: theme.colors.statusDanger,
    ...densityText(theme, "footnote"),
    marginTop: theme.spacing[1],
  },
}));
