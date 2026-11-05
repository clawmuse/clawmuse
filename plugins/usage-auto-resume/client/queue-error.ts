type ErrorKey =
  | "errorTextLength"
  | "errorAgentUnavailable"
  | "errorMaxMessages"
  | "errorMessageRunning"
  | "errorEmptyQueue"
  | "errorUncertainDecision"
  | "errorProviderDisabled"
  | "errorNoQueue"
  | "errorQueuesUnavailable"
  | "errorQueueStoreRead"
  | "reasonAgentUnavailable"
  | "reasonAgentArchived"
  | "reasonAgentBusy"
  | "reasonAgentPending";

/**
 * RPC errors carry English sentences thrown by the daemon; translate back by exact match so a
 * non-English client does not see the daemon's English. Unknown messages surface as-is.
 */
const ENGLISH_MESSAGES: Record<string, ErrorKey> = {
  "Enter a follow-up message of 1 to 20,000 characters.": "errorTextLength",
  "This agent is unavailable or archived.": "errorAgentUnavailable",
  "This agent already has 100 follow-ups. Remove some first.": "errorMaxMessages",
  "This message is running. Stop the agent before removing it.": "errorMessageRunning",
  "There are no queued messages to send.": "errorEmptyQueue",
  "The previous message may already have run. Choose retry or skip first.":
    "errorUncertainDecision",
  "Turn on Auto Resume for this subscription provider before resuming the queue.":
    "errorProviderDisabled",
  "This agent has no saved follow-up queue.": "errorNoQueue",
  "The follow-up queue is unavailable.": "errorQueuesUnavailable",
  "Could not read the saved follow-up queue; existing messages were kept.": "errorQueueStoreRead",
  "This agent no longer exists.": "reasonAgentUnavailable",
  "This agent is archived.": "reasonAgentArchived",
  "The agent is still running or was closed. Wait for the current turn to finish and reopen the session, then resume.":
    "reasonAgentBusy",
  "The agent is waiting for a permission or input.": "reasonAgentPending",
};

export function queueErrorMessage(
  error: unknown,
  fallback: string,
  translate?: (key: ErrorKey) => string,
): string {
  if (
    error &&
    typeof error === "object" &&
    "userMessage" in error &&
    typeof error.userMessage === "string"
  ) {
    const text = error.userMessage.replace(/^Request failed:\s*/u, "");
    const key = ENGLISH_MESSAGES[text];
    if (key && translate) return translate(key);
    return text;
  }
  return error instanceof Error ? error.message : fallback;
}
