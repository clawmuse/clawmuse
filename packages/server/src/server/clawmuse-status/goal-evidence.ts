import { z } from "zod";

export const goalEvidenceSchema = z
  .object({
    revision: z.string().trim().min(1).max(200),
    checks: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(300),
            result: z.enum(["passed", "failed", "not_run"]),
            detail: z.string().max(2000).optional(),
          })
          .strict(),
      )
      .max(30),
    artifacts: z
      .array(
        z.object({ label: z.string().min(1).max(200), url: z.string().url().max(1024) }).strict(),
      )
      .max(20),
  })
  .strict();
export type GoalEvidence = z.infer<typeof goalEvidenceSchema>;
