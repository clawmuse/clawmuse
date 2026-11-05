import { useCallback, useMemo, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useGoalsStore } from "@/clawmuse-status/goals/store";
import { initialGoalTarget } from "@/clawmuse-status/goals/target";
import type { GoalRepo, GoalTarget } from "@/clawmuse-status/goals/types";
import { GoalTargetFields } from "./goal-target-fields";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SelectField, type SelectFieldDisplay } from "@/components/ui/select-field";
import { Switch } from "@/components/ui/switch";
import { formatTimeAgo } from "@/utils/time";
import { buildRepoOptions } from "./goal-create-sheet";

interface GoalPlanSheetProps {
  visible: boolean;
  onClose: () => void;
  repos: readonly GoalRepo[];
  initialRepoKey: string | null;
}

interface Notice {
  variant: "success" | "info" | "error";
  text: string;
}

/** Where the newest plan run stands, so an empty suggestion list has a reason. */
function LastPlanRunLine({ run }: { run: GoalRepo["lastPlanRun"] }): ReactElement | null {
  const { t } = useTranslation();
  if (!run) {
    return null;
  }
  if (["queued", "leased", "running"].includes(run.status)) {
    return (
      <Text style={styles.fact} testID="goal-plan-last-run-active">
        {t("clawmuseStatus.goals.plan.lastRunActive", {
          host: run.hostDisplayName ?? t("clawmuseStatus.goals.target.autoHost"),
        })}
      </Text>
    );
  }
  if (["failed", "expired", "canceled"].includes(run.status)) {
    return (
      <Text style={styles.warning} testID="goal-plan-last-run-failed">
        {t("clawmuseStatus.goals.plan.lastRunFailed", {
          reason: run.outcome ?? t(`clawmuseStatus.goals.runStatus.${run.status}`),
        })}
      </Text>
    );
  }
  return null;
}

/**
 * Ask the planner for suggestions now, and toggle the daily automatic pass per
 * project. Suggestions are cheap; nothing runs until a card is accepted.
 */
export function GoalPlanSheet({
  visible,
  onClose,
  repos,
  initialRepoKey,
}: GoalPlanSheetProps): ReactElement {
  const { t } = useTranslation();
  const requestPlan = useGoalsStore((state) => state.requestPlan);
  const setRepoPlanEnabled = useGoalsStore((state) => state.setRepoPlanEnabled);
  const [repoKey, setRepoKey] = useState<string | null>(
    initialRepoKey ?? repos[0]?.repoKey ?? null,
  );
  const [isRequesting, setIsRequesting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [target, setTarget] = useState<GoalTarget>(() =>
    initialGoalTarget({
      repo:
        repos.find(
          (candidate) => candidate.repoKey === (initialRepoKey ?? repos[0]?.repoKey ?? null),
        ) ?? null,
      kind: "plan",
    }),
  );

  const repo = repos.find((candidate) => candidate.repoKey === repoKey) ?? null;
  const hasLiveHost = repo?.hosts.some((host) => host.connectivity === "live") ?? false;

  const repoOptions = useMemo(() => buildRepoOptions(repos), [repos]);
  const selectedRepo = useMemo<SelectFieldDisplay | null>(
    () => (repo ? { label: repo.displayName } : null),
    [repo],
  );
  const onRepoChange = useCallback(
    (value: string) => {
      setRepoKey(value);
      setNotice(null);
      setTarget(
        initialGoalTarget({
          repo: repos.find((candidate) => candidate.repoKey === value) ?? null,
          kind: "plan",
        }),
      );
    },
    [repos],
  );

  const request = useCallback(() => {
    if (!repoKey) {
      return;
    }
    setIsRequesting(true);
    setNotice(null);
    const run = async (): Promise<void> => {
      try {
        // Sent explicitly so the service remembers it for this project.
        const outcome = await requestPlan(repoKey, target);
        setNotice(
          outcome === "queued"
            ? { variant: "success", text: t("clawmuseStatus.goals.plan.requested") }
            : { variant: "info", text: t("clawmuseStatus.goals.plan.alreadyOpen") },
        );
      } catch (error) {
        setNotice({
          variant: "error",
          text: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setIsRequesting(false);
      }
    };
    void run();
  }, [repoKey, requestPlan, t, target]);

  const toggleAutoPlan = useCallback(
    (value: boolean) => {
      if (!repoKey) {
        return;
      }
      void setRepoPlanEnabled(repoKey, value).catch((error: unknown) => {
        setNotice({
          variant: "error",
          text: error instanceof Error ? error.message : String(error),
        });
      });
    },
    [repoKey, setRepoPlanEnabled],
  );

  const header = useMemo<SheetHeader>(
    () => ({
      title: t("clawmuseStatus.goals.plan.title"),
      subtitle: <Text style={styles.fact}>{t("clawmuseStatus.goals.plan.hint")}</Text>,
    }),
    [t],
  );
  const footer = useMemo(
    () => (
      <View style={styles.footer}>
        <Button
          style={styles.footerButton}
          variant="secondary"
          onPress={onClose}
          disabled={isRequesting}
        >
          {t("clawmuseStatus.goals.actions.cancel")}
        </Button>
        <Button
          style={styles.footerButton}
          variant="default"
          onPress={request}
          disabled={!repoKey || !hasLiveHost || isRequesting}
          loading={isRequesting}
          testID="goal-plan-request"
        >
          {t("clawmuseStatus.goals.plan.request")}
        </Button>
      </View>
    ),
    [hasLiveHost, isRequesting, onClose, repoKey, request, t],
  );

  const lastPlanned = repo?.lastPlannedAt
    ? t("clawmuseStatus.goals.plan.lastPlanned", {
        when: formatTimeAgo(new Date(repo.lastPlannedAt)),
      })
    : t("clawmuseStatus.goals.plan.neverPlanned");

  return (
    <AdaptiveModalSheet
      header={header}
      visible={visible}
      onClose={onClose}
      footer={footer}
      testID="goal-plan-sheet"
    >
      <View style={styles.content}>
        <SelectField
          label={t("clawmuseStatus.goals.plan.repo")}
          value={repoKey}
          selectedDisplay={selectedRepo}
          options={repoOptions}
          onChange={onRepoChange}
          placeholder={t("clawmuseStatus.goals.create.repoPlaceholder")}
          emptyText={t("clawmuseStatus.goals.create.repoEmpty")}
        />
        {repo ? (
          <View style={styles.repoFacts}>
            <Text style={styles.fact}>{lastPlanned}</Text>
            <LastPlanRunLine run={repo.lastPlanRun} />
            <Text style={styles.fact}>
              {t("clawmuseStatus.goals.plan.suggestedCount", { count: repo.suggestedCount })}
            </Text>
            {!hasLiveHost ? (
              <Text style={styles.warning}>{t("clawmuseStatus.goals.plan.noLiveHost")}</Text>
            ) : null}
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>{t("clawmuseStatus.goals.plan.autoPlan")}</Text>
              <Switch
                value={repo.planEnabled}
                onValueChange={toggleAutoPlan}
                accessibilityLabel={t("clawmuseStatus.goals.plan.autoPlan")}
                testID="goal-plan-auto"
              />
            </View>
          </View>
        ) : null}
        {repo ? (
          <GoalTargetFields
            repo={repo}
            value={target}
            onChange={setTarget}
            kind="plan"
            testIDPrefix="goal-plan"
          />
        ) : null}
        {notice ? <Alert variant={notice.variant} title={notice.text} /> : null}
      </View>
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: {
    gap: theme.spacing[4],
    paddingBottom: theme.spacing[4],
  },
  repoFacts: {
    gap: theme.spacing[2],
  },
  fact: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  warning: {
    color: theme.colors.statusWarning,
    fontSize: theme.fontSize.sm,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
    paddingTop: theme.spacing[2],
  },
  switchLabel: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  footer: {
    flexDirection: "row",
    gap: theme.spacing[2],
  },
  footerButton: {
    flex: 1,
  },
}));
