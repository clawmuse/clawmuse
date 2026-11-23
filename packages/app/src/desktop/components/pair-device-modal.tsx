import { useClawMuseAccountContextBridge } from "@/clawmuse/account-provider";
import { useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ScrollView } from "react-native";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { PairDeviceSection } from "@/desktop/components/pair-device-section";

export interface PairDeviceModalProps {
  serverId: string;
  visible: boolean;
  onClose: () => void;
  testID?: string;
}

const SNAP_POINTS: string[] = ["72%", "92%"];

export function PairDeviceModal({ serverId, visible, onClose, testID }: PairDeviceModalProps) {
  const { t } = useTranslation();
  const contentContextBridge = useClawMuseAccountContextBridge();
  const scrollRef = useRef<ScrollView>(null);
  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);
  const header = useMemo<SheetHeader>(
    () => ({ title: t("settings.host.pairDevices.rowTitle") }),
    [t],
  );

  return (
    <AdaptiveModalSheet
      contextBridge={contentContextBridge}
      header={header}
      visible={visible}
      onClose={onClose}
      snapPoints={SNAP_POINTS}
      desktopMaxWidth={480}
      scrollRef={scrollRef}
      testID={testID}
    >
      <PairDeviceSection serverId={serverId} onClose={onClose} onPendingAppear={scrollToTop} />
    </AdaptiveModalSheet>
  );
}
