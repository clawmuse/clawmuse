import type { TFunction } from "i18next";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { Button } from "@/components/ui/button";
import { settingsStyles } from "@/styles/settings";

interface MobileUpdatesViewProps {
  buildNumber: string;
  enabled: boolean;
  embedded?: boolean;
  updateId?: string;
  createdAt?: Date;
  channel?: string;
  pendingId?: string;
  pending?: boolean;
  checking?: boolean;
  downloading?: boolean;
  progress?: number;
  restarting?: boolean;
  checked?: boolean;
  lastChecked?: Date;
  error?: string;
  emergency?: boolean;
  onCheck?: () => void;
  onApply?: () => void;
}

function updateStatus(props: MobileUpdatesViewProps, t: TFunction): string {
  if (!props.enabled) return t("mobileUpdates.disabled");
  if (props.restarting) return t("mobileUpdates.restarting");
  if (props.downloading)
    return t("mobileUpdates.downloading", { percent: Math.round((props.progress ?? 0) * 100) });
  if (props.checking) return t("mobileUpdates.checking");
  if (props.pending) return t("mobileUpdates.ready");
  if (props.checked) return t("mobileUpdates.current");
  return t("mobileUpdates.idle");
}

export function MobileUpdatesView(props: MobileUpdatesViewProps) {
  const { t, i18n } = useTranslation();
  const date = (value: Date) => value.toLocaleString(i18n.resolvedLanguage);
  const busy = props.checking || props.downloading || props.restarting;
  const status = updateStatus(props, t);

  return (
    <SettingsSection
      title={t("mobileUpdates.title")}
      testID="mobile-updates-section"
      info={t("mobileUpdates.explanation")}
    >
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <Text style={settingsStyles.rowTitle}>{t("mobileUpdates.build")}</Text>
          <Text selectable style={settingsStyles.rowHint} testID="mobile-build-number">
            {props.buildNumber}
          </Text>
        </View>
        <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>{t("mobileUpdates.running")}</Text>
            <Text selectable style={settingsStyles.rowHint} testID="mobile-running-update">
              {props.embedded ? t("mobileUpdates.embedded") : (props.updateId ?? "—")}
            </Text>
            {props.createdAt && <Text style={settingsStyles.rowHint}>{date(props.createdAt)}</Text>}
            {props.channel && (
              <Text style={settingsStyles.rowHint}>
                {t("mobileUpdates.channel", { channel: props.channel })}
              </Text>
            )}
            {props.emergency && (
              <Text style={settingsStyles.rowError}>{t("mobileUpdates.emergency")}</Text>
            )}
          </View>
        </View>
        <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
          <View style={settingsStyles.rowContent}>
            <Text
              style={settingsStyles.rowTitle}
              accessibilityLiveRegion="polite"
              testID="mobile-update-status"
            >
              {status}
            </Text>
            {props.pending && props.pendingId && (
              <Text selectable style={settingsStyles.rowHint}>
                {props.pendingId}
              </Text>
            )}
            {props.lastChecked && (
              <Text style={settingsStyles.rowHint}>
                {t("mobileUpdates.lastChecked", { date: date(props.lastChecked) })}
              </Text>
            )}
            {props.error && (
              <Text style={settingsStyles.rowError} accessibilityRole="alert">
                {t("mobileUpdates.failed", { error: props.error })}
              </Text>
            )}
          </View>
        </View>
        {props.enabled && (
          <View style={styles.actions}>
            <Button
              variant="outline"
              onPress={props.onCheck}
              disabled={busy || props.pending}
              testID="mobile-check-update"
            >
              {t("mobileUpdates.check")}
            </Button>
            {props.pending && (
              <Button onPress={props.onApply} disabled={busy} testID="mobile-apply-update">
                {t("mobileUpdates.restart")}
              </Button>
            )}
          </View>
        )}
      </View>
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
    padding: theme.spacing[4],
    paddingTop: 0,
  },
}));
