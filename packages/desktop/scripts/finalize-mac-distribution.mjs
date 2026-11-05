import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { dump, load } from "js-yaml";
import { isMainModule } from "../../../scripts/is-main-module.mjs";
import { resolveMacSigning } from "./mac-signing.mjs";

function authenticationArgs(env) {
  if (env.APPLE_ID)
    return [
      "--apple-id",
      env.APPLE_ID,
      "--password",
      env.APPLE_APP_SPECIFIC_PASSWORD,
      "--team-id",
      env.APPLE_TEAM_ID,
    ];
  if (env.APPLE_API_KEY)
    return [
      "--key",
      env.APPLE_API_KEY,
      "--key-id",
      env.APPLE_API_KEY_ID,
      "--issuer",
      env.APPLE_API_ISSUER,
    ];
  return [
    "--keychain-profile",
    env.APPLE_KEYCHAIN_PROFILE,
    ...(env.APPLE_KEYCHAIN ? ["--keychain", env.APPLE_KEYCHAIN] : []),
  ];
}

function runChecked(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 35 * 60_000 });
  // Authentication arguments and raw Apple output must not appear in errors or logs.
  if (result.status !== 0)
    throw new Error(
      `Mac DMG verification failed: ${path.basename(command)} (exit ${result.status}, ${result.error?.code || "failed"})`,
    );
  if (args[0] === "notarytool") return (result.stdout || "").trim();
  return `${result.stdout || ""}\n${result.stderr || ""}`.trim();
}

async function generateBlockmap(file) {
  const { executeAppBuilderAsJson } = await import("app-builder-lib/out/util/appBuilder.js");
  const temporary = `${file}.blockmap.finalizing`;
  const info = await executeAppBuilderAsJson(["blockmap", "--input", file, "--output", temporary]);
  renameSync(temporary, `${file}.blockmap`);
  return info;
}

export async function finalizeMacDistribution({
  directory,
  version,
  env = process.env,
  run = runChecked,
  blockmap = generateBlockmap,
}) {
  if (!resolveMacSigning({ version, env }).notarize) return;
  const names = readdirSync(directory);
  const images = names.filter(
    (name) => name.startsWith(`ClawMuse-${version}-`) && name.endsWith(".dmg"),
  );
  if (images.length === 0) return;
  const manifestNames = names.filter((name) => /^(latest|beta)-mac\.yml$/.test(name));
  if (manifestNames.length === 0) throw new Error("Mac distribution has no update manifest.");
  const manifests = manifestNames.map((name) => {
    const manifest = load(readFileSync(path.join(directory, name), "utf8"));
    if (manifest.version !== version || !Array.isArray(manifest.files))
      throw new Error("Mac distribution manifest version or files mismatch.");
    return { name, manifest };
  });
  const changed = new Map();
  for (const name of images) {
    const file = path.join(directory, name);
    run("/usr/bin/codesign", ["--verify", "--strict", file]);
    const signature = run("/usr/bin/codesign", ["--display", "--verbose=4", file]);
    const identity = (env.APPLE_SIGN_IDENTITY || env.CSC_NAME).trim();
    if (!signature.split(/\r?\n/).includes(`Authority=${identity}`))
      throw new Error("Mac DMG has an unexpected Developer ID signature.");
    const output = run("/usr/bin/xcrun", [
      "notarytool",
      "submit",
      file,
      ...authenticationArgs(env),
      "--no-s3-acceleration",
      "--wait",
      "--timeout",
      "30m",
      "--output-format",
      "json",
    ]);
    let submission;
    try {
      submission = JSON.parse(output);
    } catch {
      throw new Error("Apple returned an invalid DMG notarization response.");
    }
    if (submission.status !== "Accepted")
      throw new Error(`DMG notarization was not accepted (${submission.status}).`);
    console.log(`Mac DMG notarization accepted: ${submission.id}`);
    run("/usr/bin/xcrun", ["stapler", "staple", file]);
    run("/usr/bin/xcrun", ["stapler", "validate", file]);
    const assessment = run("/usr/sbin/spctl", [
      "--assess",
      "--type",
      "open",
      "--context",
      "context:primary-signature",
      "--verbose=4",
      file,
    ]);
    if (!assessment.includes("source=Notarized Developer ID"))
      throw new Error("Gatekeeper did not recognize the notarized Mac DMG.");
    changed.set(name, await blockmap(file));
  }
  // Stapling changes the DMG bytes. Refresh its blockmap and every local reference before upload.
  for (const { name, manifest } of manifests) {
    manifest.files = manifest.files.map((file) =>
      changed.has(file.url) ? { ...file, ...changed.get(file.url) } : file,
    );
    if (changed.has(manifest.path)) manifest.sha512 = changed.get(manifest.path).sha512;
    const temporary = path.join(directory, `.${name}.finalizing`);
    writeFileSync(temporary, dump(manifest, { lineWidth: -1, noRefs: true }));
    renameSync(temporary, path.join(directory, name));
  }
}

if (isMainModule(import.meta.url) && process.platform === "darwin") {
  const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  await finalizeMacDistribution({ directory: path.resolve(process.argv[2] || "release"), version });
}
