import { z } from "zod";

export const GoalStatusSchema = z.enum([
  "suggested",
  "accepted",
  "running",
  "needs_review",
  "done",
  "discarded",
  "paused",
  "waiting_on_children",
  "waiting_on_dependencies",
]);
export type GoalStatus = z.infer<typeof GoalStatusSchema>;

export const GoalReviewReasonSchema = z.enum([
  "completed",
  "blocked",
  "needs_decision",
  "nothing_to_do",
  "failed",
  "budget_exhausted",
]);
export type GoalReviewReason = z.infer<typeof GoalReviewReasonSchema>;

export const GoalReportKindSchema = z.enum([
  "progress",
  "blocked",
  "needs_decision",
  "done",
  "nothing_to_do",
]);
export type GoalReportKind = z.infer<typeof GoalReportKindSchema>;

export const GoalRunKindSchema = z.enum(["plan", "execute", "verify"]);
export type GoalRunKind = z.infer<typeof GoalRunKindSchema>;

export const GoalRunStatusSchema = z.enum([
  "queued",
  "leased",
  "running",
  "succeeded",
  "failed",
  "expired",
  "canceled",
]);
export type GoalRunStatus = z.infer<typeof GoalRunStatusSchema>;

export const GoalListFilterSchema = z.enum([
  "all",
  "suggested",
  "active",
  "needs_review",
  "closed",
]);
export type GoalListFilter = z.infer<typeof GoalListFilterSchema>;

export const GoalActionIdSchema = z.enum([
  "accept",
  "discard",
  "approve",
  "continue",
  "pause",
  "land",
]);
export type GoalActionId = z.infer<typeof GoalActionIdSchema>;

export const GoalMergeMethodSchema = z.enum(["merge", "squash", "rebase"]);
export type GoalMergeMethod = z.infer<typeof GoalMergeMethodSchema>;

export const GoalEvidenceCheckSchema = z.object({
  name: z.string(),
  result: z.enum(["passed", "failed", "not_run"]),
  detail: z.string().optional(),
  exitCode: z.number().int().optional(),
  durationMs: z.number().int().nonnegative().optional(),
});

export const GoalEvidenceArtifactSchema = z.object({
  label: z.string(),
  url: z.string(),
});

export const GoalEvidenceSchema = z.object({
  revision: z.string(),
  checks: z.array(GoalEvidenceCheckSchema),
  artifacts: z.array(GoalEvidenceArtifactSchema),
  source: z.enum(["executor", "verifier", "owner"]).optional(),
  verifiedByRunId: z.string().optional(),
  headSha: z
    .string()
    .regex(/^[0-9a-f]{40}$/i)
    .optional(),
});
export type GoalEvidence = z.infer<typeof GoalEvidenceSchema>;

export const GoalReportSchema = z
  .object({
    id: z.string(),
    runId: z.string(),
    seq: z.number().int(),
    kind: GoalReportKindSchema,
    message: z.string(),
    prUrl: z.string().nullable(),
    evidence: GoalEvidenceSchema.nullable().optional(),
    createdAt: z.number(),
  })
  .passthrough();
export type GoalReport = z.infer<typeof GoalReportSchema>;

export const GoalRunSchema = z
  .object({
    id: z.string(),
    kind: GoalRunKindSchema,
    status: GoalRunStatusSchema,
    pinned: z.boolean(),
    agent: z.string().nullable(),
    agentRef: z.string().nullable().optional(),
    relayHostId: z.string().nullable().optional(),
    serverId: z.string().nullable().optional(),
    hostId: z.string().nullable(),
    hostDisplayName: z.string().nullable(),
    instruction: z.string().nullable(),
    outcome: z.string().nullable(),
    startedAt: z.number().nullable(),
    finishedAt: z.number().nullable(),
    createdAt: z.number(),
  })
  .passthrough();
export type GoalRun = z.infer<typeof GoalRunSchema>;

export const GoalChildSummarySchema = z
  .object({
    id: z.string(),
    title: z.string(),
    status: GoalStatusSchema,
  })
  .passthrough();

export const GoalSourceSchema = z
  .object({
    kind: z.string(),
    key: z.string().nullable(),
    url: z.string().nullable(),
  })
  .passthrough();
export type GoalSource = z.infer<typeof GoalSourceSchema>;

export const GoalWireSchema = z
  .object({
    id: z.string(),
    serverId: z.string().nullable().optional(),
    repoKey: z.string(),
    repoDisplayName: z.string(),
    title: z.string(),
    summary: z.string(),
    acceptance: z.string(),
    origin: z.enum(["planner", "manual"]),
    status: GoalStatusSchema,
    reviewReason: GoalReviewReasonSchema.nullable(),
    priority: z.number().int(),
    budgetRuns: z.number().int(),
    runsUsed: z.number().int(),
    expiresAt: z.number().nullable(),
    decidedAt: z.number().nullable(),
    createdAt: z.number(),
    updatedAt: z.number(),
    hostId: z.string().nullable(),
    hostDisplayName: z.string().nullable(),
    agent: z.string().nullable(),
    latestReport: GoalReportSchema.nullable(),
    currentRun: GoalRunSchema.nullable(),
    parentGoalId: z.string().nullable().optional(),
    parentGoalTitle: z.string().nullable().optional(),
    dependsOn: z.array(z.string()).optional(),
    blockedBy: z.array(z.string()).optional(),
    children: z.array(GoalChildSummarySchema).optional(),
    source: GoalSourceSchema.optional(),
    paths: z.array(z.string()).optional(),
    attachedAgentRef: z.string().nullable().optional(),
    executionUnconfirmed: z.boolean().optional(),
    mergeCommitSha: z.string().nullable().optional(),
    reviewEventVersion: z.number().int().optional(),
  })
  .passthrough();
export type GoalWire = z.infer<typeof GoalWireSchema>;

export const GoalDetailWireSchema = GoalWireSchema.extend({
  runs: z.array(GoalRunSchema),
  reports: z.array(GoalReportSchema),
}).passthrough();
export type GoalDetailWire = z.infer<typeof GoalDetailWireSchema>;

export const GoalRepoHostWireSchema = z
  .object({
    hostId: z.string(),
    serverId: z.string().optional(),
    relayHostId: z.string(),
    displayName: z.string(),
    connectivity: z.enum(["live", "unverifiable"]),
  })
  .passthrough();

export const GoalRepoPlanRunWireSchema = z
  .object({
    status: GoalRunStatusSchema,
    outcome: z.string().nullable(),
    hostDisplayName: z.string().nullable(),
    createdAt: z.number(),
    finishedAt: z.number().nullable(),
  })
  .passthrough();

export const GoalVerificationCommandSchema = z.object({
  name: z.string(),
  command: z.string(),
});
export type GoalVerificationCommand = z.infer<typeof GoalVerificationCommandSchema>;

export const GoalRepoWireSchema = z
  .object({
    repoKey: z.string(),
    displayName: z.string(),
    planEnabled: z.boolean(),
    lastPlannedAt: z.number().nullable(),
    preferredHostId: z.string().nullable(),
    planAgent: z.string().nullable(),
    executeAgent: z.string().nullable(),
    verifierAgent: z.string().nullable().optional(),
    verificationCommands: z.array(GoalVerificationCommandSchema).optional(),
    lastPlanRun: GoalRepoPlanRunWireSchema.nullable(),
    hosts: z.array(GoalRepoHostWireSchema),
    suggestedCount: z.number().int(),
    activeCount: z.number().int(),
  })
  .passthrough();
export type GoalRepoWire = z.infer<typeof GoalRepoWireSchema>;

// ============================================================================
// Inbound Requests
// ============================================================================

export const GoalsListRequestSchema = z.object({
  type: z.literal("goals.list.request"),
  requestId: z.string(),
  filter: GoalListFilterSchema.optional(),
  repoKey: z.string().nullable().optional(),
  parentGoalId: z.string().optional(),
});

export const GoalsGetRequestSchema = z.object({
  type: z.literal("goals.get.request"),
  requestId: z.string(),
  goalId: z.string(),
});

export const GoalsCreateRequestSchema = z.object({
  type: z.literal("goals.create.request"),
  requestId: z.string(),
  idempotencyKey: z.string().optional(),
  repoKey: z.string(),
  title: z.string(),
  summary: z.string(),
  acceptance: z.string().optional(),
  priority: z.number().int().optional(),
  budgetRuns: z.number().int().optional(),
  start: z.boolean().optional(),
  parentGoalId: z.string().optional(),
  dependsOn: z.array(z.string()).optional(),
  source: GoalSourceSchema.optional(),
  paths: z.array(z.string()).optional(),
  agent: z.string().nullable().optional(),
  attachedAgentRef: z.string().nullable().optional(),
});

export const GoalsActRequestSchema = z.object({
  type: z.literal("goals.act.request"),
  requestId: z.string(),
  goalId: z.string(),
  action: GoalActionIdSchema,
  budgetRuns: z.number().int().optional(),
  instruction: z.string().optional(),
  agent: z.string().nullable().optional(),
  confirmExecutionStopped: z.boolean().optional(),
  mergeMethod: GoalMergeMethodSchema.optional(),
});

export const GoalsPlanRequestSchema = z.object({
  type: z.literal("goals.plan.request"),
  requestId: z.string(),
  repoKey: z.string(),
  agent: z.string().nullable().optional(),
});

export const GoalsSetRepoPlanRequestSchema = z.object({
  type: z.literal("goals.set_repo_plan.request"),
  requestId: z.string(),
  repoKey: z.string(),
  planEnabled: z.boolean(),
});

export const GoalsSubmitReviewRequestSchema = z.object({
  type: z.literal("goals.submit_review.request"),
  requestId: z.string(),
  goalId: z.string(),
  runId: z.string(),
  message: z.string(),
  evidence: GoalEvidenceSchema,
});

// ============================================================================
// Outbound Responses & Events
// ============================================================================

export const GoalsListResponseSchema = z.object({
  type: z.literal("goals.list.response"),
  payload: z
    .object({
      requestId: z.string(),
      goals: z.array(GoalWireSchema),
      repos: z.array(GoalRepoWireSchema),
    })
    .passthrough(),
});

export const GoalsGetResponseSchema = z.object({
  type: z.literal("goals.get.response"),
  payload: z
    .object({
      requestId: z.string(),
      goal: GoalDetailWireSchema,
    })
    .passthrough(),
});

export const GoalsCreateResponseSchema = z.object({
  type: z.literal("goals.create.response"),
  payload: z
    .object({
      requestId: z.string(),
      goal: GoalWireSchema,
    })
    .passthrough(),
});

export const GoalsActResponseSchema = z.object({
  type: z.literal("goals.act.response"),
  payload: z
    .object({
      requestId: z.string(),
      goal: GoalWireSchema,
    })
    .passthrough(),
});

export const GoalsPlanResponseSchema = z.object({
  type: z.literal("goals.plan.response"),
  payload: z
    .object({
      requestId: z.string(),
      outcome: z.enum(["queued", "already_open"]),
      repos: z.array(GoalRepoWireSchema),
    })
    .passthrough(),
});

export const GoalsSetRepoPlanResponseSchema = z.object({
  type: z.literal("goals.set_repo_plan.response"),
  payload: z
    .object({
      requestId: z.string(),
      repo: GoalRepoWireSchema,
    })
    .passthrough(),
});

export const GoalsSubmitReviewResponseSchema = z.object({
  type: z.literal("goals.submit_review.response"),
  payload: z
    .object({
      requestId: z.string(),
      goal: GoalDetailWireSchema,
    })
    .passthrough(),
});

export type GoalsListResponse = z.infer<typeof GoalsListResponseSchema>;
export type GoalsGetResponse = z.infer<typeof GoalsGetResponseSchema>;
export type GoalsCreateResponse = z.infer<typeof GoalsCreateResponseSchema>;
export type GoalsActResponse = z.infer<typeof GoalsActResponseSchema>;
export type GoalsPlanResponse = z.infer<typeof GoalsPlanResponseSchema>;
export type GoalsSetRepoPlanResponse = z.infer<typeof GoalsSetRepoPlanResponseSchema>;
export type GoalsSubmitReviewResponse = z.infer<typeof GoalsSubmitReviewResponseSchema>;

export const GoalsChangedMessageSchema = z.object({
  type: z.literal("goals.changed"),
  payload: z.object({
    goalId: z.string().nullable(),
  }),
});
