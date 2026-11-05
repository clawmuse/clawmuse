import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import {
  getClawMuseStatusBindingSnapshot,
  subscribeClawMuseStatusBindings,
} from "@/clawmuse-status/binding-state";
import { resolveModelSourceHost } from "@/clawmuse-status/goals/target";
import type { GoalRepo, GoalTarget } from "@/clawmuse-status/goals/types";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { useDictation } from "@/hooks/use-dictation";
import { Button } from "@/components/ui/button";
import { FormTextInput } from "@/components/ui/form-field";
import type { EditingTextInputHandle } from "@/components/ui/text-input";

/** Uses the paired host's existing speech provider. Transcripts never submit a goal. */
export function GoalDictationInput({
  repo,
  target,
  initialValue,
  onChangeText,
  testID,
}: {
  repo: GoalRepo | null;
  target: GoalTarget;
  initialValue: string;
  onChangeText: (value: string) => void;
  testID: string;
}) {
  const { t } = useTranslation();
  const input = useRef<EditingTextInputHandle>(null);
  const bindings = useSyncExternalStore(
    subscribeClawMuseStatusBindings,
    getClawMuseStatusBindingSnapshot,
    getClawMuseStatusBindingSnapshot,
  );
  const source = useMemo(
    () =>
      resolveModelSourceHost({
        repo,
        hostId: target.hostId,
        serverIdForRelayHost: (relayHostId) =>
          Object.entries(bindings.hosts).find(
            ([, binding]) => binding.kind === "bound" && binding.relayHostId === relayHostId,
          )?.[0] ?? null,
      }),
    [bindings, repo, target.hostId],
  );
  const client = useHostRuntimeClient(source?.serverId ?? "");
  const onTranscript = useCallback(
    (text: string) => {
      const previous = input.current?.getText() ?? "";
      const next = previous ? `${previous}\n${text}` : text;
      input.current?.replaceText(next);
      onChangeText(next);
    },
    [onChangeText],
  );
  const dictation = useDictation({ client, onTranscript, enableDuration: true });
  const start = useCallback(() => {
    void dictation.startDictation();
  }, [dictation]);
  const stop = useCallback(() => {
    void dictation.confirmDictation();
  }, [dictation]);
  const cancel = useCallback(() => {
    void dictation.cancelDictation();
  }, [dictation]);
  const retry = useCallback(() => {
    void dictation.retryFailedDictation();
  }, [dictation]);
  return (
    <View style={styles.container}>
      <FormTextInput
        ref={input}
        initialValue={initialValue}
        onChangeText={onChangeText}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
        testID={testID}
        style={styles.input}
      />
      <View style={styles.controls}>
        {dictation.isRecording ? (
          <>
            <Button
              size="sm"
              variant="outline"
              onPress={stop}
              loading={dictation.isProcessing}
              testID={`${testID}-stop`}
            >
              {t("clawmuseStatus.goals.stopDictation")} ({dictation.duration}s)
            </Button>
            <Button size="sm" variant="ghost" onPress={cancel} disabled={dictation.isProcessing}>
              {t("clawmuseStatus.goals.cancelDictation")}
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onPress={start}
            disabled={!client?.isConnected || dictation.isProcessing}
            testID={`${testID}-record`}
          >
            {t("clawmuseStatus.goals.dictate")}
          </Button>
        )}
        {dictation.status === "failed" ? (
          <Button size="sm" variant="outline" onPress={retry}>
            {t("message.dictation.retry")}
          </Button>
        ) : null}
      </View>
      {dictation.error ? <Text style={styles.error}>{dictation.error}</Text> : null}
    </View>
  );
}
const styles = StyleSheet.create((theme) => ({
  container: { gap: theme.spacing[2] },
  input: { minHeight: 96 },
  controls: { flexDirection: "row", gap: theme.spacing[2] },
  error: { color: theme.colors.statusDanger, fontSize: theme.fontSize.sm },
}));
