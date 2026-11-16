import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import {
  goalBudgetProgress,
  goalStatusBadgeVariant,
  goalStatusLabelKey,
} from "@/clawmuse-status/goals/presentation";
import type { Goal } from "@/clawmuse-status/goals/types";
import { PressHighlight } from "@/components/ui/press-highlight";
import { StatusBadge } from "@/components/ui/status-badge";
import { GoalEvidenceBadge } from "./goal-evidence-badge";
import { formatTimeAgo } from "@/utils/time";

interface GoalRowProps {
  goal: Goal;
  onPress: (goal: Goal) => void;
  inBoard?: boolean;
}

/** Project, host, and either budget (once accepted) or who proposed it. */
function metaLine(goal: Goal, t: TFunction): string {
  const parts = [goal.repoDisplayName];
  if (goal.parentGoalTitle) {
    parts.push(t("clawmuseStatus.goals.tasks.parent", { title: goal.parentGoalTitle }));
  }
  if (goal.source && goal.source.kind !== "manual" && goal.source.kind !== "planner") {
    parts.push(t(`clawmuseStatus.goals.tasks.source.${goal.source.kind}`));
  }
  const host = goal.currentRun?.hostDisplayName ?? goal.hostDisplayName;
  if (host) {
    parts.push(t("clawmuseStatus.goals.detail.onHost", { host }));
  }
  if (goal.status === "suggested") {
    if (goal.origin === "planner") {
      parts.push(t("clawmuseStatus.goals.origin.planner"));
    }
  } else {
    parts.push(t("clawmuseStatus.goals.budget", goalBudgetProgress(goal)));
  }
  if (goal.children && goal.children.length > 0) {
    const done = goal.children.filter((child) => child.status === "done").length;
    parts.push(
      t("clawmuseStatus.goals.tasks.subtasksProgress", {
        done,
        total: goal.children.length,
      }),
    );
  }
  return parts.join(" · ");
}

function bodyLine(goal: Goal, t: TFunction): string {
  if (!goal.latestReport) {
    return goal.summary;
  }
  return `${t(`clawmuseStatus.goals.reportKind.${goal.latestReport.kind}`)} · ${goal.latestReport.message}`;
}

/**
 * One goal card. Title and project on the first line, the agent's latest report
 * underneath, status and budget as metadata. Everything else lives in the detail
 * sheet so the list stays scannable on a phone.
 */
export const GoalRow = memo(function GoalRow({ goal, onPress, inBoard = false }: GoalRowProps) {
  const { t } = useTranslation();
  const handlePress = useCallback(() => onPress(goal), [goal, onPress]);
  return (
    <PressHighlight
      style={[styles.card, inBoard ? styles.cardInBoard : styles.cardStandalone]}
      highlightStyle={styles.cardHighlight}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={goal.title}
      testID={`goal-row-${goal.id}`}
    >
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={2}>
          {goal.title}
        </Text>
        <StatusBadge label={t(goalStatusLabelKey(goal))} variant={goalStatusBadgeVariant(goal)} />
      </View>
      <GoalEvidenceBadge evidence={goal.latestReport?.evidence} />
      <Text style={styles.meta} numberOfLines={2}>
        {metaLine(goal, t)}
      </Text>
      <Text style={styles.body} numberOfLines={3}>
        {bodyLine(goal, t)}
      </Text>
      <Text style={styles.time}>{formatTimeAgo(new Date(goal.updatedAt))}</Text>
    </PressHighlight>
  );
});

const styles = StyleSheet.create((theme) => ({
  card: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    gap: theme.spacing[1],
  },
  cardStandalone: {
    marginHorizontal: { xs: theme.spacing[3], md: theme.spacing[6] },
  },
  cardInBoard: {
    marginHorizontal: 0,
  },
  cardHighlight: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  title: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  meta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  body: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing[1],
  },
  time: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing[1],
  },
}));
