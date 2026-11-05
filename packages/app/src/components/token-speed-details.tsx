import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import type { AgentTokenSpeed } from "@getpaseo/protocol/agent-types";
import { buildTokenSpeedFigures } from "./context-window-meter.utils";

/**
 * The speed figures Cindy's running-status popover shows, as text: current, turn average, the
 * turn's highest and lowest live readings, the turn's output, and the session average.
 */
export function TokenSpeedDetails({
  speed,
  showTitle,
}: {
  speed: AgentTokenSpeed;
  showTitle: boolean;
}) {
  const { t } = useTranslation();
  const figures = buildTokenSpeedFigures(speed);
  const rate = (value: string | null) =>
    value ? t("contextWindow.tokenRate", { rate: value }) : "—";
  const rows: Array<{ key: string; label: string; value: string }> = [
    ...(speed.streaming
      ? [{ key: "current", label: t("tokenSpeed.current"), value: rate(figures.current) }]
      : []),
    { key: "turnAverage", label: t("tokenSpeed.turnAverage"), value: rate(figures.turnAverage) },
    { key: "peak", label: t("tokenSpeed.peak"), value: rate(figures.peak) },
    { key: "low", label: t("tokenSpeed.low"), value: rate(figures.low) },
    {
      key: "turnOutput",
      label: t("tokenSpeed.turnOutput"),
      value: t("tokenSpeed.outputDetail", {
        tokens: figures.turnTokens,
        elapsed: figures.turnElapsed,
      }),
    },
    {
      key: "sessionAverage",
      label: t("tokenSpeed.sessionAverage"),
      value: rate(figures.sessionAverage),
    },
    ...(figures.sessionTokens && figures.sessionElapsed
      ? [
          {
            key: "sessionOutput",
            label: t("tokenSpeed.sessionOutput"),
            value: t("tokenSpeed.outputDetail", {
              tokens: figures.sessionTokens,
              elapsed: figures.sessionElapsed,
            }),
          },
        ]
      : []),
  ];
  return (
    <View style={styles.container} testID="token-speed-details">
      {showTitle ? <Text style={styles.title}>{t("tokenSpeed.title")}</Text> : null}
      {rows.map((row) => (
        <View key={row.key} style={styles.row}>
          <Text style={styles.label}>{row.label}</Text>
          <Text style={styles.value}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.spacing[1.5],
    minWidth: 220,
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: theme.spacing[4],
  },
  label: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm * 1.4,
  },
  value: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm * 1.4,
    fontVariant: ["tabular-nums"],
  },
}));
