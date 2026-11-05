import { useClawMuseDeviceLabel } from "./device-label";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Trash2 } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "@/components/ui/external-link";
import type { EditingTextInputHandle } from "@/components/ui/text-input";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { buildHostRootRoute } from "@/utils/host-routes";
import { shouldUseDesktopDaemon } from "@/desktop/daemon/desktop-daemon";
import { useHosts, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useClawMuseAccount } from "./account-provider";
import { accountSupported } from "./transport";
import { PRIVACY_URL, TERMS_URL } from "@/privacy/legal";
import { confirmDialog } from "@/utils/confirm-dialog";
import { densityText } from "@/styles/density";
import { AccountAuthFormModel } from "./account-auth-form-model";
import { CloudSpacePanel } from "./cloud-panel";

export function ClawMuseAccountPanel({ showTitle = true }: { showTitle?: boolean }) {
  const { t } = useTranslation();
  const { model, state } = useClawMuseAccount();
  if (!accountSupported)
    return (
      <View style={styles.panel} testID="clawmuse-account-update-required">
        {showTitle ? <Text style={styles.title}>{t("clawmuseAccount.title")}</Text> : null}
        <Text style={styles.hint}>{t("clawmuseAccount.unavailable")}</Text>
      </View>
    );
  return (
    <View style={styles.panel} testID="clawmuse-account">
      {showTitle ? <Text style={styles.title}>{t("clawmuseAccount.title")}</Text> : null}
      {state.account && state.error ? (
        <Text
          style={styles.error}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          testID="clawmuse-account-error"
        >
          {state.error}
        </Text>
      ) : null}
      {state.account ? (
        <>
          <Text style={styles.hint}>{state.account.email}</Text>
          <CloudSpacePanel />
          {state.devices.map((device) => (
            <DeviceRow
              key={device.serverId}
              serverId={device.serverId}
              label={device.label}
              requiresAuthorization={device.offer.requiresAuthorization === true}
              accountAuthorization={device.accountAuthorization === true}
            />
          ))}
          {state.devices.length === 0 ? (
            <Text style={styles.hint}>{t("clawmuseAccount.noDevices")}</Text>
          ) : null}
          <View style={styles.actions}>
            {shouldUseDesktopDaemon() ? (
              <Button
                variant="outline"
                loading={state.pendingAction === "connectLocal"}
                disabled={state.busy}
                onPress={model.connectLocal}
              >
                {t("clawmuseAccount.connectLocal")}
              </Button>
            ) : null}
            <Button
              variant="outline"
              loading={state.pendingAction === "refresh"}
              disabled={state.busy}
              onPress={model.refresh}
              testID="clawmuse-refresh-devices"
            >
              {t("clawmuseAccount.refreshDevices")}
            </Button>
            <Button
              variant="ghost"
              loading={state.pendingAction === "signOut"}
              disabled={state.busy}
              onPress={model.signOut}
              testID="clawmuse-sign-out"
            >
              {t("clawmuseAccount.signOut")}
            </Button>
          </View>
          <DeleteAccountControl />
        </>
      ) : (
        <>
          <AccountAuthForm />
          <AccountLegalLinks />
        </>
      )}
      <AccountDeletionNotice />
    </View>
  );
}

function AccountAuthForm() {
  const { t } = useTranslation();
  const { model: account, state: accountState } = useClawMuseAccount();
  const [form] = useState(() => new AccountAuthFormModel(account));
  useEffect(() => () => form.close(), [form]);
  const state = useSyncExternalStore(form.subscribe, form.getState);
  const passwordInput = useRef<EditingTextInputHandle>(null);
  const router = useRouter();
  const register = state.mode === "register";
  const recover = state.mode === "recover";
  const busy = state.busy || accountState.busy;
  const error = state.error ?? accountState.error;
  const submit = useCallback(async () => {
    await form.submit();
    passwordInput.current?.reset();
    const result = account.getState();
    if (
      result.account &&
      result.devices.length === 1 &&
      !result.devices[0]!.offer.requiresAuthorization &&
      !result.error
    )
      router.replace(buildHostRootRoute(result.devices[0]!.serverId));
  }, [form, account, router]);
  const toggleMode = useCallback(() => {
    form.setMode(form.getState().mode === "login" ? "register" : "login");
  }, [form]);
  const recoverPassword = useCallback(() => form.setMode("recover"), [form]);
  const focusPassword = useCallback(() => passwordInput.current?.focus(), []);
  return (
    <>
      <Text style={styles.hint}>
        {t(recover ? "clawmuseAccount.resetIntro" : "clawmuseAccount.intro")}
      </Text>
      <Field
        label={t("clawmuseAccount.email")}
        error={state.emailError ? t(`clawmuseAccount.${state.emailError}`) : undefined}
        testID="clawmuse-email-field"
      >
        <FormTextInput
          initialValue={state.email}
          onChangeText={form.setEmail}
          onBlur={form.blurEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          returnKeyType={recover ? "send" : "next"}
          onSubmitEditing={recover ? submit : focusPassword}
          editable={!busy}
          testID="clawmuse-email"
        />
      </Field>
      {!recover ? (
        <Field
          label={t("clawmuseAccount.password")}
          hint={register ? t("clawmuseAccount.passwordHint") : undefined}
          error={state.passwordError ? t(`clawmuseAccount.${state.passwordError}`) : undefined}
          testID="clawmuse-password-field"
        >
          <FormTextInput
            ref={passwordInput}
            initialValue=""
            resetKey={state.mode}
            onChangeText={form.setPassword}
            onBlur={form.blurPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={register ? "new-password" : "current-password"}
            returnKeyType="go"
            onSubmitEditing={submit}
            editable={!busy}
            testID="clawmuse-password"
          />
        </Field>
      ) : null}
      {error ? (
        <Text
          style={styles.error}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          testID="clawmuse-auth-error"
        >
          {error}
        </Text>
      ) : null}
      {state.resetSent || state.verificationSent ? (
        <Text
          style={styles.hint}
          accessibilityRole="alert"
          testID={state.verificationSent ? "clawmuse-verification-sent" : "clawmuse-reset-sent"}
        >
          {t(
            state.verificationSent
              ? "clawmuseAccount.verificationSent"
              : "clawmuseAccount.resetSent",
          )}
        </Text>
      ) : (
        <Button
          loading={busy}
          disabled={busy || !state.canSubmit}
          onPress={submit}
          testID={recover ? "clawmuse-send-reset" : "clawmuse-sign-in"}
        >
          {
            {
              login: t("clawmuseAccount.signInConnect"),
              register: t("clawmuseAccount.registerConnect"),
              recover: t("clawmuseAccount.sendResetLink"),
            }[state.mode]
          }
        </Button>
      )}
      {state.mode === "login" ? (
        <Button
          variant="ghost"
          disabled={busy}
          onPress={recoverPassword}
          testID="clawmuse-forgot-password"
        >
          {t("clawmuseAccount.forgotPassword")}
        </Button>
      ) : null}
      <Button
        variant="ghost"
        disabled={busy}
        onPress={toggleMode}
        testID="clawmuse-switch-auth-mode"
      >
        {
          {
            login: t("clawmuseAccount.createAccount"),
            register: t("clawmuseAccount.switchToSignIn"),
            recover: t("clawmuseAccount.backToSignIn"),
          }[state.mode]
        }
      </Button>
    </>
  );
}

function AccountDeletionNotice() {
  const { t } = useTranslation();
  const { state } = useClawMuseAccount();
  return state.deleted ? (
    <Text style={styles.hint} accessibilityRole="alert">
      {t("clawmuseAccount.deleteSuccess")}
    </Text>
  ) : null;
}
function AccountLegalLinks() {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const handleLinkError = useCallback(
    (failure: unknown) => {
      setError(failure instanceof Error ? failure.message : t("privacy.unavailable"));
    },
    [t],
  );
  return (
    <View style={styles.panel} testID="clawmuse-login-notice">
      <Text style={styles.hint}>{t("clawmuseAccount.legalNotice")}</Text>
      <View style={styles.actions}>
        <ExternalLink href={TERMS_URL} label={t("privacy.terms")} onError={handleLinkError} />
        <ExternalLink href={PRIVACY_URL} label={t("privacy.policy")} onError={handleLinkError} />
      </View>
      {error ? (
        <Text style={styles.hint} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function DeleteAccountControl() {
  const { t } = useTranslation();
  const { model, state } = useClawMuseAccount();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const deletePasswordInput = useRef<EditingTextInputHandle>(null);
  const deleteAccount = useCallback(async () => {
    setError(null);
    try {
      if (
        !(await confirmDialog({
          title: t("clawmuseAccount.deleteConfirm"),
          message: t("clawmuseAccount.deleteWarning"),
          confirmLabel: t("clawmuseAccount.deleteAccount"),
          cancelLabel: t("clawmuseAccount.deleteCancel"),
          destructive: true,
        }))
      )
        return;
      await model.deleteAccount(deletePassword);
      setDeletePassword("");
      deletePasswordInput.current?.reset();
      if (model.getState().deleted) setDeleting(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("privacy.unavailable"));
    }
  }, [deletePassword, model, t]);
  const open = useCallback(() => setDeleting(true), []);
  const cancel = useCallback(() => {
    setDeleting(false);
    setDeletePassword("");
  }, []);
  return (
    <View style={styles.panel}>
      {error ? (
        <Text style={styles.hint} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {deleting ? (
        <>
          <Text style={styles.hint}>{t("clawmuseAccount.deleteWarning")}</Text>
          <Field label={t("clawmuseAccount.deletePassword")}>
            <FormTextInput
              ref={deletePasswordInput}
              initialValue=""
              onChangeText={setDeletePassword}
              editable={!state.busy}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              testID="clawmuse-delete-password"
            />
          </Field>
          <Button
            variant="outline"
            disabled={state.busy || !deletePassword}
            loading={state.pendingAction === "deleteAccount"}
            onPress={deleteAccount}
            testID="clawmuse-delete-confirm"
          >
            {t(
              state.pendingAction === "deleteAccount"
                ? "clawmuseAccount.deleteDeleting"
                : "clawmuseAccount.deleteAccount",
            )}
          </Button>
          <Button variant="ghost" disabled={state.busy} onPress={cancel}>
            {t("clawmuseAccount.deleteCancel")}
          </Button>
        </>
      ) : (
        <Button
          variant="outline"
          disabled={state.busy}
          onPress={open}
          testID="clawmuse-delete-account"
        >
          {t("clawmuseAccount.deleteAccount")}
        </Button>
      )}
    </View>
  );
}

function DeviceRow({
  serverId,
  label,
  requiresAuthorization,
  accountAuthorization,
}: {
  serverId: string;
  label: string;
  requiresAuthorization: boolean;
  accountAuthorization: boolean;
}) {
  const hosts = useHosts();
  const connected = useHostRuntimeIsConnected(serverId);
  const savedHost = hosts.find((host) => host.serverId === serverId);
  const needsPairing =
    requiresAuthorization &&
    !accountAuthorization &&
    !connected &&
    !savedHost?.controllerCredential;
  const deviceLabel = useClawMuseDeviceLabel();
  const { t } = useTranslation();
  const { model, state } = useClawMuseAccount();
  const router = useRouter();
  let statusLabel = connected ? "clawmuseAccount.connected" : "clawmuseAccount.waiting";
  if (needsPairing) statusLabel = "remoteAccess.accountHostUpdateRequired";
  const openHost = useCallback(() => router.push(buildHostRootRoute(serverId)), [router, serverId]);
  const remove = useCallback(() => model.removeDevice(serverId), [model, serverId]);
  return (
    <View style={styles.deviceRow}>
      <Button
        variant="outline"
        style={styles.deviceButton}
        loading={!savedHost && state.pendingAction === "refresh"}
        disabled={!savedHost && state.busy}
        onPress={savedHost ? openHost : model.refresh}
      >
        {deviceLabel(serverId, label)} · {t(statusLabel)}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        leftIcon={Trash2}
        disabled={state.busy}
        loading={state.pendingAction === `removeDevice:${serverId}`}
        onPress={remove}
        accessibilityLabel={t("clawmuseAccount.removeDevice", {
          device: deviceLabel(serverId, label),
        })}
        testID={`clawmuse-remove-device-${serverId}`}
      >
        {t("clawmuseAccount.remove")}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  panel: { width: "100%", gap: theme.spacing[3] },
  title: {
    color: theme.colors.foreground,
    ...densityText(theme, "title"),
    fontWeight: { xs: theme.fontWeight.semibold, md: theme.fontWeight.medium },
  },
  error: { color: theme.colors.destructive, ...densityText(theme, "footnote") },
  hint: { color: theme.colors.foregroundMuted, ...densityText(theme, "footnote") },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2] },
  deviceRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing[2] },
  deviceButton: { flex: 1 },
}));
