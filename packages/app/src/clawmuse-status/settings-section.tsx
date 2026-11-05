import type { TFunction } from "i18next";
import { useCallback, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Platform, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { useHosts } from "@/runtime/host-runtime";
import { settingsStyles } from "@/styles/settings";
import {
  getClawMuseStatusBindingSnapshot,
  subscribeClawMuseStatusBindings,
  type ClawMuseStatusHostBinding,
} from "./binding-state";
import { getClawMuseStatusControls } from "./controls";
import { ClawMuseUsageCard } from "./usage-card";

type PendingAction = { kind: "bind" | "recreate" } | { kind: "unbind"; serverId: string } | null;

const OFFLINE_BINDING: ClawMuseStatusHostBinding = { kind: "offline" };

function useBindingSnapshot() {
  return useSyncExternalStore(
    subscribeClawMuseStatusBindings,
    getClawMuseStatusBindingSnapshot,
    getClawMuseStatusBindingSnapshot,
  );
}

function HostBindingRow({
  serverId,
  hostLabel,
  binding,
  isFirst,
  isBusy,
  isUnbinding,
  onBind,
  onUnbind,
}: {
  serverId: string;
  hostLabel: string;
  binding: ClawMuseStatusHostBinding;
  isFirst: boolean;
  isBusy: boolean;
  isUnbinding: boolean;
  onBind: () => void;
  onUnbind: (serverId: string) => void;
}) {
  const { t } = useTranslation();
  const unbind = useCallback(() => onUnbind(serverId), [onUnbind, serverId]);
  const detail = describeBinding(binding, t);
  return (
    <View style={isFirst ? settingsStyles.row : styles.rowWithBorder}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle} numberOfLines={1}>
          {hostLabel}
        </Text>
        <Text style={settingsStyles.rowHint}>{detail}</Text>
      </View>
      {binding.kind === "bound" ? (
        <Button variant="ghost" size="sm" onPress={unbind} disabled={isBusy} loading={isUnbinding}>
          {t("clawmuseStatus.settings.actions.unbind")}
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          onPress={onBind}
          disabled={isBusy || binding.kind === "unsupported"}
        >
          {t("clawmuseStatus.settings.actions.bind")}
        </Button>
      )}
    </View>
  );
}

function describeBinding(binding: ClawMuseStatusHostBinding, t: TFunction): string {
  switch (binding.kind) {
    case "bound":
      return t("clawmuseStatus.settings.state.bound");
    case "unbound":
      return t("clawmuseStatus.settings.state.unbound");
    case "unsupported":
      return t("clawmuseStatus.settings.state.unsupported");
    case "offline":
      return t("clawmuseStatus.settings.state.offline");
    case "base_url_mismatch":
      return t("clawmuseStatus.settings.state.baseUrlMismatch", { baseUrl: binding.hostBaseUrl });
    case "error":
      return t("clawmuseStatus.settings.state.error", { message: binding.message });
  }
}

/**
 * Settings → Notifications: which hosts publish to ClawMuse Status, what the
 * lock-screen capsule is doing, and the plan usage the widget mirrors.
 */
export function ClawMuseStatusSettingsSection() {
  const { t } = useTranslation();
  const snapshot = useBindingSnapshot();
  const hosts = useHosts();
  const [pending, setPending] = useState<PendingAction>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const runBind = useCallback(() => {
    const controls = getClawMuseStatusControls();
    if (!controls) {
      return;
    }
    setPending({ kind: "bind" });
    setFailure(null);
    void controls
      .synchronize()
      .catch((error: unknown) => setFailure(error instanceof Error ? error.message : String(error)))
      .finally(() => setPending(null));
  }, []);

  const runRecreate = useCallback(() => {
    const controls = getClawMuseStatusControls();
    if (!controls) {
      return;
    }
    setPending({ kind: "recreate" });
    setFailure(null);
    void controls
      .recreateLiveActivity()
      .catch((error: unknown) => setFailure(error instanceof Error ? error.message : String(error)))
      .finally(() => setPending(null));
  }, []);

  const runUnbind = useCallback((serverId: string) => {
    const controls = getClawMuseStatusControls();
    if (!controls) {
      return;
    }
    setPending({ kind: "unbind", serverId });
    setFailure(null);
    void controls
      .unbindHost(serverId)
      .catch((error: unknown) => setFailure(error instanceof Error ? error.message : String(error)))
      .finally(() => setPending(null));
  }, []);

  // The phone always shows the section (it explains when the capsule is
  // unavailable); the desktop shows it once it holds a status session.
  if (Platform.OS !== "ios" && !snapshot.supported) {
    return null;
  }

  return (
    <SettingsSection
      title={t(
        snapshot.liveActivity || Platform.OS === "ios"
          ? "clawmuseStatus.settings.title"
          : "clawmuseStatus.settings.titleDesktop",
      )}
    >
      <ClawMuseUsageCard />
      {snapshot.supported ? (
        <View style={settingsStyles.card}>
          {hosts.map((host, index) => (
            <HostBindingRow
              key={host.serverId}
              serverId={host.serverId}
              hostLabel={host.label}
              binding={snapshot.hosts[host.serverId] ?? OFFLINE_BINDING}
              isFirst={index === 0}
              isBusy={pending !== null}
              isUnbinding={pending?.kind === "unbind" && pending.serverId === host.serverId}
              onBind={runBind}
              onUnbind={runUnbind}
            />
          ))}
        </View>
      ) : (
        <Text style={settingsStyles.rowHint}>{t("clawmuseStatus.settings.unavailable")}</Text>
      )}
      {Platform.OS === "ios" ? (
        <View style={styles.footer}>
          <Text style={settingsStyles.rowHint}>{t("clawmuseStatus.settings.widgetHint")}</Text>
          <Button
            variant="ghost"
            size="sm"
            onPress={runRecreate}
            disabled={pending !== null || !snapshot.liveActivity}
            loading={pending?.kind === "recreate"}
          >
            {t("clawmuseStatus.settings.actions.recreate")}
          </Button>
        </View>
      ) : null}
      {failure ? <Text style={settingsStyles.rowError}>{failure}</Text> : null}
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  rowWithBorder: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[4],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
}));
