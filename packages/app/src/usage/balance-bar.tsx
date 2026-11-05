import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { UsageDisplayAs } from "./preferences";
import {
  formatAmount,
  formatProviderUsageLabel,
  formatResetLabel,
  formatResetTime,
} from "./format";
import { UsageMeter } from "./meter";
import { UsageResetLine } from "./reset-line";
import type { UsageBalance } from "./types";
import { useRelativeTimeTick } from "./use-relative-time-tick";

interface ResolvedBalance {
  amountText: string;
  fillPct: number | null;
}

function resolveBalance({
  balance,
  t,
  locale,
  displayAs,
}: {
  balance: UsageBalance;
  t: TFunction;
  locale?: string;
  displayAs?: UsageDisplayAs;
}): ResolvedBalance {
  const { used, remaining, limit, unit } = balance;
  const format = (value: number) => formatAmount(value, unit, locale);
  if (limit != null && limit > 0) {
    const usedAmount = used ?? (remaining != null ? limit - remaining : null);
    const usedPct = usedAmount != null ? (usedAmount / limit) * 100 : null;
    const usedText = usedAmount != null ? format(usedAmount) : "—";
    const remainingAmount = remaining ?? (used != null ? Math.max(0, limit - used) : null);
    const amount = displayAs === "remaining" ? remainingAmount : usedAmount;
    const amountText =
      displayAs && amount != null
        ? t(displayAs === "remaining" ? "usageMonitoring.remainingOf" : "usageMonitoring.usedOf", {
            amount: format(amount),
            limit: format(limit),
          })
        : `${usedText} / ${format(limit)}`;
    return {
      amountText,
      fillPct: displayAs === "remaining" && usedPct !== null ? 100 - usedPct : usedPct,
    };
  }
  if (remaining != null) {
    return {
      amountText: t("providerUsage.values.remaining", { amount: format(remaining) }),
      fillPct: null,
    };
  }
  if (used != null) {
    return { amountText: format(used), fillPct: null };
  }
  return { amountText: "—", fillPct: null };
}

export function UsageBalanceBar({
  balance,
  retained = false,
  displayAs,
}: {
  balance: UsageBalance;
  retained?: boolean;
  displayAs?: UsageDisplayAs;
}) {
  const { t, i18n } = useTranslation();
  const now = useRelativeTimeTick({ enabled: balance.resetsAt != null });
  const { amountText, fillPct } = resolveBalance({
    balance,
    t,
    locale: i18n.resolvedLanguage,
    displayAs,
  });
  const tone = balance.tone ?? "default";
  const resetLabel = formatResetLabel(balance.resetsAt, retained, now, t);
  const resetTime = formatResetTime(balance.resetsAt, now, t);

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label} numberOfLines={1}>
          {formatProviderUsageLabel(balance.id, balance.label, t)}
        </Text>
        <Text
          style={styles.amount}
          numberOfLines={1}
          ellipsizeMode="tail"
          testID={`provider-usage-balance-${balance.id}-value`}
        >
          {amountText}
        </Text>
      </View>
      {fillPct != null ? <UsageMeter percent={fillPct} tone={tone} /> : null}
      <UsageResetLine
        countdown={resetLabel}
        exactTime={resetTime}
        testID={`provider-usage-balance-${balance.id}-reset`}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: 3,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  label: {
    flexShrink: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  amount: {
    flexShrink: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
}));
