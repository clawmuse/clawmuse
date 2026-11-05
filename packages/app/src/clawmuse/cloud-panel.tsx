import { useCallback } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { buildHostRootRoute } from "@/utils/host-routes";
import { densityText } from "@/styles/density";
import { useClawMuseAccount } from "./account-provider";

export function CloudSpacePanel() {
  const { model, state } = useClawMuseAccount();
  const { t } = useTranslation();
  const router = useRouter();
  const cloud = state.cloud;
  const serverId = cloud?.state === "running" ? cloud.offer?.serverId : undefined;
  const open = useCallback(() => {
    if (serverId) router.push(buildHostRootRoute(serverId));
  }, [router, serverId]);
  if (!state.cloudEnabled) return null;
  const pending = cloud?.state === "pending_configuration";
  const changing = ["starting", "stopping"].includes(cloud?.state ?? "");
  return (
    <View style={styles.panel} testID="clawmuse-cloud-space">
      <Text style={styles.title}>{t("cloudSpace.title")}</Text>
      <Text style={styles.hint}>{t("cloudSpace.intro")}</Text>
      <Text style={styles.hint} accessibilityLiveRegion="polite" testID="clawmuse-cloud-status">
        {cloud ? t(`cloudSpace.${cloud.state}`) : t("cloudSpace.loading")}
      </Text>
      {pending ? <Text style={styles.hint}>{t("cloudSpace.pendingHint")}</Text> : null}
      <CloudSpaceDetails />
      {state.cloudError ? (
        <Text style={styles.error} accessibilityRole="alert" testID="clawmuse-cloud-error">
          {state.cloudError}
        </Text>
      ) : null}
      {!pending ? (
        <View style={styles.actions}>
          {serverId ? (
            <Button onPress={open} testID="clawmuse-cloud-open">
              {t("cloudSpace.open")}
            </Button>
          ) : null}
          {cloud?.state === "running" ? (
            <Button
              variant="outline"
              onPress={model.pauseCloud}
              disabled={state.busy}
              loading={state.pendingAction === "pauseCloud"}
              testID="clawmuse-cloud-pause"
            >
              {t("cloudSpace.pause")}
            </Button>
          ) : null}
          {cloud && !changing && cloud.state !== "running" && cloud.state !== "deleted" ? (
            <Button
              onPress={model.startCloud}
              disabled={state.busy}
              loading={state.pendingAction === "startCloud"}
              testID="clawmuse-cloud-start"
            >
              {t("cloudSpace.start")}
            </Button>
          ) : null}
          {state.cloudError ? (
            <Button variant="outline" onPress={model.refresh} disabled={state.busy}>
              {t("cloudSpace.retry")}
            </Button>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function CloudSpaceDetails() {
  const {
    state: { cloud },
  } = useClawMuseAccount();
  const { t } = useTranslation();
  return (
    <>
      {cloud?.models.length ? (
        <Text style={styles.hint}>
          {cloud.models
            .map((m) => `${m.tool === "codex" ? "Codex" : "Claude Code"} · ${m.label}`)
            .join("\n")}
        </Text>
      ) : null}
      {cloud?.balance ? (
        <Text style={styles.hint}>
          {t("cloudSpace.balance", {
            amount: (cloud.balance.availableMicros / 1_000_000).toFixed(2),
          })}
        </Text>
      ) : null}
      {cloud?.balance && cloud.balance.reservedMicros > 0 ? (
        <Text style={styles.hint}>
          {t("cloudSpace.reserved", {
            amount: (cloud.balance.reservedMicros / 1_000_000).toFixed(4),
          })}
        </Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  panel: { gap: theme.spacing[2], width: "100%" },
  title: {
    color: theme.colors.foreground,
    ...densityText(theme, "footnote"),
    fontWeight: theme.fontWeight.semibold,
  },
  hint: { color: theme.colors.foregroundMuted, ...densityText(theme, "footnote") },
  error: { color: theme.colors.destructive, ...densityText(theme, "footnote") },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2] },
}));
