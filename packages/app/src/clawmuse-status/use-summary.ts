import { useSyncExternalStore } from "react";
import {
  getClawMuseStatusSummarySnapshot,
  subscribeClawMuseStatusSummary,
  type ClawMuseStatusSummarySnapshot,
} from "./summary";

export function useClawMuseStatusSummary(): ClawMuseStatusSummarySnapshot | null {
  return useSyncExternalStore(
    subscribeClawMuseStatusSummary,
    getClawMuseStatusSummarySnapshot,
    getClawMuseStatusSummarySnapshot,
  );
}
