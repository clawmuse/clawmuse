import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { Pencil, RotateCw } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import type { OutboxEntry } from "./model";
import { useAgentOutboxEntries } from "./store";

interface FailedOutboxTrackProps {
  serverId: string;
  agentId: string;
  /** Receives a discarded prompt so the composer can reopen it as a draft. */
  onEdit: (entry: OutboxEntry) => void;
}

/**
 * Prompts the outbox gave up on. Their optimistic rows were rolled back, so this
 * is the one place their text stays visible until the user retries or edits them.
 */
export function FailedOutboxTrack({ serverId, agentId, onEdit }: FailedOutboxTrackProps) {
  const entries = useAgentOutboxEntries(serverId, agentId);
  const failed = useMemo(
    () => entries.filter((entry) => entry.delivery.status === "failed"),
    [entries],
  );
  if (failed.length === 0) return null;
  return (
    <View style={styles.track}>
      {failed.map((entry) => (
        <FailedOutboxRow key={entry.clientMessageId} entry={entry} onEdit={onEdit} />
      ))}
    </View>
  );
}

interface FailedOutboxRowProps {
  entry: OutboxEntry;
  onEdit: (entry: OutboxEntry) => void;
}

function FailedOutboxRow({ entry, onEdit }: FailedOutboxRowProps) {
  const { t } = useTranslation();
  const handleRetry = useCallback(() => {
    getHostRuntimeStore().retryOutboxMessage(entry.clientMessageId);
  }, [entry.clientMessageId]);
  const handleEdit = useCallback(() => {
    const discarded = getHostRuntimeStore().discardOutboxMessage(entry.clientMessageId);
    if (discarded) onEdit(discarded);
  }, [entry.clientMessageId, onEdit]);
  const error = entry.delivery.status === "failed" ? entry.delivery.error : null;
  return (
    <View style={styles.row} testID="outbox-failed-message">
      <View style={styles.body}>
        <Text style={styles.text} numberOfLines={2} ellipsizeMode="tail">
          {entry.text}
        </Text>
        <Text style={styles.status}>{t("connectionResilience.outbox.failedRetry")}</Text>
        {error ? (
          <Text style={styles.error} numberOfLines={2}>
            {error}
          </Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        <Button variant="ghost" size="sm" leftIcon={Pencil} onPress={handleEdit}>
          {t("connectionResilience.outbox.edit")}
        </Button>
        <Button variant="secondary" size="sm" leftIcon={RotateCw} onPress={handleRetry}>
          {t("connectionResilience.outbox.retry")}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  track: {
    flexDirection: "column",
    gap: theme.spacing[2],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.surface1,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.destructive,
    gap: theme.spacing[2],
  },
  body: {
    flex: 1,
    gap: theme.spacing[1],
  },
  text: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  status: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
  error: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
}));
