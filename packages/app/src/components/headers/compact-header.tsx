import { useCallback, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { CompactBackIcon } from "@/components/headers/compact-back-icon";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { HeaderToggleButton } from "@/components/headers/header-toggle-button";
import { SidebarMenuToggle } from "@/components/headers/sidebar-menu-toggle";
import { GlassSurface } from "@/components/ui/glass-surface";
import {
  IconButtonChromeProvider,
  mutedIconColorMapping,
} from "@/components/ui/icon-button-chrome";
import { HEADER_TOP_PADDING_MOBILE } from "@/constants/layout";
import { compactChrome } from "@/constants/compact-chrome";
import { densityText } from "@/styles/density";
import type { ShortcutKey } from "@/utils/format-shortcut";

const ThemedBackIcon = withUnistyles(ArrowLeft);

const NO_SHORTCUT: ShortcutKey[] = [];

interface CompactHeaderProps {
  /** The leading island: the sidebar menu, or a back button. */
  navigation: "menu" | "back";
  /** Back button action. Defaults to navigating back. */
  onBack?: () => void;
  title?: string;
  titleTestID?: string;
  /** A line under the title. */
  subtitle?: ReactNode;
  /** Show a placeholder instead of the title while it loads. */
  loading?: boolean;
  /** Icon actions inherit the island chrome through the shared button primitives. */
  actions?: ReactNode;
}

/**
 * The phone header keeps navigation and actions in separate islands. On iOS the system glass
 * owns each island's contour; the row stays transparent over the floating header's fade.
 */
export function CompactHeader({
  navigation,
  onBack,
  title,
  titleTestID,
  subtitle,
  loading = false,
  actions,
}: CompactHeaderProps) {
  const insets = useSafeAreaInsets();
  // Reserve the system status bar once, with no extra gap above the controls.
  const rootStyle = useMemo(
    () => [
      styles.root,
      {
        paddingTop: insets.top,
        paddingBottom: HEADER_TOP_PADDING_MOBILE,
        marginLeft: insets.left,
        marginRight: insets.right,
      },
    ],
    [insets.top, insets.left, insets.right],
  );

  return (
    <IconButtonChromeProvider value="header-island">
      <View style={rootStyle}>
        <View style={styles.row}>
          <View style={styles.navigationIsland}>
            <GlassSurface
              style={[StyleSheet.absoluteFill, styles.island]}
              pointerEvents="none"
              isInteractive
            />
            {navigation === "menu" ? (
              <SidebarMenuToggle compactBackAppearance={compactChrome.nativeGlass} />
            ) : (
              <BackButton onBack={onBack} />
            )}
          </View>
          <View style={styles.titleGroup}>
            <CompactHeaderTitle
              loading={loading}
              title={title}
              titleTestID={titleTestID}
              subtitle={subtitle}
            />
          </View>
          {actions ? <GlassSurface style={styles.island}>{actions}</GlassSurface> : null}
        </View>
      </View>
    </IconButtonChromeProvider>
  );
}

function CompactHeaderTitle({
  loading,
  title,
  titleTestID,
  subtitle,
}: Pick<CompactHeaderProps, "title" | "titleTestID" | "subtitle"> & { loading: boolean }) {
  if (loading) {
    return <View style={styles.titleSkeleton} />;
  }
  return (
    <>
      {title ? (
        <Text
          style={subtitle ? styles.title : styles.singleLineTitle}
          numberOfLines={1}
          testID={titleTestID}
        >
          {title}
        </Text>
      ) : null}
      {subtitle}
    </>
  );
}

function BackButton({ onBack }: { onBack?: () => void }) {
  const { t } = useTranslation();
  const handlePress = useCallback(() => {
    if (onBack) {
      onBack();
      return;
    }
    router.back();
  }, [onBack]);
  return (
    <HeaderToggleButton
      onPress={handlePress}
      tooltipLabel={t("common.actions.back")}
      tooltipKeys={NO_SHORTCUT}
      tooltipSide="right"
      testID="header-back-button"
      accessibilityRole="button"
      accessibilityLabel={t("common.actions.back")}
    >
      {compactChrome.nativeGlass ? (
        <CompactBackIcon />
      ) : (
        <ThemedBackIcon size={compactChrome.glyphSize} uniProps={mutedIconColorMapping} />
      )}
    </HeaderToggleButton>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    paddingHorizontal: compactChrome.horizontalInset,
  },
  row: {
    minHeight: compactChrome.controlSize,
    flexDirection: "row",
    alignItems: "center",
    gap: compactChrome.gap,
  },
  titleGroup: {
    flex: 1,
    minWidth: 0,
    // Both title lines receive the remaining width; text alignment does not size the slot.
    alignItems: "stretch",
    justifyContent: "center",
    minHeight: compactChrome.controlSize,
  },
  island: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: compactChrome.controlSize,
    flexShrink: 0,
    borderRadius: compactChrome.controlSize / 2,
    borderCurve: "continuous",
    ...(compactChrome.nativeGlass
      ? {
          backgroundColor: theme.colors.surface2,
        }
      : {}),
  },
  navigationIsland: {
    width: compactChrome.controlSize,
    height: compactChrome.controlSize,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...densityText(theme, "label"),
    color: theme.colors.foreground,
    textAlign: "left",
  },
  // A title without a subtitle has the header to itself, so it reads one step larger.
  singleLineTitle: {
    ...densityText(theme, "title"),
    color: theme.colors.foreground,
    textAlign: "left",
  },
  titleSkeleton: {
    width: 140,
    maxWidth: "100%",
    height: 22,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface3,
    opacity: 0.25,
  },
}));
