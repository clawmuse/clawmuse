import type pino from "pino";
import type { SessionInboundMessage, SessionOutboundMessage } from "../messages.js";
import type { LocalGoalService } from "./service.js";

export type LocalGoalsInboundMessage = Extract<
  SessionInboundMessage,
  {
    type:
      | "goals.list.request"
      | "goals.get.request"
      | "goals.create.request"
      | "goals.act.request"
      | "goals.plan.request"
      | "goals.set_repo_plan.request"
      | "goals.submit_review.request";
  }
>;

export interface LocalGoalsSessionContext {
  service: LocalGoalService | null;
  emit(msg: SessionOutboundMessage): void;
  logger: pino.Logger;
}

export function isLocalGoalsInboundMessage(
  msg: SessionInboundMessage,
): msg is LocalGoalsInboundMessage {
  switch (msg.type) {
    case "goals.list.request":
    case "goals.get.request":
    case "goals.create.request":
    case "goals.act.request":
    case "goals.plan.request":
    case "goals.set_repo_plan.request":
    case "goals.submit_review.request":
      return true;
    default:
      return false;
  }
}

export async function handleLocalGoalsRequest(
  ctx: LocalGoalsSessionContext,
  msg: LocalGoalsInboundMessage,
): Promise<void> {
  if (!ctx.service) {
    ctx.emit({
      type: "rpc_error",
      payload: {
        requestId: msg.requestId,
        requestType: msg.type,
        error: "Goals service is not initialized on this host",
        code: "goals_unavailable",
      },
    });
    return;
  }

  try {
    switch (msg.type) {
      case "goals.list.request": {
        const result = await ctx.service.list({
          filter: msg.filter,
          repoKey: msg.repoKey,
          parentGoalId: msg.parentGoalId,
        });
        ctx.emit({
          type: "goals.list.response",
          payload: {
            requestId: msg.requestId,
            goals: result.goals,
            repos: result.repos,
          },
        });
        return;
      }
      case "goals.get.request": {
        const goal = await ctx.service.get(msg.goalId);
        ctx.emit({
          type: "goals.get.response",
          payload: {
            requestId: msg.requestId,
            goal,
          },
        });
        return;
      }
      case "goals.create.request": {
        const goal = await ctx.service.create({
          idempotencyKey: msg.idempotencyKey,
          repoKey: msg.repoKey,
          title: msg.title,
          summary: msg.summary,
          acceptance: msg.acceptance,
          priority: msg.priority,
          budgetRuns: msg.budgetRuns,
          start: msg.start,
          parentGoalId: msg.parentGoalId,
          dependsOn: msg.dependsOn,
          source: msg.source,
          paths: msg.paths,
          agent: msg.agent,
          attachedAgentRef: msg.attachedAgentRef,
        });
        ctx.emit({
          type: "goals.create.response",
          payload: {
            requestId: msg.requestId,
            goal,
          },
        });
        return;
      }
      case "goals.act.request": {
        const goal = await ctx.service.act({
          goalId: msg.goalId,
          action: msg.action,
          budgetRuns: msg.budgetRuns,
          instruction: msg.instruction,
          agent: msg.agent,
          confirmExecutionStopped: msg.confirmExecutionStopped,
          mergeMethod: msg.mergeMethod,
        });
        ctx.emit({
          type: "goals.act.response",
          payload: {
            requestId: msg.requestId,
            goal,
          },
        });
        return;
      }
      case "goals.plan.request": {
        const result = await ctx.service.requestPlan({
          repoKey: msg.repoKey,
          agent: msg.agent,
        });
        ctx.emit({
          type: "goals.plan.response",
          payload: {
            requestId: msg.requestId,
            outcome: result.outcome,
            repos: result.repos,
          },
        });
        return;
      }
      case "goals.set_repo_plan.request": {
        const repo = await ctx.service.setRepoPlanEnabled(msg.repoKey, msg.planEnabled);
        ctx.emit({
          type: "goals.set_repo_plan.response",
          payload: {
            requestId: msg.requestId,
            repo,
          },
        });
        return;
      }
      case "goals.submit_review.request": {
        const goal = await ctx.service.submitReview({
          goalId: msg.goalId,
          runId: msg.runId,
          message: msg.message,
          evidence: msg.evidence,
        });
        ctx.emit({
          type: "goals.submit_review.response",
          payload: {
            requestId: msg.requestId,
            goal,
          },
        });
        return;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.logger.warn({ err: error, requestType: msg.type }, "Goals RPC failed");
    ctx.emit({
      type: "rpc_error",
      payload: {
        requestId: msg.requestId,
        requestType: msg.type,
        error: message,
        code: "goals_request_failed",
      },
    });
  }
}
