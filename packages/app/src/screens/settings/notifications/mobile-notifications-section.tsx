import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Platform, Text, View } from "react-native";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { isNative } from "@/constants/platform";
import {
  useNotificationPreferences,
  type MobileNotificationPreferences,
} from "@/notifications/preferences";
import { settingsStyles } from "@/styles/settings";

type EditablePreferenceKey = Exclude<keyof MobileNotificationPreferences, "pushEnabled">;

interface ToggleRowProps {
  title: string;
  hint: string;
  value: boolean;
  disabled?: boolean;
  bordered?: boolean;
  testID: string;
  onValueChange: (value: boolean) => void;
}

function ToggleRow({
  title,
  hint,
  value,
  disabled = false,
  bordered = true,
  testID,
  onValueChange,
}: ToggleRowProps) {
  return (
    <View style={bordered ? [settingsStyles.row, settingsStyles.rowBorder] : settingsStyles.row}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{title}</Text>
        <Text style={settingsStyles.rowHint}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel={title}
        testID={testID}
      />
    </View>
  );
}

export function MobileNotificationsSection() {
  const { t } = useTranslation();
  const {
    hydrated,
    saving,
    osPermissionStatus,
    permissionDeniedPrompt,
    preferences,
    setPushEnabled,
    updatePreferences,
  } = useNotificationPreferences();

  const handlePushEnabledChange = useCallback(
    (enabled: boolean) => {
      void setPushEnabled(enabled);
    },
    [setPushEnabled],
  );

  const handleOpenSystemSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  const makeFieldHandler = useCallback(
    (key: EditablePreferenceKey) => (value: boolean) => {
      void updatePreferences({ [key]: value });
    },
    [updatePreferences],
  );

  if (!isNative) {
    return null;
  }

  const isBusy = !hydrated || saving;
  const permissionDenied = osPermissionStatus === "denied";
  const effectivePushEnabled = preferences.pushEnabled && !permissionDenied;
  const showPermissionWarning =
    permissionDeniedPrompt || (preferences.pushEnabled && permissionDenied);
  const subToggleDisabled = isBusy || !effectivePushEnabled;

  return (
    <>
      <SettingsSection title={t("notificationSettings.mobileTitle")}>
        <View style={settingsStyles.card}>
          <ToggleRow
            bordered={false}
            title={t("notificationSettings.pushEnabled")}
            hint={t("notificationSettings.pushEnabledHint")}
            value={effectivePushEnabled}
            disabled={isBusy}
            testID="mobile-notifications-push-enabled-switch"
            onValueChange={handlePushEnabledChange}
          />
          {showPermissionWarning ? (
            <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
              <View style={settingsStyles.rowContent}>
                <Text style={settingsStyles.rowTitle}>
                  {t("notificationSettings.permissionDeniedTitle")}
                </Text>
                <Text style={settingsStyles.rowError}>
                  {t("notificationSettings.permissionDeniedDescription")}
                </Text>
              </View>
              <Button
                variant="outline"
                size="sm"
                onPress={handleOpenSystemSettings}
                testID="mobile-notifications-open-system-settings"
              >
                {t("notificationSettings.openSystemSettings")}
              </Button>
            </View>
          ) : null}
        </View>
      </SettingsSection>

      <SettingsSection title={t("notificationSettings.eventsTitle")}>
        <View style={settingsStyles.card}>
          <ToggleRow
            bordered={false}
            title={t("notificationSettings.needsAction")}
            hint={t("notificationSettings.needsActionHint")}
            value={preferences.needsAction}
            disabled={subToggleDisabled}
            testID="mobile-notifications-needs-action-switch"
            onValueChange={makeFieldHandler("needsAction")}
          />
          <ToggleRow
            title={t("notificationSettings.taskCompleted")}
            hint={t("notificationSettings.taskCompletedHint")}
            value={preferences.taskCompleted}
            disabled={subToggleDisabled}
            testID="mobile-notifications-task-completed-switch"
            onValueChange={makeFieldHandler("taskCompleted")}
          />
          <ToggleRow
            title={t("notificationSettings.taskError")}
            hint={t("notificationSettings.taskErrorHint")}
            value={preferences.taskError}
            disabled={subToggleDisabled}
            testID="mobile-notifications-task-error-switch"
            onValueChange={makeFieldHandler("taskError")}
          />
          <ToggleRow
            title={t("notificationSettings.taskRunning")}
            hint={t("notificationSettings.taskRunningHint")}
            value={preferences.taskRunning}
            disabled={subToggleDisabled}
            testID="mobile-notifications-task-running-switch"
            onValueChange={makeFieldHandler("taskRunning")}
          />
          <ToggleRow
            title={t("notificationSettings.goalsReview")}
            hint={t("notificationSettings.goalsReviewHint")}
            value={preferences.goalsReview}
            disabled={subToggleDisabled}
            testID="mobile-notifications-goals-review-switch"
            onValueChange={makeFieldHandler("goalsReview")}
          />
        </View>
      </SettingsSection>

      <SettingsSection title={t("notificationSettings.deliveryTitle")}>
        <View style={settingsStyles.card}>
          <ToggleRow
            bordered={false}
            title={t("notificationSettings.suppressWhenActive")}
            hint={t("notificationSettings.suppressWhenActiveHint")}
            value={preferences.suppressWhenActive}
            disabled={subToggleDisabled}
            testID="mobile-notifications-suppress-active-switch"
            onValueChange={makeFieldHandler("suppressWhenActive")}
          />
          <ToggleRow
            title={t("notificationSettings.foregroundBanner")}
            hint={t("notificationSettings.foregroundBannerHint")}
            value={preferences.foregroundBanner}
            disabled={subToggleDisabled}
            testID="mobile-notifications-foreground-banner-switch"
            onValueChange={makeFieldHandler("foregroundBanner")}
          />
          <ToggleRow
            title={t("notificationSettings.showPreview")}
            hint={t("notificationSettings.showPreviewHint")}
            value={preferences.showPreview}
            disabled={subToggleDisabled}
            testID="mobile-notifications-show-preview-switch"
            onValueChange={makeFieldHandler("showPreview")}
          />
        </View>
      </SettingsSection>

      {Platform.OS === "ios" ? (
        <SettingsSection title={t("notificationSettings.liveActivityTitle")}>
          <View style={settingsStyles.card}>
            <ToggleRow
              bordered={false}
              title={t("notificationSettings.liveActivityEnabled")}
              hint={t("notificationSettings.liveActivityEnabledHint")}
              value={preferences.liveActivityEnabled}
              disabled={isBusy}
              testID="mobile-notifications-live-activity-enabled-switch"
              onValueChange={makeFieldHandler("liveActivityEnabled")}
            />
            <ToggleRow
              title={t("notificationSettings.liveActivityPushToStart")}
              hint={t("notificationSettings.liveActivityPushToStartHint")}
              value={preferences.liveActivityPushToStart}
              disabled={isBusy || !preferences.liveActivityEnabled}
              testID="mobile-notifications-live-activity-push-to-start-switch"
              onValueChange={makeFieldHandler("liveActivityPushToStart")}
            />
          </View>
        </SettingsSection>
      ) : null}
    </>
  );
}
