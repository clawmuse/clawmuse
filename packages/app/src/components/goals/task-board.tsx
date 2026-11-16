import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { useIsCompactFormFactor } from "@/constants/layout";
import { filterForStatus } from "@/clawmuse-status/goals/presentation";
import type { Goal } from "@/clawmuse-status/goals/types";
import { GoalRow } from "./goal-row";

const COLUMNS = [
  { id: "suggested", label: "suggested", empty: "suggested" },
  { id: "active", label: "active", empty: "active" },
  { id: "needs_review", label: "needsReview", empty: "needsReview" },
  { id: "closed", label: "closed", empty: "closed" },
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
      {COLUMNS.map((column) => {
        const columnGoals = goals.filter((goal) => filterForStatus(goal.status) === column.id);
        return (
          <View key={column.id} style={styles.column} testID={`task-column-${column.id}`}>
            <View style={styles.columnHeader}>
              <Text style={styles.title}>{t(`clawmuseStatus.goals.filters.${column.label}`)}</Text>
              <View style={styles.countPill}>
                <Text style={styles.countText}>{columnGoals.length}</Text>
              </View>
            </View>
            {columnGoals.length === 0 ? (
              <View style={styles.emptySlot}>
                <Text style={styles.emptySlotText}>
                  {t(`clawmuseStatus.goals.empty.${column.empty}`)}
                </Text>
              </View>
            ) : (
              columnGoals.map((goal) => (
                <GoalRow key={goal.id} goal={goal} onPress={onPress} inBoard />
              ))
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  board: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[3],
    paddingHorizontal: { xs: theme.spacing[3], md: theme.spacing[6] },
  },
  compact: {
    flexDirection: "column",
  },
  column: {
    flex: 1,
    minWidth: 0,
    width: "100%",
    gap: theme.spacing[2],
  },
  columnHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing[1],
    paddingBottom: theme.spacing[1],
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
  countPill: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface2,
  },
  countText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  emptySlot: {
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.colors.border,
    alignItems: "center",
  },
  emptySlotText: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
}));
