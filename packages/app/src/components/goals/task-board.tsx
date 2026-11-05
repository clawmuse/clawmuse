import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { useIsCompactFormFactor } from "@/constants/layout";
import { filterForStatus } from "@/clawmuse-status/goals/presentation";
import type { Goal } from "@/clawmuse-status/goals/types";
import { GoalRow } from "./goal-row";

const COLUMNS = [
  { id: "suggested", label: "suggested" },
  { id: "active", label: "active" },
  { id: "needs_review", label: "needsReview" },
  { id: "closed", label: "closed" },
] as const;

export function TaskBoard({
  goals,
  onPress,
}: {
  goals: readonly Goal[];
  onPress: (goal: Goal) => void;
}) {
  const { t } = useTranslation();
  const compact = useIsCompactFormFactor();
  return (
    <View style={[styles.board, compact && styles.compact]} testID="task-board">
      {COLUMNS.map((column) => (
        <View key={column.id} style={styles.column} testID={`task-column-${column.id}`}>
          <Text style={styles.title}>{t(`clawmuseStatus.goals.filters.${column.label}`)}</Text>
          {goals
            .filter((goal) => filterForStatus(goal.status) === column.id)
            .map((goal) => (
              <GoalRow key={goal.id} goal={goal} onPress={onPress} />
            ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  board: { flexDirection: "row", alignItems: "flex-start", gap: theme.spacing[2] },
  compact: { flexDirection: "column" },
  column: { flex: 1, minWidth: 0, width: "100%", gap: theme.spacing[3] },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
    paddingHorizontal: theme.spacing[4],
  },
}));
