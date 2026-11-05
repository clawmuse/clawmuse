import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { BarcodeScanningResult, BarcodeSettings } from "expo-camera";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { openPairScan } from "@/hosts/pair-scan-model";
import { buildHostRootRoute, buildSettingsHostRoute } from "@/utils/host-routes";
import { isWeb } from "@/constants/platform";
import { BackHeader } from "@/components/headers/back-header";
import { PairLinkModal } from "@/components/pair-link-modal";
import { Button } from "@/components/ui/button";

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  body: {
    flex: 1,
    paddingHorizontal: theme.spacing[6],
  },
  cameraWrap: {
    flex: 1,
    overflow: "hidden",
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.surface2,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: "center",
    alignItems: "center",
  },
  scanFrame: {
    width: 260,
    height: 260,
  },
  corner: {
    position: "absolute",
    width: 36,
    height: 36,
    borderColor: theme.colors.accent,
  },
  cornerTL: {
    left: 0,
    top: 0,
    borderLeftWidth: 4,
    borderTopWidth: 4,
    borderTopLeftRadius: 12,
  },
  cornerTR: {
    right: 0,
    top: 0,
    borderRightWidth: 4,
    borderTopWidth: 4,
    borderTopRightRadius: 12,
  },
  cornerBL: {
    left: 0,
    bottom: 0,
    borderLeftWidth: 4,
    borderBottomWidth: 4,
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    right: 0,
    bottom: 0,
    borderRightWidth: 4,
    borderBottomWidth: 4,
    borderBottomRightRadius: 12,
  },
  scanAgainButton: {
    marginTop: theme.spacing[6],
  },
  permissionCard: {
    marginTop: theme.spacing[6],
    padding: theme.spacing[6],
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.surface2,
    gap: theme.spacing[4],
  },
  permissionTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
  },
  permissionBody: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
  permissionButton: {
    alignSelf: "flex-start",
    paddingHorizontal: theme.spacing[6],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.palette.blue[500],
  },
  permissionButtonText: {
    color: theme.colors.palette.white,
    fontWeight: theme.fontWeight.semibold,
  },
  statusCard: {
    marginTop: theme.spacing[6],
    padding: theme.spacing[6],
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.surface2,
    gap: theme.spacing[4],
  },
  approvalCode: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.semibold,
    letterSpacing: 1,
  },
}));

export default function PairScanScreen() {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    source?: string;
  }>();
  const source = typeof params.source === "string" ? params.source : "settings";

  const [permission, requestPermission] = useCameraPermissions();

  const navigateToPairedHost = useCallback(
    (serverId: string) => {
      if (source === "onboarding") {
        router.replace(buildHostRootRoute(serverId));
        return;
      }
      router.replace(buildSettingsHostRoute(serverId));
    },
    [router, source],
  );

  const [scan] = useState(() =>
    openPairScan({
      importConnectionLink: (link, onPending) =>
        getHostRuntimeStore().importConnectionLink(
          link,
          source === "onboarding" ? "hostRoot" : "hostSettings",
          onPending,
        ),
      onConnected: navigateToPairedHost,
    }),
  );
  const scanState = useSyncExternalStore(scan.subscribe, scan.getState, scan.getState);
  useEffect(() => () => scan.close(), [scan]);

  const closeToSource = useCallback(() => {
    try {
      router.back();
    } catch {
      router.replace("/" as Href);
    }
  }, [router]);

  useEffect(() => {
    if (isWeb) return;
    if (permission && permission.granted) return;
    void requestPermission().catch(() => undefined);
  }, [permission, requestPermission]);

  const handleScan = useCallback(
    (result: BarcodeScanningResult) =>
      scan.scan(typeof result.data === "string" ? result.data : ""),
    [scan],
  );

  const handleRouterBack = useCallback(() => router.back(), [router]);
  const savePasswordPairing = useCallback(
    ({ serverId }: { serverId: string }) => navigateToPairedHost(serverId),
    [navigateToPairedHost],
  );
  const handleRequestPermission = useCallback(() => {
    void requestPermission();
  }, [requestPermission]);

  const bodyStyle = useMemo(
    () => [styles.body, { paddingBottom: insets.bottom + theme.spacing[6] }],
    [insets.bottom, theme.spacing],
  );
  if (isWeb) {
    return (
      <View style={styles.container}>
        <BackHeader title={t("pairing.scan.title")} onBack={handleRouterBack} />
        <View style={bodyStyle}>
          <View style={styles.permissionCard}>
            <Text style={styles.permissionTitle}>{t("pairing.scan.webUnavailableTitle")}</Text>
            <Text style={styles.permissionBody}>{t("pairing.scan.webUnavailableBody")}</Text>
            <Pressable style={styles.permissionButton} onPress={closeToSource}>
              <Text style={styles.permissionButtonText}>{t("pairing.scan.backToSettings")}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  const granted = Boolean(permission?.granted);

  return (
    <View style={styles.container}>
      <BackHeader title={t("pairing.scan.title")} onBack={closeToSource} />

      <View style={bodyStyle}>
        {!granted ? (
          <View style={styles.permissionCard}>
            <Text style={styles.permissionTitle}>{t("pairing.scan.cameraPermissionTitle")}</Text>
            <Text style={styles.permissionBody}>{t("pairing.scan.cameraPermissionBody")}</Text>
            <Pressable style={styles.permissionButton} onPress={handleRequestPermission}>
              <Text style={styles.permissionButtonText}>{t("pairing.scan.grantPermission")}</Text>
            </Pressable>
          </View>
        ) : null}
        {granted && scanState.status === "pairing" ? (
          <View style={styles.statusCard} testID="pair-scan-pairing">
            <Text style={styles.permissionTitle}>{t("pairing.scan.pairingTitle")}</Text>
            <Text style={styles.permissionBody}>{t("pairing.scan.pairingBody")}</Text>
          </View>
        ) : null}
        {granted && scanState.status === "waitingForApproval" ? (
          <View style={styles.statusCard} testID="pair-scan-waiting">
            <Text style={styles.permissionTitle}>{t("pairing.scan.waitingForApprovalTitle")}</Text>
            <Text style={styles.permissionBody}>{t("pairing.scan.waitingForApprovalBody")}</Text>
            <Text style={styles.approvalCode} selectable>
              {t("pairing.scan.verificationCode", {
                fingerprint: scanState.pending.fingerprint,
              })}
            </Text>
          </View>
        ) : null}
        {granted && scanState.status === "stopped" ? (
          <View style={styles.statusCard} testID="pair-scan-stopped">
            <Text style={styles.permissionTitle}>{t("pairing.scan.errorTitle")}</Text>
            {scanState.error ? <Text style={styles.permissionBody}>{scanState.error}</Text> : null}
            <Button
              style={styles.scanAgainButton}
              onPress={scan.scanAgain}
              testID="pair-scan-again"
            >
              {t("pairing.connectionMethods.scanQr.title")}
            </Button>
          </View>
        ) : null}
        {granted && scanState.status === "scanning" ? (
          <View style={styles.cameraWrap}>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={BARCODE_SCANNER_SETTINGS}
              onBarcodeScanned={handleScan}
            />
            <View style={styles.overlay} pointerEvents="box-none">
              <View style={styles.scanFrame}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>
            </View>
          </View>
        ) : null}
      </View>
      <PairLinkModal
        visible={scanState.status === "passwordRequired"}
        passwordRequired={
          scanState.status === "passwordRequired" ? scanState.passwordRequired : undefined
        }
        onClose={scan.closePassword}
        onSaved={savePasswordPairing}
      />
    </View>
  );
}

const BARCODE_SCANNER_SETTINGS: BarcodeSettings = { barcodeTypes: ["qr"] };
