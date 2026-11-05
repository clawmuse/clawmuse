import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { THIRD_PARTY_PACKAGES } from "./open-source.generated";

const packagesDir = join(__dirname, "../../../../..");

function readPackageJson(dir: string): { name: string; dependencies?: Record<string, string> } {
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
}

describe("open-source list", () => {
  it("lists every non-workspace app dependency (run npm run licenses:sync)", () => {
    const workspaceNames = new Set(
      readdirSync(packagesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .flatMap((entry) => {
          try {
            return [readPackageJson(join(packagesDir, entry.name)).name];
          } catch {
            return [];
          }
        }),
    );
    const dependencies = Object.keys(
      readPackageJson(join(packagesDir, "app")).dependencies ?? {},
    ).filter((name) => !workspaceNames.has(name));

    expect(THIRD_PARTY_PACKAGES.map((pkg) => pkg.name).sort()).toEqual(dependencies.sort());
  });
});
