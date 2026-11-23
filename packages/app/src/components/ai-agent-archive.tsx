import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Archive } from "@/components/icons/app-icons";
import { SidebarNavIconButton } from "@/components/sidebar/sidebar-nav-icon-button";
import { HeaderToggleButton } from "@/components/headers/header-toggle-button";
import { DensityIcon } from "@/components/ui/density-icon";
import { AiAgentArchiveSheet } from "./ai-archive/sheet";

export { AiAgentArchiveSheet } from "./ai-archive/sheet";

const NO_SHORTCUTS: [] = [];

export function AiAgentArchiveButton({ variant = "sidebar" }: { variant?: "sidebar" | "header" }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const openSheet = useCallback(() => setOpen(true), []);
  const closeSheet = useCallback(() => setOpen(false), []);
  return (
    <>
      {variant === "header" ? (
        <HeaderToggleButton
          onPress={openSheet}
          tooltipLabel={t("aiArchive.title")}
          tooltipKeys={NO_SHORTCUTS}
          tooltipSide="bottom"
          accessibilityLabel={t("aiArchive.title")}
          testID="mobile-home-ai-archive"
        >
          <DensityIcon icon={Archive} size="lg" color="foreground" />
        </HeaderToggleButton>
      ) : (
        <SidebarNavIconButton
          icon={Archive}
          label={t("aiArchive.title")}
          onPress={openSheet}
          testID="sidebar-ai-archive"
        />
      )}
      {open ? <AiAgentArchiveSheet onClose={closeSheet} /> : null}
    </>
  );
}
