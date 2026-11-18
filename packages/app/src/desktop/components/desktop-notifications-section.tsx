import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { withUnistyles } from "react-native-unistyles";
import { RotateCw } from "@/components/icons/app-icons";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { DesktopPermissionRow } from "@/desktop/components/desktop-permission-row";
import { useDesktopPermissions } from "@/desktop/permissions/use-desktop-permissions";
import { useDesktopSettings, type DesktopSettings } from "@/desktop/settings/desktop-settings";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { settingsStyles } from "@/styles/settings";

const ThemedRotateCw = withUnistyles(RotateCw, (theme) => ({
  size: theme.iconSize.md,
  color: theme.colors.foregroundMuted,
}));

type DesktopNotificationToggleKey = keyof DesktopSettings["notifications"];

interface DesktopToggleRowProps {
  title: string;
  hint: string;
  value: boolean;
  disabled?: boolean;
  bordered?: boolean;
  testID: string;
  onValueChange: (value: boolean) => void;
}

function DesktopToggleRow({
  title,
  hint,
  value,
  disabled = false,
  bordered = true,
  testID,
  onValueChange,
}: DesktopToggleRowProps) {
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

export function DesktopNotificationsSection() {
  const { t } = useTranslation();
  const { settings, isSaving, updateSettings } = useDesktopSettings();
  const {
    isDesktopApp,
    snapshot,
    isRefreshing,
    requestingPermission,
    testNotificationState,
    refreshPermissions,
    requestPermission,
    sendTestNotification,
  } = useDesktopPermissions();

  const handleRefreshPress = useCallback(() => {
    void refreshPermissions();
  }, [refreshPermissions]);

  const handleRequestNotifications = useCallback(() => {
    void requestPermission("notifications");
  }, [requestPermission]);

  const handleToggleChange = useCallback(
    (key: DesktopNotificationToggleKey) => (value: boolean) => {
      void updateSettings({ notifications: { [key]: value } }).catch(() => {
        // useDesktopSettings owns the user-visible IPC error.
      });
    },
    [updateSettings],
  );

  const handleSendTestNotification = useCallback(() => {
    void sendTestNotification();
  }, [sendTestNotification]);

  const isPermissionBusy = isRefreshing || requestingPermission !== null;
  const isSendingTestNotification = testNotificationState.status === "sending";
  const refreshIcon = useMemo(() => <ThemedRotateCw />, []);
  const refreshButton = useMemo(
    () => (
      <Button
        variant="ghost"
        leftIcon={refreshIcon}
        onPress={handleRefreshPress}
        disabled={isPermissionBusy}
        accessibilityLabel={t("settings.notifications.refreshAccessibility")}
      >
        {isRefreshing ? t("settings.permissions.refreshing") : t("settings.permissions.refresh")}
      </Button>
    ),
    [handleRefreshPress, isPermissionBusy, isRefreshing, refreshIcon, t],
  );
  const permissionLabels = useMemo(
    () => ({
      granted: t("settings.permissions.actions.granted"),
      request: t("settings.permissions.actions.request"),
      requesting: t("settings.permissions.actions.requesting"),
    }),
    [t],
  );

  if (!isDesktopApp) {
    return null;
  }

  const notificationsGranted = snapshot?.notifications.state === "granted";
  const subToggleDisabled = isSaving || !settings.notifications.enabled;

  return (
    <>
      <SettingsSection title={t("settings.notifications.title")} trailing={refreshButton}>
        <View style={settingsStyles.card}>
          <DesktopPermissionRow
            title={t("settings.notifications.permission")}
            status={snapshot?.notifications ?? null}
            isRequesting={requestingPermission === "notifications"}
            onRequest={handleRequestNotifications}
            labels={permissionLabels}
          />
          <DesktopToggleRow
            title={t("notificationSettings.desktopEnabled")}
            hint={t("notificationSettings.desktopEnabledHint")}
            value={settings.notifications.enabled}
            disabled={isSaving}
            testID="desktop-notifications-enabled-switch"
            onValueChange={handleToggleChange("enabled")}
          />
          <DesktopToggleRow
            title={t("settings.notifications.playSound")}
            hint={t("settings.notifications.playSoundHint")}
            value={settings.notifications.playSound}
            disabled={subToggleDisabled}
            testID="desktop-notifications-play-sound-switch"
            onValueChange={handleToggleChange("playSound")}
          />
          <DesktopToggleRow
            title={t("notificationSettings.suppressWhenFocused")}
            hint={t("notificationSettings.suppressWhenFocusedHint")}
            value={settings.notifications.suppressWhenFocused}
            disabled={subToggleDisabled}
            testID="desktop-notifications-suppress-focused-switch"
            onValueChange={handleToggleChange("suppressWhenFocused")}
          />
          <DesktopToggleRow
            title={t("notificationSettings.showPreview")}
            hint={t("notificationSettings.showPreviewHint")}
            value={settings.notifications.showPreview}
            disabled={subToggleDisabled}
            testID="desktop-notifications-show-preview-switch"
            onValueChange={handleToggleChange("showPreview")}
          />
          <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
            <View style={settingsStyles.rowContent}>
              <Text style={settingsStyles.rowTitle}>{t("settings.notifications.test")}</Text>
              <Text style={settingsStyles.rowHint}>
                {notificationsGranted
                  ? t("settings.notifications.testHint")
                  : t("settings.notifications.permissionRequired")}
              </Text>
            </View>
            <Button
              variant="outline"
              size="sm"
              onPress={handleSendTestNotification}
              disabled={!notificationsGranted || isPermissionBusy || isSendingTestNotification}
            >
              {isSendingTestNotification
                ? t("settings.notifications.sending")
                : t("settings.notifications.send")}
            </Button>
          </View>
        </View>
        {testNotificationState.status === "success" ? (
          <Alert
            size="sm"
            variant="success"
            title={t("settings.notifications.sentTitle")}
            description={t("settings.notifications.sentDescription")}
            testID="desktop-notifications-test-success"
          />
        ) : null}
        {testNotificationState.status === "error" ? (
          <Alert
            size="sm"
            variant="error"
            title={t("settings.notifications.sendFailedTitle")}
            description={testNotificationState.message}
            testID="desktop-notifications-test-error"
          />
        ) : null}
      </SettingsSection>

      <SettingsSection title={t("notificationSettings.eventsTitle")}>
        <View style={settingsStyles.card}>
          <DesktopToggleRow
            bordered={false}
            title={t("notificationSettings.needsAction")}
            hint={t("notificationSettings.needsActionHint")}
            value={settings.notifications.permission}
            disabled={subToggleDisabled}
            testID="desktop-notifications-permission-switch"
            onValueChange={handleToggleChange("permission")}
          />
          <DesktopToggleRow
            title={t("notificationSettings.taskCompleted")}
            hint={t("notificationSettings.taskCompletedHint")}
            value={settings.notifications.finished}
            disabled={subToggleDisabled}
            testID="desktop-notifications-finished-switch"
            onValueChange={handleToggleChange("finished")}
          />
          <DesktopToggleRow
            title={t("notificationSettings.taskError")}
            hint={t("notificationSettings.taskErrorHint")}
            value={settings.notifications.error}
            disabled={subToggleDisabled}
            testID="desktop-notifications-error-switch"
            onValueChange={handleToggleChange("error")}
          />
          <DesktopToggleRow
            title={t("notificationSettings.taskRunning")}
            hint={t("notificationSettings.taskRunningHint")}
            value={settings.notifications.running}
            disabled={subToggleDisabled}
            testID="desktop-notifications-running-switch"
            onValueChange={handleToggleChange("running")}
          />
          <DesktopToggleRow
            title={t("notificationSettings.goalsReview")}
            hint={t("notificationSettings.goalsReviewHint")}
            value={settings.notifications.goalsReview}
            disabled={subToggleDisabled}
            testID="desktop-notifications-goals-review-switch"
            onValueChange={handleToggleChange("goalsReview")}
          />
        </View>
      </SettingsSection>
    </>
  );
}
