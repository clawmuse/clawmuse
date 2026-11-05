import { memo } from "react";
import { Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { contentText } from "@/styles/content-text";

// The web Markdown renderer and RN web Text both resolve fonts through CSS.
// Keep Text's single-line ellipsis: the library's line clamp is native-only.
export const ContentLabel = memo(function ContentLabel({ text }: { text: string }) {
  return (
    <Text style={styles.label} numberOfLines={1}>
      {text}
    </Text>
  );
});

const styles = StyleSheet.create((theme) => ({
  label: {
    ...contentText(theme),
    fontWeight: theme.fontWeight.medium,
    flex: 1,
    minWidth: 0,
  },
}));
