import { ExternalLink } from "lucide-react-native";
import { useCallback } from "react";
import { Text, View, type PressableStateCallbackType } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { SettingsCollapsibleRow } from "@/components/settings/collapsible-row";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { mutedIconColorMapping } from "@/components/ui/icon-color";
import { PressHighlight } from "@/components/ui/press-highlight";
import { CODE_SURFACE_DATASET } from "@/styles/code-surface";
import { settingsStyles } from "@/styles/settings";
import { ICON_SIZE } from "@/styles/theme";
import { openExternalUrl } from "@/utils/open-external-url";
import {
  PROJECT_LICENSE_TEXT,
  PROJECT_NOTICE_TEXT,
  THIRD_PARTY_PACKAGES,
} from "./open-source.generated";

const ThemedExternalLink = withUnistyles(ExternalLink);

// Passed as an interpolation value: bundled copy rewrites the literal "Paseo" to the brand name.
const UPSTREAM_NAME = "Paseo";

interface UpstreamCredit {
  name: string;
  holder: string;
  license: string;
  url: string;
  /** What the app takes from it; null for the upstream project itself. */
  usageKey: string | null;
}

// Projects whose code or assets are copied into this repository rather than installed from npm.
// Keep in step with NOTICE and the "Ported from" headers in the source.
const UPSTREAM_CREDITS: readonly UpstreamCredit[] = [
  {
    name: UPSTREAM_NAME,
    holder: "Mohamed Boudra",
    license: "Apache-2.0",
    url: "https://github.com/getpaseo/paseo",
    usageKey: null,
  },
  {
    name: "Cindy",
    holder: "XD Inc.",
    license: "Apache-2.0",
    url: "https://github.com/makecindy/cindy",
    usageKey: "settings.about.openSource.promptRecommendations",
  },
  {
    name: "Visual Studio Code",
    holder: "Microsoft Corporation",
    license: "MIT",
    url: "https://github.com/microsoft/vscode",
    usageKey: "settings.about.openSource.terminalLinks",
  },
  {
    name: "Material Icon Theme",
    holder: "Material Extensions",
    license: "MIT",
    url: "https://github.com/material-extensions/vscode-material-icon-theme",
    usageKey: "settings.about.openSource.fileIcons",
  },
];

function linkRowStyle({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) {
  return [settingsStyles.row, hovered && styles.rowHovered, pressed && styles.rowPressed];
}

function LinkRow({
  title,
  hint,
  url,
  showBorder,
}: {
  title: string;
  hint: string;
  url: string;
  showBorder?: boolean;
}) {
  const handlePress = useCallback(() => {
    void openExternalUrl(url);
  }, [url]);
  return (
    <View style={showBorder ? settingsStyles.rowBorder : null}>
      <PressHighlight
        accessibilityRole="link"
        onPress={handlePress}
        style={linkRowStyle}
        highlightStyle={styles.rowPressed}
      >
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>{title}</Text>
          <Text style={settingsStyles.rowHint}>{hint}</Text>
        </View>
        <ThemedExternalLink size={ICON_SIZE.sm} uniProps={mutedIconColorMapping} />
      </PressHighlight>
    </View>
  );
}

export function OpenSourceSection() {
  const { t } = useTranslation();
  return (
    <SettingsSection
      title={t("settings.about.openSource.title")}
      info={t("settings.about.openSource.info", { upstream: UPSTREAM_NAME })}
      testID="settings-open-source"
    >
      <View style={settingsStyles.card}>
        {UPSTREAM_CREDITS.map((credit, index) => {
          const usage = credit.usageKey
            ? t(credit.usageKey)
            : t("settings.about.openSource.basedOn", { upstream: UPSTREAM_NAME });
          return (
            <LinkRow
              key={credit.name}
              title={credit.name}
              hint={`© ${credit.holder} · ${credit.license} · ${usage}`}
              url={credit.url}
              showBorder={index > 0}
            />
          );
        })}
        <View style={settingsStyles.rowBorder}>
          <SettingsCollapsibleRow
            label={t("settings.about.openSource.licenseText")}
            testID="settings-open-source-license"
          >
            <View dataSet={CODE_SURFACE_DATASET}>
              <Text selectable style={styles.licenseText}>
                {PROJECT_NOTICE_TEXT}
              </Text>
            </View>
            <View dataSet={CODE_SURFACE_DATASET}>
              <Text selectable style={styles.licenseText}>
                {PROJECT_LICENSE_TEXT}
              </Text>
            </View>
          </SettingsCollapsibleRow>
        </View>
        <View style={settingsStyles.rowBorder}>
          <SettingsCollapsibleRow
            label={t("settings.about.openSource.packages", {
              total: THIRD_PARTY_PACKAGES.length,
            })}
            testID="settings-open-source-packages"
          >
            {THIRD_PARTY_PACKAGES.map((pkg) => (
              <LinkRow
                key={pkg.name}
                title={pkg.name}
                hint={`${pkg.version} · ${pkg.license}`}
                url={pkg.url}
              />
            ))}
          </SettingsCollapsibleRow>
        </View>
      </View>
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  rowHovered: {
    backgroundColor: theme.colors.surface2,
  },
  rowPressed: {
    backgroundColor: theme.colors.surface3,
  },
  licenseText: {
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.code,
    lineHeight: theme.fontSize.code * 1.5,
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[4],
  },
}));
