import { StyleSheet } from "react-native-unistyles";
import { isNative } from "@/constants/platform";

export const messageActionStyles = StyleSheet.create((theme) => ({
  // Cindy uses 44pt touch targets separated by 2pt, rather than overlapping hitSlop.
  button: {
    minWidth: { xs: 44, md: isNative ? 44 : 0 },
    minHeight: { xs: 44, md: isNative ? 44 : 0 },
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderRadius: theme.borderRadius.full,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    minHeight: { xs: 44, md: isNative ? 44 : 24 },
    gap: { xs: 2, md: isNative ? 2 : theme.spacing[2] },
  },
}));
