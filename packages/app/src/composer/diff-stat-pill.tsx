import { memo, useCallback, useMemo, useState, type ReactElement } from "react";
import { Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { DiffStat } from "@/components/diff-stat";
import { composerPillStyles } from "@/composer/pill-styles";
import { useVisibleWorkspaceDiffStat } from "@/composer/workspace-diff-stat";
import { useIsCompactFormFactor } from "@/constants/layout";

interface ComposerDiffStatPillProps {
  additions: number;
  deletions: number;
  onPress: () => void;
  rail?: boolean;
}

export function ComposerDiffStatPill({
  additions,
  deletions,
  onPress,
  rail = false,
}: ComposerDiffStatPillProps) {
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
  const [isHovered, setIsHovered] = useState(false);
  const handleHoverIn = useCallback(() => setIsHovered(true), []);
  const handleHoverOut = useCallback(() => setIsHovered(false), []);
  const bodyStyle = useMemo(
    () => [
      composerPillStyles.body,
      composerPillStyles.denseBody,
      composerPillStyles.compactActionBody,
      rail && composerPillStyles.railBody,
      isHovered && composerPillStyles.bodyActive,
    ],
    [isHovered, rail],
  );

  return (
    <Pressable
      testID="composer-diff-stat-pill"
      accessibilityRole="button"
      accessibilityLabel={t("workspace.git.diff.openChangesTab")}
      onPress={onPress}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      style={bodyStyle}
    >
      <DiffStat additions={additions} deletions={deletions} stacked={isCompact} />
    </Pressable>
  );
}

export const WorkspaceDiffStatPill = memo(function WorkspaceDiffStatPill({
  serverId,
  workspaceId,
  onPress,
  rail = false,
}: {
  serverId: string;
  workspaceId: string;
  onPress: () => void;
  rail?: boolean;
}): ReactElement | null {
  const diffStat = useVisibleWorkspaceDiffStat(serverId, workspaceId);
  if (!diffStat) {
    return null;
  }
  return (
    <ComposerDiffStatPill
      additions={diffStat.additions}
      deletions={diffStat.deletions}
      onPress={onPress}
      rail={rail}
    />
  );
});
