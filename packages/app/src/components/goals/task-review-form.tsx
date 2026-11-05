import { useCallback, useReducer } from "react";
import { View } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { getClawMuseStatusApiClient } from "@/clawmuse-status/api-access";
import { useGoalsStore } from "@/clawmuse-status/goals/store";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface ReviewDraft {
  revision: string;
  checks: string;
  message: string;
}
export function TaskReviewForm({ goalId, runId }: { goalId: string; runId: string }) {
  const { t } = useTranslation();
  const [draft, update] = useReducer(
    (state: ReviewDraft, patch: Partial<ReviewDraft>) => ({ ...state, ...patch }),
    { revision: "", checks: "", message: "" },
  );
  const mutation = useMutation({
    mutationFn: async () => {
      const api = getClawMuseStatusApiClient();
      if (!api) throw new Error(t("clawmuseStatus.goals.notEnrolled"));
      await api.submitTaskReview(goalId, {
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
      await useGoalsStore.getState().openDetail(goalId);
      await useGoalsStore.getState().load();
    },
  });
  const setRevision = useCallback((revision: string) => update({ revision }), []);
  const setChecks = useCallback((checks: string) => update({ checks }), []);
  const setMessage = useCallback((message: string) => update({ message }), []);
  const submit = useCallback(() => mutation.mutate(), [mutation]);
  return (
    <View style={styles.content}>
      <Field label={t("clawmuseStatus.goals.tasks.reviewRevision")}>
        <FormTextInput
          initialValue={draft.revision}
          onChangeText={setRevision}
          testID="task-review-revision"
        />
      </Field>
      <Field label={t("clawmuseStatus.goals.tasks.reviewChecks")}>
        <FormTextInput
          initialValue={draft.checks}
          onChangeText={setChecks}
          multiline
          testID="task-review-checks"
        />
      </Field>
      <Field label={t("clawmuseStatus.goals.tasks.reviewMessage")}>
        <FormTextInput
          initialValue={draft.message}
          onChangeText={setMessage}
          multiline
          testID="task-review-message"
        />
      </Field>
      {mutation.isSuccess ? <Alert title={t("clawmuseStatus.goals.tasks.evidenceSaved")} /> : null}
      {mutation.error ? <Alert variant="error" title={mutation.error.message} /> : null}
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
    </View>
  );
}
const styles = StyleSheet.create((theme) => ({ content: { gap: theme.spacing[3] } }));
