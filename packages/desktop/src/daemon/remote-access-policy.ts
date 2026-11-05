import { readFileSync } from "node:fs";
import { join } from "node:path";

export function readControlledOnlyPolicy(home: string): boolean {
  try {
    const value: unknown = JSON.parse(readFileSync(join(home, "remote-access.json"), "utf8"));
    if (
      !value ||
      typeof value !== "object" ||
      !("controlledOnly" in value) ||
      typeof value.controlledOnly !== "boolean"
    )
      return true;
    return value.controlledOnly;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
}
