import { useAssistantPanel } from "@/voice/assistant-panel-store";
import { AiAgentArchiveButton } from "@/components/ai-agent-archive";
import { router, usePathname } from "expo-router";
import { memo, useCallback, useMemo, useRef, type ComponentType, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import {
  CirclePlus,
  Headphones,
  History,
  Search,
  Target,
  Timer,
} from "@/components/icons/app-icons";
import { SidebarNavIconButton } from "@/components/sidebar/sidebar-nav-icon-button";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import { PluginSidebarItem } from "@/plugins/sidebar-items";
import { useOpenNewWorkspace } from "@/hooks/use-open-new-workspace";
import {
  builtinSidebarNavLabelKey,
  builtinSidebarNavShortcutAction,
  type BuiltinSidebarNavId,
} from "@/sidebar-nav/model";
import { useSidebarNavItems } from "@/sidebar-nav/use-sidebar-nav-items";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import { buildGoalsRoute, buildSchedulesRoute, buildSessionsRoute } from "@/utils/host-routes";

interface SidebarNavRowProps {
  onBeforeNavigate?: () => void;
}

interface SidebarNavRowsProps {
  onBeforeNavigate?: () => void;
  /** Style for the group wrapper, which the sidebar owns. */
  style?: StyleProp<ViewStyle>;
  /** End of the icon line, such as the phone sidebar's close button. */
  trailing?: ReactNode;
}

/** Top-level icon navigation, ordered and filtered by the user's sidebar preferences. */
export function SidebarNavRows({ style, onBeforeNavigate, trailing }: SidebarNavRowsProps) {
  const { t } = useTranslation();
  const setAssistantOpen = useAssistantPanel((s) => s.setOpen);
  const openAssistant = useCallback(() => {
    onBeforeNavigate?.();
    setAssistantOpen(true);
  }, [onBeforeNavigate, setAssistantOpen]);
  const { items } = useSidebarNavItems("header");
  const visibleItems = useMemo(() => items.filter((item) => item.visible), [items]);
  const groupRef = useRef<View | null>(null);

  const renderPlugin = (item: Extract<(typeof visibleItems)[number], { kind: "plugin" }>) => (
    <PluginSidebarItem
      key={item.key}
      group={item.group}
      section="header"
      fallbackAnchorRef={groupRef}
      onBeforeNavigate={onBeforeNavigate}
    />
  );

  return (
    <View ref={groupRef} collapsable={false} style={style}>
      <View style={styles.iconLine}>
        {visibleItems.map((item) => {
          if (item.kind === "plugin") return renderPlugin(item);
          const Row = BUILTIN_ROWS[item.id];
          return <Row key={item.key} onBeforeNavigate={onBeforeNavigate} />;
        })}
        <SidebarNavIconButton
          icon={Headphones}
          label={t("speechSettings.assistantTitle")}
          onPress={openAssistant}
          testID="sidebar-voice-assistant"
        />
        <AiAgentArchiveButton />
        {trailing ? <View style={styles.iconLineSpacer} /> : null}
        {trailing}
      </View>
    </View>
  );
}

const SidebarNewWorkspaceRow = memo(function SidebarNewWorkspaceRow({
  onBeforeNavigate,
}: SidebarNavRowProps) {
  const { t } = useTranslation();
  const shortcutKeys = useShortcutKeys(builtinSidebarNavShortcutAction("new-workspace"));
  const handlePress = useOpenNewWorkspace(onBeforeNavigate);

  return (
    <SidebarNavIconButton
      icon={CirclePlus}
      label={t(builtinSidebarNavLabelKey("new-workspace"))}
      onPress={handlePress}
      testID="sidebar-global-new-workspace"
      shortcutKeys={shortcutKeys}
    />
  );
});

function SidebarHistoryRow({ onBeforeNavigate }: SidebarNavRowProps) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const handlePress = useCallback(() => {
    onBeforeNavigate?.();
    router.push(buildSessionsRoute());
  }, [onBeforeNavigate]);

  return (
    <SidebarNavIconButton
      icon={History}
      label={t(builtinSidebarNavLabelKey("history"))}
      onPress={handlePress}
      isActive={pathname.includes("/sessions")}
      testID="sidebar-sessions"
    />
  );
}

function SidebarSearchRow() {
  const { t } = useTranslation();
  const shortcutKeys = useShortcutKeys(builtinSidebarNavShortcutAction("search"));
  const setCommandCenterOpen = useKeyboardShortcutsStore((state) => state.setCommandCenterOpen);
  const handlePress = useCallback(() => {
    setCommandCenterOpen(true);
  }, [setCommandCenterOpen]);

  return (
    <SidebarNavIconButton
      icon={Search}
      label={t(builtinSidebarNavLabelKey("search"))}
      onPress={handlePress}
      testID="sidebar-search"
      shortcutKeys={shortcutKeys}
    />
  );
}

function SidebarSchedulesRow({ onBeforeNavigate }: SidebarNavRowProps) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const handlePress = useCallback(() => {
    onBeforeNavigate?.();
    router.push(buildSchedulesRoute());
  }, [onBeforeNavigate]);

  return (
    <SidebarNavIconButton
      icon={Timer}
      label={t(builtinSidebarNavLabelKey("schedules"))}
      onPress={handlePress}
      isActive={pathname.includes("/schedules")}
      testID="sidebar-schedules"
    />
  );
}

function SidebarGoalsRow({ onBeforeNavigate }: SidebarNavRowProps) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const handlePress = useCallback(() => {
    onBeforeNavigate?.();
    router.push(buildGoalsRoute());
  }, [onBeforeNavigate]);

  return (
    <SidebarNavIconButton
      icon={Target}
      label={t(builtinSidebarNavLabelKey("goals"))}
      onPress={handlePress}
      isActive={pathname.includes("/goals")}
      testID="sidebar-goals"
    />
  );
}

const BUILTIN_ROWS: Record<BuiltinSidebarNavId, ComponentType<SidebarNavRowProps>> = {
  "new-workspace": SidebarNewWorkspaceRow,
  history: SidebarHistoryRow,
  search: SidebarSearchRow,
  schedules: SidebarSchedulesRow,
  goals: SidebarGoalsRow,
};

const styles = StyleSheet.create((theme) => ({
  iconLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    paddingHorizontal: theme.spacing[2],
  },
  iconLineSpacer: {
    flex: 1,
  },
}));
