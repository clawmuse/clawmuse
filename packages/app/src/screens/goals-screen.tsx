import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from "react";
import { useTranslation } from "react-i18next";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import { Plus, Sparkles } from "@/components/icons/app-icons";
import { StyleSheet } from "react-native-unistyles";
import {
  getClawMuseStatusApiClient,
  subscribeClawMuseStatusApiClient,
} from "@/clawmuse-status/api-access";
import { GOAL_LIST_FILTERS } from "@/clawmuse-status/goals/presentation";
import { statusSessionIsEphemeral } from "@/clawmuse-status/secure-store";
import { useGoalsStore } from "@/clawmuse-status/goals/store";
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

export function GoalsScreen(): ReactElement {
  const isFocused = useIsFocused();
  if (!isFocused) {
    return <View style={styles.container} />;
  }
  return <GoalsScreenContent />;
}

/**
 * The owner's goal queue across every linked host: suggestions to accept or
 * discard, work in progress, and what is waiting for review. Data comes from the
 * status service directly; hosts only appear through the service.
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

  useEffect(() => {
    void load();
  }, [apiClient, load]);

  useEffect(() => {
    if (!params.goalId || !apiClient) return;
    let disposed = false;
    void (async () => {
      const installationId = await apiClient.getInstallationId();
      if (disposed) return;
      if (params.installationId && params.installationId !== installationId) {
        closeDetail();
        setNotificationError(t("clawmuseStatus.goals.notificationAccountMismatch"));
        return;
      }
      setNotificationError(null);
      await openDetail(params.goalId!);
      const version = Number(params.eventVersion);
      if (Number.isSafeInteger(version) && version > 0 && !disposed) {
        // Receipt failure must not hide the task or imply the user acted on it.
        await apiClient
          .recordGoalNotificationReceipt(params.goalId!, version, "opened")
          .catch(() => {});
      }
    })().catch((openError: unknown) => {
      if (!disposed)
        setNotificationError(openError instanceof Error ? openError.message : String(openError));
    });
    return () => {
      disposed = true;
    };
  }, [
    apiClient,
    closeDetail,
    openDetail,
    params.goalId,
    params.installationId,
    params.eventVersion,
    t,
  ]);

  // Planner and executor runs finish minutes after they are requested; refresh
  // while the screen is open so new suggestions and reports appear on their own.
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
    ),
    [openPlan, repos.length, t, unavailable],
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
        {unavailable ? (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>{t("clawmuseStatus.goals.notEnrolled")}</Text>
          </View>
        ) : null}
        {!unavailable && status === "error" ? (
          <View style={styles.inset}>
            <Alert
              variant="error"
              title={t("clawmuseStatus.goals.loadFailed", { message: error ?? "" })}
            >
              {retryButton}
            </Alert>
          </View>
        ) : null}
        {!unavailable && isInitialLoad ? (
          <View style={styles.centered}>
            <LoadingSpinner size="large" color={styles.spinner.color} />
          </View>
        ) : null}
        {!unavailable && status === "loaded" && goals.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyText}>{t(EMPTY_KEYS[filter])}</Text>
          </View>
        ) : null}
        {filter === "all" ? (
          <TaskBoard goals={goals} onPress={onPressGoal} />
        ) : (
          goals.map((goal) => <GoalRow key={goal.id} goal={goal} onPress={onPressGoal} />)
        )}
      </ScrollView>
      {!unavailable && repos.length > 0 ? (
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
}));
