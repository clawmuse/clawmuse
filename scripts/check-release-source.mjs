import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getReleaseInfoFromSourceTag, parseReleaseVersion } from "./release-version-utils.mjs";
import { isMainModule } from "./is-main-module.mjs";

export function checkReleaseSource({ tag, cwd = process.cwd(), allowBehindMain = false }) {
  const release = getReleaseInfoFromSourceTag(tag);
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  const commit = git("rev-parse", "HEAD");
  const taggedCommit = git("rev-parse", "--verify", `refs/tags/${tag}^{commit}`);
  if (taggedCommit !== commit) throw new Error(`${tag} does not identify the checked-out source`);
  if (git("status", "--porcelain")) {
    throw new Error("Release source has uncommitted changes");
  }
  if (!allowBehindMain && git("rev-list", "--count", "HEAD..origin/main") !== "0") {
    throw new Error("Release source is missing commits from origin/main");
  }
  const tags = git("tag", "--list").split("\n");
  for (const existing of tags) {
    if (
      !/^(?:(?:desktop(?:-(?:windows|linux|macos))?|android|ios)-)?v\d+\.\d+\.\d+(?:-beta\.\d+)?(?:\+[0-9]{4})?$/.test(
        existing,
      )
    )
      continue;
    const other = getReleaseInfoFromSourceTag(existing);
    if (other.version === release.version) {
      const otherCommit = git("rev-parse", `refs/tags/${existing}^{commit}`);
      if (otherCommit !== commit)
        throw new Error(`${existing} names different source for ${release.version}`);
    }
    if (release.isBeta && !other.isPrerelease) {
      const candidate = parseReleaseVersion(release.version);
      const stable = parseReleaseVersion(other.version);
      const order =
        candidate.major - stable.major ||
        candidate.minor - stable.minor ||
        candidate.patch - stable.patch;
      if (order <= 0)
        throw new Error(`${release.version} must be newer than stable ${other.version}`);
    }
  }
  if (!release.isPrerelease) {
    const root = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8"));
    for (const workspace of [".", ...root.workspaces]) {
      const file = path.join(cwd, workspace, "package.json");
      const pkg = JSON.parse(readFileSync(file, "utf8"));
      if (pkg.version !== release.version)
        throw new Error(`${file}: expected version ${release.version}, got ${pkg.version}`);
    }
  }
  return { version: release.version, sourceTag: tag, sourceCommit: commit };
}

if (isMainModule(import.meta.url)) {
  const [tag] = process.argv.slice(2);
  if (!tag) throw new Error("Usage: node scripts/check-release-source.mjs <source-tag>");
  const allowBehindMain = process.env.CLAWMUSE_DESKTOP_ALLOW_BEHIND_MAIN === "1";
  console.log(JSON.stringify(checkReleaseSource({ tag, allowBehindMain }), null, 2));
}
