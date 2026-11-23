import type { AggregateLoadState, AggregatedSchedule } from "@/schedules/aggregated-schedules";

export type SchedulesScreenBodyState =
  | { kind: "loading" }
  | { kind: "load-error" }
  | { kind: "offline" }
  | { kind: "hosts-offline" }
  | { kind: "empty" }
  | { kind: "content" };

export function resolveSchedulesScreenBodyState(input: {
  loadState: AggregateLoadState<AggregatedSchedule>;
  showLoadError: boolean;
  isOffline?: boolean;
  allHostsOffline?: boolean;
}): SchedulesScreenBodyState {
  if (input.showLoadError) {
    return { kind: "load-error" };
  }
  const hasLoadedData = input.loadState.status === "loaded" && input.loadState.data.length > 0;
  if (input.isOffline && !hasLoadedData) {
    return { kind: "offline" };
  }
  if (input.loadState.status === "connecting" || input.loadState.status === "loading") {
    return { kind: "loading" };
  }
  if (input.loadState.data.length === 0) {
    if (input.allHostsOffline) {
      return { kind: "hosts-offline" };
    }
    return { kind: "empty" };
  }
  return { kind: "content" };
}
