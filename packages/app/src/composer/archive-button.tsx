import { useCallback, type ReactElement } from "react";
import { Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Archive } from "@/components/icons/app-icons";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { buttonControlHeight } from "@/components/ui/control-geometry";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function ComposerArchiveButton({
  disabled,
  pending = false,
  iconSize,
  onPress,
}: {
  disabled: boolean;
  pending?: boolean;
  iconSize: number;
  onPress: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const actionLabel = t("sidebar.workspace.actions.archiveWorkspace");
  const label = pending ? t("sidebar.workspace.actions.archiving") : actionLabel;
  const renderIcon = useCallback(
    (color: string) => <Archive size={iconSize} color={color} />,
    [iconSize],
  );

  return (
    <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          leftIcon={renderIcon}
          disabled={disabled || pending}
          loading={pending}
          onPress={onPress}
          accessibilityLabel={label}
          testID="composer-archive-workspace"
          style={styles.button}
        />
      </TooltipTrigger>
      <TooltipContent side="top" align="center" offset={8}>
        <Text style={styles.tooltipText}>{actionLabel}</Text>
      </TooltipContent>
    </Tooltip>
  );
}

const styles = StyleSheet.create((theme) => ({
  button: {
    flexShrink: 0,
    width: buttonControlHeight.xs,
    paddingHorizontal: 0,
  },
  tooltipText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.popoverForeground,
  },
}));
