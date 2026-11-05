import { memo } from "react";
import { View } from "react-native";
import { EnrichedMarkdownText } from "react-native-enriched-markdown";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
import { createMarkdownStyles } from "./styles";
import { contentLabelSource } from "./content-label-source";

const ThemedMarkdown = withUnistyles(EnrichedMarkdownText);
const labelStyle = (theme: Theme) => {
  const { markdownStyle, ...rest } = createMarkdownStyles(theme, { blockGap: 0 });
  return {
    ...rest,
    markdownStyle: {
      ...markdownStyle,
      paragraph: { ...markdownStyle.paragraph, fontWeight: theme.fontWeight.medium },
    },
  };
};

// Use the reply renderer's font and text layout, not RN Text's independently resolved font.
// CommonMark supports native single-line truncation.
export const ContentLabel = memo(function ContentLabel({ text }: { text: string }) {
  return (
    <View style={styles.label} pointerEvents="none">
      <ThemedMarkdown
        markdown={contentLabelSource(text)}
        uniProps={labelStyle}
        flavor="commonmark"
        numberOfLines={1}
        ellipsizeMode="tail"
        selectable={false}
        accessibilityLabel={text}
        enableLinkPreview={false}
        enableBlockContextMenu={false}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  label: { flex: 1, minWidth: 0 },
});
