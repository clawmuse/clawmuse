import { useEffect, useSyncExternalStore } from "react";
import { Text, View, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getHostRuntimeStore, isHostRuntimeConnected, useHosts } from "@/runtime/host-runtime";
import { ClawMuseAccountPanel } from "@/clawmuse/account-panel";
import { ClawMuseLogo } from "@/components/icons/clawmuse-logo";
import { resolveAppVersion } from "@/utils/app-version";
import { formatVersionWithPrefix } from "@/desktop/updates/desktop-updates";
import { buildOpenProjectRoute } from "@/utils/host-routes";
import { densityText } from "@/styles/density";

function useAnyHostOnline(serverIds: string[]): string | null {
  const runtime = getHostRuntimeStore();
  return useSyncExternalStore(
    (onStoreChange) => runtime.subscribeAll(onStoreChange),
    () => {
      let firstOnlineServerId: string | null = null;
      let firstOnlineAt: string | null = null;
      for (const serverId of serverIds) {
        const snapshot = runtime.getSnapshot(serverId);
        const lastOnlineAt = snapshot?.lastOnlineAt ?? null;
        if (!isHostRuntimeConnected(snapshot) || !lastOnlineAt) {
          continue;
        }
        if (!firstOnlineAt || lastOnlineAt < firstOnlineAt) {
          firstOnlineAt = lastOnlineAt;
          firstOnlineServerId = serverId;
        }
      }
      return firstOnlineServerId;
    },
    () => {
      let firstOnlineServerId: string | null = null;
      let firstOnlineAt: string | null = null;
      for (const serverId of serverIds) {
        const snapshot = runtime.getSnapshot(serverId);
        const lastOnlineAt = snapshot?.lastOnlineAt ?? null;
        if (!isHostRuntimeConnected(snapshot) || !lastOnlineAt) {
          continue;
        }
        if (!firstOnlineAt || lastOnlineAt < firstOnlineAt) {
          firstOnlineAt = lastOnlineAt;
          firstOnlineServerId = serverId;
        }
      }
      return firstOnlineServerId;
    },
  );
}

export function WelcomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const hosts = useHosts();
  const onlineId = useAnyHostOnline(hosts.map((host) => host.serverId));
  useEffect(() => {
    if (onlineId) router.replace(buildOpenProjectRoute());
  }, [onlineId, router]);
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
      testID="welcome-screen"
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.content}>
        <ClawMuseLogo size={80} />
        <Text style={styles.title}>ClawMuse</Text>
        <Text style={styles.subtitle}>{t("onboarding.tagline")}</Text>
        <ClawMuseAccountPanel />
        <Text style={styles.subtitle}>{formatVersionWithPrefix(resolveAppVersion())}</Text>
      </View>
    </ScrollView>
  );
}
const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.surface0 },
  container: { flexGrow: 1, justifyContent: "center", alignItems: "center" },
  content: {
    width: "100%",
    maxWidth: 468,
    padding: theme.spacing[6],
    gap: theme.spacing[6],
    alignItems: "center",
  },
  title: {
    color: theme.colors.foreground,
    ...densityText(theme, "title"),
    fontSize: { xs: densityText(theme, "title").fontSize.xs, md: theme.fontSize["2xl"] },
    fontWeight: { xs: theme.fontWeight.semibold, md: theme.fontWeight.medium },
  },
  subtitle: { color: theme.colors.foregroundMuted, ...densityText(theme, "footnote") },
}));
