import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { StatusBadge } from "@/components/ui/status-badge";
import { ClawMuseHostUsageCollector } from "./host-usage-collector";
import type { ClawMuseStatusUsage } from "./summary";
import { useHostUsagePlans } from "./host-usage-plans";
import { UsageMeter } from "./usage-meter";
import {
  buildClawMuseUsageGroups,
  buildClawMuseUsageRows,
  remainingPercentLabel,
  resetCountdownLabel,
  type ClawMuseUsageGroup,
  type ClawMuseUsageRow,
  type ClawMuseUsageWindowRow,
} from "./usage-rows";
import { useClawMuseStatusSummary } from "./use-summary";
import { useMinuteClock } from "./use-minute-clock";

const EMPTY_SERVICE_USAGES: readonly ClawMuseStatusUsage[] = [];

function UsageWindow({
  label,
  window,
  unlimitedText,
  now,
}: {
  label: string;
  window: ClawMuseUsageWindowRow;
  unlimitedText: string;
  now: number;
}) {
  const { t } = useTranslation();
  const reset = resetCountdownLabel(window, now, t);
  return (
    <View style={styles.windowRow}>
      <Text style={styles.windowLabel}>{label}</Text>
      <UsageMeter
        usedPercent={window.usedPercent}
        timePercent={window.timePercent}
        unlimited={window.unlimited}
      />
      <Text style={styles.windowValue}>{remainingPercentLabel(window, unlimitedText)}</Text>
      <Text style={styles.windowReset} numberOfLines={1}>
        {reset ?? ""}
      </Text>
    </View>
  );
}

function UsagePlan({
  row,
  unlimitedText,
  now,
}: {
  row: ClawMuseUsageRow;
  unlimitedText: string;
  now: number;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.plan}>
      <View style={styles.planHeader}>
        <Text style={styles.planName} numberOfLines={1}>
          {row.name}
        </Text>
        {row.planLabel ? <StatusBadge label={row.planLabel} variant="muted" /> : null}
      </View>
      {row.session ? (
        <UsageWindow
          label={t("clawmuseStatus.usage.session")}
          window={row.session}
          unlimitedText={unlimitedText}
          now={now}
        />
      ) : null}
      {row.weekly ? (
        <UsageWindow
          label={t("clawmuseStatus.usage.weekly")}
          window={row.weekly}
          unlimitedText={unlimitedText}
          now={now}
        />
      ) : null}
    </View>
  );
}

function UsageGroup({
  group,
  showTitle,
  isFirst,
  unlimitedText,
  now,
}: {
  group: ClawMuseUsageGroup;
  showTitle: boolean;
  isFirst: boolean;
  unlimitedText: string;
  now: number;
}) {
  const { t } = useTranslation();
  return (
    <View style={isFirst ? styles.group : [styles.group, styles.groupDivided]}>
      {showTitle ? (
        <Text style={styles.groupTitle} numberOfLines={1}>
          {group.hostName ?? t("clawmuseStatus.usage.serviceGroup")}
        </Text>
      ) : null}
      {group.rows.map((row) => (
        <UsagePlan key={row.key} row={row} unlimitedText={unlimitedText} now={now} />
      ))}
    </View>
  );
}

/**
 * Every plan on one card, a section per online host for its own providers, plus
 * a section for the external plans the status service polls. Settings only; the
 * sidebar footer already opens usage. Ported from
 * agent/mobile/src/home/MobileHomeUsageCard.tsx.
 */
export function ClawMuseUsageCard() {
  const { t } = useTranslation();
  const hostPlans = useHostUsagePlans();
  const summary = useClawMuseStatusSummary();
  const serviceUsages = useMemo(() => summary?.usages ?? EMPTY_SERVICE_USAGES, [summary]);
  const hasSource = hostPlans.length > 0 || serviceUsages.length > 0;
  const now = useMinuteClock(hasSource);
  const rows = useMemo(
    () => buildClawMuseUsageRows({ hosts: hostPlans, serviceUsages, now }),
    [hostPlans, now, serviceUsages],
  );
  const groups = useMemo(
    () => buildClawMuseUsageGroups({ hosts: hostPlans, serviceUsages, now }),
    [hostPlans, now, serviceUsages],
  );
  const unlimitedText = t("clawmuseStatus.usage.unlimited");

  if (rows.length === 0) {
    return <ClawMuseHostUsageCollector />;
  }

  return (
    <View style={styles.settingsCard}>
      <ClawMuseHostUsageCollector />
      <View
        style={styles.header}
        accessibilityLabel={t("clawmuseStatus.usage.title")}
        testID="clawmuse-usage-card-header"
      >
        <Text style={styles.headerText} numberOfLines={1}>
          {t("clawmuseStatus.usage.title")}
        </Text>
      </View>
      <View style={styles.rows}>
        {groups.map((group, index) => (
          <UsageGroup
            key={group.key}
            group={group}
            // A lone section needs no title; there is nothing to tell it apart from.
            showTitle={groups.length > 1}
            isFirst={index === 0}
            unlimitedText={unlimitedText}
            now={now}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  settingsCard: {
    padding: theme.spacing[4],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    gap: theme.spacing[3],
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  headerText: {
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  rows: {
    gap: theme.spacing[3],
  },
  group: {
    gap: theme.spacing[3],
  },
  groupDivided: {
    paddingTop: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  groupTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  plan: {
    gap: theme.spacing[1],
  },
  planHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  planName: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
  windowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  // Wide enough for two CJK glyphs ("5时"), which wrap to two lines at 20.
  windowLabel: {
    width: 26,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  windowValue: {
    width: 40,
    textAlign: "right",
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    fontVariant: ["tabular-nums"],
  },
  // Fixed width keeps every row's meter the same length. Sized for the longest
  // countdown a locale produces ("6 天 23 小时后重置"); 86 clipped most of them.
  windowReset: {
    width: 104,
    textAlign: "right",
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
}));
