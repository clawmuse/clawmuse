import { useMemo } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";

const METER_HEIGHT = 6;

export interface UsageMeterProps {
  usedPercent: number | null;
  /** How far the window has run; drawn as a vertical marker. */
  timePercent: number | null;
  unlimited?: boolean;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function fillStyleFor(usedPercent: number | null) {
  if (usedPercent === null) {
    return styles.fillUnknown;
  }
  const used = clamp(usedPercent);
  if (used >= 80) {
    return styles.fillDanger;
  }
  return used >= 60 ? styles.fillWarning : styles.fillOk;
}

/**
 * Ported from agent/mobile/src/components/UsageMeter.tsx.
 *
 * Colour is used quota, the vertical line marks how much of the window has
 * elapsed, and the thin connector between them is the pace gap: a line to the
 * right of the fill means usage trails time, so the window will not run out.
 */
export function UsageMeter({ usedPercent, timePercent, unlimited }: UsageMeterProps) {
  const used = usedPercent === null ? 0 : clamp(usedPercent);
  const time = timePercent === null ? null : clamp(timePercent);
  const fillStyle = useMemo<StyleProp<ViewStyle>>(
    () => [
      styles.fill,
      fillStyleFor(usedPercent),
      inlineUnistylesStyle<ViewStyle>({ width: `${used}%` }),
    ],
    [used, usedPercent],
  );
  const gapStyle = useMemo<StyleProp<ViewStyle>>(
    () =>
      time === null
        ? null
        : [
            styles.gap,
            inlineUnistylesStyle<ViewStyle>({
              left: `${Math.min(used, time)}%`,
              width: `${Math.abs(time - used)}%`,
            }),
          ],
    [time, used],
  );
  const markStyle = useMemo<StyleProp<ViewStyle>>(
    () =>
      time === null ? null : [styles.mark, inlineUnistylesStyle<ViewStyle>({ left: `${time}%` })],
    [time],
  );

  return (
    <View style={styles.row}>
      {unlimited ? (
        <View style={styles.unlimitedTrack} />
      ) : (
        <View style={styles.track}>
          <View style={fillStyle} />
        </View>
      )}
      {time !== null && !unlimited ? (
        <>
          <View style={gapStyle} />
          <View style={markStyle} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flex: 1,
    minWidth: 0,
    height: METER_HEIGHT + 6,
    justifyContent: "center",
  },
  track: {
    width: "100%",
    height: METER_HEIGHT,
    borderRadius: METER_HEIGHT / 2,
    backgroundColor: theme.colors.surface3,
    overflow: "hidden",
  },
  unlimitedTrack: {
    width: "100%",
    height: METER_HEIGHT,
    borderRadius: METER_HEIGHT / 2,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.colors.border,
  },
  fill: {
    height: "100%",
    borderRadius: METER_HEIGHT / 2,
  },
  fillUnknown: {
    backgroundColor: theme.colors.foregroundMuted,
  },
  fillOk: {
    backgroundColor: theme.colors.statusSuccess,
  },
  fillWarning: {
    backgroundColor: theme.colors.statusWarning,
  },
  fillDanger: {
    backgroundColor: theme.colors.statusDanger,
  },
  // Low, so the gap reads as a distance between two marks rather than a second fill.
  gap: {
    position: "absolute",
    height: 2,
    backgroundColor: theme.colors.foregroundMuted,
    opacity: 0.5,
  },
  mark: {
    position: "absolute",
    top: 0,
    marginLeft: -1,
    width: 2,
    height: METER_HEIGHT + 6,
    borderRadius: 1,
    backgroundColor: theme.colors.foreground,
    opacity: 0.9,
  },
}));
