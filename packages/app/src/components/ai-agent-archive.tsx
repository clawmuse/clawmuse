import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Archive } from "@/components/icons/app-icons";
import { SidebarNavIconButton } from "@/components/sidebar/sidebar-nav-icon-button";
import { HeaderToggleButton } from "@/components/headers/header-toggle-button";
import { DensityIcon } from "@/components/ui/density-icon";
import { AiAgentArchiveSheet, type AiArchiveBackgroundStatus } from "./ai-archive/sheet";

export { AiAgentArchiveSheet } from "./ai-archive/sheet";

const NO_SHORTCUTS: [] = [];

export function AiAgentArchiveButton({ variant = "sidebar" }: { variant?: "sidebar" | "header" }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"closed" | "open" | "minimized">("closed");
  const [backgroundStatus, setBackgroundStatus] = useState<AiArchiveBackgroundStatus | null>(null);

  const openSheet = useCallback(() => setMode("open"), []);
  const minimizeSheet = useCallback(() => setMode("minimized"), []);
  const closeSheet = useCallback(() => {
    setMode("closed");
    setBackgroundStatus(null);
  }, []);

  const buttonLabel = useMemo(() => {
    if (mode !== "minimized") {
      return t("aiArchive.title");
    }
    if (backgroundStatus?.batchBusy) {
      return t("aiArchive.minimizedRunning", {
        done: backgroundStatus.batchDone,
        total: backgroundStatus.batchTotal,
      });
    }
    if (backgroundStatus && backgroundStatus.readyCount > 0) {
      return t("aiArchive.minimizedReady", { count: backgroundStatus.readyCount });
    }
    return t("aiArchive.minimizedLabel");
  }, [backgroundStatus, mode, t]);

  return (
    <>
      {variant === "header" ? (
        <HeaderToggleButton
          onPress={openSheet}
          tooltipLabel={buttonLabel}
          tooltipKeys={NO_SHORTCUTS}
          tooltipSide="bottom"
          accessibilityLabel={buttonLabel}
          testID="mobile-home-ai-archive"
        >
          <DensityIcon icon={Archive} size="lg" color="foreground" />
        </HeaderToggleButton>
      ) : (
        <SidebarNavIconButton
          icon={Archive}
          label={buttonLabel}
          isActive={mode !== "closed"}
          onPress={openSheet}
          testID="sidebar-ai-archive"
        />
      )}
      {mode !== "closed" ? (
        <AiAgentArchiveSheet
          visible={mode === "open"}
          onMinimize={minimizeSheet}
          onClose={closeSheet}
          onBackgroundStatusChange={setBackgroundStatus}
        />
      ) : null}
    </>
  );
}
