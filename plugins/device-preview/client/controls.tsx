import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginHostProps } from "@getpaseo/plugin/client";
import type { Action, DevicePlatform } from "../shared/contracts.js";
import type { SessionSnapshot } from "./session.js";
import type { PreviewStyles } from "./styles.js";

interface ButtonProps extends Pick<PluginHostProps, "theme" | "layout"> {
  title: string;
  onPress(): void;
  disabled?: boolean;
  active?: boolean;
}
export function PreviewButton({
  theme,
  layout,
  title,
  onPress,
  disabled = false,
  active = false,
}: ButtonProps) {
  const style = useMemo(
    () => ({
      paddingHorizontal: layout.compact ? 10 : 12,
      paddingVertical: layout.compact ? 10 : 8,
      borderWidth: 1,
      borderColor: active ? theme.colors.accent : theme.colors.border,
      borderRadius: 6,
      backgroundColor: theme.colors.surface1,
      opacity: disabled ? 0.5 : 1,
    }),
    [theme, layout.compact, disabled, active],
  );
  const text = useMemo(() => ({ color: theme.colors.foreground }), [theme]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={style}
    >
      <Text style={text}>{title}</Text>
    </Pressable>
  );
}
interface Control {
  title: string;
  action: Action;
}
const androidControls: Control[] = [
  { title: "返回", action: { type: "back" } },
  { title: "Home", action: { type: "home" } },
  { title: "最近任务", action: { type: "recents" } },
  { title: "旋转", action: { type: "rotate" } },
  { title: "深色", action: { type: "night", enabled: true } },
  { title: "浅色", action: { type: "night", enabled: false } },
];
const iosControls: Control[] = [
  { title: "深色", action: { type: "appearance", mode: "dark" } },
  { title: "浅色", action: { type: "appearance", mode: "light" } },
];

interface ControlButtonProps extends Pick<ButtonProps, "theme" | "layout" | "disabled"> {
  control: Control;
  onAction(action: Action): void;
}
function ControlButton({ control, onAction, ...props }: ControlButtonProps) {
  const onPress = useCallback(() => onAction(control.action), [onAction, control]);
  return <PreviewButton {...props} title={control.title} onPress={onPress} />;
}
interface ToolbarProps extends Pick<PluginHostProps, "theme" | "layout"> {
  styles: PreviewStyles;
  platform: DevicePlatform;
  snapshot: SessionSnapshot;
  loading: boolean;
  onPlatform(platform: DevicePlatform): void;
  onRefresh(): void;
  onStop(): void;
  onAction(action: Action): void;
}
export function PreviewToolbar({
  theme,
  layout,
  styles,
  platform,
  snapshot,
  loading,
  onPlatform,
  onRefresh,
  onStop,
  onAction,
}: ToolbarProps) {
  const [menu, setMenu] = useState(false);
  const android = useCallback(() => {
    setMenu(false);
    onPlatform("android");
  }, [onPlatform]);
  const ios = useCallback(() => {
    setMenu(false);
    onPlatform("ios");
  }, [onPlatform]);
  const toggle = useCallback(() => setMenu((value) => !value), []);
  const action = useCallback(
    (value: Action) => {
      setMenu(false);
      onAction(value);
    },
    [onAction],
  );
  const connected = snapshot.phase === "ready";
  const preparing = snapshot.phase === "preparing";
  const controls = platform === "android" ? androidControls : iosControls;
  const showControls = connected && (!layout.compact || menu);
  return (
    <>
      <View style={styles.row}>
        <PreviewButton
          theme={theme}
          layout={layout}
          title="Android"
          onPress={android}
          disabled={platform === "android"}
          active={platform === "android"}
        />
        <PreviewButton
          theme={theme}
          layout={layout}
          title="iOS"
          onPress={ios}
          disabled={platform === "ios"}
          active={platform === "ios"}
        />
        <PreviewButton
          theme={theme}
          layout={layout}
          title={loading ? "刷新中…" : "刷新设备"}
          onPress={onRefresh}
          disabled={loading}
        />
        {(preparing || connected || snapshot.phase === "failed") && (
          <PreviewButton
            theme={theme}
            layout={layout}
            title={preparing ? "取消准备" : "停止预览"}
            onPress={onStop}
          />
        )}
        {layout.compact && connected && (
          <PreviewButton
            theme={theme}
            layout={layout}
            title="更多操作"
            onPress={toggle}
            active={menu}
          />
        )}
      </View>
      {showControls && (
        <View style={styles.row}>
          {controls.map((control) => (
            <ControlButton
              key={control.title}
              theme={theme}
              layout={layout}
              disabled={snapshot.inputPending}
              control={control}
              onAction={action}
            />
          ))}
        </View>
      )}
    </>
  );
}
