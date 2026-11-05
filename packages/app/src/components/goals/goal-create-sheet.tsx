import { randomUUID } from "expo-crypto";
import { useCallback, useMemo, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useGoalsStore } from "@/clawmuse-status/goals/store";
import { initialGoalTarget } from "@/clawmuse-status/goals/target";
import type { Goal, GoalRepo, GoalTarget } from "@/clawmuse-status/goals/types";
import { GoalDictationInput } from "./goal-dictation-input";
import { GoalTargetFields } from "./goal-target-fields";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import {
  SelectField,
  type SelectFieldDisplay,
  type SelectFieldOption,
} from "@/components/ui/select-field";

interface GoalCreateSheetProps {
  parentGoal?: Goal;
  visible: boolean;
  onClose: () => void;
  repos: readonly GoalRepo[];
  /** Pre-selects the project the list is filtered to. */
  initialRepoKey: string | null;
}

const DEFAULT_BUDGET = "3";

function parseBudget(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return 3;
  }
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 50 ? parsed : null;
}

export function buildRepoOptions(repos: readonly GoalRepo[]): SelectFieldOption<string>[] {
  return repos.map((repo) => ({
    id: repo.repoKey,
    value: repo.repoKey,
    label: repo.displayName,
    description: repo.hosts.map((host) => host.displayName).join(", "),
  }));
}

/** Save a draft to decompose work before starting its execution. */
export function GoalCreateSheet({
  visible,
  onClose,
  repos,
  initialRepoKey,
  parentGoal,
}: GoalCreateSheetProps): ReactElement {
  const { t } = useTranslation();
  const createGoal = useGoalsStore((state) => state.createGoal);
  const [requestId] = useState(() => randomUUID());
  const [repoKey, setRepoKey] = useState<string | null>(
    parentGoal?.repoKey ?? initialRepoKey ?? (repos.length === 1 ? repos[0]!.repoKey : null),
  );
  const [draft, setDraft] = useState(false);
  const [dependency, setDependency] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [acceptance, setAcceptance] = useState("");
  const [budget, setBudget] = useState(DEFAULT_BUDGET);
  const [target, setTarget] = useState<GoalTarget>(() =>
    initialGoalTarget({
      repo: repos.find((candidate) => candidate.repoKey === repoKey) ?? null,
      kind: "execute",
    }),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const repoOptions = useMemo(() => buildRepoOptions(repos), [repos]);
  const repo = useMemo(
    () => repos.find((candidate) => candidate.repoKey === repoKey) ?? null,
    [repoKey, repos],
  );
  const selectedRepo = useMemo<SelectFieldDisplay | null>(
    () => (repo ? { label: repo.displayName } : null),
    [repo],
  );
  // Switching project loads that project's remembered host and model.
  const onRepoChange = useCallback(
    (value: string) => {
      setRepoKey(value);
      setTarget(
        initialGoalTarget({
          repo: repos.find((candidate) => candidate.repoKey === value) ?? null,
          kind: "execute",
        }),
      );
    },
    [repos],
  );

  const dependencyDisplay = useMemo(
    () => ({
      label:
        parentGoal?.children?.find((child) => child.id === dependency)?.title ??
        t("clawmuseStatus.goals.tasks.noDependency"),
    }),
    [parentGoal, dependency, t],
  );
  const dependencyOptions = useMemo(
    () => [
      { id: "none", value: "", label: t("clawmuseStatus.goals.tasks.noDependency") },
      ...(parentGoal?.children ?? [])
        .filter((child) => child.status !== "discarded")
        .map((child) => ({ id: child.id, value: child.id, label: child.title })),
    ],
    [parentGoal, t],
  );
  const selectDependency = useCallback((value: string) => setDependency(value || null), []);
  const budgetValue = parseBudget(budget);
  const canSubmit =
    !isSubmitting &&
    repoKey !== null &&
    title.trim().length > 0 &&
    summary.trim().length > 0 &&
    acceptance.trim().length > 0 &&
    budgetValue !== null;

  const submit = useCallback(() => {
    if (!repoKey || budgetValue === null) {
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    void createGoal({
      requestId,
      ...(draft ? { start: false } : {}),
      ...(parentGoal ? { parentGoalId: parentGoal.id } : {}),
      ...(dependency ? { dependsOn: [dependency] } : {}),
      repoKey,
      title: title.trim(),
      summary: summary.trim(),
      ...(acceptance.trim() ? { acceptance: acceptance.trim() } : {}),
      budgetRuns: budgetValue,
      // Sent explicitly so the service remembers it for this project.
      hostId: target.hostId,
      agent: target.agent,
    })
      .then(() => onClose())
      .catch((error: unknown) => {
        setSubmitError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => setIsSubmitting(false));
  }, [
    acceptance,
    budgetValue,
    createGoal,
    onClose,
    repoKey,
    requestId,
    summary,
    target,
    title,
    parentGoal,
    dependency,
    draft,
  ]);

  const header = useMemo<SheetHeader>(
    () => ({ title: t("clawmuseStatus.goals.create.title") }),
    [t],
  );
  const footer = useMemo(
    () => (
      <View style={styles.footerContainer}>
        <Text style={styles.scope}>{t("clawmuseStatus.goals.executionScope")}</Text>
        {submitError ? <Text style={styles.error}>{submitError}</Text> : null}
        <View style={styles.footer}>
          <Button
            style={styles.footerButton}
            variant="secondary"
            onPress={onClose}
            disabled={isSubmitting}
          >
            {t("clawmuseStatus.goals.actions.cancel")}
          </Button>
          <Button
            style={styles.footerButton}
            variant="default"
            onPress={submit}
            disabled={!canSubmit}
            loading={isSubmitting}
            testID="goal-create-submit"
          >
            {t(
              draft ? "clawmuseStatus.goals.tasks.saveDraft" : "clawmuseStatus.goals.create.submit",
            )}
          </Button>
        </View>
      </View>
    ),
    [canSubmit, isSubmitting, onClose, submit, submitError, t, draft],
  );

  return (
    <AdaptiveModalSheet
      header={header}
      visible={visible}
      onClose={onClose}
      footer={footer}
      testID="goal-create-sheet"
    >
      <View style={styles.content}>
        {parentGoal ? (
          <Text style={styles.scope}>
            {t("clawmuseStatus.goals.tasks.parent", { title: parentGoal.title })}
          </Text>
        ) : null}
        <SelectField
          disabled={parentGoal !== undefined}
          label={t("clawmuseStatus.goals.create.repo")}
          value={repoKey}
          selectedDisplay={selectedRepo}
          options={repoOptions}
          onChange={onRepoChange}
          placeholder={t("clawmuseStatus.goals.create.repoPlaceholder")}
          emptyText={t("clawmuseStatus.goals.create.repoEmpty")}
        />
        {parentGoal?.children?.length ? (
          <SelectField
            label={t("clawmuseStatus.goals.tasks.dependsOn")}
            placeholder={t("clawmuseStatus.goals.tasks.noDependency")}
            emptyText={t("clawmuseStatus.goals.tasks.noDependency")}
            value={dependency ?? ""}
            selectedDisplay={dependencyDisplay}
            options={dependencyOptions}
            onChange={selectDependency}
          />
        ) : null}
        <Field label={t("clawmuseStatus.goals.create.titleLabel")}>
          <FormTextInput
            initialValue={title}
            onChangeText={setTitle}
            placeholder={t("clawmuseStatus.goals.create.titlePlaceholder")}
            testID="goal-create-title"
          />
        </Field>
        <Field label={t("clawmuseStatus.goals.create.summaryLabel")}>
          <GoalDictationInput
            repo={repo}
            target={target}
            initialValue={summary}
            onChangeText={setSummary}
            testID="goal-create-summary"
          />
        </Field>
        <Field label={t("clawmuseStatus.goals.create.acceptanceLabel")}>
          <FormTextInput
            initialValue={acceptance}
            onChangeText={setAcceptance}
            placeholder={t("clawmuseStatus.goals.create.acceptancePlaceholder")}
            style={styles.multiline}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            testID="goal-create-acceptance"
          />
        </Field>
        <Field
          label={t("clawmuseStatus.goals.create.budgetLabel")}
          hint={t("clawmuseStatus.goals.create.budgetHint")}
          error={budgetValue === null ? t("clawmuseStatus.goals.create.invalidBudget") : null}
        >
          <FormTextInput
            initialValue={budget}
            onChangeText={setBudget}
            keyboardType="number-pad"
            testID="goal-create-budget"
          />
        </Field>
        <Field label={t("clawmuseStatus.goals.tasks.draftHint")}>
          <Switch value={draft} onValueChange={setDraft} testID="goal-create-draft" />
        </Field>
        {repo ? (
          <GoalTargetFields
            repo={repo}
            value={target}
            onChange={setTarget}
            kind="execute"
            testIDPrefix="goal-create"
          />
        ) : null}
      </View>
    </AdaptiveModalSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: {
    gap: theme.spacing[4],
    paddingBottom: theme.spacing[4],
  },
  multiline: {
    minHeight: 96,
  },
  scope: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  error: {
    color: theme.colors.statusDanger,
    fontSize: theme.fontSize.sm,
  },
  footerContainer: { flex: 1, minWidth: 0, gap: theme.spacing[2] },
  footer: {
    flexDirection: "row",
    gap: theme.spacing[2],
  },
  footerButton: {
    flex: 1,
  },
}));
