import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import { Plus, Sparkles } from "@/components/icons/app-icons";
import { StyleSheet } from "react-native-unistyles";
import type { ClawMuseStatusApiClient } from "@/clawmuse-status/api";
import {
  getClawMuseStatusApiClient,
  subscribeClawMuseStatusApiClient,
} from "@/clawmuse-status/api-access";
import { GOAL_LIST_FILTERS } from "@/clawmuse-status/goals/presentation";
import { statusSessionIsEphemeral } from "@/clawmuse-status/secure-store";
import {
  useGoalsStore,
  type GoalsLoadStatus,
  type GoalsUnavailableReason,
} from "@/clawmuse-status/goals/store";
import type { Goal, GoalListFilter, GoalRepo } from "@/clawmuse-status/goals/types";
import { GoalCreateSheet } from "@/components/goals/goal-create-sheet";
import { GoalDetailSheet } from "@/components/goals/goal-detail-sheet";
import { GoalPlanSheet } from "@/components/goals/goal-plan-sheet";
import { TaskBoard } from "@/components/goals/task-board";
import { GoalRow } from "@/components/goals/goal-row";
import { MenuHeader } from "@/components/headers/menu-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  FLOATING_ACTION_BUTTON_CLEARANCE,
  FloatingActionButton,
} from "@/components/ui/floating-action-button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { SegmentedControl, type SegmentedControlOption } from "@/components/ui/segmented-control";
import { hostSupportsFeature } from "@/runtime/host-features";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";

const GOALS_REFRESH_MS = 30_000;

type SheetState = { kind: "closed" } | { kind: "create"; parent?: Goal } | { kind: "plan" };

const FILTER_LABEL_KEYS: Record<GoalListFilter, string> = {
  all: "clawmuseStatus.goals.tasks.board",
  suggested: "clawmuseStatus.goals.filters.suggested",
  active: "clawmuseStatus.goals.filters.active",
  needs_review: "clawmuseStatus.goals.filters.needsReview",
  closed: "clawmuseStatus.goals.filters.closed",
};

const EMPTY_KEYS: Record<GoalListFilter, string> = {
  all: "clawmuseStatus.goals.tasks.empty",
  suggested: "clawmuseStatus.goals.empty.suggested",
  active: "clawmuseStatus.goals.empty.active",
  needs_review: "clawmuseStatus.goals.empty.needsReview",
  closed: "clawmuseStatus.goals.empty.closed",
};

interface RepoChipProps {
  repoKey: string | null;
  label: string;
  selected: boolean;
  onSelect: (repoKey: string | null) => void;
  testID?: string;
}

const RepoChip = memo(function RepoChip({
  repoKey,
  label,
  selected,
  onSelect,
  testID,
}: RepoChipProps) {
  const handlePress = useCallback(() => onSelect(repoKey), [onSelect, repoKey]);
  return (
    <Button
      size="xs"
      variant={selected ? "secondary" : "ghost"}
      onPress={handlePress}
      testID={testID}
    >
      {label}
    </Button>
  );
});

interface RepoChipsProps {
  repos: readonly GoalRepo[];
  selectedRepoKey: string | null;
  onSelect: (repoKey: string | null) => void;
}

function RepoChips({ repos, selectedRepoKey, onSelect }: RepoChipsProps): ReactElement {
  const { t } = useTranslation();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chipsScroll}
      contentContainerStyle={styles.chips}
    >
      <RepoChip
        repoKey={null}
        label={t("clawmuseStatus.goals.repoFilter.all")}
        selected={selectedRepoKey === null}
        onSelect={onSelect}
        testID="goals-repo-all"
      />
      {repos.map((repo) => (
        <RepoChip
          key={repo.repoKey}
          repoKey={repo.repoKey}
          label={repo.displayName}
          selected={selectedRepoKey === repo.repoKey}
          onSelect={onSelect}
        />
      ))}
    </ScrollView>
  );
}

function resolveCapabilityTag(serverId: string): string {
  const info = useSessionStore.getState().sessions[serverId]?.serverInfo;
  if (!info) return "pending";
  return hostSupportsFeature(info, "localGoals") ? "localGoals" : "legacy";
}

function computeGoalDaemonSignature(): string {
  const runtime = getHostRuntimeStore();
  return runtime
    .getHosts()
    .map((host) => {
      const conn = runtime.getSnapshot(host.serverId)?.connectionStatus ?? "connecting";
      return `${host.serverId}:${conn}:${resolveCapabilityTag(host.serverId)}`;
    })
    .join("|");
}

function useGoalDaemonRealtimeSync(
  apiClient: ClawMuseStatusApiClient | null,
  load: () => Promise<void>,
  openDetail: (goalId: string) => Promise<void>,
  unavailable: boolean,
): void {
  const subscribe = useCallback((onStoreChange: () => void) => {
    const runtime = getHostRuntimeStore();
    const unsubHosts = runtime.subscribeHostList(onStoreChange);
    const unsubRuntime = runtime.subscribeAll(onStoreChange);
    const unsubSession = useSessionStore.subscribe(onStoreChange);
    return () => {
      unsubHosts();
      unsubRuntime();
      unsubSession();
    };
  }, []);
  const daemonSignature = useSyncExternalStore(
    subscribe,
    computeGoalDaemonSignature,
    computeGoalDaemonSignature,
  );

  useEffect(() => {
    void load();
  }, [apiClient, daemonSignature, load]);

  useEffect(() => {
    const runtime = getHostRuntimeStore();
    const sessions = useSessionStore.getState().sessions;
    const unsubs: Array<() => void> = [];
    for (const host of runtime.getHosts()) {
      const snapshot = runtime.getSnapshot(host.serverId);
      if (snapshot?.connectionStatus !== "online") continue;
      const client = runtime.getClient(host.serverId);
      const info = sessions[host.serverId]?.serverInfo;
      if (!client || !hostSupportsFeature(info, "localGoals")) continue;
      unsubs.push(
        client.onGoalsChanged((payload) => {
          void load();
          const currentDetail = useGoalsStore.getState().detail;
          if (
            currentDetail &&
            (payload.goalId === null || payload.goalId === currentDetail.goalId)
          ) {
            void openDetail(currentDetail.goalId);
          }
        }),
      );
    }
    return () => {
      for (const unsub of unsubs) {
        unsub();
      }
    };
  }, [daemonSignature, load, openDetail]);

  useEffect(() => {
    if (unavailable) {
      return undefined;
    }
    const timer = setInterval(() => {
      void load();
      const currentDetail = useGoalsStore.getState().detail;
      if (currentDetail?.status === "loaded") void openDetail(currentDetail.goalId);
    }, GOALS_REFRESH_MS);
    return () => clearInterval(timer);
  }, [load, openDetail, unavailable]);
}

function useGoalNotificationOpen(input: {
  goalId?: string;
  installationId?: string;
  eventVersion?: string;
  apiClient: ClawMuseStatusApiClient | null;
  unavailable: boolean;
  status: GoalsLoadStatus;
  openDetail: (goalId: string) => Promise<void>;
  closeDetail: () => void;
  setNotificationError: (err: string | null) => void;
}): void {
  const { t } = useTranslation();
  const {
    goalId,
    installationId,
    eventVersion,
    apiClient,
    unavailable,
    status,
    openDetail,
    closeDetail,
    setNotificationError,
  } = input;

  useEffect(() => {
    if (!goalId) return;
    if (!apiClient) {
      if (!unavailable && status === "loaded") {
        setNotificationError(null);
        void openDetail(goalId);
      }
      return;
    }
    let disposed = false;
    void (async () => {
      const currentInstallationId = await apiClient.getInstallationId();
      if (disposed) return;
      if (installationId && installationId !== currentInstallationId) {
        closeDetail();
        setNotificationError(t("clawmuseStatus.goals.notificationAccountMismatch"));
        return;
      }
      setNotificationError(null);
      await openDetail(goalId);
      const version = Number(eventVersion);
      if (Number.isSafeInteger(version) && version > 0 && !disposed) {
        await apiClient.recordGoalNotificationReceipt(goalId, version, "opened").catch(() => {});
      }
    })().catch((openError: unknown) => {
      if (!disposed) {
        setNotificationError(openError instanceof Error ? openError.message : String(openError));
      }
    });
    return () => {
      disposed = true;
    };
  }, [
    apiClient,
    closeDetail,
    eventVersion,
    goalId,
    installationId,
    openDetail,
    setNotificationError,
    status,
    t,
    unavailable,
  ]);
}

function GoalsUnavailableNotice({
  reason,
  retryButton,
}: {
  reason: GoalsUnavailableReason;
  retryButton: ReactNode;
}): ReactElement {
  const { t } = useTranslation();
  if (reason === "host_needs_update") {
    return (
      <View style={styles.inset}>
        <Alert
          variant="warning"
          title={t("clawmuseStatus.goals.tasks.hostNeedsUpdateTitle")}
          description={t("clawmuseStatus.goals.tasks.hostNeedsUpdateHint")}
        >
          {retryButton}
        </Alert>
      </View>
    );
  }
  if (reason === "no_hosts") {
    return (
      <View style={styles.inset}>
        <Alert
          title={t("clawmuseStatus.goals.tasks.noHostsTitle")}
          description={t("clawmuseStatus.goals.tasks.noHostsHint")}
        >
          {retryButton}
        </Alert>
      </View>
    );
  }
  return (
    <View style={styles.centered}>
      <Text style={styles.emptyText}>{t("clawmuseStatus.goals.notEnrolled")}</Text>
    </View>
  );
}

function GoalsEmptyState({
  filter,
  hasRepos,
  onCreate,
  onPlan,
  retryButton,
}: {
  filter: GoalListFilter;
  hasRepos: boolean;
  onCreate: () => void;
  onPlan: () => void;
  retryButton: ReactNode;
}): ReactElement {
  const { t } = useTranslation();
  if (filter !== "all") {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>{t(EMPTY_KEYS[filter])}</Text>
      </View>
    );
  }

  return (
    <View style={styles.onboardingCard} testID="goals-onboarding-card">
      <Text style={styles.onboardingTitle}>{t("clawmuseStatus.goals.tasks.onboardingTitle")}</Text>
      <Text style={styles.onboardingSteps}>{t("clawmuseStatus.goals.tasks.onboardingSteps")}</Text>
      {hasRepos ? (
        <View style={styles.onboardingActions}>
          <Button
            variant="default"
            leftIcon={Plus}
            onPress={onCreate}
            testID="goals-onboarding-create"
          >
            {t("clawmuseStatus.goals.actions.create")}
          </Button>
          <Button
            variant="outline"
            leftIcon={Sparkles}
            onPress={onPlan}
            testID="goals-onboarding-plan"
          >
            {t("clawmuseStatus.goals.actions.plan")}
          </Button>
        </View>
      ) : (
        <View style={styles.onboardingNoRepos}>
          <Text style={styles.onboardingSteps}>{t("clawmuseStatus.goals.tasks.noReposHint")}</Text>
          {retryButton}
        </View>
      )}
    </View>
  );
}

function GoalsListBody({
  filter,
  goals,
  onPressGoal,
}: {
  filter: GoalListFilter;
  goals: readonly Goal[];
  onPressGoal: (goal: Goal) => void;
}): ReactElement {
  if (filter === "all") {
    return <TaskBoard goals={goals} onPress={onPressGoal} />;
  }
  return (
    <>
      {goals.map((goal) => (
        <GoalRow key={goal.id} goal={goal} onPress={onPressGoal} />
      ))}
    </>
  );
}

function GoalsScrollBody({
  unavailable,
  unavailableReason,
  status,
  error,
  isInitialLoad,
  goals,
  filter,
  hasRepos,
  onCreate,
  onPlan,
  onPressGoal,
  retryButton,
}: {
  unavailable: boolean;
  unavailableReason: GoalsUnavailableReason;
  status: GoalsLoadStatus;
  error: string | null;
  isInitialLoad: boolean;
  goals: readonly Goal[];
  filter: GoalListFilter;
  hasRepos: boolean;
  onCreate: () => void;
  onPlan: () => void;
  onPressGoal: (goal: Goal) => void;
  retryButton: ReactNode;
}): ReactElement | null {
  const { t } = useTranslation();
  if (unavailable) {
    return <GoalsUnavailableNotice reason={unavailableReason} retryButton={retryButton} />;
  }
  if (status === "error") {
    return (
      <View style={styles.inset}>
        <Alert
          variant="error"
          title={t("clawmuseStatus.goals.loadFailed", { message: error ?? "" })}
        >
          {retryButton}
        </Alert>
      </View>
    );
  }
  if (isInitialLoad) {
    return (
      <View style={styles.centered}>
        <LoadingSpinner size="large" color={styles.spinner.color} />
      </View>
    );
  }
  if (status === "loaded" && goals.length === 0) {
    return (
      <GoalsEmptyState
        filter={filter}
        hasRepos={hasRepos}
        onCreate={onCreate}
        onPlan={onPlan}
        retryButton={retryButton}
      />
    );
  }
  if (goals.length > 0) {
    return <GoalsListBody filter={filter} goals={goals} onPressGoal={onPressGoal} />;
  }
  return null;
}

export function GoalsScreen(): ReactElement {
  const isFocused = useIsFocused();
  if (!isFocused) {
    return <View style={styles.container} />;
  }
  return <GoalsScreenContent />;
}

/**
 * The owner's goal board across every connected host: suggestions to accept or
 * discard, work in progress, and completed runs waiting for review.
 */
function GoalsScreenContent(): ReactElement {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    goalId?: string;
    installationId?: string;
    eventVersion?: string;
  }>();
  const filter = useGoalsStore((state) => state.filter);
  const repoKey = useGoalsStore((state) => state.repoKey);
  const goals = useGoalsStore((state) => state.goals);
  const repos = useGoalsStore((state) => state.repos);
  const status = useGoalsStore((state) => state.status);
  const refreshing = useGoalsStore((state) => state.refreshing);
  const error = useGoalsStore((state) => state.error);
  const unavailable = useGoalsStore((state) => state.unavailable);
  const unavailableReason = useGoalsStore((state) => state.unavailableReason);
  const detail = useGoalsStore((state) => state.detail);
  const setFilter = useGoalsStore((state) => state.setFilter);
  const setRepoKey = useGoalsStore((state) => state.setRepoKey);
  const load = useGoalsStore((state) => state.load);
  const openDetail = useGoalsStore((state) => state.openDetail);
  const closeDetail = useGoalsStore((state) => state.closeDetail);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState>({ kind: "closed" });
  const apiClient = useSyncExternalStore(
    subscribeClawMuseStatusApiClient,
    getClawMuseStatusApiClient,
    getClawMuseStatusApiClient,
  );

  useGoalDaemonRealtimeSync(apiClient, load, openDetail, unavailable);
  useGoalNotificationOpen({
    goalId: params.goalId,
    installationId: params.installationId,
    eventVersion: params.eventVersion,
    apiClient,
    unavailable,
    status,
    openDetail,
    closeDetail,
    setNotificationError,
  });

  const filterOptions = useMemo<SegmentedControlOption<GoalListFilter>[]>(
    () =>
      GOAL_LIST_FILTERS.map((value) => ({
        value,
        label: t(FILTER_LABEL_KEYS[value]),
        testID: `goals-filter-${value}`,
      })),
    [t],
  );

  const onPressGoal = useCallback((goal: Goal) => void openDetail(goal.id), [openDetail]);
  const closeGoalDetail = useCallback(() => {
    closeDetail();
    router.setParams({ goalId: undefined, installationId: undefined, eventVersion: undefined });
  }, [closeDetail]);
  const reload = useCallback(() => void load(), [load]);
  const openPlan = useCallback(() => setSheet({ kind: "plan" }), []);
  const openCreate = useCallback(() => setSheet({ kind: "create" }), []);
  const openSubtask = useCallback(
    (parent: Goal) => {
      closeDetail();
      setSheet({ kind: "create", parent });
    },
    [closeDetail],
  );
  const closeSheet = useCallback(() => setSheet({ kind: "closed" }), []);
  const isInitialLoad = status === "loading" && goals.length === 0;

  const headerRight = useMemo(
    () => (
      <View style={styles.headerActions}>
        <Button
          size="sm"
          variant="ghost"
          leftIcon={Sparkles}
          onPress={openPlan}
          disabled={unavailable || repos.length === 0}
          testID="goals-open-plan"
        >
          {t("clawmuseStatus.goals.actions.plan")}
        </Button>
        {!unavailable && repos.length > 0 ? (
          <Button
            size="sm"
            variant="secondary"
            leftIcon={Plus}
            onPress={openCreate}
            testID="goals-header-create"
          >
            {t("clawmuseStatus.goals.actions.create")}
          </Button>
        ) : null}
      </View>
    ),
    [openCreate, openPlan, repos.length, t, unavailable],
  );
  const refreshControl = useMemo(
    () => (
      <RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={styles.spinner.color} />
    ),
    [refreshing, reload],
  );
  const retryButton = useMemo(
    () => (
      <Button variant="outline" size="sm" onPress={reload}>
        {t("clawmuseStatus.goals.actions.refresh")}
      </Button>
    ),
    [reload, t],
  );

  return (
    <View style={styles.container}>
      <MenuHeader title={t("clawmuseStatus.goals.title")} rightContent={headerRight} />
      {statusSessionIsEphemeral ? (
        <Alert description={t("clawmuseStatus.goals.browserSession")} />
      ) : null}
      <ScrollView
        horizontal
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
        showsHorizontalScrollIndicator={false}
      >
        <SegmentedControl
          options={filterOptions}
          value={filter}
          onValueChange={setFilter}
          size="sm"
          testID="goals-filter"
        />
      </ScrollView>
      {repos.length > 1 ? (
        <RepoChips repos={repos} selectedRepoKey={repoKey} onSelect={setRepoKey} />
      ) : null}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={refreshControl}
        testID="goals-list"
      >
        {notificationError ? <Alert variant="error" title={notificationError} /> : null}
        <GoalsScrollBody
          unavailable={unavailable}
          unavailableReason={unavailableReason}
          status={status}
          error={error}
          isInitialLoad={isInitialLoad}
          goals={goals}
          filter={filter}
          hasRepos={repos.length > 0}
          onCreate={openCreate}
          onPlan={openPlan}
          onPressGoal={onPressGoal}
          retryButton={retryButton}
        />
      </ScrollView>
      {!unavailable && repos.length > 0 && goals.length > 0 ? (
        <FloatingActionButton
          icon={Plus}
          accessibilityLabel={t("clawmuseStatus.goals.actions.create")}
          onPress={openCreate}
          testID="goals-create"
        />
      ) : null}
      <GoalDetailSheet
        visible={detail !== null}
        onClose={closeGoalDetail}
        onCreateSubtask={openSubtask}
      />
      {sheet.kind === "create" ? (
        <GoalCreateSheet
          visible
          onClose={closeSheet}
          repos={repos}
          initialRepoKey={repoKey}
          parentGoal={sheet.parent}
        />
      ) : null}
      {sheet.kind === "plan" ? (
        <GoalPlanSheet visible onClose={closeSheet} repos={repos} initialRepoKey={repoKey} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  spinner: {
    color: theme.colors.foregroundMuted,
  },
  filterScroll: { flexGrow: 0, flexShrink: 0 },
  filterRow: {
    paddingHorizontal: { xs: theme.spacing[3], md: theme.spacing[6] },
    paddingTop: theme.spacing[4],
  },
  chipsScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  chips: {
    flexDirection: "row",
    gap: theme.spacing[2],
    paddingHorizontal: { xs: theme.spacing[3], md: theme.spacing[6] },
    paddingTop: theme.spacing[3],
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    flexGrow: 1,
    gap: theme.spacing[3],
    paddingTop: theme.spacing[4],
    paddingBottom: theme.spacing[6] + FLOATING_ACTION_BUTTON_CLEARANCE,
  },
  inset: {
    paddingHorizontal: { xs: theme.spacing[3], md: theme.spacing[6] },
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: theme.spacing[4],
    padding: theme.spacing[6],
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    textAlign: "center",
  },
  onboardingCard: {
    marginHorizontal: { xs: theme.spacing[3], md: theme.spacing[6] },
    padding: theme.spacing[6],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    gap: theme.spacing[3],
  },
  onboardingTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
  },
  onboardingSteps: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm * 1.6,
  },
  onboardingActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
    marginTop: theme.spacing[1],
  },
  onboardingNoRepos: {
    gap: theme.spacing[3],
    alignItems: "flex-start",
    marginTop: theme.spacing[1],
  },
}));
