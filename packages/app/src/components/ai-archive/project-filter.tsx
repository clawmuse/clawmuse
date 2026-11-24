import { useCallback, useMemo, useRef, useState, type ReactElement } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Check, Folder } from "@/components/icons/app-icons";
import { Combobox, ComboboxItem, type ComboboxOption } from "@/components/ui/combobox";
import { ComboboxTrigger } from "@/components/ui/combobox-trigger";
import { density } from "@/styles/density";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import { ALL_PROJECTS_OPTION_ID, type ProjectArchiveOption } from "./project-scope";

const ThemedCheck = withUnistyles(Check);
const ThemedFolder = withUnistyles(Folder);

const checkIconProps = (theme: Theme) => ({
  size: 16,
  color: theme.colors.foregroundMuted,
});

const folderIconProps = (theme: Theme) => ({
  size: ICON_SIZE.sm,
  color: theme.colors.foregroundMuted,
});

const SELECTED_LEADING_SLOT = (
  <View style={{ width: 16, alignItems: "center", justifyContent: "center" }}>
    <ThemedCheck uniProps={checkIconProps} />
  </View>
);

const FOLDER_LEADING_SLOT = (
  <View style={{ width: 16, alignItems: "center", justifyContent: "center" }}>
    <ThemedFolder uniProps={folderIconProps} />
  </View>
);

function ProjectFilterOptionRow({
  option,
  count,
  selected,
  active,
  onPress,
  testID,
}: {
  option: ComboboxOption;
  count: number;
  selected: boolean;
  active: boolean;
  onPress: () => void;
  testID?: string;
}): ReactElement {
  const trailingAction = useMemo(() => <Text style={styles.optionCount}>{count}</Text>, [count]);
  return (
    <ComboboxItem
      label={option.label}
      description={option.description}
      leadingSlot={selected ? SELECTED_LEADING_SLOT : FOLDER_LEADING_SLOT}
      trailingAction={trailingAction}
      selected={selected}
      active={active}
      onPress={onPress}
      testID={testID}
    />
  );
}

export interface ProjectFilterProps {
  projects: readonly ProjectArchiveOption[];
  totalCount: number;
  selectedProject: string;
  onSelectProject: (projectId: string) => void;
  disabled?: boolean;
  triggerTestID?: string;
  projectOptionTestID?: (projectId: string) => string;
}

export function ProjectFilter({
  projects,
  totalCount,
  selectedProject,
  onSelectProject,
  disabled = false,
  triggerTestID,
  projectOptionTestID,
}: ProjectFilterProps): ReactElement {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<View>(null);

  const handleOpen = useCallback(() => {
    if (!disabled) setOpen(true);
  }, [disabled]);

  const countsById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.count])),
    [projects],
  );

  const selectedOption = useMemo(
    () => projects.find((project) => project.id === selectedProject) ?? null,
    [projects, selectedProject],
  );

  const selectedLabel = useMemo(() => {
    if (!selectedOption) {
      return `${t("aiArchive.projectFilter.all")} (${totalCount})`;
    }
    return `${selectedOption.label} (${selectedOption.count})`;
  }, [selectedOption, t, totalCount]);

  const options = useMemo<ComboboxOption[]>(() => {
    const allLabel = t("aiArchive.projectFilter.all");
    return [
      { id: ALL_PROJECTS_OPTION_ID, label: allLabel },
      ...projects.map((project) => ({
        id: project.id,
        label: project.label,
        description: project.description,
      })),
    ];
  }, [projects, t]);

  const renderOption = useCallback(
    ({
      option,
      selected,
      active,
      onPress,
    }: {
      option: ComboboxOption;
      selected: boolean;
      active: boolean;
      onPress: () => void;
    }) => {
      const count =
        option.id === ALL_PROJECTS_OPTION_ID ? totalCount : (countsById.get(option.id) ?? 0);
      return (
        <ProjectFilterOptionRow
          option={option}
          count={count}
          selected={selected}
          active={active}
          onPress={onPress}
          testID={projectOptionTestID?.(option.id)}
        />
      );
    },
    [countsById, projectOptionTestID, totalCount],
  );

  const triggerStyle = useCallback(
    ({ pressed, hovered }: { pressed: boolean; hovered: boolean }) => [
      styles.trigger,
      hovered && !disabled && styles.triggerHovered,
      pressed && !disabled && styles.triggerPressed,
      disabled && styles.triggerDisabled,
    ],
    [disabled],
  );

  return (
    <>
      <View style={styles.triggerSlot}>
        <ComboboxTrigger
          ref={anchorRef}
          onPress={handleOpen}
          disabled={disabled}
          style={triggerStyle}
          testID={triggerTestID}
          accessibilityRole="button"
          accessibilityLabel={`${t("aiArchive.projectFilter.label")}: ${selectedLabel}`}
        >
          <View style={styles.triggerIdentity}>
            <ThemedFolder uniProps={folderIconProps} />
            <Text style={styles.label} numberOfLines={1}>
              {selectedLabel}
            </Text>
          </View>
        </ComboboxTrigger>
      </View>
      <Combobox
        options={options}
        value={selectedOption ? selectedOption.id : ALL_PROJECTS_OPTION_ID}
        onSelect={onSelectProject}
        renderOption={renderOption}
        open={open}
        onOpenChange={setOpen}
        anchorRef={anchorRef}
        searchable={projects.length > 6}
        searchPlaceholder={t("aiArchive.projectFilter.searchPlaceholder")}
        emptyText={t("aiArchive.projectFilter.empty")}
        title={t("aiArchive.projectFilter.label")}
        desktopPlacement="bottom-start"
        desktopMinWidth={280}
      />
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  triggerSlot: {
    flexDirection: "row",
    flexShrink: 1,
    minWidth: 0,
    maxWidth: 320,
  },
  trigger: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    minHeight: density.tightRowHeight,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  triggerHovered: {
    backgroundColor: theme.colors.surface2,
  },
  triggerPressed: {
    backgroundColor: theme.colors.surface2,
  },
  triggerDisabled: {
    opacity: 0.55,
  },
  triggerIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    flexShrink: 1,
    minWidth: 0,
  },
  label: {
    flexShrink: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
  },
  optionCount: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    fontVariant: ["tabular-nums"],
  },
}));
