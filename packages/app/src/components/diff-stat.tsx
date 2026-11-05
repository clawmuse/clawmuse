import { View, Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { formatDiffCount } from "@/git/file-header-presentation";

interface DiffStatProps {
  additions: number;
  deletions: number;
  testID?: string;
  stacked?: boolean;
}

export function DiffStat({ additions, deletions, testID, stacked = false }: DiffStatProps) {
  return (
    <View style={stacked ? styles.stack : styles.row} testID={testID}>
      <Text style={[styles.additions, stacked && styles.stackedCount]}>
        +{formatDiffCount(additions)}
      </Text>
      <Text style={[styles.deletions, stacked && styles.stackedCount]}>
        -{formatDiffCount(deletions)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    height: 20,
    gap: 4,
    flexShrink: 0,
  },
  stack: {
    alignItems: "flex-end",
    flexShrink: 0,
  },
  stackedCount: {
    fontSize: (theme.fontSize.sm * 5) / 6,
    lineHeight: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  additions: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.statusSuccess,
  },
  deletions: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.statusDanger,
  },
}));
