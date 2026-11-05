import { execFileSync } from "node:child_process";
import { getReleaseInfoFromSourceTag } from "./release-version-utils.mjs";
import { isMainModule } from "./is-main-module.mjs";

export function planDesktopBeta({ platform, version, commit }) {
  if (!["macos", "linux", "windows"].includes(platform)) {
    throw new Error("Choose --platform macos, linux or windows");
  }
  const tag = `desktop-${platform}-v${version}`;
  const release = getReleaseInfoFromSourceTag(tag);
  if (!release.isBeta) throw new Error("Per-platform test releases require a beta version");
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("Expected a resolved source commit");
  const refs = [`${commit}:refs/tags/${tag}`];
  if (platform !== "macos") refs.push(`${commit}:refs/heads/release-build/${tag}`);
  return { platform, version, commit, tag, releaseTag: release.releaseTag, refs };
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

if (isMainModule(import.meta.url)) {
  const args = process.argv.slice(2);
  const options = { ref: "HEAD", publish: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--publish") options.publish = true;
    else if (arg === "--dry-run") options.publish = false;
    else if (["--platform", "--version", "--ref"].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith("-")) throw new Error(`Missing value for ${arg}`);
      options[arg.slice(2)] = value;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  const commit = git("rev-parse", "--verify", "--end-of-options", `${options.ref}^{commit}`);
  const plan = planDesktopBeta({ ...options, commit });
  console.log(JSON.stringify(plan, null, 2));
  if (options.publish) {
    if (git("status", "--porcelain")) throw new Error("Commit the reviewed release inputs first");
    // The 0.13.0 Mac package shipped from a branch that had forked from main. A hotfix cut
    // from a tag sets CLAWMUSE_DESKTOP_ALLOW_BEHIND_MAIN=1 on purpose.
    if (process.env.CLAWMUSE_DESKTOP_ALLOW_BEHIND_MAIN !== "1") {
      git("fetch", "--quiet", "origin", "main");
      const missing = git("rev-list", "--count", `${commit}..origin/main`);
      if (missing !== "0") {
        throw new Error(
          `${commit} is missing ${missing} commit(s) from origin/main; merge main first (git log ${commit}..origin/main)`,
        );
      }
    }
    if (git("tag", "--list", plan.tag)) {
      const existing = git("rev-parse", `${plan.tag}^{commit}`);
      if (existing !== commit) throw new Error(`${plan.tag} already names another source commit`);
    } else {
      git("tag", plan.tag, commit);
    }
    // Explicit refs keep mobile, npm and the other desktop builds out of this release.
    execFileSync("git", ["push", "origin", ...plan.refs], { stdio: "inherit" });
  } else {
    console.log("Preview only. Add --publish to push these platform-specific refs.");
  }
}
