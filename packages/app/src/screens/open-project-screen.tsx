import { useVisibleHosts, useHostRuntimeLastError } from "@/runtime/host-runtime";
import { useCallback, useEffect, useMemo, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { View, Text, ScrollView } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useRouter } from "expo-router";
import { Check, FolderOpen, Inbox, Plug, SquarePen } from "@/components/icons/app-icons";
import { DensityIcon } from "@/components/ui/density-icon";
import { Shortcut } from "@/components/ui/shortcut";
import { useOpenNewWorkspace } from "@/hooks/use-open-new-workspace";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import { useSidebarWorkspacesList } from "@/hooks/use-sidebar-workspaces-list";
import { builtinSidebarNavShortcutAction } from "@/sidebar-nav/model";
import { settingsStyles } from "@/styles/settings";
import { ClawMuseLogo } from "@/components/icons/clawmuse-logo";
import { ClawMuseAccountButton } from "@/clawmuse/account-button";
import { MenuHeader } from "@/components/headers/menu-header";
import { useOpenAddProject } from "@/hooks/use-open-add-project";
import { useImportSession } from "@/hooks/use-import-session";
import { useHostChooser } from "@/hosts/host-chooser";
import { usePanelStore } from "@/stores/panel-store";
import {
  useIsCompactFormFactor,
  HEADER_INNER_HEIGHT,
  HEADER_INNER_HEIGHT_MOBILE,
  HEADER_TOP_PADDING_MOBILE,
} from "@/constants/layout";
import { buildSettingsHostSectionRoute } from "@/utils/host-routes";
import { MobileHomeScreen } from "./mobile-home-screen";
import { Button } from "@/components/ui/button";

const WINDOW_CONTENT_DATASET = { "window-content": "" };
/** Reading width for the welcome column; wider than a form, narrower than settings. */
const ONBOARDING_COLUMN_WIDTH = 560;
const STEP_MARKER_SIZE = 24;
const STEP_ICON_SIZE = { xs: 16, md: 16 };
const STEP_CHECK_SIZE = { xs: 14, md: 14 };

type IconComponent = ComponentProps<typeof DensityIcon>["icon"];

export function OpenProjectScreen() {
  const { t } = useTranslation();
  const hosts = useVisibleHosts();
  const router = useRouter();
  const openDesktopAgentList = usePanelStore((s) => s.openDesktopAgentList);
  const openProjectPicker = useOpenAddProject();
  const importSession = useImportSession();
  const chooseHost = useHostChooser();

  const isCompactLayout = useIsCompactFormFactor();

  useEffect(() => {
    if (!isCompactLayout) {
      openDesktopAgentList();
    }
  }, [isCompactLayout, openDesktopAgentList]);

  const handleOpenPicker = useCallback(() => {
    void openProjectPicker();
  }, [openProjectPicker]);

  const handleOpenProviders = useCallback(() => {
    chooseHost({
      title: "Choose host",
      onChooseHost: (serverId) => {
        router.push(buildSettingsHostSectionRoute(serverId, "providers"));
      },
    });
  }, [chooseHost, router]);

  const mobileSupport = useMemo(
    () => (
      <View style={styles.mobileSupport}>
        {hosts.map((host) => (
          <HostError key={host.serverId} serverId={host.serverId} label={host.label} />
        ))}
        <Button
          variant="outline"
          onPress={handleOpenProviders}
          testID="open-project-setup-providers"
        >
          {t("openProject.tiles.setupProviders.title")}
        </Button>
        <ClawMuseAccountButton />
      </View>
    ),
    [hosts, handleOpenProviders, t],
  );

  if (isCompactLayout) return <MobileHomeScreen supportContent={mobileSupport} />;

  return (
    <View style={styles.container}>
      <MenuHeader borderless />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        dataSet={WINDOW_CONTENT_DATASET}
      >
        <View style={styles.content}>
          <View style={styles.column}>
            <View style={styles.hero}>
              <ClawMuseLogo size={40} />
              <Text style={styles.heroTitle}>{t("openProject.onboarding.title")}</Text>
              <Text style={styles.heroSubtitle}>{t("openProject.onboarding.subtitle")}</Text>
            </View>
            {hosts.map((host) => (
              <HostError key={host.serverId} serverId={host.serverId} label={host.label} />
            ))}
            <OnboardingChecklist
              serverId={hosts[0]?.serverId ?? null}
              onSetupProviders={handleOpenProviders}
              onAddProject={handleOpenPicker}
            />
            <ImportSessionHint onPress={importSession.open} />
            <ShortcutHints />
          </View>
        </View>
        <View style={styles.communityRow}>
          <ClawMuseAccountButton />
        </View>
      </ScrollView>
      {importSession.sheet}
    </View>
  );
}

type StepId = "providers" | "project" | "task";

interface OnboardingStep {
  id: StepId;
  icon: IconComponent;
  done: boolean;
  /** Shown instead of the description once the step is done. */
  status: string | null;
  onPress: () => void;
  testID: string;
}

/**
 * The first-run path as one card: connect an agent, add a project, start a task. Steps read
 * their done state from live host data, and the first unfinished one carries the page's CTA.
 */
function OnboardingChecklist({
  serverId,
  onSetupProviders,
  onAddProject,
}: {
  serverId: string | null;
  onSetupProviders: () => void;
  onAddProject: () => void;
}) {
  const { t } = useTranslation();
  const { projects } = useSidebarWorkspacesList();
  const { entries } = useProvidersSnapshot(serverId, { enabled: serverId !== null });
  const openNewWorkspace = useOpenNewWorkspace();
  const readyProviders = (entries ?? []).filter(
    (entry) => entry.enabled && entry.status === "ready",
  ).length;
  const projectCount = projects.length;

  const steps: OnboardingStep[] = [
    {
      id: "providers",
      icon: Plug,
      done: readyProviders > 0,
      status:
        readyProviders > 0
          ? t("openProject.onboarding.steps.providers.ready", { count: readyProviders })
          : null,
      onPress: onSetupProviders,
      testID: "open-project-setup-providers",
    },
    {
      id: "project",
      icon: FolderOpen,
      done: projectCount > 0,
      status:
        projectCount > 0
          ? t("openProject.onboarding.steps.project.ready", { count: projectCount })
          : null,
      onPress: onAddProject,
      testID: "open-project-submit",
    },
    {
      id: "task",
      icon: SquarePen,
      done: false,
      status: null,
      onPress: openNewWorkspace,
      testID: "open-project-new-workspace",
    },
  ];
  const doneCount = steps.filter((step) => step.done).length;
  const primaryId = steps.find((step) => !step.done)?.id;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t("openProject.onboarding.heading")}</Text>
        <Text style={styles.sectionMeta}>
          {t("openProject.onboarding.progress", { done: doneCount, total: steps.length })}
        </Text>
      </View>
      <View style={settingsStyles.card} testID="open-project-onboarding">
        {steps.map((step, index) => (
          <OnboardingStepRow
            key={step.id}
            step={step}
            number={index + 1}
            primary={step.id === primaryId}
            bordered={index > 0}
          />
        ))}
      </View>
    </View>
  );
}

function OnboardingStepRow({
  step,
  number,
  primary,
  bordered,
}: {
  step: OnboardingStep;
  number: number;
  primary: boolean;
  bordered: boolean;
}) {
  const { t } = useTranslation();
  const copyKey = `openProject.onboarding.steps.${step.id}` as const;
  return (
    <View
      style={[settingsStyles.row, styles.stepRow, bordered && settingsStyles.rowBorder]}
      testID={`open-project-step-${step.id}`}
    >
      <View
        style={[styles.stepMarker, step.done && styles.stepMarkerDone]}
        accessibilityLabel={step.done ? t("openProject.onboarding.done") : undefined}
      >
        {step.done ? (
          <DensityIcon icon={Check} size={STEP_CHECK_SIZE} color="accentForeground" />
        ) : (
          <Text style={styles.stepNumber}>{number}</Text>
        )}
      </View>
      <View style={settingsStyles.rowContent}>
        <View style={styles.stepTitleLine}>
          <DensityIcon
            icon={step.icon}
            size={STEP_ICON_SIZE}
            color={step.done ? "foregroundMuted" : "foreground"}
          />
          <Text style={[settingsStyles.rowTitle, step.done && styles.stepTitleDone]}>
            {t(`${copyKey}.title`)}
          </Text>
        </View>
        <Text style={settingsStyles.rowHint}>{step.status ?? t(`${copyKey}.description`)}</Text>
      </View>
      <Button
        size="sm"
        variant={primary ? "default" : "outline"}
        onPress={step.onPress}
        testID={step.testID}
      >
        {t(`${copyKey}.action`)}
      </Button>
    </View>
  );
}

/** Returning terminal users skip ahead by importing; it sits outside the numbered path. */
function ImportSessionHint({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={[settingsStyles.card, styles.importCard]}>
      <View style={[settingsStyles.row, styles.stepRow]}>
        <View style={styles.importIcon}>
          <DensityIcon icon={Inbox} size={STEP_ICON_SIZE} color="foregroundMuted" />
        </View>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>{t("openProject.onboarding.import.title")}</Text>
          <Text style={settingsStyles.rowHint}>
            {t("openProject.onboarding.import.description")}
          </Text>
        </View>
        <Button size="sm" variant="outline" onPress={onPress} testID="open-project-import-session">
          {t("openProject.onboarding.import.action")}
        </Button>
      </View>
    </View>
  );
}

function ShortcutHints() {
  const { t } = useTranslation();
  const newWorkspaceKeys = useShortcutKeys(builtinSidebarNavShortcutAction("new-workspace"));
  const searchKeys = useShortcutKeys(builtinSidebarNavShortcutAction("search"));
  if (!newWorkspaceKeys && !searchKeys) return null;
  return (
    <View style={styles.shortcuts} testID="open-project-shortcuts">
      <Text style={styles.shortcutLabel}>{t("openProject.onboarding.shortcuts.label")}</Text>
      {newWorkspaceKeys ? (
        <View style={styles.shortcut}>
          <Text style={styles.shortcutText}>
            {t("openProject.onboarding.shortcuts.newWorkspace")}
          </Text>
          <Shortcut chord={newWorkspaceKeys} />
        </View>
      ) : null}
      {searchKeys ? (
        <View style={styles.shortcut}>
          <Text style={styles.shortcutText}>{t("openProject.onboarding.shortcuts.search")}</Text>
          <Shortcut chord={searchKeys} />
        </View>
      ) : null}
    </View>
  );
}

function HostError({ serverId, label }: { serverId: string; label: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const error = useHostRuntimeLastError(serverId);
  const manageHost = useCallback(
    () => router.push(buildSettingsHostSectionRoute(serverId, "connections")),
    [router, serverId],
  );
  return error ? (
    <View style={styles.hostRecovery} testID={`host-recovery-${serverId}`}>
      <Text accessibilityRole="alert" style={styles.hostError}>
        {label}: {error}
      </Text>
      <Button size="sm" variant="secondary" onPress={manageHost} testID={`manage-host-${serverId}`}>
        {t("workspace.route.manageHost")}
      </Button>
    </View>
  ) : null;
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
    userSelect: "none",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    position: "relative",
    flexGrow: 1,
    flexShrink: 0,
    justifyContent: { xs: "flex-start", md: "center" },
    alignItems: "center",
    gap: 0,
    padding: theme.spacing[6],
    paddingTop: { xs: theme.spacing[12], md: theme.spacing[6] },
  },
  mobileSupport: {
    padding: theme.spacing[4],
    gap: theme.spacing[3],
    alignItems: "stretch",
  },
  hostError: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.base,
    textAlign: "left",
  },
  hostRecovery: {
    width: "100%",
    alignItems: "flex-start",
    gap: theme.spacing[2],
    marginBottom: theme.spacing[3],
  },
  column: {
    width: "100%",
    maxWidth: ONBOARDING_COLUMN_WIDTH,
    gap: theme.spacing[8],
  },
  hero: {
    alignItems: "flex-start",
    gap: theme.spacing[3],
  },
  heroTitle: {
    marginTop: theme.spacing[3],
    color: theme.colors.foreground,
    fontSize: theme.fontSize["2xl"],
    fontWeight: theme.fontWeight.medium,
  },
  heroSubtitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    lineHeight: theme.fontSize.base * 1.6,
  },
  section: {
    gap: theme.spacing[3],
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  sectionMeta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  stepRow: {
    gap: theme.spacing[3],
  },
  stepMarker: {
    width: STEP_MARKER_SIZE,
    height: STEP_MARKER_SIZE,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  stepMarkerDone: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accent,
  },
  stepNumber: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  stepTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  stepTitleDone: {
    color: theme.colors.foregroundMuted,
  },
  importCard: {
    backgroundColor: "transparent",
  },
  importIcon: {
    width: STEP_MARKER_SIZE,
    alignItems: "center",
    alignSelf: "flex-start",
    // Optical: centers the 16px glyph on the title's first line rather than its box top.
    paddingTop: 3,
  },
  shortcuts: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: theme.spacing[4],
    rowGap: theme.spacing[2],
  },
  shortcutLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  shortcut: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  shortcutText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  communityRow: {
    flexShrink: 0,
    paddingBottom: {
      xs: HEADER_INNER_HEIGHT_MOBILE + HEADER_TOP_PADDING_MOBILE + theme.spacing[2],
      md: HEADER_INNER_HEIGHT + theme.spacing[2],
    },
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 0,
  },
}));
