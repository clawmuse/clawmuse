import { useEffect, useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import {
  useRpc,
  useSettings,
  useAgent,
  type PluginTimelineItemProps,
} from "@getpaseo/plugin/client";
import { SettingsAction, Markdown } from "@getpaseo/plugin/client/ui";
import type { z } from "zod";
import {
  originalRpc,
  preferences,
  rowSchema,
  repliesRpc,
  prepareRpc,
  configuredPreferencesSchema,
} from "../shared/contracts.js";
import { sharedTranslationQueue } from "./queue.js";
import { createReplyQueue } from "./replies.js";

interface PassageProps {
  ready: boolean;
  agentId: string;
  text: string;
  revision: string;
  color: string;
}

// Completed messages from the same conversation are batched before entering the queue.
export const translationQueue = createReplyQueue(sharedTranslationQueue);

function TranslatedPassage({ text, revision, color, agentId, ready }: PassageProps) {
  const translate = useRpc(repliesRpc);
  const prepare = useRpc(prepareRpc);
  const [showOriginal, setShowOriginal] = useState(false);
  const [started, setStarted] = useState(false);
  const style = useMemo(() => ({ color }), [color]);
  const result = useQuery({
    queryKey: ["translation", agentId, revision, text],
    enabled: ready,
    queryFn: ({ signal }) => {
      setStarted(false);
      return translationQueue.enqueue({
        signal,
        onStart: () => setStarted(true),
        text,
        agentId,
        revision,
        translate,
        prepare,
      });
    },
    staleTime: Infinity,
    retry: false,
    retryOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const translated = result.data?.text;
  const { refetch } = result;
  const retry = useCallback(() => void refetch(), [refetch]);
  const toggleOriginal = useCallback(() => setShowOriginal((current) => !current), []);
  return (
    <View>
      <Markdown>{translated ?? text}</Markdown>
      {result.isFetching ? <Text style={style}>{started ? "正在翻译…" : "等待翻译…"}</Text> : null}
      {result.isError && !result.isFetching ? (
        <View>
          <Text accessibilityRole="alert" style={style}>
            {result.error.message}
          </Text>
          <SettingsAction label="翻译失败" actionLabel="重试翻译" onPress={retry} />
        </View>
      ) : null}
      {translated && translated !== text ? (
        <View>
          <SettingsAction
            label="原文"
            actionLabel={showOriginal ? "收起原文" : "英文原文"}
            onPress={toggleOriginal}
          />
          {showOriginal ? <Markdown>{text}</Markdown> : null}
        </View>
      ) : null}
    </View>
  );
}

function UserMessage({
  agentId,
  item,
  theme,
}: PluginTimelineItemProps<z.output<typeof rowSchema>>) {
  const original = useRpc(originalRpc);
  const [showEnglish, setShowEnglish] = useState(false);
  const style = useMemo(() => ({ color: theme.colors.foregroundMuted }), [theme]);
  const result = useQuery({
    queryKey: ["translation-original", agentId, item.data.text, item.data.clientMessageId],
    queryFn: () =>
      original({ agentId, text: item.data.text, clientMessageId: item.data.clientMessageId }),
    staleTime: Infinity,
    retry: false,
  });
  const typed = result.data?.text;
  const { refetch } = result;
  const retry = useCallback(() => void refetch(), [refetch]);
  const toggleEnglish = useCallback(() => setShowEnglish((current) => !current), []);
  return (
    <View>
      <Markdown>{typed ?? item.data.text}</Markdown>
      {typed ? (
        <SettingsAction
          label="原文"
          actionLabel={showEnglish ? "收起英文" : "发送的英文"}
          onPress={toggleEnglish}
        />
      ) : null}
      {showEnglish ? <Markdown>{item.data.text}</Markdown> : null}
      {result.isError ? (
        <View>
          <Text accessibilityRole="alert" style={style}>
            原始输入加载失败
          </Text>
          <SettingsAction label="加载原始输入" actionLabel="重试" onPress={retry} />
        </View>
      ) : null}
    </View>
  );
}

export function TranslationRow(props: PluginTimelineItemProps<z.output<typeof rowSchema>>) {
  const settings = useSettings(preferences);
  const status = useAgent(props.agentId, (agent) => agent.status);
  const prepare = useRpc(prepareRpc);
  const revision = settings.status === "ready" ? settings.revision : undefined;
  const configured =
    settings.status === "ready" && configuredPreferencesSchema.safeParse(settings.values).success;
  useEffect(() => {
    if (configured && status === "running") {
      // Start only the provider process while the coding agent is working.
      // A failure is retried within the bounded queue when the reply is ready.
      void translationQueue
        .prepare({ agentId: props.agentId, revision, prepare })
        .catch(() => undefined);
    }
  }, [configured, status, props.agentId, revision, prepare]);
  if (
    settings.status !== "ready" ||
    !configuredPreferencesSchema.safeParse(settings.values).success
  )
    return <Markdown>{props.item.data.text}</Markdown>;
  if (props.item.data.role === "user") return <UserMessage {...props} />;
  return (
    <TranslatedPassage
      ready={
        props.item.data.phase === "complete" &&
        status !== null &&
        status !== "running" &&
        status !== "initializing"
      }
      agentId={props.agentId}
      text={props.item.data.text}
      revision={settings.revision}
      color={props.theme.colors.foregroundMuted}
    />
  );
}
