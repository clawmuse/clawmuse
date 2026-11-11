import type { ReactElement } from "react";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Folder, FolderPlus, GitBranch, GitPullRequest } from "@/components/icons/app-icons";
import { ProjectIconView } from "@/components/project-icon-view";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import { projectIconPlaceholderLabelFromDisplayName } from "@/utils/project-display-name";

const ThemedFolder = withUnistyles(Folder);
const ThemedFolderPlus = withUnistyles(FolderPlus);
const ThemedGitBranch = withUnistyles(GitBranch);
const ThemedGitPullRequest = withUnistyles(GitPullRequest);
const mutedColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

export const folderIcon = <ThemedFolder size={ICON_SIZE.sm} uniProps={mutedColor} />;
export const compactFolderIcon = <ThemedFolder size={ICON_SIZE.lg} uniProps={mutedColor} />;
export const addProjectIcon = <ThemedFolderPlus size={ICON_SIZE.sm} uniProps={mutedColor} />;
export const branchIcon = <ThemedGitBranch size={ICON_SIZE.sm} uniProps={mutedColor} />;
export const compactBranchIcon = <ThemedGitBranch size={ICON_SIZE.lg} uniProps={mutedColor} />;
export const pullRequestIcon = <ThemedGitPullRequest size={ICON_SIZE.sm} uniProps={mutedColor} />;
export const compactPullRequestIcon = (
  <ThemedGitPullRequest size={ICON_SIZE.lg} uniProps={mutedColor} />
);

// Single uppercase initial inside an iconSize.md (16px) square — the fallback letter's size
// comes from ProjectIconView's size-derived default, so this file only needs the box size.
const COMPACT_PROJECT_ICON_SIZE = 24;

export function ProjectIcon({
  projectViewKey,
  projectName,
  iconDataUri,
  compact = false,
}: {
  projectViewKey: string;
  projectName: string;
  iconDataUri: string | null;
  compact?: boolean;
}): ReactElement {
  const placeholderLabel = projectIconPlaceholderLabelFromDisplayName(projectName);
  return (
    <ProjectIconView
      iconDataUri={iconDataUri}
      initial={placeholderLabel.charAt(0).toUpperCase() || "?"}
      projectViewKey={projectViewKey}
      size={compact ? COMPACT_PROJECT_ICON_SIZE : ICON_SIZE.md}
      textStyle={compact ? styles.compactFallbackText : styles.fallbackText}
      // Letter size is inherited — see ProjectIconView.
    />
  );
}

const styles = StyleSheet.create(() => ({
  fallbackText: {},
  compactFallbackText: {},
}));
