import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useQuery, useQueries } from "@tanstack/react-query";
import { useRpc, useSettings, type PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { SettingsAction, Markdown } from "@getpaseo/plugin/client/ui";
import type { z } from "zod";
import {
  originalRpc,
  preferences,
  rowSchema,
  translationRpc,
  configuredPreferencesSchema,
} from "../shared/contracts.js";
import { enqueueTranslation } from "./queue.js";
import { paragraphs } from "../shared/paragraphs.js";

function AssistantMessage({
  text,
  phase,
  revision,
  color,
}: {
  text: string;
  phase: "streaming" | "complete";
  revision: string;
  color: string;
}) {
  const translate = useRpc(translationRpc);
  const [showOriginal, setShowOriginal] = useState(false);
  const style = useMemo(() => ({ color }), [color]);
  const passages = useMemo(() => paragraphs(text, phase), [text, phase]);
  const results = useQueries({
    queries: passages.map((passage) => ({
      queryKey: ["translation", revision, passage.text],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        enqueueTranslation(() => translate({ text: passage.text, revision }), signal),
      enabled: passage.complete,
      staleTime: Infinity,
      retry: false,
    })),
  });
  const translated = passages
    .map((passage, index) =>
      results[index]!.data
        ? results[index]!.data.text.trimEnd() + (passage.text.match(/\s*$/)?.[0] ?? "")
        : passage.text,
    )
    .join("");
  const pending = results.some((result) => result.isFetching);
  const failure = results.find((result) => result.isError);
  const retry = useCallback(() => {
    for (const result of results) if (result.isError) void result.refetch();
  }, [results]);
  const toggleOriginal = useCallback(() => setShowOriginal((current) => !current), []);
  return (
    <View>
      <Markdown>{showOriginal ? text : translated}</Markdown>
      {pending ? <Text style={style}>正在翻译…</Text> : null}
      {failure ? (
        <View>
          <Text accessibilityRole="alert" style={style}>
            {failure.error.message}
          </Text>
          <SettingsAction
            label="翻译失败"
            actionLabel="重试翻译"
            onPress={retry}
            disabled={pending}
          />
        </View>
      ) : null}
      {translated !== text ? (
        <SettingsAction
          label="原文"
          actionLabel={showOriginal ? "显示译文" : "查看原文"}
          onPress={toggleOriginal}
        />
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
  if (
    settings.status !== "ready" ||
    !configuredPreferencesSchema.safeParse(settings.values).success
  )
    return <Markdown>{props.item.data.text}</Markdown>;
  if (props.item.data.role === "user") return <UserMessage {...props} />;
  return (
    <AssistantMessage
      text={props.item.data.text}
      phase={props.item.data.phase}
      revision={settings.revision}
      color={props.theme.colors.foregroundMuted}
    />
  );
}
