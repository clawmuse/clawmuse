import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import type { AgentTokenSpeed } from "@getpaseo/protocol/agent-types";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { PressHighlight } from "@/components/ui/press-highlight";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isNative } from "@/constants/platform";
import { ContextWindowSheet } from "./context-window-sheet";
import { formatLiveTokenRate, formatTokenRate } from "./context-window-meter.utils";
import { TokenSpeedDetails } from "./token-speed-details";
import { selectAgentTurnPresentation, useSessionStore } from "@/stores/session-store";

function visibleTokenRate(speed: AgentTokenSpeed | null, isRunning: boolean): string | null {
  if (!speed) return null;
  return (
    (isRunning ? formatLiveTokenRate(speed) : null) ??
    (!speed.streaming && speed.average > 0 ? formatTokenRate(speed.average) : null)
  );
}

export function useHasAgentTokenSpeed(serverId: string, agentId: string): boolean {
  return useSessionStore((state) => {
    const session = state.sessions[serverId];
    const speed = session?.agents.get(agentId)?.lastUsage?.tokenSpeed ?? null;
    return visibleTokenRate(speed, selectAgentTurnPresentation(session, agentId).isActive) !== null;
  });
}

export function AgentTokenSpeedIndicator({
  serverId,
  agentId,
  rail = false,
}: {
  serverId: string;
  agentId: string;
  rail?: boolean;
}) {
  const speed = useSessionStore(
    (state) => state.sessions[serverId]?.agents.get(agentId)?.lastUsage?.tokenSpeed ?? null,
  );
  const isRunning = useSessionStore(
    (state) => selectAgentTurnPresentation(state.sessions[serverId], agentId).isActive,
  );
  return <TokenSpeedIndicator speed={speed} isRunning={isRunning} rail={rail} />;
}

/**
 * The composer's speed readout: the live rate while the agent runs, the last turn's average once
 * it stops. Opens the full figures the same three ways the context window meter does: a sheet on
 * compact screens, a press tooltip on native wide screens, a hover card on web.
 */
export function TokenSpeedIndicator({
  speed,
  isRunning,
  rail = false,
}: {
  speed: AgentTokenSpeed | null;
  isRunning: boolean;
  rail?: boolean;
}) {
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const openSheet = useCallback(() => setIsSheetOpen(true), []);
  const closeSheet = useCallback(() => setIsSheetOpen(false), []);
  if (!speed) return null;
  const live = isRunning ? formatLiveTokenRate(speed) : null;
  const rate = visibleTokenRate(speed, isRunning);
  if (!rate) return null;
  const label = (
    <Text style={live ? styles.live : styles.settled}>
      {t("contextWindow.tokenRate", { rate })}
    </Text>
  );
  const accessibilityLabel = t("tokenSpeed.accessibility", { rate });
  const triggerStyle = rail ? styles.triggerRail : styles.trigger;

  if (isCompact) {
    return (
      <>
        <PressHighlight
          style={triggerStyle}
          highlightStyle={styles.triggerHighlight}
          testID="composer-output-token-rate"
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          onPress={openSheet}
        >
          {label}
        </PressHighlight>
        <ContextWindowSheet open={isSheetOpen} onClose={closeSheet} title={t("tokenSpeed.title")}>
          <TokenSpeedDetails speed={speed} showTitle={false} />
        </ContextWindowSheet>
      </>
    );
  }

  if (isNative) {
    return (
      <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile>
        <TooltipTrigger asChild triggerRefProp="ref">
          <PressHighlight
            style={triggerStyle}
            highlightStyle={styles.triggerHighlight}
            testID="composer-output-token-rate"
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
          >
            {label}
          </PressHighlight>
        </TooltipTrigger>
        <TooltipContent side="top" align="center" offset={8} style={styles.popover}>
          <TokenSpeedDetails speed={speed} showTitle />
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <HoverCard>
      <HoverCardTrigger focusable accessibilityLabel={accessibilityLabel}>
        <View style={triggerStyle} testID="composer-output-token-rate">
          {label}
        </View>
      </HoverCardTrigger>
      <HoverCardContent
        placement="top"
        offset={8}
        role="dialog"
        accessibilityLabel={t("tokenSpeed.title")}
        testID="token-speed-popover"
        style={styles.popover}
      >
        <TokenSpeedDetails speed={speed} showTitle />
      </HoverCardContent>
    </HoverCard>
  );
}

const styles = StyleSheet.create((theme) => ({
  trigger: {
    height: 28,
    flexShrink: 0,
    justifyContent: "center",
    paddingHorizontal: theme.spacing[1],
    borderRadius: theme.borderRadius.full,
  },
  /**
   * The same readout wearing the action rail's ground: the flat solid round badge the rail's
   * icon buttons use (`chatActionButton` in agent-panel.tsx), instead of bare text over the
   * transcript. No shadow — a wide pill wearing the icon buttons' shadow picks up a blur they don't.
   */
  triggerRail: {
    height: 28,
    flexShrink: 0,
    justifyContent: "center",
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface2,
  },
  triggerHighlight: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  live: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  settled: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
    opacity: 0.7,
  },
  popover: { paddingVertical: theme.spacing[2], paddingHorizontal: theme.spacing[3] },
}));
