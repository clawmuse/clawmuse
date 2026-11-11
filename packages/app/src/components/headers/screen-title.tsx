import { useMemo, type ReactNode } from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { densityText } from "@/styles/density";

interface ScreenTitleProps {
  children: ReactNode;
  numberOfLines?: number;
  testID?: string;
  style?: StyleProp<TextStyle>;
}

/**
 * Canonical screen title for use inside `ScreenHeader`. One typography, one
 * color, responsive weight. Leading icons are siblings (HeaderToggleButton,
 * HeaderIconBadge) — never nested inside this component.
 */
export function ScreenTitle({ children, numberOfLines = 1, testID, style }: ScreenTitleProps) {
  const combinedStyle = useMemo(() => [styles.text, style], [style]);
  return (
    <Text style={combinedStyle} numberOfLines={numberOfLines} testID={testID}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create((theme) => ({
  text: {
    flexShrink: 1,
    minWidth: 0,
    ...densityText(theme, "title"),
    fontWeight: {
      xs: theme.fontWeight.semibold,
      md: theme.fontWeight.medium,
    },
    color: theme.colors.foreground,
  },
}));
