import { useCallback, useEffect, useMemo, useState } from "react";
import { Text } from "react-native";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { PairLinkModal } from "@/components/pair-link-modal";
import { getHostRuntimeStore, type PasswordRequiredPairing } from "@/runtime/host-runtime";
import { buildOpenProjectRoute } from "@/utils/host-routes";

type LinkFeedback =
  | { kind: "pending"; fingerprint: string }
  | { kind: "password"; pairing: PasswordRequiredPairing }
  | { kind: "error"; message: string };

/** External invitation links need feedback even before the first host is saved. */
export function OfferLinkListener() {
  const router = useRouter();
  const { t } = useTranslation();
  const [feedback, setFeedback] = useState<LinkFeedback | null>(null);
  const header = useMemo<SheetHeader>(
    () => ({
      title: t(
        feedback?.kind === "pending"
          ? "pairing.scan.waitingForApprovalTitle"
          : "pairing.link.alert.failedTitle",
      ),
    }),
    [feedback?.kind, t],
  );

  useEffect(() => {
    let cancelled = false;
    let attempt = 0;
    const handleUrl = async (url: string | null) => {
      if (!url) return;
      if (!url.includes("#offer=") && !url.includes("#connect=") && !url.startsWith("relay://"))
        return;
      const current = ++attempt;
      const active = () => !cancelled && current === attempt;
      setFeedback(null);
      try {
        const result = await getHostRuntimeStore().importConnectionLink(
          url,
          "openProject",
          (pending) => {
            if (active()) setFeedback({ kind: "pending", fingerprint: pending.fingerprint });
          },
        );
        if (!active()) return;
        if (result.status === "password_required") {
          setFeedback({ kind: "password", pairing: result });
          return;
        }
        setFeedback(null);
        if (result.status === "connected") router.replace(buildOpenProjectRoute());
      } catch (error) {
        if (active())
          setFeedback({
            kind: "error",
            message: error instanceof Error ? error.message : String(error),
          });
      }
    };

    void Linking.getInitialURL()
      .then(handleUrl)
      .catch(() => undefined);
    const subscription = Linking.addEventListener("url", (event) => {
      void handleUrl(event.url);
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [router]);

  const close = useCallback(() => setFeedback(null), []);
  const saved = useCallback(() => {
    setFeedback(null);
    router.replace(buildOpenProjectRoute());
  }, [router]);
  return (
    <>
      {feedback?.kind === "pending" || feedback?.kind === "error" ? (
        <AdaptiveModalSheet visible header={header} onClose={close} testID="offer-link-feedback">
          <Text style={styles.body}>
            {feedback.kind === "pending"
              ? t("pairing.scan.waitingForApprovalBody")
              : feedback.message}
          </Text>
          {feedback.kind === "pending" ? (
            <Text style={styles.code} selectable testID="offer-link-fingerprint">
              {t("pairing.scan.verificationCode", { fingerprint: feedback.fingerprint })}
            </Text>
          ) : null}
        </AdaptiveModalSheet>
      ) : null}
      {feedback?.kind === "password" ? (
        <PairLinkModal
          visible
          passwordRequired={feedback.pairing}
          onClose={close}
          onSaved={saved}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  body: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.base },
  code: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.semibold,
    marginTop: theme.spacing[4],
  },
}));
