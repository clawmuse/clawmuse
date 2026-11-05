import { useCallback, useState, useMemo, useEffect } from "react";
import { Text, View } from "react-native";
import { router, usePathname } from "expo-router";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { AdaptiveModalSheet } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { useVoice } from "@/contexts/voice-context";
import { useSessionStore } from "@/stores/session-store";
import { useLastWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { useAssistantPanel } from "@/voice/assistant-panel-store";
import { useHostRuntimeIsConnected, getHostRuntimeStore } from "@/runtime/host-runtime";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { buildSettingsHostSectionRoute, buildSessionsRoute } from "@/utils/host-routes";
import { useSettingsHostSelection } from "@/navigation/settings-presentation";

export function VoiceAssistantPanel() {
  const { t } = useTranslation();
  const voice = useVoice();
  const open = useAssistantPanel((s) => s.open);
  const setOpen = useAssistantPanel((s) => s.setOpen);
  const close = useCallback(() => setOpen(false), [setOpen]);
  const show = useCallback(() => setOpen(true), [setOpen]);
  const [error, setError] = useState<string | null>(null);
  const stop = useCallback(() => {
    setError(null);
    void voice.stopVoice().catch((e) => setError(String(e)));
  }, [voice]);
  const header = useMemo(() => ({ title: t("speechSettings.assistantTitle") }), [t]);
  return (
    <>
      {voice.isVoiceMode && voice.isAssistant ? (
        <View style={styles.bar} testID="voice-assistant-bar">
          <Button variant="ghost" size="sm" onPress={show}>
            {t("speechSettings.assistantTitle")} ·{" "}
            {t(`speechSettings.assistantPhase.${voice.phase}`, { defaultValue: voice.phase })}
          </Button>
          <Button variant="ghost" size="sm" onPress={voice.toggleMute}>
            {t(voice.isMuted ? "speechSettings.assistantUnmute" : "speechSettings.assistantMute")}
          </Button>
          <Button variant="outline" size="sm" onPress={stop}>
            {t("speechSettings.assistantEnd")}
          </Button>
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <AdaptiveModalSheet
        visible={open}
        onClose={close}
        header={header}
        testID="voice-assistant-panel"
      >
        {open ? <AssistantPanelBody onClose={close} voice={voice} /> : null}
      </AdaptiveModalSheet>
    </>
  );
}

function AssistantPanelBody({ onClose, voice }: { onClose(): void; voice: PanelState }) {
  const sessions = useSessionStore((s) => s.sessions);
  const last = useLastWorkspaceSelection();
  const pathname = usePathname();
  const settingsHost = useSettingsHostSelection();
  const contextHost = pathname.startsWith("/settings") ? settingsHost : last?.serverId;
  const [selectedHost, setSelectedHost] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hostId = voice.isVoiceMode
    ? voice.activeServerId
    : (selectedHost ?? contextHost ?? Object.keys(sessions)[0] ?? null);
  const selectHost = useCallback((id: string) => {
    setSelectedHost(id);
    setSelectedAgent(null);
  }, []);
  const session = hostId ? sessions[hostId] : undefined;
  const connected = useHostRuntimeIsConnected(hostId ?? "");
  const { config } = useDaemonConfig(hostId);
  useEffect(() => {
    if (hostId && connected) return getHostRuntimeStore().acquireDirectoryDemand(hostId);
  }, [hostId, connected]);
  const assistant = config?.speech?.assistant;
  const agents = session
    ? [...session.agents.values()].filter((a) => !a.archivedAt && a.workspaceId)
    : [];
  const anchorId =
    selectedAgent ??
    session?.focusedAgentId ??
    agents.find((a) => a.workspaceId === last?.workspaceId)?.id;
  const anchor = agents.find((a) => a.id === anchorId);
  const active = voice.isVoiceMode;
  const start = useCallback(async () => {
    if (!hostId) return;
    setError(null);
    setBusy(true);
    try {
      await voice.startAssistant(hostId, anchor?.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [hostId, anchor?.id, voice]);
  const stop = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      await voice.stopVoice();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [voice]);
  const settings = useCallback(() => {
    if (hostId) {
      onClose();
      router.push(buildSettingsHostSectionRoute(hostId, "voice"));
    }
  }, [hostId, onClose]);
  const tasks = useCallback(() => {
    onClose();
    router.push(buildSessionsRoute());
  }, [onClose]);
  return (
    <AssistantPanelContent
      {...{
        voice,
        sessions,
        hostId,
        session,
        connected,
        assistant,
        agents,
        anchor,
        active,
        error,
        busy,
        start,
        stop,
        settings,
        tasks,
        selectHost,
        setSelectedAgent,
      }}
    />
  );
}

type PanelState = ReturnType<typeof useVoice>;
interface PanelContentProps {
  voice: PanelState;
  sessions: ReturnType<typeof useSessionStore.getState>["sessions"];
  hostId: string | null;
  session: ReturnType<typeof useSessionStore.getState>["sessions"][string] | undefined;
  connected: boolean;
  assistant: import("@getpaseo/protocol/speech-config").SpeechSettings["assistant"];
  agents: import("@/stores/session-store").Agent[];
  anchor: import("@/stores/session-store").Agent | undefined;
  active: boolean;
  error: string | null;
  busy: boolean;
  start(): Promise<void>;
  stop(): Promise<void>;
  settings(): void;
  tasks(): void;
  selectHost(id: string): void;
  setSelectedAgent(id: string): void;
}

function AssistantPanelContent({
  voice,
  sessions,
  hostId,
  session,
  connected,
  assistant,
  agents,
  anchor,
  active,
  error,
  busy,
  start,
  stop,
  settings,
  tasks,
  selectHost,
  setSelectedAgent,
}: PanelContentProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.body}>
      <Text style={styles.hint}>{t("speechSettings.assistantDescription")}</Text>
      <AssistantSelection
        {...{
          active,
          sessions,
          hostId,
          session,
          agents,
          anchor,
          busy,
          selectHost,
          setSelectedAgent,
        }}
      />
      {assistant ? (
        <Text style={styles.hint}>
          {t(
            assistant.baseUrl.includes("/step_plan/")
              ? "speechSettings.assistantCost.plan"
              : "speechSettings.assistantCost.preview",
          )}
        </Text>
      ) : null}
      {!connected ? (
        <Text style={styles.error}>{t("workspace.terminal.hostDisconnected")}</Text>
      ) : null}
      {!assistant?.enabled && !active ? (
        <Text style={styles.hint}>{t("speechSettings.assistantSetup")}</Text>
      ) : null}
      {error ? (
        <Text style={styles.error} testID="assistant-operation-error">
          {error}
        </Text>
      ) : null}
      {active ? <AssistantConversation voice={voice} /> : null}
      <View style={styles.choices}>
        {active ? (
          <>
            <Button onPress={voice.toggleMute}>
              {t(voice.isMuted ? "speechSettings.assistantUnmute" : "speechSettings.assistantMute")}
            </Button>
            <Button onPress={voice.interruptReply}>{t("speechSettings.assistantInterrupt")}</Button>
            <Button onPress={stop} disabled={busy || voice.isVoiceSwitching}>
              {t("speechSettings.assistantEnd")}
            </Button>
          </>
        ) : (
          <Button
            onPress={start}
            disabled={busy || !connected || !assistant?.enabled}
            testID="assistant-start"
          >
            {t(busy ? "speechSettings.assistantConnecting" : "speechSettings.assistantStart")}
          </Button>
        )}
        <Button variant="outline" onPress={settings} disabled={!hostId || active}>
          {t("speechSettings.assistantSettings")}
        </Button>
        <Button variant="ghost" onPress={tasks}>
          {t("speechSettings.assistantTasks")}
        </Button>
      </View>
      <Text style={styles.hint}>{t("speechSettings.assistantForeground")}</Text>
    </View>
  );
}

function AssistantConversation({ voice }: { voice: PanelState }) {
  const { t } = useTranslation();
  return (
    <>
      {voice.lastTranscript ? (
        <Text style={styles.text}>
          {t("speechSettings.assistantYou")}
          {voice.lastTranscript}
        </Text>
      ) : null}
      {voice.assistantMessage ? (
        <Text
          style={voice.phase === "connection_failed" ? styles.error : styles.text}
          testID="assistant-message"
        >
          {voice.assistantMessage}
        </Text>
      ) : null}
      {voice.assistantUsage ? (
        <Text style={styles.hint}>{t("speechSettings.assistantUsage", voice.assistantUsage)}</Text>
      ) : null}
    </>
  );
}

function AssistantSelection({
  active,
  sessions,
  hostId,
  session,
  agents,
  anchor,
  busy,
  selectHost,
  setSelectedAgent,
}: Pick<
  PanelContentProps,
  | "active"
  | "sessions"
  | "hostId"
  | "session"
  | "agents"
  | "anchor"
  | "busy"
  | "selectHost"
  | "setSelectedAgent"
>) {
  const { t } = useTranslation();
  return (
    <>
      {!active ? (
        <View style={styles.choices}>
          {Object.entries(sessions).map(([id, value]) => (
            <ChoiceButton
              key={id}
              id={id}
              label={value.serverInfo?.hostname ?? id}
              selected={id === hostId}
              onSelect={selectHost}
              disabled={busy}
            />
          ))}
        </View>
      ) : null}
      <Text style={styles.text}>
        {t("speechSettings.assistantScope", { host: session?.serverInfo?.hostname ?? "—" })}
      </Text>
      {!active && agents.length > 0 ? (
        <View style={styles.choices}>
          <Text style={styles.hint}>{t("speechSettings.assistantProject")}</Text>
          {agents.slice(0, 20).map((agent) => (
            <ChoiceButton
              key={agent.id}
              id={agent.id}
              label={agent.title ?? agent.cwd}
              selected={agent.id === anchor?.id}
              disabled={busy}
              onSelect={setSelectedAgent}
            />
          ))}
        </View>
      ) : null}
      {!anchor && !active ? (
        <Text style={styles.hint}>{t("speechSettings.assistantReadOnly")}</Text>
      ) : null}
    </>
  );
}

function ChoiceButton({
  id,
  label,
  selected,
  onSelect,
  disabled,
}: {
  id: string;
  label: string;
  selected: boolean;
  disabled: boolean;
  onSelect(id: string): void;
}) {
  const select = useCallback(() => onSelect(id), [onSelect, id]);
  return (
    <Button
      variant={selected ? "secondary" : "ghost"}
      size="sm"
      onPress={select}
      disabled={disabled}
    >
      {label}
    </Button>
  );
}

const styles = StyleSheet.create((theme) => ({
  body: { gap: theme.spacing[3], padding: theme.spacing[4] },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2], alignItems: "center" },
  bar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
    alignItems: "center",
    padding: theme.spacing[2],
    backgroundColor: theme.colors.surface1,
    borderTopWidth: 1,
    borderColor: theme.colors.border,
  },
  text: { color: theme.colors.foreground, fontSize: theme.fontSize.base },
  hint: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  error: { color: theme.colors.destructive, fontSize: theme.fontSize.sm },
}));
