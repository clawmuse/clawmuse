import { useCallback, useMemo, useState } from "react";
import { Text } from "react-native";
import { useMutation } from "@tanstack/react-query";
import {
  useRpc,
  useSettings,
  type PluginSurfaceProps,
  type SettingsState,
} from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  ModelSelector,
  SettingsRow,
  SettingsSection,
  useToast,
} from "@getpaseo/plugin/client/ui";
import { checkRpc, preferences, configuredPreferencesSchema } from "../shared/contracts.js";

type ReadySettings = Extract<SettingsState<typeof preferences.schema>, { status: "ready" }>;

function Controls({
  settings,
  theme,
  serverId,
  onSaved,
}: {
  settings: ReadySettings;
  theme: PluginSurfaceProps["theme"];
  serverId: string;
  onSaved(): void;
}) {
  const [draft, setDraft] = useState({ values: settings.values, revision: settings.revision });
  const [validationError, setValidationError] = useState<string | null>(null);
  const check = useRpc(checkRpc);
  const probe = useMutation({
    mutationFn: () => check(configuredPreferencesSchema.parse(draft.values)),
  });
  const toast = useToast();
  const { reset, mutate } = probe;
  const styles = useMemo(
    () => ({
      text: { color: theme.colors.foreground },
      hint: { color: theme.colors.foregroundMuted },
      error: { color: theme.colors.statusDanger },
    }),
    [theme],
  );
  const setModel = useCallback(
    (value: { provider: string; model: string }) => {
      const provider = value.provider;
      reset();
      setValidationError(null);
      setDraft((current) => ({ ...current, values: { provider, model: value.model } }));
    },
    [reset],
  );
  const testTranslation = useCallback(() => mutate(), [mutate]);
  const save = useCallback(async () => {
    const configured = configuredPreferencesSchema.safeParse(draft.values);
    if (!configured.success) {
      setValidationError(configured.error.issues[0]?.message ?? "请选择翻译工具和模型");
      return;
    }
    if (await settings.save(configured.data, draft.revision)) {
      toast.show("已保存会话翻译设置");
      onSaved();
    }
  }, [settings, draft, toast, onSaved]);
  const disabled = settings.saving || probe.isPending;
  return (
    <SettingsSection title="会话翻译">
      <Text style={styles.hint}>
        选择这台主机上已登录的翻译工具和模型，保存后才开始自动翻译。未配置时保持原来的聊天流程，不调用模型。翻译会消耗所选模型的额度；可在插件列表中关闭。
      </Text>
      <SettingsCard>
        <SettingsRow label="翻译模型">
          <ModelSelector
            serverId={serverId}
            value={draft.values}
            disabled={disabled}
            onChange={setModel}
          />
        </SettingsRow>
        <SettingsAction
          label="验证登录与模型"
          actionLabel={probe.isPending ? "测试中…" : "测试翻译"}
          disabled={disabled || !configuredPreferencesSchema.safeParse(draft.values).success}
          onPress={testTranslation}
        />
        <SettingsAction
          label="应用设置"
          actionLabel={settings.saving ? "保存中…" : "保存"}
          disabled={disabled}
          onPress={save}
        />
      </SettingsCard>
      {probe.isSuccess ? <Text style={styles.text}>{probe.data.text}</Text> : null}
      {probe.isError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {probe.error.message}
        </Text>
      ) : null}
      {validationError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {validationError}
        </Text>
      ) : null}
      {settings.saveError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {settings.saveError}
        </Text>
      ) : null}
    </SettingsSection>
  );
}

function ReadyView({
  settings,
  theme,
  serverId,
}: {
  settings: ReadySettings;
  serverId: string;
  theme: PluginSurfaceProps["theme"];
}) {
  const [editing, setEditing] = useState(true);
  const edit = useCallback(() => setEditing(true), []);
  const saved = useCallback(() => setEditing(false), []);
  const style = useMemo(() => ({ color: theme.colors.foreground }), [theme]);
  if (editing)
    return <Controls settings={settings} theme={theme} serverId={serverId} onSaved={saved} />;
  return (
    <SettingsSection title="会话翻译">
      <Text style={style}>翻译模型已保存</Text>
      <Text style={style}>
        {settings.values.provider} · {settings.values.model}
      </Text>
      <SettingsAction label="翻译设置" actionLabel="编辑" onPress={edit} />
    </SettingsSection>
  );
}

export function TranslationSettings({ theme, host }: PluginSurfaceProps) {
  const settings = useSettings(preferences);
  const styles = useMemo(
    () => ({
      text: { color: theme.colors.foreground },
      error: { color: theme.colors.statusDanger },
    }),
    [theme],
  );
  if (settings.status === "loading") return <Text style={styles.text}>正在加载…</Text>;
  if (settings.status !== "ready")
    return (
      <SettingsSection title="会话翻译">
        <Text accessibilityRole="alert" style={styles.error}>
          {settings.error}
        </Text>
        <SettingsAction label="加载设置" actionLabel="重试" onPress={settings.reload} />
      </SettingsSection>
    );
  return <ReadyView settings={settings} theme={theme} serverId={host.id} />;
}
