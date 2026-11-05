// Ported from makecindy/cindy@da94e838e, promptRecommendationStore.ts (Apache-2.0).
// Paseo uses daemon turn IDs instead of Cindy's database completion timestamps.
import { useSyncExternalStore } from "react";

export interface PromptRecommendationSnapshot {
  revision: string;
  phase: "candidate" | "predicting" | "ready";
  prompt: string | null;
  requestSeq: number;
}

const entries = new Map<string, PromptRecommendationSnapshot>();
const sessionListeners = new Map<string, Set<() => void>>();
const settleTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingCompletionRevisions = new Map<string, string>();
const consumedRevisions = new Map<string, string>();
const generations = new Map<string, number>();
let nextRequestSeq = 0;

export function getPromptRecommendationGeneration(sessionId: string): number {
  return generations.get(sessionId) ?? 0;
}

function emitSession(sessionId: string): void {
  for (const listener of sessionListeners.get(sessionId) ?? []) listener();
}

function deleteEntry(sessionId: string): void {
  if (!entries.delete(sessionId)) return;
  emitSession(sessionId);
}

export function clearPromptRecommendationSession(sessionId: string): void {
  clearTimeout(settleTimers.get(sessionId));
  settleTimers.delete(sessionId);
  pendingCompletionRevisions.delete(sessionId);
  consumedRevisions.delete(sessionId);
  generations.set(sessionId, getPromptRecommendationGeneration(sessionId) + 1);
  deleteEntry(sessionId);
}

export function notePromptRecommendationCompletion(sessionId: string, revision: string): void {
  if (
    entries.get(sessionId)?.revision === revision ||
    consumedRevisions.get(sessionId) === revision
  )
    return;
  clearTimeout(settleTimers.get(sessionId));
  pendingCompletionRevisions.set(sessionId, revision);
  settleTimers.set(
    sessionId,
    setTimeout(() => {
      settleTimers.delete(sessionId);
      pendingCompletionRevisions.delete(sessionId);
      entries.set(sessionId, { revision, phase: "candidate", prompt: null, requestSeq: 0 });
      emitSession(sessionId);
    }, 500),
  );
}

export function usePromptRecommendation(
  sessionId: string,
): PromptRecommendationSnapshot | undefined {
  return useSyncExternalStore(
    (listener) => {
      let listeners = sessionListeners.get(sessionId);
      if (!listeners) {
        listeners = new Set();
        sessionListeners.set(sessionId, listeners);
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) sessionListeners.delete(sessionId);
      };
    },
    () => entries.get(sessionId),
    () => entries.get(sessionId),
  );
}

export function beginPromptRecommendationPrediction(
  sessionId: string,
  revision: string,
): number | null {
  const current = entries.get(sessionId);
  if (!current || current.revision !== revision || current.phase !== "candidate") return null;
  const requestSeq = ++nextRequestSeq;
  entries.set(sessionId, { ...current, phase: "predicting", requestSeq });
  emitSession(sessionId);
  return requestSeq;
}

export function resolvePromptRecommendationPrediction(
  sessionId: string,
  revision: string,
  requestSeq: number,
  prompt: string | null,
): void {
  const current = entries.get(sessionId);
  if (
    !current ||
    current.revision !== revision ||
    current.requestSeq !== requestSeq ||
    current.phase !== "predicting"
  )
    return;
  if (!prompt) {
    dismissPromptRecommendation(sessionId, revision);
    return;
  }
  entries.set(sessionId, { ...current, phase: "ready", prompt });
  emitSession(sessionId);
}

export function dismissPromptRecommendation(sessionId: string, revision?: string): void {
  const current = entries.get(sessionId);
  const currentRevision = current?.revision ?? pendingCompletionRevisions.get(sessionId);
  if (revision != null && currentRevision !== revision) return;
  clearTimeout(settleTimers.get(sessionId));
  settleTimers.delete(sessionId);
  pendingCompletionRevisions.delete(sessionId);
  if (currentRevision) consumedRevisions.set(sessionId, currentRevision);
  generations.set(sessionId, getPromptRecommendationGeneration(sessionId) + 1);
  deleteEntry(sessionId);
}

export function restorePromptRecommendation(
  sessionId: string,
  revision: string,
  prompt: string,
  generation: number,
): void {
  if (getPromptRecommendationGeneration(sessionId) !== generation) return;
  if (entries.has(sessionId) || consumedRevisions.get(sessionId) === revision) return;
  clearTimeout(settleTimers.get(sessionId));
  settleTimers.delete(sessionId);
  pendingCompletionRevisions.delete(sessionId);
  entries.set(sessionId, { revision, phase: "ready", prompt, requestSeq: 0 });
  emitSession(sessionId);
}
