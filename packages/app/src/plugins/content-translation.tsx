import { useMemo, useState, useCallback, type ComponentProps } from "react";
import type { PluginContentTranslatorContribution } from "@getpaseo/plugin/client";
import { useFetchQuery } from "@/data/query";
import { Text, View } from "react-native";
import { Button } from "@/components/ui/button";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { useInstalledPlugins } from "./registry";
import { QuestionFormCard, type QuestionFormCardProps } from "@/components/question-form-card";
import { PlanCard } from "@/components/plan-card";
import { parseQuestionFormQuestions } from "@/components/question-form-card-core";

const translatorScopes = new WeakMap<PluginContentTranslatorContribution, number>();
let nextScope = 0;
function translatorScope(translator: PluginContentTranslatorContribution | undefined) {
  if (!translator) return null;
  let scope = translatorScopes.get(translator);
  if (scope === undefined) {
    scope = ++nextScope;
    translatorScopes.set(translator, scope);
  }
  return scope;
}

export function TranslatedQuestionFormCard({
  serverId,
  ...props
}: QuestionFormCardProps & { serverId: string | undefined }) {
  const texts = useMemo(() => {
    const questions = parseQuestionFormQuestions(props.permission.request.input) ?? [];
    // eslint-disable-next-line no-map-spread -- collect independent display fields, not object clones.
    const fields = questions.flatMap((question) => [
      question.header,
      question.question,
      question.placeholder,
      question.dismissLabel,
      ...question.options.flatMap((option) => [option.label, option.description]),
    ]);
    return [
      ...new Set(
        fields.filter((field): field is string => typeof field === "string" && field.length > 0),
      ),
    ];
  }, [props.permission.request.input]);
  const { displayText, controls } = useContentTranslation(serverId, texts);
  return <QuestionFormCard {...props} displayText={displayText} translationControls={controls} />;
}

export function TranslatedPlanCard({
  serverId,
  ...props
}: ComponentProps<typeof PlanCard> & { serverId: string | undefined }) {
  const texts = useMemo(
    () => [props.text, ...(props.description ? [props.description] : [])],
    [props.text, props.description],
  );
  const { displayText, controls } = useContentTranslation(serverId, texts);
  return (
    <PlanCard
      {...props}
      text={displayText?.get(props.text) ?? props.text}
      description={
        props.description ? (displayText?.get(props.description) ?? props.description) : undefined
      }
      footer={
        <>
          {controls}
          {props.footer}
        </>
      }
    />
  );
}

function useContentTranslation(serverId: string | undefined, texts: string[]) {
  const { t } = useTranslation();
  const plugins = useInstalledPlugins();
  const plugin = plugins.find(
    (candidate) => candidate.serverId === serverId && candidate.contentTranslators.length > 0,
  );
  const translator = plugin?.contentTranslators[0];
  const result = useFetchQuery({
    dataShape: "value",
    immutableWhen: () => true,
    queryKey: [
      "content-translation",
      serverId,
      plugin?.id,
      translator?.id,
      translator?.revision,
      translatorScope(translator),
      texts,
    ],
    enabled: Boolean(translator && texts.length),
    queryFn: async ({ signal }) => {
      if (!translator) return texts;
      const translated = await translator.translate(texts, signal);
      if (
        translated.length !== texts.length ||
        translated.some((text) => typeof text !== "string" || !text.trim())
      ) {
        throw new Error(t("message.contentTranslation.failed"));
      }
      return translated;
    },
    retry: false,
  });
  const [showOriginal, setShowOriginal] = useState(false);
  const displayText = useMemo(() => {
    if (!translator || showOriginal || !result.data) return undefined;
    return new Map(texts.map((text, index) => [text, result.data[index]!]));
  }, [translator, showOriginal, result.data, texts]);
  const changed = translator && result.data?.some((text, index) => text !== texts[index]);
  const { refetch } = result;
  const retry = useCallback(() => void refetch(), [refetch]);
  const toggleOriginal = useCallback(() => setShowOriginal((value) => !value), []);
  const controls = translator ? (
    <View style={styles.controls}>
      {result.isFetching ? (
        <Text style={styles.hint}>{t("message.contentTranslation.translating")}</Text>
      ) : null}
      {result.isError ? (
        <>
          <Text accessibilityRole="alert" style={styles.hint}>
            {t("message.contentTranslation.failed")}
          </Text>
          <Button variant="ghost" size="sm" disabled={result.isFetching} onPress={retry}>
            {t("common.actions.retry")}
          </Button>
        </>
      ) : null}
      {changed ? (
        <Button variant="ghost" size="sm" onPress={toggleOriginal}>
          {t(
            showOriginal
              ? "message.contentTranslation.showTranslation"
              : "message.contentTranslation.showOriginal",
          )}
        </Button>
      ) : null}
    </View>
  ) : null;
  return { displayText, controls };
}

const styles = StyleSheet.create((theme) => ({
  controls: { gap: theme.spacing[2] },
  hint: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
}));
