import { useCallback, useReducer, useRef } from "react";
import { View } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { submitGoalTaskReview, useGoalsStore } from "@/clawmuse-status/goals/store";
import { Field, FormTextInput } from "@/components/ui/form-field";
import type { EditingTextInputHandle } from "@/components/ui/text-input";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface ReviewDraft {
  revision: string;
  checks: string;
  message: string;
}

export function TaskReviewForm({ goalId, runId }: { goalId: string; runId: string }) {
  const { t } = useTranslation();
  const revisionRef = useRef<EditingTextInputHandle>(null);
  const checksRef = useRef<EditingTextInputHandle>(null);
  const messageRef = useRef<EditingTextInputHandle>(null);
  const [draft, update] = useReducer(
    (state: ReviewDraft, patch: Partial<ReviewDraft>) => ({ ...state, ...patch }),
    { revision: "", checks: "", message: "" },
  );
  const mutation = useMutation({
    mutationFn: async () => {
      try {
        await submitGoalTaskReview(goalId, {
          runId,
          message: draft.message.trim(),
          evidence: {
            revision: draft.revision.trim(),
            checks: draft.checks
              .split("\n")
              .map((name) => name.trim())
              .filter(Boolean)
              .map((name) => ({ name, result: "passed" })),
            artifacts: [],
          },
        });
      } catch (error) {
        if (error instanceof Error && error.message === "status_not_enrolled") {
          throw new Error(t("clawmuseStatus.goals.notEnrolled"), { cause: error });
        }
        throw error;
      }
      await useGoalsStore.getState().openDetail(goalId);
      await useGoalsStore.getState().load();
    },
  });
  const act = useGoalsStore((state) => state.act);
  const landMutation = useMutation({
    mutationFn: async () => {
      await act(goalId, "land", { mergeMethod: "merge" });
      await useGoalsStore.getState().load();
    },
  });
  const setRevision = useCallback((revision: string) => update({ revision }), []);
  const setChecks = useCallback((checks: string) => update({ checks }), []);
  const setMessage = useCallback((message: string) => update({ message }), []);
  const land = useCallback(() => landMutation.mutate(), [landMutation]);
  const quickFill = useCallback(() => {
    const rev = "workspace:verified";
    const check = t("clawmuseStatus.goals.tasks.presetTestsPassLabel");
    const msg = t("clawmuseStatus.goals.tasks.presetTestsPassValue");
    revisionRef.current?.replaceText(rev);
    checksRef.current?.replaceText(check);
    messageRef.current?.replaceText(msg);
    update({ revision: rev, checks: check, message: msg });
  }, [t]);
  const submit = useCallback(() => mutation.mutate(), [mutation]);
  return (
    <View style={styles.content}>
      <View style={styles.quickRow}>
        <Button size="sm" variant="ghost" onPress={quickFill} testID="task-review-quick-fill">
          {t("clawmuseStatus.goals.tasks.quickVerifyFill")}
        </Button>
      </View>
      <Field label={t("clawmuseStatus.goals.tasks.reviewRevision")}>
        <FormTextInput
          ref={revisionRef}
          initialValue={draft.revision}
          onChangeText={setRevision}
          testID="task-review-revision"
        />
      </Field>
      <Field label={t("clawmuseStatus.goals.tasks.reviewChecks")}>
        <FormTextInput
          ref={checksRef}
          initialValue={draft.checks}
          onChangeText={setChecks}
          multiline
          testID="task-review-checks"
        />
      </Field>
      <Field label={t("clawmuseStatus.goals.tasks.reviewMessage")}>
        <FormTextInput
          ref={messageRef}
          initialValue={draft.message}
          onChangeText={setMessage}
          multiline
          testID="task-review-message"
        />
      </Field>
      {mutation.isSuccess ? <Alert title={t("clawmuseStatus.goals.tasks.evidenceSaved")} /> : null}
      {mutation.error ? <Alert variant="error" title={mutation.error.message} /> : null}
      {landMutation.isSuccess ? <Alert title={t("clawmuseStatus.goals.tasks.landDone")} /> : null}
      {landMutation.error ? <Alert variant="error" title={landMutation.error.message} /> : null}
      <Button
        variant="outline"
        loading={mutation.isPending}
        disabled={
          mutation.isPending ||
          !draft.revision.trim() ||
          !draft.checks.trim() ||
          !draft.message.trim()
        }
        onPress={submit}
        testID="task-review-submit"
      >
        {t("clawmuseStatus.goals.tasks.submitEvidence")}
      </Button>
      {mutation.isSuccess && !landMutation.isSuccess ? (
        <Button
          variant="default"
          loading={landMutation.isPending}
          disabled={landMutation.isPending}
          onPress={land}
          testID="task-review-land"
        >
          {t("clawmuseStatus.goals.actions.land")}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: { gap: theme.spacing[3] },
  quickRow: { flexDirection: "row", justifyContent: "flex-end" },
}));
