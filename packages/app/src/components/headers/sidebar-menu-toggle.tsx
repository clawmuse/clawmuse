import { useCallback, useMemo } from "react";
import { ICON_STROKE_WIDTH } from "@/styles/theme";
import { useTranslation } from "react-i18next";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Menu, PanelLeft } from "lucide-react-native";
import { router } from "expo-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIconButtonChromeStyle } from "@/components/ui/icon-button-chrome";
import { useOpenNewWorkspace } from "@/hooks/use-open-new-workspace";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import { builtinSidebarNavLabelKey } from "@/sidebar-nav/model";
import { buildSettingsRoute } from "@/utils/host-routes";
import { CompactBackIcon } from "./compact-back-icon";
import {
  HeaderToggleButton,
  headerIconSlotStyle,
  WINDOW_CONTROL_ICON_SIZE,
  windowControlStyles,
} from "./header-toggle-button";
import { selectIsAgentListOpen, usePanelStore } from "@/stores/panel-store";
import { useIsCompactFormFactor } from "@/constants/layout";
import { getShortcutOs } from "@/utils/shortcut-platform";
import { useOwnsWindowChromeCorner } from "@/utils/desktop-window";
import {
  extraMutedIconColorMapping,
  iconButtonChromeGlyphSize,
  mutedIconColorMapping,
} from "@/components/ui/icon-button-chrome";

const ThemedPanelLeft = withUnistyles(PanelLeft);
const ThemedMenu = withUnistyles(Menu);

interface SidebarMenuToggleProps {
  compactBackAppearance?: boolean;
  style?: StyleProp<ViewStyle>;
  tooltipSide?: "left" | "right" | "top" | "bottom";
  testID?: string;
  nativeID?: string;
}

const MOBILE_MENU_LINE_WIDTH = 16;
const MOBILE_MENU_LINE_SHORT_WIDTH = 8;
const MOBILE_MENU_LINE_HEIGHT = ICON_STROKE_WIDTH;

function MobileMenuIcon({ extraMuted }: { extraMuted: boolean }) {
  const color = extraMuted ? styles.mobileMenuLineExtraMuted : styles.mobileMenuLineMuted;
  const lineStyle = useMemo(() => [styles.mobileMenuLine, color], [color]);
  const shortLineStyle = useMemo(
    () => [styles.mobileMenuLine, styles.mobileMenuLineShort, color],
    [color],
  );
  return (
    <View style={styles.mobileMenuIcon} pointerEvents="none">
      <View style={lineStyle} />
      <View style={lineStyle} />
      <View style={shortLineStyle} />
    </View>
  );
}

function SidebarMenuToggleButton({
  isMobile,
  extraMutedIdleIcon = false,
  compactBackAppearance = false,
  resolvedStyle,
  tooltipSide = "right",
  testID = "menu-button",
  nativeID = "menu-button",
}: Omit<SidebarMenuToggleProps, "style"> & {
  isMobile: boolean;
  extraMutedIdleIcon?: boolean;
  resolvedStyle: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  const isOpen = usePanelStore((state) => selectIsAgentListOpen(state, { isCompact: isMobile }));
  const toggleAgentListForLayout = usePanelStore((state) => state.toggleAgentListForLayout);
  const toggleShortcutKeys = useMemo(
    () => (getShortcutOs() === "mac" ? ["mod", "B"] : ["mod", "."]),
    [],
  );

  const handlePress = useCallback(() => {
    toggleAgentListForLayout({ isCompact: isMobile });
  }, [toggleAgentListForLayout, isMobile]);

  const accessibilityState = useMemo(() => ({ expanded: isOpen }), [isOpen]);
  let icon = (
    <ThemedPanelLeft
      size={isMobile ? iconButtonChromeGlyphSize("large") : WINDOW_CONTROL_ICON_SIZE}
      uniProps={extraMutedIdleIcon ? extraMutedIconColorMapping : mutedIconColorMapping}
    />
  );
  if (isMobile) {
    icon = <MobileMenuIcon extraMuted={extraMutedIdleIcon} />;
    if (compactBackAppearance) {
      icon = <CompactBackIcon />;
    }
  }

  return (
    <HeaderToggleButton
      onPress={handlePress}
      tooltipLabel={t("shell.menu.toggleSidebar")}
      tooltipKeys={toggleShortcutKeys}
      tooltipSide={tooltipSide}
      testID={testID}
      nativeID={nativeID}
      style={resolvedStyle}
      accessible
      accessibilityRole="button"
      accessibilityLabel={isOpen ? t("shell.menu.close") : t("shell.menu.open")}
      accessibilityState={accessibilityState}
    >
      {icon}
    </HeaderToggleButton>
  );
}

export function SidebarMenuToggle({ style, ...props }: SidebarMenuToggleProps = {}) {
  const isMobile = useIsCompactFormFactor();
  const ownsTopLeft = useOwnsWindowChromeCorner("top-left");
  const resolvedStyle = useMemo(() => [styles.leadingToggle, style], [style]);
  const placeholderStyle = useMemo(
    () => [headerIconSlotStyle.slot, resolvedStyle, styles.desktopControlsPlaceholder],
    [resolvedStyle],
  );

  if (!isMobile && !ownsTopLeft) {
    return null;
  }

  if (!isMobile) {
    return (
      <View pointerEvents="none" style={placeholderStyle}>
        <View style={styles.desktopMenuIconSpace} />
      </View>
    );
  }

  return <SidebarMenuToggleButton {...props} isMobile resolvedStyle={resolvedStyle} />;
}

export function WindowSidebarMenuToggle({ style, ...props }: SidebarMenuToggleProps = {}) {
  const resolvedStyle = useMemo(() => [windowControlStyles.button, style], [style]);
  return (
    <View style={styles.windowControls}>
      <SidebarMenuToggleButton {...props} isMobile={false} resolvedStyle={resolvedStyle} />
      <WindowApplicationMenu />
    </View>
  );
}

function WindowApplicationMenu() {
  const { t } = useTranslation();
  const openNewWorkspace = useOpenNewWorkspace();
  const setCommandCenterOpen = useKeyboardShortcutsStore((state) => state.setCommandCenterOpen);
  const triggerStyle = useIconButtonChromeStyle({
    size: "large",
    style: windowControlStyles.button,
  });
  const openSearch = useCallback(() => setCommandCenterOpen(true), [setCommandCenterOpen]);
  const openSettings = useCallback(() => router.push(buildSettingsRoute()), []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        style={triggerStyle}
        testID="window-application-menu"
        accessibilityRole="button"
        accessibilityLabel={t("shell.menu.open")}
      >
        <ThemedMenu size={WINDOW_CONTROL_ICON_SIZE} uniProps={mutedIconColorMapping} />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start">
        <DropdownMenuItem onSelect={openNewWorkspace}>
          {t(builtinSidebarNavLabelKey("new-workspace"))}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={openSearch}>
          {t(builtinSidebarNavLabelKey("search"))}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={openSettings}>{t("sidebar.actions.settings")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const styles = StyleSheet.create((theme) => ({
  windowControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  leadingToggle: {
    marginLeft: {
      xs: 0,
      md: -theme.spacing[2],
    },
  },
  mobileMenuIcon: {
    width: MOBILE_MENU_LINE_WIDTH,
    height: 12,
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  desktopControlsPlaceholder: {
    width: 60,
  },
  desktopMenuIconSpace: {
    width: 60,
    height: 28,
  },
  mobileMenuLine: {
    width: MOBILE_MENU_LINE_WIDTH,
    height: MOBILE_MENU_LINE_HEIGHT,
    borderRadius: theme.borderRadius.full,
  },
  mobileMenuLineMuted: {
    backgroundColor: theme.colors.foregroundMuted,
  },
  mobileMenuLineExtraMuted: {
    backgroundColor: theme.colors.foregroundExtraMuted,
  },
  mobileMenuLineShort: {
    width: MOBILE_MENU_LINE_SHORT_WIDTH,
  },
}));
