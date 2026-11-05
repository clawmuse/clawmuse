import { useCallback, useMemo, useState, type ReactNode } from "react";
import { UserRound } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { AdaptiveModalSheet } from "@/components/adaptive-modal-sheet";
import { ClawMuseAccountPanel } from "./account-panel";
import { useClawMuseAccount, useClawMuseAccountContextBridge } from "./account-provider";

const SNAP_POINTS = ["85%"];

/**
 * Opens the account sheet. `renderTrigger` swaps the full-width button for the caller's own
 * trigger, such as an icon in the phone sidebar's footer line.
 */
export function ClawMuseAccountButton({
  renderTrigger,
}: {
  renderTrigger?: (input: { open: () => void; label: string }) => ReactNode;
} = {}) {
  const { t } = useTranslation();
  const { state } = useClawMuseAccount();
  const contextBridge = useClawMuseAccountContextBridge();
  const [visible, setVisible] = useState(false);
  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);
  const label = t(state.account ? "clawmuseAccount.myAccount" : "clawmuseAccount.signIn");
  const header = useMemo(() => ({ title: t("clawmuseAccount.title") }), [t]);
  return (
    <>
      {renderTrigger ? (
        renderTrigger({ open, label })
      ) : (
        <Button
          variant="outline"
          leftIcon={UserRound}
          onPress={open}
          testID="clawmuse-open-account"
        >
          {label}
        </Button>
      )}
      <AdaptiveModalSheet
        header={header}
        visible={visible}
        onClose={close}
        snapPoints={SNAP_POINTS}
        desktopMaxWidth={480}
        contextBridge={contextBridge}
        testID="clawmuse-account-dialog"
      >
        <ClawMuseAccountPanel showTitle={false} />
      </AdaptiveModalSheet>
    </>
  );
}
