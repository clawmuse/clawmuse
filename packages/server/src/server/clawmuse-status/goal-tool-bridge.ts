import type { ClawMuseGoalProposal, ClawMuseGoalReportKind } from "./client.js";

/**
 * What the agent tool catalog needs from the goal runner. Kept as its own type so
 * `paseo-tools.ts` does not import the runner (and its agent-manager dependencies).
 */
export interface ClawMuseGoalToolBridge {
  runIdForAgent(agentId: string): string | null;
  report(input: {
    evidence?: import("./goal-evidence.js").GoalEvidence;
    callerAgentId: string;
    kind: ClawMuseGoalReportKind;
    message: string;
    prUrl: string | null;
  }): Promise<void>;
  propose(input: {
    callerAgentId: string;
    proposals: ClawMuseGoalProposal[];
  }): Promise<{ created: number; skipped: number }>;
}
