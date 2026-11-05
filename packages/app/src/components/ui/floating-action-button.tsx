import { forwardRef, useMemo } from "react";
import { Text, type View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { PressHighlight } from "@/components/ui/press-highlight";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import { COMPACT_ACTION_BUTTON_SIZE } from "./control-geometry";

import {
  FLOATING_ACTION_BUTTON_SIZE,
  FLOATING_ACTION_BUTTON_INSET,
} from "./floating-action-layout";
export {
  FLOATING_ACTION_BUTTON_CLEARANCE,
  COMPACT_FLOATING_ACTION_BUTTON_CLEARANCE,
  floatingActionsClearance,
} from "./floating-action-layout";

export interface FloatingActionButtonProps {
  icon: LucideIcon;
  /** Names the action for assistive technology. */
  accessibilityLabel: string;
  onPress: () => void;
  label?: string;
  disabled?: boolean;
  compact?: boolean;
  bottomInset?: number;
  testID?: string;
  variant?: "default" | "primary";
}

function FloatingActionGlyph({ icon: Icon, color }: { icon: LucideIcon; color: string }) {
  return <Icon size={ICON_SIZE.lg} color={color} />;
}

const ThemedFloatingActionGlyph = withUnistyles(FloatingActionGlyph);
const foregroundGlyph = (theme: Theme) => ({ color: theme.colors.foreground });
const primaryGlyph = (theme: Theme) => ({ color: theme.colors.surface0 });

/**
 * Pins an action to the bottom-right of its nearest positioned ancestor.
 * The surface reserves scroll clearance and uses bottomInset to separate stacked actions.
 */
export const FloatingActionButton = forwardRef<View, FloatingActionButtonProps>(
  function FloatingActionButton(
    {
      icon: Icon,
      accessibilityLabel,
      onPress,
      label,
      disabled = false,
      compact = false,
      bottomInset = 0,
      testID,
      variant = "default",
    },
    ref,
  ) {
    const accessibilityState = useMemo(() => ({ disabled }), [disabled]);
    const labelStyle = useMemo(
      () => [styles.label, variant === "primary" && styles.primaryGlyph],
      [variant],
    );
    const buttonStyle = useMemo(
      () => [
        styles.button,
        compact && styles.compact,
        variant === "primary" && styles.primary,
        label && styles.labeled,
        disabled && styles.disabled,
        { bottom: FLOATING_ACTION_BUTTON_INSET + bottomInset },
      ],
      [bottomInset, compact, disabled, label, variant],
    );
    return (
      <PressHighlight
        ref={ref}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={accessibilityState}
        disabled={disabled}
        onPress={onPress}
        style={buttonStyle}
        highlightStyle={styles.pressed}
        testID={testID}
      >
        <ThemedFloatingActionGlyph
          icon={Icon}
          uniProps={variant === "primary" ? primaryGlyph : foregroundGlyph}
        />
        {label ? <Text style={labelStyle}>{label}</Text> : null}
      </PressHighlight>
    );
  },
);

const styles = StyleSheet.create((theme) => ({
  button: {
    position: "absolute",
    right: FLOATING_ACTION_BUTTON_INSET,
    bottom: FLOATING_ACTION_BUTTON_INSET,
    width: FLOATING_ACTION_BUTTON_SIZE,
    height: FLOATING_ACTION_BUTTON_SIZE,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface3,
    ...theme.shadow.md,
  },
  labeled: {
    width: "auto",
    minWidth: FLOATING_ACTION_BUTTON_SIZE,
    paddingHorizontal: theme.spacing[4],
    flexDirection: "row",
    gap: theme.spacing[2],
  },
  compact: {
    width: COMPACT_ACTION_BUTTON_SIZE,
    minWidth: COMPACT_ACTION_BUTTON_SIZE,
    height: COMPACT_ACTION_BUTTON_SIZE,
  },
  label: { color: theme.colors.foreground, fontSize: theme.fontSize.base },
  disabled: { opacity: theme.opacity[50] },
  pressed: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  primary: { backgroundColor: theme.colors.foreground },
  primaryGlyph: { color: theme.colors.surface0 },
}));
