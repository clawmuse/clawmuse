import { useClawMuseAccount } from "@/clawmuse/account-provider";
import { parseConnectionOfferFromUrl } from "@getpaseo/protocol/connection-offer";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import * as QRCode from "qrcode";
import { SvgXml } from "react-native-svg";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import type { RemoteAccessState } from "@getpaseo/protocol/remote-access";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { useFetchQuery } from "@/data/query";
import { useHostRuntimeClient, getHostRuntimeStore } from "@/runtime/host-runtime";
import { settingsStyles } from "@/styles/settings";
import type { Theme } from "@/styles/theme";

const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);
const foregroundMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});

function useRemoteAccess(serverId: string, onPendingAppear?: () => void) {
  const { t } = useTranslation();
  const account = useClawMuseAccount();
  const client = useHostRuntimeClient(serverId);
  const cache = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [hasActiveInvitation, setHasActiveInvitation] = useState(false);
  const knownPendingIdsRef = useRef<Set<string> | null>(null);
  const pendingIdsBeforeInviteRef = useRef<Set<string> | null>(null);
  const state = useFetchQuery({
    queryKey: ["remote-access", serverId],
    queryFn: async () => {
      if (!client) throw new Error(t("remoteAccess.disconnected"));
      return (await client.getRemoteAccessState()).state;
    },
    enabled: Boolean(client?.isConnected),
    refetchInterval: hasActiveInvitation ? 1000 : 2000,
    dataShape: "value",
    staleTimeMs: 0,
  });
  const refresh = useCallback(async () => {
    await getHostRuntimeStore().enforceLocalAccessPolicy();
    await cache.invalidateQueries({ queryKey: ["remote-access", serverId] });
  }, [cache, serverId]);
  const action = useMutation({
    mutationFn: async (run: () => Promise<unknown>) => {
      await run();
      await refresh();
    },
  });
  const invitation = useMutation({
    onMutate: () => {
      const current = state.data?.controllers
        .filter((row) => row.status === "pending")
        .map((row) => row.id);
      pendingIdsBeforeInviteRef.current = new Set(current ?? []);
    },
    mutationFn: async (input: { bootstrap?: boolean; manager?: boolean }) => {
      if (!client) throw new Error(t("remoteAccess.disconnected"));
      const { config } = await client.getDaemonConfig();
      if (!config.relay?.enabled) await client.patchDaemonConfig({ relay: { enabled: true } });
      const result = await client.createRemoteAccessInvitation(input);
      await refresh();
      setCopied(false);
      setHasActiveInvitation(true);
      return result;
    },
  });
  const { data: invitationData, reset: resetInvitation } = invitation;
  useEffect(() => {
    const controllers = state.data?.controllers;
    if (!controllers) return;
    const pendingIds = controllers.filter((row) => row.status === "pending").map((row) => row.id);
    const prevSeen = knownPendingIdsRef.current;
    const hasNewArrival = prevSeen !== null && pendingIds.some((id) => !prevSeen.has(id));
    knownPendingIdsRef.current = new Set(pendingIds);

    // A single-use invitation becomes invalid as soon as a scan turns into a pending request.
    if (
      invitationData &&
      pendingIdsBeforeInviteRef.current !== null &&
      pendingIds.some((id) => !pendingIdsBeforeInviteRef.current!.has(id))
    ) {
      pendingIdsBeforeInviteRef.current = null;
      setCopied(false);
      setHasActiveInvitation(false);
      resetInvitation();
    }
    if (hasNewArrival) {
      onPendingAppear?.();
    }
  }, [invitationData, onPendingAppear, resetInvitation, state.data?.controllers]);
  const copy = useMutation({
    mutationFn: async () => {
      if (!invitation.data) return;
      await Clipboard.setStringAsync(invitation.data.url);
      setCopied(true);
    },
  });
  const register = useCallback(
    () =>
      action.mutate(async () => {
        const pairing = await client!.getDaemonPairingOffer();
        const offer = parseConnectionOfferFromUrl(pairing.url);
        if (!offer?.requiresAuthorization) throw new Error(t("remoteAccess.invalidDirectoryOffer"));
        const host = getHostRuntimeStore()
          .getHosts()
          .find((entry) => entry.serverId === serverId);
        await account.model.registerDevice(offer, host?.label ?? serverId);
      }),
    [action, account.model, client, serverId, t],
  );
  const bootstrap = useCallback(() => invitation.mutate({ bootstrap: true }), [invitation]);
  const createLink = useCallback(() => invitation.mutate({}), [invitation]);
  const createManagerLink = useCallback(() => invitation.mutate({ manager: true }), [invitation]);
  const retry = useCallback(() => {
    void state.refetch();
  }, [state]);
  const copyLink = useCallback(() => copy.mutate(), [copy]);
  const setMode = useCallback(
    () => action.mutate(() => client!.setControlledOnly(!state.data!.controlledOnly)),
    [action, client, state.data],
  );
  const setReceiving = useCallback(
    () => action.mutate(() => client!.setRemoteAccessReceiving(!state.data!.receiving)),
    [action, client, state.data],
  );
  return {
    state,
    action,
    invitation,
    copy,
    copied,
    bootstrap,
    createLink,
    createManagerLink,
    retry,
    copyLink,
    setMode,
    setReceiving,
    account,
    register,
    client,
  };
}
type AccessModel = ReturnType<typeof useRemoteAccess>;

export function RemoteAccessSection({
  serverId,
  legacy,
  onPendingAppear,
}: {
  serverId: string;
  legacy?: ReactNode;
  onPendingAppear?: () => void;
}) {
  const { t } = useTranslation();
  const model = useRemoteAccess(serverId, onPendingAppear);
  const { state, action, invitation, copy } = model;
  const error = action.error ?? invitation.error ?? state.error ?? copy.error;
  return (
    <View style={styles.section} testID="remote-access-section">
      <Text style={styles.title}>{t("remoteAccess.title")}</Text>
      {error ? <Alert variant="error" description={error.message} /> : null}
      {state.isPending ? <Text style={styles.text}>{t("remoteAccess.loading")}</Text> : null}
      {state.isError ? (
        <Button variant="outline" onPress={model.retry}>
          {t("remoteAccess.retry")}
        </Button>
      ) : null}
      {state.data ? <AccessContent model={model} data={state.data} legacy={legacy} /> : null}
    </View>
  );
}

function AccessContent({
  model,
  data,
  legacy,
}: {
  model: AccessModel;
  data: RemoteAccessState;
  legacy?: ReactNode;
}) {
  const { t } = useTranslation();
  // COMPAT(remoteAccessCanRevoke): added in v1.6.0, remove fallback after 2027-05-18 once daemon floor >= v1.6.0.
  const canRevoke = data.canRevoke ?? data.canManage;
  const pendingControllers = data.controllers.filter((row) => row.status === "pending").reverse();
  const authorizedControllers = data.controllers.filter((row) => row.status !== "pending");
  const hasPending = pendingControllers.length > 0;
  return (
    <View style={styles.section}>
      {hasPending ? (
        <View style={styles.pendingList} testID="remote-access-pending-list">
          {pendingControllers.map((row) => (
            <PendingControllerCard key={row.id} controller={row} model={model} />
          ))}
        </View>
      ) : null}
      <Text style={styles.text}>
        {t(data.controlledOnly ? "remoteAccess.controlledOnly" : "remoteAccess.description")}
      </Text>
      {!data.enabled && !data.canPair ? (
        <Text style={styles.text}>{t("remoteAccess.setupLocal")}</Text>
      ) : null}
      <AccessControls model={model} data={data} hasPending={hasPending} />
      <ManagedAccessActions model={model} data={data} />
      {model.invitation.data ? (
        <InvitationLink
          url={model.invitation.data.url}
          expiresAt={model.invitation.data.expiresAt}
          model={model}
        />
      ) : null}
      {!data.enabled ? legacy : null}
      {authorizedControllers.map((row) => (
        <AuthorizedControllerRow
          key={row.id}
          controller={row}
          model={model}
          canRevoke={canRevoke}
        />
      ))}
    </View>
  );
}

function ManagedAccessActions({ model, data }: { model: AccessModel; data: RemoteAccessState }) {
  const { t } = useTranslation();
  if (!data.enabled) return null;
  const saved = model.account.state.devices.some(
    (device) => device.serverId === model.client?.getLastServerInfoMessage()?.serverId,
  );
  return (
    <View style={styles.actions}>
      {data.canManage && model.account.state.account ? (
        <Button variant="outline" disabled={model.action.isPending} onPress={model.register}>
          {t(saved ? "remoteAccess.directorySaved" : "remoteAccess.saveToAccount")}
        </Button>
      ) : null}
      {data.canToggleReceiving ? (
        <Button variant="outline" disabled={model.action.isPending} onPress={model.setReceiving}>
          {t(data.receiving ? "remoteAccess.pause" : "remoteAccess.resume")}
        </Button>
      ) : null}
    </View>
  );
}

function AccessControls({
  model,
  data,
  hasPending,
}: {
  model: AccessModel;
  data: RemoteAccessState;
  hasPending: boolean;
}) {
  const { t } = useTranslation();
  if (!data.canPair) return null;
  const busy = model.action.isPending || model.invitation.isPending;
  const needsManager = !data.controllers.some((row) => row.manager && row.status === "authorized");
  return (
    <View style={styles.actions}>
      {!data.enabled || (!data.canManage && needsManager) ? (
        <Button
          variant={hasPending ? "outline" : "default"}
          disabled={busy}
          loading={model.invitation.isPending}
          onPress={model.bootstrap}
        >
          {t("remoteAccess.bootstrap")}
        </Button>
      ) : null}
      {data.enabled ? (
        <Button variant="outline" disabled={busy} onPress={model.createLink}>
          {t("remoteAccess.createLink")}
        </Button>
      ) : null}
      {data.enabled && data.canManage ? (
        <Button variant="outline" disabled={busy} onPress={model.createManagerLink}>
          {t("remoteAccess.createManagerLink")}
        </Button>
      ) : null}
      {data.enabled && data.canManage ? (
        <Button
          variant="outline"
          disabled={busy}
          loading={model.action.isPending}
          onPress={model.setMode}
        >
          {t(data.controlledOnly ? "remoteAccess.allowOutbound" : "remoteAccess.restrictOutbound")}
        </Button>
      ) : null}
    </View>
  );
}

function InvitationLink({
  url,
  expiresAt,
  model,
}: {
  url: string;
  expiresAt: string;
  model: AccessModel;
}) {
  const { t } = useTranslation();
  const qr = useFetchQuery({
    queryKey: ["remote-access-qr", url],
    queryFn: () => QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 1 }),
    dataShape: "value",
    staleTimeMs: 600_000,
  });
  return (
    <View style={styles.section}>
      <Text style={styles.text}>
        {t("remoteAccess.linkExpires", { time: new Date(expiresAt).toLocaleTimeString() })}
      </Text>
      {qr.error ? <Alert variant="error" description={qr.error.message} /> : null}
      {qr.data ? (
        <View style={styles.qr}>
          <SvgXml
            xml={qr.data}
            width={240}
            height={240}
            accessibilityRole="image"
            accessibilityLabel={t("remoteAccess.qr")}
          />
        </View>
      ) : null}
      <Text selectable style={styles.link}>
        {url}
      </Text>
      <Button variant="outline" loading={model.copy.isPending} onPress={model.copyLink}>
        {t(model.copied ? "remoteAccess.copied" : "remoteAccess.copy")}
      </Button>
      <View style={styles.waitingRow}>
        <ThemedLoadingSpinner size="small" uniProps={foregroundMutedColorMapping} />
        <Text style={styles.waitingText}>{t("remoteAccess.waitingForScan")}</Text>
      </View>
    </View>
  );
}

function PendingControllerCard({
  controller,
  model,
}: {
  controller: RemoteAccessState["controllers"][number];
  model: AccessModel;
}) {
  const { t } = useTranslation();
  const busy = model.action.isPending || model.invitation.isPending;
  const decide = useCallback(
    (approve: boolean, persistent: boolean) =>
      model.action.mutate(() =>
        model.client!.decideRemotePairing({ controllerId: controller.id, approve, persistent }),
      ),
    [model, controller.id],
  );
  const temporary = useCallback(() => decide(true, false), [decide]);
  const persistent = useCallback(() => decide(true, true), [decide]);
  const deny = useCallback(() => decide(false, false), [decide]);

  return (
    <View
      style={[settingsStyles.card, styles.pendingCard]}
      testID={`remote-access-pending-${controller.id}`}
    >
      <View style={styles.pendingHeader}>
        <Text style={styles.pendingTitle}>
          {controller.label}
          {controller.manager ? ` · ${t("remoteAccess.manager")}` : ""}
        </Text>
        <StatusBadge size="xs" variant="warning" label={t("remoteAccess.pendingBadge")} />
      </View>
      <Text selectable style={styles.fingerprint}>
        {t("remoteAccess.fingerprint", { value: controller.fingerprint })}
      </Text>
      <Text style={styles.text}>{t("remoteAccess.pending")}</Text>
      <View style={styles.actions}>
        <Button disabled={busy} onPress={persistent}>
          {t("remoteAccess.allowPersistent")}
        </Button>
        {!controller.manager ? (
          <Button variant="outline" disabled={busy} onPress={temporary}>
            {t("remoteAccess.allowOnce")}
          </Button>
        ) : null}
        <Button variant="outline" disabled={busy} onPress={deny}>
          {t("remoteAccess.deny")}
        </Button>
      </View>
    </View>
  );
}

function AuthorizedControllerRow({
  controller,
  model,
  canRevoke,
}: {
  controller: RemoteAccessState["controllers"][number];
  model: AccessModel;
  canRevoke: boolean;
}) {
  const { t } = useTranslation();
  const busy = model.action.isPending || model.invitation.isPending;
  const revoke = useCallback(
    () => model.action.mutate(() => model.client!.revokeRemoteController(controller.id)),
    [model, controller.id],
  );
  const status = controller.expiresAt ? "remoteAccess.temporary" : "remoteAccess.persistent";
  return (
    <View style={styles.controller}>
      <Text style={styles.title}>
        {controller.label}
        {controller.manager ? ` · ${t("remoteAccess.manager")}` : ""}
      </Text>
      <Text selectable style={styles.text}>
        {t("remoteAccess.fingerprint", { value: controller.fingerprint })}
      </Text>
      <Text style={styles.text}>{t(status)}</Text>
      {controller.status === "authorized" && canRevoke ? (
        <Button variant="outline" disabled={busy} onPress={revoke}>
          {t("remoteAccess.revoke")}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: { gap: theme.spacing[3] },
  pendingList: { gap: theme.spacing[2] },
  pendingCard: {
    padding: theme.spacing[4],
    gap: theme.spacing[2],
  },
  pendingHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  pendingTitle: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  fingerprint: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.mono,
  },
  waitingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  waitingText: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2] },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  text: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  link: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.mono,
  },
  controller: {
    gap: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing[3],
  },
  qr: {
    alignSelf: "center",
    padding: theme.spacing[3],
    backgroundColor: theme.colors.palette.white,
  },
}));
