import type { ReactElement } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { GoalEvidence } from "@/clawmuse-status/goals/types";

export type GoalEvidenceBadgeState =
  | "executor"
  | "owner"
  | "verified"
  | "verification_failed"
  | null;

export function goalEvidenceBadgeState(
  evidence: GoalEvidence | null | undefined,
): GoalEvidenceBadgeState {
  if (!evidence) return null;
  if (evidence.source === "verifier") {
    return evidence.checks.every((check) => check.result === "passed") &&
      /^[0-9a-f]{40}$/i.test(evidence.headSha ?? "")
      ? "verified"
      : "verification_failed";
  }
  return evidence.source === "owner" ? "owner" : "executor";
}

function labelFor(state: Exclude<GoalEvidenceBadgeState, null>, evidence: GoalEvidence): string {
  switch (state) {
    case "verified":
      return `独立实测通过 · ${(evidence.headSha ?? evidence.revision).slice(0, 12)}`;
    case "verification_failed":
      return "独立核验未通过或已失效";
    case "owner":
      return "主人核对证据";
    case "executor":
      return "执行器自报证据";
  }
}

export function GoalEvidenceBadge({
  evidence,
}: {
  evidence: GoalEvidence | null | undefined;
}): ReactElement | null {
  const state = goalEvidenceBadgeState(evidence);
  if (!state || !evidence) return null;
  return (
    <View
      style={[styles.badge, state === "verified" ? styles.verified : styles.unverified]}
      accessibilityLabel={labelFor(state, evidence)}
    >
      <Text style={styles.label}>{labelFor(state, evidence)}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  badge: {
    alignSelf: "flex-start",
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  verified: {
    backgroundColor: theme.colors.statusSuccessTint,
  },
  unverified: {
    backgroundColor: theme.colors.statusWarningTint,
  },
  label: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
}));
