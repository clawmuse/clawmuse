import {
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import {
  goalActions,
  goalExecutionTarget,
  goalBudgetProgress,
  goalStatusBadgeVariant,
  goalStatusLabelKey,
  type GoalAction,
} from "@/clawmuse-status/goals/presentation";
import { useGoalsStore, type GoalActionId, type ActionInput } from "@/clawmuse-status/goals/store";
import { initialGoalTarget } from "@/clawmuse-status/goals/target";
import type {
  Goal,
  GoalDetail,
  GoalRepo,
  GoalReport,
  GoalRun,
  GoalTarget,
} from "@/clawmuse-status/goals/types";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "@/components/ui/external-link";
import { Field } from "@/components/ui/form-field";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "@/components/ui/status-badge";
import { confirmDialog } from "@/utils/confirm-dialog";
import { formatTimeAgo } from "@/utils/time";
import {
  getClawMuseStatusBindingSnapshot,
  subscribeClawMuseStatusBindings,
} from "@/clawmuse-status/binding-state";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { GoalDictationInput } from "./goal-dictation-input";
import { TaskReviewForm } from "./task-review-form";
import { GoalTargetFields } from "./goal-target-fields";

interface GoalDetailSheetProps {
  onCreateSubtask?: (parent: Goal) => void;
  visible: boolean;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function TaskLink({ id, label }: { id: string; label: string }) {
  const open = useCallback(() => void useGoalsStore.getState().openDetail(id), [id]);
  return (
    <Button variant="ghost" size="sm" onPress={open}>
      {label}
    </Button>
  );
}

function TaskRelations({
  goal,
  onCreateSubtask,
}: {
  goal: GoalDetail;
  onCreateSubtask?: (goal: Goal) => void;
}) {
  const { t } = useTranslation();
  const add = useCallback(() => onCreateSubtask?.(goal), [goal, onCreateSubtask]);
  const canAdd =
    onCreateSubtask && goal.source && goal.status !== "done" && goal.status !== "discarded";
  return (
    <View style={styles.section}>
      {goal.parentGoalId ? (
        <TaskLink
          id={goal.parentGoalId}
          label={t("clawmuseStatus.goals.tasks.parent", {
            title: goal.parentGoalTitle ?? goal.parentGoalId,
          })}
        />
      ) : null}
      {goal.source?.url ? (
        <ExternalLink href={goal.source.url} label={t("clawmuseStatus.goals.tasks.openSource")} />
      ) : null}
      {goal.blockedBy?.length ? (
        <Alert description={t("clawmuseStatus.goals.tasks.waitingDependencies")} />
      ) : null}
      {goal.dependsOn?.map((id) => (
        <TaskLink key={id} id={id} label={t("clawmuseStatus.goals.tasks.dependency", { id })} />
      ))}
      {goal.children?.map((child) => (
        <TaskLink
          key={child.id}
          id={child.id}
          label={`${child.title} · ${t(`clawmuseStatus.goals.status.${child.status}`)}`}
        />
      ))}
      {canAdd ? (
        <Button variant="outline" size="sm" onPress={add} testID="goal-add-task">
          {t("clawmuseStatus.goals.tasks.addTask")}
        </Button>
      ) : null}
    </View>
  );
}

function TaskReviewSection({ goal }: { goal: GoalDetail }) {
  if (
    !goal.source ||
    goal.status !== "needs_review" ||
    (goal.reviewReason === "completed" &&
      !goal.latestReport?.evidence?.checks.some((check) => check.result !== "passed")) ||
    !goal.currentRun
  )
    return null;
  if (!["succeeded", "failed"].includes(goal.currentRun.status)) return null;
  return <TaskReviewForm key={goal.currentRun.id} goalId={goal.id} runId={goal.currentRun.id} />;
}

function ReportRow({ report }: { report: GoalReport }): ReactElement {
  const { t } = useTranslation();
  return (
    <View style={styles.report}>
      <View style={styles.reportHeader}>
        <Text style={styles.reportKind}>{t(`clawmuseStatus.goals.reportKind.${report.kind}`)}</Text>
        <Text style={styles.reportTime}>{formatTimeAgo(new Date(report.createdAt))}</Text>
      </View>
      <Text style={styles.reportMessage}>{report.message}</Text>
      {report.evidence ? (
        <View style={styles.section}>
          <Text style={styles.meta}>
            {t("clawmuseStatus.goals.tasks.revision", { revision: report.evidence.revision })}
          </Text>
          {report.evidence.checks.map((check) => (
            <Text key={check.name} style={styles.reportMessage}>
              {t(`clawmuseStatus.goals.tasks.check.${check.result}`)} · {check.name}
              {check.detail ? ` — ${check.detail}` : ""}
            </Text>
          ))}
          {report.evidence.artifacts.map((artifact) => (
            <ExternalLink key={artifact.url} href={artifact.url} label={artifact.label} />
          ))}
        </View>
      ) : null}
      {report.prUrl ? (
        <ExternalLink href={report.prUrl} label={t("clawmuseStatus.goals.detail.openPr")} />
      ) : null}
    </View>
  );
}

function RunRow({ run, onClose }: { run: GoalRun; onClose: () => void }): ReactElement {
  const { t } = useTranslation();
  const bindings = useSyncExternalStore(
    subscribeClawMuseStatusBindings,
    getClawMuseStatusBindingSnapshot,
  );
  const executionTarget = goalExecutionTarget(run, bindings.hosts);
  const openExecution = useCallback(() => {
    if (!executionTarget) return;
    onClose();
    navigateToAgent({ ...executionTarget, pin: true });
  }, [executionTarget, onClose]);
  const when = run.finishedAt ?? run.startedAt ?? run.createdAt;
  const host = run.hostDisplayName
    ? ` · ${t("clawmuseStatus.goals.detail.onHost", { host: run.hostDisplayName })}`
    : "";
  return (
    <View style={styles.run}>
      <Text style={styles.runText} numberOfLines={2}>
        {t(`clawmuseStatus.goals.runKind.${run.kind}`)} ·{" "}
        {t(`clawmuseStatus.goals.runStatus.${run.status}`)}
        {host}
      </Text>
      <Text style={styles.reportTime}>{formatTimeAgo(new Date(when))}</Text>
      {run.instruction ? (
        <Text style={styles.runInstruction}>
          {t("clawmuseStatus.goals.detail.instruction")}: {run.instruction}
        </Text>
      ) : null}
      {run.agentRef && run.relayHostId ? (
        <Button size="sm" variant="outline" onPress={openExecution} disabled={!executionTarget}>
          {t("clawmuseStatus.goals.detail.openExecution")}
        </Button>
      ) : null}
      {run.outcome ? <Text style={styles.runInstruction}>{run.outcome}</Text> : null}
    </View>
  );
}

function GoalExecutionRecovery({
  unconfirmed,
  confirming,
  confirmed,
  onConfirm,
}: {
  unconfirmed: boolean;
  confirming: boolean;
  confirmed: boolean;
  onConfirm: (value: boolean) => void;
}): ReactElement | null {
  const { t } = useTranslation();
  if (!unconfirmed) return null;
  return (
    <>
      <Alert variant="warning" description={t("clawmuseStatus.goals.executionUnconfirmed")} />
      {confirming ? (
        <View style={styles.confirmExecution}>
          <Text style={[styles.paragraph, styles.confirmExecutionLabel]}>
            {t("clawmuseStatus.goals.confirmExecutionStopped")}
          </Text>
          <Switch
            value={confirmed}
            onValueChange={onConfirm}
            accessibilityLabel={t("clawmuseStatus.goals.confirmExecutionStopped")}
            testID="goal-confirm-execution-stopped"
          />
        </View>
      ) : null}
    </>
  );
}

interface ActionButtonProps {
  action: GoalAction;
  pending: boolean;
  onPress: (action: GoalAction) => void;
}

function ActionButton({ action, pending, onPress }: ActionButtonProps): ReactElement {
  const { t } = useTranslation();
  const handlePress = useCallback(() => onPress(action), [action, onPress]);
  return (
    <Button
      style={styles.footerButton}
      variant={action.primary ? "default" : "outline"}
      disabled={pending}
      loading={pending && action.primary}
      onPress={handlePress}
      testID={`goal-action-${action.id}`}
    >
      {t(`clawmuseStatus.goals.actions.${action.id}`)}
    </Button>
  );
}

type SetupMode = "accept" | "continue";

/**
 * The target a setup form starts from. Accepting a suggestion starts from the
 * project's remembered choice; continuing starts from the goal's own target, so
 * "automatic" stays automatic instead of picking up someone else's preference.
 */
function GoalSetupFields({
  mode,
  goal,
  repo,
  target,
  onTarget,
  instruction,
  onInstruction,
}: {
  mode: SetupMode | null;
  goal: GoalDetail;
  repo: GoalRepo | null;
  target: GoalTarget;
  onTarget: (target: GoalTarget) => void;
  instruction: string;
  onInstruction: (value: string) => void;
}) {
  const { t } = useTranslation();
  if (!mode || goal.attachedAgentRef) return null;
  return (
    <>
      <GoalTargetFields
        repo={repo}
        value={target}
        onChange={onTarget}
        kind="execute"
        testIDPrefix={`goal-${mode}`}
      />
      {mode === "continue" ? (
        <Field
          label={t("clawmuseStatus.goals.continue.instructionLabel")}
          hint={t("clawmuseStatus.goals.continue.instructionHint")}
        >
          <GoalDictationInput
            repo={repo}
            target={target}
            initialValue={instruction}
            onChangeText={onInstruction}
            testID="goal-continue-instruction"
          />
        </Field>
      ) : null}
    </>
  );
}

function setupTarget(mode: SetupMode, goal: GoalDetail, repo: GoalRepo | null): GoalTarget {
  if (mode === "accept") {
    return initialGoalTarget({ repo, kind: "execute" });
  }
  return { hostId: goal.hostId, agent: goal.agent };
}

/**
 * The whole goal: card text, the structured report history, runs with their
 * hosts, and the actions the current state allows. Accept and continue open an
 * inline setup (host, model, and an instruction for continue) prefilled with
 * the remembered choice, instead of a second sheet.
 */
export function GoalDetailSheet({
  visible,
  onClose,
  onCreateSubtask,
}: GoalDetailSheetProps): ReactElement | null {
  const { t } = useTranslation();
  const detail = useGoalsStore((state) => state.detail);
  const pendingActionGoalId = useGoalsStore((state) => state.pendingActionGoalId);
  const act = useGoalsStore((state) => state.act);
  const repos = useGoalsStore((state) => state.repos);
  const [setupMode, setSetupMode] = useState<SetupMode | null>(null);
  const [instruction, setInstruction] = useState("");
  const [executionStoppedConfirmed, setExecutionStoppedConfirmed] = useState(false);
  const [target, setTarget] = useState<GoalTarget>({ hostId: null, agent: null });
  const [actionError, setActionError] = useState<string | null>(null);

  const goal = detail?.goal ?? null;
  const repo = useMemo(
    () => (goal ? (repos.find((candidate) => candidate.repoKey === goal.repoKey) ?? null) : null),
    [goal, repos],
  );
  const isPending = detail !== null && pendingActionGoalId === detail.goalId;

  const runAction = useCallback(
    async (action: GoalActionId, input?: ActionInput) => {
      if (!goal) {
        return;
      }
      if (action === "discard") {
        const confirmed = await confirmDialog({
          title: t("clawmuseStatus.goals.confirmDiscard.title"),
          message: t("clawmuseStatus.goals.confirmDiscard.message"),
          confirmLabel: t("clawmuseStatus.goals.actions.discard"),
          cancelLabel: t("clawmuseStatus.goals.actions.cancel"),
          destructive: true,
        });
        if (!confirmed) {
          return;
        }
      }
      setActionError(null);
      try {
        await act(goal.id, action, input);
        setSetupMode(null);
        setInstruction("");
        if (action === "discard" || action === "approve") {
          onClose();
        }
      } catch (error) {
        setActionError(error instanceof Error ? error.message : String(error));
      }
    },
    [act, goal, onClose, t],
  );

  const onActionPress = useCallback(
    (action: GoalAction) => {
      if (action.setup && goal) {
        setExecutionStoppedConfirmed(false);
        setTarget(setupTarget(action.setup, goal, repo));
        setSetupMode(action.setup);
        return;
      }
      void runAction(action.id);
    },
    [goal, repo, runAction],
  );
  const leaveSetupMode = useCallback(() => setSetupMode(null), []);
  // The target is always sent explicitly so the service remembers it.
  const submitSetup = useCallback(() => {
    if (setupMode === "accept") {
      void runAction("accept", { target });
      return;
    }
    const trimmed = instruction.trim();
    if (goal?.executionUnconfirmed && !executionStoppedConfirmed) return;
    void runAction("continue", {
      ...(trimmed && !goal?.attachedAgentRef ? { instruction: trimmed } : {}),
      ...(!goal?.attachedAgentRef ? { target } : {}),
      confirmExecutionStopped: executionStoppedConfirmed,
    });
  }, [instruction, runAction, setupMode, target, goal, executionStoppedConfirmed]);

  const header = useMemo<SheetHeader>(
    () => ({
      title: goal?.title ?? t("clawmuseStatus.goals.title"),
      subtitle: goal ? (
        <Text style={styles.reportTime} numberOfLines={1}>
          {goal.repoDisplayName}
        </Text>
      ) : undefined,
    }),
    [goal, t],
  );

  const footer = useMemo(() => {
    if (!goal) {
      return null;
    }
    if (setupMode) {
      return (
        <View style={styles.footer}>
          <Button
            style={styles.footerButton}
            variant="secondary"
            onPress={leaveSetupMode}
            disabled={isPending}
          >
            {t("clawmuseStatus.goals.actions.cancel")}
          </Button>
          <Button
            style={styles.footerButton}
            variant="default"
            loading={isPending}
            onPress={submitSetup}
            disabled={
              setupMode === "continue" &&
              goal.executionUnconfirmed === true &&
              !executionStoppedConfirmed
            }
            testID={`goal-${setupMode}-submit`}
          >
            {t(
              setupMode === "accept"
                ? "clawmuseStatus.goals.target.start"
                : "clawmuseStatus.goals.continue.submit",
            )}
          </Button>
        </View>
      );
    }
    const actions = goalActions(goal);
    if (actions.length === 0) {
      return null;
    }
    return (
      <View style={styles.footer}>
        {actions.map((action) => (
          <ActionButton
            key={action.id}
            action={action}
            pending={isPending}
            onPress={onActionPress}
          />
        ))}
      </View>
    );
  }, [
    goal,
    isPending,
    leaveSetupMode,
    onActionPress,
    setupMode,
    submitSetup,
    t,
    executionStoppedConfirmed,
  ]);

  if (!detail) {
    return null;
  }

  return (
    <AdaptiveModalSheet
      header={header}
      visible={visible}
      onClose={onClose}
      footer={footer}
      testID="goal-detail-sheet"
    >
      {detail.status === "loading" && !goal ? (
        <View style={styles.centered}>
          <LoadingSpinner color={styles.spinner.color} />
        </View>
      ) : null}
      {detail.status === "error" ? (
        <Alert
          variant="error"
          title={t("clawmuseStatus.goals.loadFailed", { message: detail.error ?? "" })}
        />
      ) : null}
      {goal ? (
        <View style={styles.content}>
          <TaskRelations goal={goal} onCreateSubtask={onCreateSubtask} />
          <View style={styles.badges}>
            <StatusBadge
              label={t(goalStatusLabelKey(goal))}
              variant={goalStatusBadgeVariant(goal)}
            />
            <Text style={styles.meta}>
              {t("clawmuseStatus.goals.budget", goalBudgetProgress(goal))}
              {" · "}
              {t(`clawmuseStatus.goals.origin.${goal.origin}`)}
            </Text>
          </View>
          {goal.status !== "suggested" ? (
            <Text style={styles.meta}>
              {t("clawmuseStatus.goals.target.summary", {
                host: goal.hostDisplayName ?? t("clawmuseStatus.goals.target.autoHost"),
                model: goal.agent ?? t("clawmuseStatus.goals.target.hostDefaultModel"),
              })}
            </Text>
          ) : null}
          {actionError ? <Alert variant="error" title={actionError} /> : null}
          <GoalSetupFields
            mode={setupMode}
            goal={goal}
            repo={repo}
            target={target}
            onTarget={setTarget}
            instruction={instruction}
            onInstruction={setInstruction}
          />
          <Text style={styles.paragraph}>{t("clawmuseStatus.goals.executionScope")}</Text>
          <GoalExecutionRecovery
            unconfirmed={goal.executionUnconfirmed === true}
            confirming={setupMode === "continue"}
            confirmed={executionStoppedConfirmed}
            onConfirm={setExecutionStoppedConfirmed}
          />
          {setupMode === "continue" && goal.runsUsed >= goal.budgetRuns ? (
            <Text style={styles.paragraph}>{t("clawmuseStatus.goals.continueAddsRun")}</Text>
          ) : null}
          <Section title={t("clawmuseStatus.goals.detail.summary")}>
            <Text style={styles.paragraph}>{goal.summary}</Text>
          </Section>
          <Section title={t("clawmuseStatus.goals.detail.acceptance")}>
            <Text style={styles.paragraph}>{goal.acceptance}</Text>
          </Section>
          {goal.attachedAgentRef ? (
            <Text style={styles.paragraph}>{t("clawmuseStatus.goals.tasks.attachedHint")}</Text>
          ) : null}
          <TaskReviewSection goal={goal} />
          <Section title={t("clawmuseStatus.goals.detail.reports")}>
            {goal.reports.length === 0 ? (
              <Text style={styles.empty}>{t("clawmuseStatus.goals.detail.noReports")}</Text>
            ) : (
              goal.reports.map((report) => <ReportRow key={report.id} report={report} />)
            )}
          </Section>
          {goal.runs.length > 0 ? (
            <Section title={t("clawmuseStatus.goals.detail.runs")}>
              {goal.runs.map((run) => (
                <RunRow key={run.id} run={run} onClose={onClose} />
              ))}
            </Section>
          ) : null}
        </View>
      ) : null}
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  confirmExecution: { flexDirection: "row", alignItems: "center", gap: theme.spacing[3] },
  confirmExecutionLabel: { flex: 1 },
  content: {
    gap: theme.spacing[4],
    paddingBottom: theme.spacing[4],
  },
  centered: {
    paddingVertical: theme.spacing[8],
    alignItems: "center",
  },
  spinner: {
    color: theme.colors.foregroundMuted,
  },
  badges: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flexWrap: "wrap",
  },
  meta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  section: {
    gap: theme.spacing[2],
  },
  sectionTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  paragraph: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    lineHeight: theme.fontSize.base * 1.5,
  },
  empty: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  report: {
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  reportHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  reportKind: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  reportTime: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  reportMessage: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm * 1.5,
  },
  run: {
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  runText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  runInstruction: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  multiline: {
    minHeight: 88,
  },
  footer: {
    flexDirection: "row",
    gap: theme.spacing[2],
  },
  footerButton: {
    flex: 1,
  },
}));
