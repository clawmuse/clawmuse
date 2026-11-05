import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { writeJsonFileAtomic } from "../atomic-file.js";

const recordSchema = z.object({ repoKey: z.string(), workspaceId: z.string().min(1) });
function recordPath(home: string, goalId: string): string {
  if (!/^[a-f0-9-]{36}$/i.test(goalId)) throw new Error("Invalid goal id");
  return path.join(home, "clawmuse-goals", `${goalId}.json`);
}

export async function readGoalWorkspace(
  home: string,
  goalId: string,
  repoKey: string,
): Promise<string | null> {
  let raw: string;
  try {
    raw = await readFile(recordPath(home, goalId), "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
      return null;
    throw error;
  }
  const record = recordSchema.parse(JSON.parse(raw));
  if (record.repoKey !== repoKey)
    throw new Error("Goal workspace repository changed; review required");
  return record.workspaceId;
}

export function saveGoalWorkspace(
  home: string,
  goalId: string,
  repoKey: string,
  workspaceId: string,
): Promise<void> {
  return writeJsonFileAtomic(recordPath(home, goalId), { repoKey, workspaceId });
}
