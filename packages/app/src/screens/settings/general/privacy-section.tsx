import { useCallback, useState } from "react";
import { Linking } from "react-native";
import { useTranslation } from "react-i18next";
import { SettingsAction, SettingsCard, SettingsSection } from "@/components/settings";
import { PRIVACY_URL, TERMS_URL } from "@/privacy/legal";

type PrivacyAction = "policy" | "terms";

export function PrivacySection() {
  const { t } = useTranslation();
  const [errors, setErrors] = useState<Partial<Record<PrivacyAction, string>>>({});
  const [pending, setPending] = useState<PrivacyAction | null>(null);
  const run = useCallback(
    (action: PrivacyAction, operation: () => Promise<unknown>) => {
      setErrors((current) => ({ ...current, [action]: undefined }));
      setPending(action);
      void operation()
        .catch((failure: unknown) => {
          setErrors((current) => ({
            ...current,
            [action]: failure instanceof Error ? failure.message : t("privacy.unavailable"),
          }));
        })
        .finally(() => setPending(null));
    },
    [t],
  );
  const openPrivacy = useCallback(() => run("policy", () => Linking.openURL(PRIVACY_URL)), [run]);
  const openTerms = useCallback(() => run("terms", () => Linking.openURL(TERMS_URL)), [run]);
  return (
    <SettingsSection title={t("privacy.title")}>
      <SettingsCard>
        <SettingsAction
          testID="privacy-policy-row"
          disabled={pending !== null}
          error={errors.policy}
          label={t("privacy.policy")}
          actionLabel={t("privacy.open")}
          onPress={openPrivacy}
        />
        <SettingsAction
          testID="privacy-terms-row"
          disabled={pending !== null}
          error={errors.terms}
          label={t("privacy.terms")}
          actionLabel={t("privacy.open")}
          onPress={openTerms}
        />
      </SettingsCard>
    </SettingsSection>
  );
}
