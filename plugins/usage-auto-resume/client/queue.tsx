import {
  useRpc,
  useTranslation,
  type PluginButtonContentProps,
  type PluginHostProps,
} from "@getpaseo/plugin/client";
import { TextInput, useToast } from "@getpaseo/plugin/client/react-native";
import {
  SettingsAction,
  SettingsCard,
  SettingsRow,
  SettingsSection,
} from "@getpaseo/plugin/client/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import {
  addQueuedMessageRpc,
  listQueuesRpc,
  pauseQueueRpc,
  removeQueuedMessageRpc,
  resumeQueueRpc,
  type MessageQueue,
  type QueuedMessage,
  type ScheduledJob,
} from "../shared/rpc";
import { messages } from "./messages";
import { getQueueDraft } from "./queue-draft";
import { queueErrorMessage } from "./queue-error";
import { reasonLabel, type T } from "./format";

export const queueQueryKey = (hostId: string) => ["usage-auto-resume", "queues", hostId];

const stacks = { form: { gap: 8 }, card: { gap: 12 }, section: { gap: 16 } };

const QUEUE_STATUS_KEYS = {
  waiting: "queueStatusWaiting",
  ready: "queueStatusReady",
  running: "queueStatusRunning",
  paused: "queueStatusPaused",
} as const satisfies Record<MessageQueue["status"], Parameters<T>[0]>;

const MESSAGE_STATE_KEYS = {
  queued: "queueMessageQueued",
  running: "queueMessageRunning",
  uncertain: "queueMessageUncertain",
} as const satisfies Record<QueuedMessage["state"], Parameters<T>[0]>;

function queueStatusLabel(t: T, status: MessageQueue["status"]): string {
  return t(QUEUE_STATUS_KEYS[status]);
}

function messageStatusLabel(t: T, state: QueuedMessage["state"]): string {
  return t(MESSAGE_STATE_KEYS[state]);
}

function useQueueStyles(theme: PluginHostProps["theme"]) {
  return useMemo(
    () => ({
      hint: { color: theme.colors.foregroundMuted, fontSize: 13, lineHeight: 20 },
      error: { color: theme.colors.statusDanger, fontSize: 13 },
      input: {
        minHeight: 96,
        maxHeight: 240,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 6,
        padding: 12,
        color: theme.colors.foreground,
        fontSize: 14,
        textAlignVertical: "top" as const,
      },
    }),
    [theme],
  );
}

function QueueComposer({ agentId, host, theme }: PluginHostProps & { agentId: string }) {
  const { t } = useTranslation(messages);
  const styles = useQueueStyles(theme);
  const add = useRpc(addQueuedMessageRpc);
  const queryClient = useQueryClient();
  const toast = useToast();
  const draft = getQueueDraft(host.id, agentId);
  const state = useSyncExternalStore(draft.subscribe, draft.getSnapshot, draft.getSnapshot);
  const save = useCallback(async () => {
    const saved = await draft.submit(
      (input) => add({ agentId, ...input }),
      () => t("queueSaveFailed"),
      (key) => t(key as never),
    );
    if (saved) {
      toast.show(t("queueAddSaved"), { variant: "success" });
      await queryClient.invalidateQueries({ queryKey: queueQueryKey(host.id) });
    }
  }, [add, agentId, draft, host.id, queryClient, toast, t]);
  let actionLabel = state.attempt ? t("queueAddRetry") : t("queueAddSave");
  if (state.pending) actionLabel = t("queueAddSaving");
  return (
    <View style={stacks.form}>
      <TextInput
        value={state.text}
        onChangeText={draft.edit}
        editable={!state.attempt}
        multiline
        maxLength={20_000}
        placeholder={t("queueComposerPlaceholder")}
        placeholderTextColor={theme.colors.foregroundMuted}
        accessibilityLabel={t("queueComposerA11y")}
        style={styles.input}
      />
      <SettingsCard>
        <SettingsAction
          label={t("queueAddLabel")}
          hint={state.attempt && !state.pending ? t("queueAddHintAttempt") : t("queueAddHint")}
          actionLabel={actionLabel}
          disabled={state.pending || !state.text.trim()}
          onPress={save}
        />
      </SettingsCard>
      {state.error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {state.error}
        </Text>
      ) : null}
    </View>
  );
}

type QueueAction =
  | { kind: "pause" }
  | { kind: "resume"; uncertain?: "retry" | "skip" }
  | { kind: "remove"; id: string };

type QueueAct = (action: QueueAction) => Promise<void>;

function QueueControls({
  queue,
  pending,
  act,
  t,
}: {
  queue: MessageQueue;
  pending: boolean;
  act: QueueAct;
  t: T;
}) {
  const retry = useCallback(() => void act({ kind: "resume", uncertain: "retry" }), [act]);
  const skip = useCallback(() => void act({ kind: "resume", uncertain: "skip" }), [act]);
  const resume = useCallback(() => void act({ kind: "resume" }), [act]);
  const pause = useCallback(() => void act({ kind: "pause" }), [act]);
  if (queue.uncertainMessageId)
    return (
      <>
        <SettingsAction
          label={t("queueRetryUncertain")}
          hint={t("queueRetryUncertainHint")}
          actionLabel={t("queueRetryThis")}
          disabled={pending}
          onPress={retry}
        />
        <SettingsAction
          label={t("queueSkipUncertain")}
          hint={t("queueSkipUncertainHint")}
          actionLabel={t("queueSkipThis")}
          disabled={pending}
          onPress={skip}
        />
      </>
    );
  if (queue.status === "paused")
    return (
      <SettingsAction
        label={t("queueResume")}
        hint={t("queueResumeHint")}
        actionLabel={pending ? t("queueWorking") : t("queueResume")}
        disabled={pending}
        onPress={resume}
      />
    );
  return (
    <SettingsAction
      label={t("queuePause")}
      hint={t("queuePauseHint")}
      actionLabel={pending ? t("queueWorking") : t("queuePause")}
      disabled={pending}
      onPress={pause}
    />
  );
}

function QueuedMessageRow({
  message,
  index,
  pending,
  act,
  t,
}: {
  message: QueuedMessage;
  index: number;
  pending: boolean;
  act: QueueAct;
  t: T;
}) {
  const remove = useCallback(() => void act({ kind: "remove", id: message.id }), [act, message.id]);
  return (
    <SettingsAction
      label={`${index + 1}. ${messageStatusLabel(t, message.state)}`}
      hint={message.text}
      actionLabel={t("queueRemove")}
      disabled={pending || message.state !== "queued"}
      onPress={remove}
    />
  );
}

function QueueCard(
  props: PluginHostProps & { agentId: string; title: string; queue: MessageQueue | null },
) {
  const { agentId, title, queue, host, theme } = props;
  const { t } = useTranslation(messages);
  const styles = useQueueStyles(theme);
  let status = queue ? queueStatusLabel(t, queue.status) : "";
  if (queue?.status === "running" && !queue.messages.some((message) => message.state === "running"))
    status = t("queueStatusRunningTask");
  const pause = useRpc(pauseQueueRpc);
  const resume = useRpc(resumeQueueRpc);
  const remove = useRpc(removeQueuedMessageRpc);
  const queryClient = useQueryClient();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = useCallback(
    async (action: QueueAction) => {
      if (busy.current) return;
      busy.current = true;
      setPending(true);
      setError(null);
      try {
        if (action.kind === "pause") await pause({ agentId });
        else if (action.kind === "resume") await resume({ agentId, uncertain: action.uncertain });
        else {
          const result = await remove({ agentId, id: action.id });
          if (!result.changed) setError(t("queueRemoveStale"));
        }
      } catch (problem) {
        setError(queueErrorMessage(problem, t("queueUpdateFailed"), (key) => t(key)));
      } finally {
        await queryClient.invalidateQueries({ queryKey: queueQueryKey(host.id) });
        busy.current = false;
        setPending(false);
      }
    },
    [agentId, host.id, pause, queryClient, remove, resume, t],
  );
  return (
    <SettingsSection title={title}>
      <View style={stacks.card}>
        {queue ? (
          <SettingsCard>
            <SettingsRow
              label={t("queueRowStatus", { status, count: queue.messages.length })}
              hint={queue.reason ? reasonLabel(t, queue.reason) : undefined}
            />
            <QueueControls queue={queue} pending={pending} act={act} t={t} />
            {queue.messages.map((message, index) => (
              <QueuedMessageRow
                key={message.id}
                message={message}
                index={index}
                pending={pending}
                act={act}
                t={t}
              />
            ))}
          </SettingsCard>
        ) : (
          <Text style={styles.hint}>{t("queueEmpty")}</Text>
        )}
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
        <QueueComposer {...props} />
      </View>
    </SettingsSection>
  );
}

function QueueHint({ theme }: Pick<PluginHostProps, "theme">) {
  const { t } = useTranslation(messages);
  const styles = useQueueStyles(theme);
  return <Text style={styles.hint}>{t("queueHint")}</Text>;
}

function QueueLoadError({ error, retry }: { error: Error; retry: () => Promise<unknown> }) {
  const { t } = useTranslation(messages);
  const onRetry = useCallback(() => void retry(), [retry]);
  return (
    <SettingsCard>
      <SettingsAction
        label={t("queueLoadErrorTitle")}
        hint={queueErrorMessage(error, t("queueReadFailed"), (key) => t(key))}
        actionLabel={t("retry")}
        onPress={onRetry}
      />
    </SettingsCard>
  );
}

export function QueuePopover(props: PluginButtonContentProps) {
  if (props.context !== "agent") return null;
  return <AgentQueue {...props} agentId={props.agentId} />;
}

function AgentQueue(props: PluginHostProps & { agentId: string }) {
  const { t } = useTranslation(messages);
  const list = useRpc(listQueuesRpc);
  const query = useQuery({
    queryKey: [...queueQueryKey(props.host.id), props.agentId],
    queryFn: async () => (await list({ agentId: props.agentId })).queues,
    refetchInterval: 5_000,
  });
  const queue = query.data?.[0] ?? null;
  return (
    <View style={stacks.section}>
      <QueueHint theme={props.theme} />
      {query.isPending ? <ActivityIndicator color={props.theme.colors.foregroundMuted} /> : null}
      {query.isError ? <QueueLoadError error={query.error} retry={query.refetch} /> : null}
      <QueueCard {...props} title={queue?.title ?? t("queueTitleFallback")} queue={queue} />
    </View>
  );
}

/** Includes scheduled agents without a queue, so a waiting job can receive its first follow-up. */
export function QueueOverview(props: PluginHostProps & { jobs: ScheduledJob[] }) {
  const { t } = useTranslation(messages);
  const styles = useQueueStyles(props.theme);
  const list = useRpc(listQueuesRpc);
  const query = useQuery({
    queryKey: queueQueryKey(props.host.id),
    queryFn: async () => (await list({})).queues,
    refetchInterval: 5_000,
  });
  const queues = query.data ?? [];
  const ids = new Set(queues.map((queue) => queue.agentId));
  return (
    <View style={stacks.section}>
      <SettingsSection title={t("queueSectionTitle")}>
        <QueueHint theme={props.theme} />
      </SettingsSection>
      {query.isPending ? <ActivityIndicator color={props.theme.colors.foregroundMuted} /> : null}
      {query.isError ? <QueueLoadError error={query.error} retry={query.refetch} /> : null}
      {queues.map((queue) => (
        <QueueCard
          key={queue.agentId}
          {...props}
          agentId={queue.agentId}
          title={queue.title ?? t("agentUntitled")}
          queue={queue}
        />
      ))}
      {props.jobs
        .filter((job) => !ids.has(job.agentId))
        .map((job) => (
          <QueueCard
            key={job.agentId}
            {...props}
            agentId={job.agentId}
            title={job.title ?? t("agentUntitled")}
            queue={null}
          />
        ))}
      {!query.isPending && !query.isError && queues.length === 0 && props.jobs.length === 0 ? (
        <Text style={styles.hint}>{t("queueHowToAdd")}</Text>
      ) : null}
    </View>
  );
}
