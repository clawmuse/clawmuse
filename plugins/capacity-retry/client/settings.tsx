import { useCallback, useMemo, useState } from "react";
import { Text } from "react-native";
import { useSettings, type PluginSurfaceProps, type SettingsState } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsSection,
} from "@getpaseo/plugin/client/ui";
import { preferences } from "../shared/settings.js";

type ReadySettings = Extract<SettingsState<typeof preferences.schema>, { status: "ready" }>;

function Controls({
  settings,
  theme,
}: {
  settings: ReadySettings;
  theme: PluginSurfaceProps["theme"];
}) {
  const [draft] = useState(() => ({ revision: settings.revision }));
  const [count, setCount] = useState(String(settings.values.maxRetries));
  const [interval, setInterval] = useState(String(settings.values.intervalSeconds));
  const [error, setError] = useState<string | null>(null);
  const style = useMemo(() => ({ color: theme.colors.foreground }), [theme]);
  const save = useCallback(async () => {
    const result = preferences.schema.safeParse({
      maxRetries: Number(count),
      intervalSeconds: Number(interval),
    });
    if (!result.success) {
      setError("重试次数须为 1–100 的整数，间隔须为 1–86400 秒的整数。");
      return;
    }
    setError(null);
    await settings.save(result.data, draft.revision);
  }, [settings, draft, count, interval]);
  return (
    <SettingsSection title="模型满载自动重试">
      <SettingsCard>
        <SettingsInput
          label="最多重试次数"
          initialValue={count}
          onChangeText={setCount}
          disabled={settings.saving}
        />
        <SettingsInput
          label="重试间隔（秒）"
          initialValue={interval}
          onChangeText={setInterval}
          disabled={settings.saving}
        />
        <SettingsAction
          label="应用设置"
          actionLabel="保存"
          onPress={save}
          disabled={settings.saving}
        />
      </SettingsCard>
      <Text style={style}>
        重试进度和结束提醒显示在原会话中。手动发消息、取消或关闭会话后停止重试。
      </Text>
      {error || settings.saveError ? (
        <Text style={style} accessibilityRole="alert">
          {error || settings.saveError}
        </Text>
      ) : null}
    </SettingsSection>
  );
}

export function RetrySettings({ theme }: PluginSurfaceProps) {
  const settings = useSettings(preferences);
  const style = useMemo(() => ({ color: theme.colors.foreground }), [theme]);
  if (settings.status === "loading") return <Text style={style}>正在加载…</Text>;
  if (settings.status !== "ready")
    return (
      <SettingsSection title="模型满载自动重试">
        <Text style={style} accessibilityRole="alert">
          {settings.error}
        </Text>
        <SettingsAction label="加载设置" actionLabel="重试" onPress={settings.reload} />
        {settings.status === "invalid" ? (
          <SettingsAction label="恢复默认设置" actionLabel="重置" onPress={settings.reset} />
        ) : null}
      </SettingsSection>
    );
  return <Controls key={settings.revision} settings={settings} theme={theme} />;
}
