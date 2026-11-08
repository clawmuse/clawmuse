import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { relative as relativePath } from "node:path";
import test from "node:test";
import { load } from "js-yaml";
import { runInNewContext } from "node:vm";
import { execFileSync } from "node:child_process";
import {
  resolveMacSigning,
  isMacCodePath,
  verifyMacDistribution,
} from "../packages/desktop/scripts/mac-signing.mjs";

const repoRoot = new URL("../", import.meta.url);
const ciWorkflowPath = new URL(".github/workflows/ci.yml", repoRoot);
const dockerWorkflowPath = new URL(".github/workflows/docker.yml", repoRoot);
const nixWorkflowPath = new URL(".github/workflows/nix.yml", repoRoot);
const filtersPath = new URL(".github/ci-paths.yml", repoRoot);
const serverTsconfigPath = new URL("packages/server/tsconfig.server.json", repoRoot);
const desktopPackagePath = new URL("packages/desktop/package.json", repoRoot);

test("CNB never skips checks or packages through duplicate VSCode pipelines", () => {
  const config = load(readFileSync(new URL(".cnb.yml", repoRoot), "utf8"));
  for (const [ref, events] of Object.entries(config)) {
    for (const [event, pipelines] of Object.entries(events)) {
      assert.ok(
        pipelines.filter((pipeline) => pipeline.services?.includes("vscode")).length <= 1,
        `${ref}/${event}: CNB permits only one VSCode pipeline per build`,
      );
    }
  }
});

test("CNB only attaches the VSCode service to events that permit it", () => {
  const config = load(readFileSync(new URL(".cnb.yml", repoRoot), "utf8"));
  const permitted = new Set(["push", "branch.create", "vscode", "web_trigger", "api_trigger"]);
  for (const [ref, events] of Object.entries(config)) {
    for (const [event, pipelines] of Object.entries(events)) {
      if (!pipelines.some((pipeline) => pipeline.services?.includes("vscode"))) continue;
      assert.ok(
        permitted.has(event) ||
          event.startsWith("api_trigger_") ||
          event.startsWith("web_trigger_"),
        `${ref}/${event}: CNB rejects the VSCode service for this event before any stage runs`,
      );
    }
  }
});

const gatedCiJobs = new Map([
  ["quality", { name: "quality", contracts: ["format", "quality", "relay", "sdk"] }],
  ["typecheck", { name: "typecheck", contract: "quality" }],
  ["server-tests-ubuntu", { name: "server-tests (ubuntu-latest)", contracts: ["server", "hub"] }],
  [
    "server-tests-macos",
    { name: "server-tests (self-hosted macOS, file observation)", contract: "server" },
  ],
  ["desktop-tests-ubuntu", { name: "desktop-tests (ubuntu-latest)", contract: "desktop" }],
  ["app-tests", { name: "app-tests", contract: "app" }],
  ["playwright-1", { name: "playwright (shard 1/8)", contract: "browser" }],
  ["playwright-2", { name: "playwright (shard 2/8)", contract: "browser" }],
  ["playwright-3", { name: "playwright (shard 3/8)", contract: "browser" }],
  ["playwright-4", { name: "playwright (shard 4/8)", contract: "browser" }],
  ["playwright-5", { name: "playwright (shard 5/8)", contract: "browser" }],
  ["playwright-6", { name: "playwright (shard 6/8)", contract: "browser" }],
  ["playwright-7", { name: "playwright (shard 7/8)", contract: "browser" }],
  ["playwright-8", { name: "playwright (shard 8/8)", contract: "browser" }],
  ["cli-tests-1", { name: "cli-tests (shard 1/3)", contract: "cli" }],
  ["cli-tests-2", { name: "cli-tests (shard 2/3)", contract: "cli" }],
  ["cli-tests-3", { name: "cli-tests (shard 3/3)", contract: "cli" }],
]);

function jobBlocks(source) {
  const jobs = new Map();
  let currentJob;

  for (const line of (source.split("\njobs:\n")[1] ?? source).split("\n")) {
    const jobMatch = /^  ([a-z0-9_-]+):\s*$/.exec(line);
    if (jobMatch) {
      currentJob = jobMatch[1];
      jobs.set(currentJob, []);
      continue;
    }
    if (currentJob) jobs.get(currentJob).push(line);
  }
  return jobs;
}

function loadFilters(path) {
  const filters = {};
  let currentFilter;

  for (const line of readFileSync(path, "utf8").split("\n")) {
    const filterMatch = /^([a-z_]+):\s*$/.exec(line);
    if (filterMatch) {
      currentFilter = filterMatch[1];
      filters[currentFilter] = [];
      continue;
    }
    const patternMatch = /^  - "([^"]+)"\s*$/.exec(line);
    if (currentFilter && patternMatch) filters[currentFilter].push(patternMatch[1]);
  }
  return filters;
}

function filesUnder(relativeDirectory, predicate) {
  const directory = new URL(`${relativeDirectory}/`, repoRoot);
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      [relativeDirectory, relativePath(directory.pathname, entry.parentPath), entry.name]
        .filter(Boolean)
        .join("/")
        .replaceAll("\\", "/"),
    )
    .filter(predicate)
    .sort();
}

test("gated checks are statically named jobs with real job-level gating", () => {
  const workflowSource = readFileSync(ciWorkflowPath, "utf8");
  const jobs = jobBlocks(workflowSource);
  const trigger = workflowSource.split("jobs:", 1)[0];

  assert.match(trigger, /^\s+merge_group:\s*$/m);
  assert.match(trigger, /^  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(trigger, /^  push:/m);
  assert.doesNotMatch(workflowSource, /strategy:\s*\n\s+matrix:/);
  assert.doesNotMatch(workflowSource, /RUN_TESTS|Skip unaffected|No .* changes detected/);

  for (const [jobId, expected] of gatedCiJobs) {
    const job = jobs.get(jobId)?.join("\n");
    assert.ok(job, `missing static job ${jobId}`);
    assert.match(job, new RegExp(`^    name: ${expected.name.replace(/[()]/g, "\\$&")}$`, "m"));
    assert.match(job, /needs\.changes\.outputs\.full != 'false'/);
    for (const contract of expected.contracts ?? [expected.contract]) {
      assert.match(job, new RegExp(`needs\\.changes\\.outputs\\.${contract} != 'false'`));
    }
  }
});

test("pull-request checks run for every base branch, including stacked PRs", () => {
  for (const workflowPath of [
    ciWorkflowPath,
    new URL(".github/workflows/desktop-packages.yml", repoRoot),
  ]) {
    const trigger = readFileSync(workflowPath, "utf8").split("jobs:", 1)[0];
    const pullRequest = trigger.match(/^  pull_request:\n((?:    .*\n)*)/m);
    assert.ok(pullRequest, `${workflowPath.pathname} runs on pull requests`);
    assert.doesNotMatch(pullRequest[1], /branches/);
  }
});

test("change gating allows superseded workflow runs to cancel", () => {
  const ci = readFileSync(ciWorkflowPath, "utf8");
  assert.match(
    ci,
    /^concurrency:\n  group: ci-\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}\n  cancel-in-progress: true$/m,
    "a newer push to any ref, main included, cancels the superseded run",
  );
  for (const workflowPath of [ciWorkflowPath, dockerWorkflowPath, nixWorkflowPath]) {
    const source = readFileSync(workflowPath, "utf8");
    assert.doesNotMatch(
      source,
      /\$\{\{\s*always\(\)/,
      "always() keeps jobs alive after concurrency cancellation; use !cancelled() for fail-open gating",
    );
  }
});

test("focused contracts stay inside existing required checks", () => {
  const jobs = jobBlocks(readFileSync(ciWorkflowPath, "utf8"));
  const changes = jobs.get("changes")?.join("\n") ?? "";
  const server = jobs.get("server-tests-ubuntu")?.join("\n") ?? "";
  const desktop = jobs.get("desktop-tests-ubuntu")?.join("\n") ?? "";

  assert.match(changes, /scripts\/daemon-launch-contract\.test\.mjs/);
  assert.doesNotMatch(changes, /Install dependencies|npm run build/);

  assert.match(server, /test:hub-cli-contract/);
  assert.match(server, /npm run test --workspace=@getpaseo\/server/);
  assert.ok(!jobs.has("hub-cli-contract"));

  assert.match(desktop, /test:e2e:renderer/);
  assert.match(desktop, /test:e2e:browser-tabs/);
  assert.match(desktop, /npm run test --workspace=@getpaseo\/desktop/);
  assert.ok(!jobs.has("desktop-browser-bridge"));
  assert.ok(!jobs.has("playwright-desktop"));
});

test("ordinary CI keeps app tests without prebuilding Android modules", () => {
  const source = readFileSync(ciWorkflowPath, "utf8");
  const app = jobBlocks(source).get("app-tests").join("\n");
  assert.match(app, /npm run build:app-deps/);
  assert.match(app, /npm run test --workspace=@getpaseo\/app/);
  assert.doesNotMatch(source, /test:android|expo prebuild|gradlew|actions\/setup-java/);
});

test("server builds exclude test utilities at every domain depth", () => {
  const tsconfig = JSON.parse(readFileSync(serverTsconfigPath, "utf8"));
  assert.ok(tsconfig.exclude.includes("src/server/**/test-utils/**"));
  assert.ok(!tsconfig.exclude.includes("src/server/test-utils/**"));
});

test("PR routing declares stable behavior ownership", () => {
  const filters = loadFilters(filtersPath);
  assert.deepEqual(filters, {
    routing: [".github/ci-paths.yml"],
    workspace: [
      ".mise.toml",
      ".tool-versions",
      "package.json",
      "package-lock.json",
      "patches/**",
      "scripts/**",
      "tsconfig.json",
      "tsconfig.base.json",
      "vitest.config.ts",
    ],
    ci: [".github/actions/**", ".github/workflows/ci.yml"],
    format: [
      ".agents/**/*.{cjs,css,html,js,json,jsonc,jsx,md,mjs,ts,tsx,yaml,yml}",
      ".github/**/*.{cjs,css,html,js,json,jsonc,jsx,md,mjs,ts,tsx,yaml,yml}",
      "**/*.{cjs,css,html,js,json,jsonc,jsx,md,mjs,ts,tsx,yaml,yml}",
      "packages/expo-two-way-audio/**",
    ],
    quality: ["**/*.{cjs,js,json,jsx,mjs,ts,tsx}", "packages/expo-two-way-audio/**"],
    hub: ["packages/cli/src/commands/hub/**", "packages/server/src/server/hub/**"],
    server: ["plugins/**", "packages/server/**", "packages/app/e2e/support/fixtures/recording.*"],
    desktop: [
      "packages/desktop/**",
      "packages/app/src/desktop/**",
      "packages/app/src/**/*.electron.{ts,tsx}",
      "packages/server/src/server/browser-tools/**",
      "packages/app/e2e/support/**",
      "packages/app/*config.{cjs,js,ts}",
      "packages/app/package.json",
    ],
    app: ["packages/app/**", "packages/expo-two-way-audio/**"],
    sdk: [
      "packages/plugin/**",
      "plugin-examples/**",
      "public-docs/plugins/**",
      "packages/client/**",
      "packages/highlight/**",
      "packages/protocol/**",
    ],
    browser: [
      "packages/server/src/server/agent/provider-snapshot-manager.ts",
      "packages/server/src/server/session/provider/provider-catalog-session.ts",
      "packages/client/src/compat/normalize-provider-models.ts",
      "packages/protocol/src/client-capabilities.ts",
      "packages/server/src/server/agent/provider-registry.ts",
      "packages/server/src/server/agent/agent-sdk-types.ts",
      "packages/server/src/server/agent/providers/codex-app-server-agent.ts",
      "packages/server/src/server/agent/providers/claude/agent.ts",
      "packages/server/src/server/agent/plugin-provider.ts",
      "packages/server/src/server/plugins/{index,plugin-process,plugin-process-protocol,runtime}.ts",
      "packages/server/src/executable-resolution/**",
      "packages/plugin/src/server/provider.ts",
      "packages/app/src/!(desktop)/**",
      "packages/app/e2e/browser/**",
      "packages/app/e2e/support/**",
      "packages/app/assets/**",
      "packages/app/public/**",
      "packages/app/index.ts",
      "packages/app/*config.{cjs,js,ts}",
      "packages/app/package.json",
    ],
    relay: ["packages/relay/**"],
    cli: ["packages/cli/**"],
  });
});

test("cross-package invariants live in the suite that owns them", () => {
  const cliTests = filesUnder("packages/cli", (path) => path.endsWith(".test.ts"));
  assert.ok(cliTests.length > 0);
  for (const path of cliTests) {
    assert.doesNotMatch(
      readFileSync(new URL(path, repoRoot), "utf8"),
      /server\/src\/server\/test-utils/,
      path,
    );
  }

  const protocolWireCompatibility = new URL(
    "packages/protocol/src/messages.wire-compat.test.ts",
    repoRoot,
  );
  assert.match(readFileSync(protocolWireCompatibility, "utf8"), /wire schema compatibility/);
});

test("browser and desktop tests have exclusive, directory-owned suites", () => {
  const filters = loadFilters(filtersPath);
  const browserSpecs = filesUnder("packages/app/e2e", (path) => path.endsWith(".spec.ts"));
  const desktopSpecs = filesUnder("packages/desktop/e2e", (path) => path.endsWith(".spec.ts"));

  assert.ok(browserSpecs.length > 0);
  assert.ok(desktopSpecs.length > 0);
  assert.ok(browserSpecs.every((path) => path.startsWith("packages/app/e2e/browser/")));
  assert.ok(desktopSpecs.every((path) => path.startsWith("packages/desktop/e2e/")));

  const desktopPackage = JSON.parse(readFileSync(desktopPackagePath, "utf8"));
  assert.match(desktopPackage.scripts.test, /--exclude ["']e2e\/\*\*["']/);

  for (const path of browserSpecs) {
    assert.doesNotMatch(
      readFileSync(new URL(path, repoRoot), "utf8"),
      /paseoDesktop|injectDesktopBridge/,
    );
  }
  for (const path of desktopSpecs) {
    assert.ok(path.startsWith("packages/desktop/e2e/"));
  }

  const routingSource = readFileSync(filtersPath, "utf8");
  assert.doesNotMatch(routingSource, /desktop_bridge|playwright_desktop|browser-\*|browser-\*\//);
  assert.deepEqual(filters.desktop, [
    "packages/desktop/**",
    "packages/app/src/desktop/**",
    "packages/app/src/**/*.electron.{ts,tsx}",
    "packages/server/src/server/browser-tools/**",
    "packages/app/e2e/support/**",
    "packages/app/*config.{cjs,js,ts}",
    "packages/app/package.json",
  ]);
  assert.deepEqual(filters.browser, [
    "packages/server/src/server/agent/provider-snapshot-manager.ts",
    "packages/server/src/server/session/provider/provider-catalog-session.ts",
    "packages/client/src/compat/normalize-provider-models.ts",
    "packages/protocol/src/client-capabilities.ts",
    "packages/server/src/server/agent/provider-registry.ts",
    "packages/server/src/server/agent/agent-sdk-types.ts",
    "packages/server/src/server/agent/providers/codex-app-server-agent.ts",
    "packages/server/src/server/agent/providers/claude/agent.ts",
    "packages/server/src/server/agent/plugin-provider.ts",
    "packages/server/src/server/plugins/{index,plugin-process,plugin-process-protocol,runtime}.ts",
    "packages/server/src/executable-resolution/**",
    "packages/plugin/src/server/provider.ts",
    "packages/app/src/!(desktop)/**",
    "packages/app/e2e/browser/**",
    "packages/app/e2e/support/**",
    "packages/app/assets/**",
    "packages/app/public/**",
    "packages/app/index.ts",
    "packages/app/*config.{cjs,js,ts}",
    "packages/app/package.json",
  ]);
});

test("packaging avoids pull-request runners and Nix stays manual", () => {
  for (const workflowPath of [dockerWorkflowPath, nixWorkflowPath]) {
    const source = readFileSync(workflowPath, "utf8");
    const trigger = source.split("jobs:", 1)[0];
    if (workflowPath === nixWorkflowPath) {
      assert.match(trigger, /^  workflow_dispatch:\s*$/m);
      assert.doesNotMatch(trigger, /^  push:/m);
    } else {
      // Docker's upstream definition is retained; the workflow is disabled in GitHub.
      assert.match(trigger, /push:\s*\n\s+branches: \[main\]/);
    }
    assert.doesNotMatch(trigger, /pull_request/);
    assert.doesNotMatch(source, /dorny\/paths-filter/);
  }
});

test("desktop packaging smokes only pull requests that touch packaging", () => {
  const source = readFileSync(new URL(".github/workflows/desktop-packages.yml", repoRoot), "utf8");
  const trigger = source.split("jobs:", 1)[0];
  assert.doesNotMatch(trigger, /^  push:/m);
  assert.match(trigger, /pull_request:\s*\n\s+paths:/);
  assert.match(trigger, /- "packages\/desktop\/\*\*"/);
  assert.doesNotMatch(source, /dorny\/paths-filter/);
  for (const action of ["actions/checkout", "actions/setup-node", "actions/upload-artifact"]) {
    assert.match(source, new RegExp(`${action}@[0-9a-f]{40} # v\\d+\\.\\d+\\.\\d+`));
  }
});

test("stable iOS releases upload once and distribute to external testers before App Store review", () => {
  const source = readFileSync(
    new URL("packages/app/.eas/workflows/release-mobile.yml", repoRoot),
    "utf8",
  );
  const jobs = jobBlocks(source);
  const uploads = [...jobs.entries()].filter(
    ([, lines]) =>
      lines.some((line) => /^    type: (submit|testflight)$/.test(line)) &&
      lines.some((line) => line.includes("needs.build_ios.outputs.build_id")),
  );
  assert.equal(uploads.length, 1, "the iOS binary must be uploaded exactly once");
  const [distributionId, distributionLines] = uploads[0];
  const distribution = distributionLines.join("\n");
  assert.match(distribution, /^    type: testflight$/m);
  assert.match(distribution, /external_groups:\s*\n\s+- Paseo Beta/);
  assert.match(distribution, /^      submit_beta_review: true$/m);

  const review = jobs.get("submit_ios_for_review").join("\n");
  assert.match(review, new RegExp(`needs: \\[build_ios, ${distributionId}\\]`));
  assert.match(review, /APP_VERSION="\$\{\{ needs\.build_ios\.outputs\.app_version \}\}"/);
  assert.match(
    review,
    /APP_BUILD_VERSION="\$\{\{ needs\.build_ios\.outputs\.app_build_version \}\}"/,
  );
  assert.match(review, /bundle exec fastlane ios submit_review/);
});

test("eight Playwright shards share two-worker coverage", () => {
  const source = readFileSync(ciWorkflowPath, "utf8");
  const jobs = jobBlocks(source);
  assert.equal(jobs.size, gatedCiJobs.size + 1, "only routed checks and the changes job exist");
  for (let shard = 1; shard <= 8; shard++) {
    const job = jobs.get(`playwright-${shard}`).join("\n");
    assert.match(job, new RegExp(`PLAYWRIGHT_SHARD: "${shard}/8"`));
    assert.match(job, new RegExp(`PLAYWRIGHT_ARTIFACT: "${shard}"`));
    assert.match(
      job,
      shard === 1 ? /steps: &playwright_test_steps/ : /steps: \*playwright_test_steps/,
    );
  }
  const shared = jobs.get("playwright-1").join("\n");
  assert.match(shared, /E2E_WORKERS: "2"/);
  const weights = /PWTEST_SHARD_WEIGHTS: "([\d:]+)"/.exec(shared)[1].split(":").map(Number);
  assert.equal(weights.length, 8);
  assert.ok(weights.every((weight) => weight > 0));
  assert.match(shared, /npm run test:e2e --workspace=@getpaseo\/app -- --shard=/);

  // No fan-in result job: a gate needs its own runner and under contention it
  // queued 8m08s behind the last shard. Required checks name the shards directly.
  assert.equal(jobs.has("playwright"), false);
});

test("quality preserves commands and routes each domain independently after failures", () => {
  const jobs = jobBlocks(readFileSync(ciWorkflowPath, "utf8"));
  const quality = jobs.get("quality").join("\n");
  assert.doesNotMatch(quality, /^\s+continue-on-error:/m);
  const commands = {
    format: ["npm run format:check"],
    quality: [
      "npx --yes lockfile-lint --path package-lock.json --type npm --allowed-hosts npm --validate-https --validate-integrity",
      "npm audit signatures",
      "npm run lint",
      "node --test scripts/oxlint/paseo-plugin.test.mjs",
    ],
    relay: ["npm run build:relay", "npm run test --workspace=@getpaseo/relay"],
    sdk: [
      "npm run build:relay && npm run build:client",
      "npm run build:plugin",
      "npm run test --workspace=@getpaseo/plugin",
      "npm run test --workspace=@getpaseo/protocol",
      "npm run test --workspace=@getpaseo/client",
      "npm run test --workspace=@getpaseo/highlight",
      "npm run typecheck:examples --workspace=@getpaseo/client",
    ],
  };
  const checks = [...quality.matchAll(/        if: \$\{\{ (.+) \}\}\n        run: (.+)/g)];
  assert.deepEqual(
    checks.map(([, , command]) => command),
    Object.values(commands).flat(),
  );
  const domains = Object.keys(commands);
  function accepts(expression, outputs, { cancelled = false, installed = true } = {}) {
    // Prior checks have failed: success() is false. Explicit !cancelled() must
    // override Actions' default success condition so later domains still run.
    assert.match(expression, /!cancelled\(\)/);
    return runInNewContext(expression, {
      needs: { changes: { outputs } },
      steps: { install: { outcome: installed ? "success" : "failure" } },
      cancelled: () => cancelled,
      success: () => false,
    });
  }
  const disabled = { full: "false", ...Object.fromEntries(domains.map((key) => [key, "false"])) };
  const jobCondition = /    if: \$\{\{ (.+) \}\}/.exec(quality)[1];
  assert.equal(accepts(jobCondition, disabled), false);
  for (const selected of domains) {
    const outputs = { ...disabled, [selected]: "true" };
    assert.equal(accepts(jobCondition, outputs), true);
    for (const [, expression, command] of checks) {
      assert.equal(accepts(expression, outputs), commands[selected].includes(command), command);
    }
  }
  for (const [, expression] of checks) {
    assert.equal(accepts(expression, { ...disabled, full: "true" }), true);
    assert.equal(accepts(expression, {}), true, "missing routing outputs fail open");
    assert.equal(accepts(expression, {}, { cancelled: true }), false);
    assert.equal(accepts(expression, {}, { installed: false }), false);
  }
  assert.equal(accepts(jobCondition, {}, { cancelled: true }), false);
});

test("iOS cloud builds require explicit selection and budget confirmation", () => {
  const workflow = load(
    readFileSync(new URL(".github/workflows/ios-testflight.yml", repoRoot), "utf8"),
  );
  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
  const inputs = workflow.on.workflow_dispatch.inputs;
  // The distribution-only workflow has no cloud runner to authorize. Keep its
  // manual/self-hosted boundary checked without requiring build-only inputs.
  if (!workflow.jobs.cloud) {
    assert.equal(inputs.distribute.default, false);
    for (const job of Object.values(workflow.jobs)) {
      assert.ok(Array.isArray(job["runs-on"]));
      assert.ok(job["runs-on"].includes("self-hosted"));
    }
    return;
  }
  assert.equal(inputs.build_host.default, "self-hosted");
  assert.equal(inputs.cloud_mode.default, "simulator");
  assert.equal(inputs.free_budget_confirmed.default, false);
  assert.equal(workflow.jobs.cloud["runs-on"], "macos-26");
  assert.equal(workflow.jobs.cloud["timeout-minutes"], 45);
  for (const build_host of [undefined, "self-hosted", "github"]) {
    for (const free_budget_confirmed of [undefined, false, true]) {
      const context = { inputs: { build_host, free_budget_confirmed } };
      const evaluate = (condition) =>
        Boolean(runInNewContext(condition.slice(3, -2).trim(), context));
      assert.equal(
        evaluate(workflow.jobs.cloud.if),
        build_host === "github" && free_budget_confirmed === true,
      );
      assert.equal(evaluate(workflow.jobs.testflight.if), build_host !== "github");
    }
  }
  const upload = workflow.jobs.cloud.steps.find((step) =>
    step.run?.includes("release-ios-local.sh"),
  );
  for (const cloud_mode of ["simulator", "testflight"]) {
    for (const preflight_only of [false, true]) {
      assert.equal(
        runInNewContext(upload.if.slice(3, -2).trim(), {
          inputs: { cloud_mode, preflight_only },
        }),
        cloud_mode === "testflight" && !preflight_only,
      );
    }
  }
});

test("CI avoids hosted Windows and macOS runners", () => {
  for (const workflowPath of [
    ciWorkflowPath,
    new URL(".github/workflows/desktop-packages.yml", repoRoot),
  ]) {
    const jobs = jobBlocks(readFileSync(workflowPath, "utf8"));
    for (const [jobId, lines] of jobs) {
      const runner = lines.find((line) => line.startsWith("    runs-on:"));
      assert.ok(runner, `${jobId} declares its runner`);
      assert.doesNotMatch(runner, /(?:windows|macos)-/i);
    }
  }
  const jobs = jobBlocks(readFileSync(ciWorkflowPath, "utf8"));
  for (const jobId of [
    "server-tests-windows",
    "server-integration-windows",
    "desktop-tests-windows",
  ]) {
    assert.equal(jobs.has(jobId), false);
  }
  const macos = jobs.get("server-tests-macos").join("\n");
  assert.match(macos, /^    runs-on: \[self-hosted, macOS, ARM64, clawmuse-mac\]$/m);
  assert.match(macos, /src\/server\/file-observer/);
  assert.match(macos, /workspace-git-service\.observation\.integration\.test\.ts/);
});

test("Ubuntu server checks preserve unit, integration and Hub routing", () => {
  const source = readFileSync(ciWorkflowPath, "utf8");
  const jobs = jobBlocks(source);
  const ubuntu = jobs.get("server-tests-ubuntu").join("\n");
  assert.match(ubuntu, /run: npm run test --workspace=@getpaseo\/server/);
  assert.match(ubuntu, /^    needs: changes$/m);
  assert.match(ubuntu, /^    runs-on: ubuntu-latest$/m);
  assert.doesNotMatch(ubuntu, /continue-on-error|maxWorkers|--exclude/);
  for (const step of [
    "server_capacity",
    "server_checkout",
    "server_node",
    "server_fetch",
    "server_install",
    "server_agent_clis",
    "server_build",
  ]) {
    assert.match(ubuntu, new RegExp(`&${step}\\b`));
  }
  assert.match(ubuntu, /env: &server_test_env/);
  assert.match(ubuntu, /run: npm run test --workspace=@getpaseo\/builtin-plugins/);
  assert.match(ubuntu, /run: npm run test:hub-cli-contract --workspace=@getpaseo\/server/);

  const scripts = JSON.parse(
    readFileSync(new URL("packages/server/package.json", repoRoot), "utf8"),
  ).scripts;
  assert.equal(scripts.test, "npm run test:unit && npm run test:integration");
  assert.equal(scripts["test:unit"], 'vitest run --fileParallelism --exclude "**/*.e2e.test.ts"');
  const invocations = scripts["test:integration"].split(" && ");
  // Each vitest start costs about half a minute on Windows, so the
  // name-filtered files share one invocation and one combined filter.
  assert.equal(invocations.length, 2);
  assert.ok(invocations.every((command) => command.startsWith("vitest run --maxWorkers=1 ")));
  assert.doesNotMatch(invocations[0], / -t /);
  assert.equal(
    invocations[1],
    'vitest run --maxWorkers=1 src/server/agent/providers/omp/history.e2e.test.ts src/server/daemon-e2e/git-operations.e2e.test.ts src/server/session.create-agent-worktree-autoarchive.e2e.test.ts src/server/agent/providers/opencode-bridge.local.e2e.test.ts src/server/daemon-e2e/relay-transport.e2e.test.ts -t "merges into|creates a worktree and auto-archives both|versioned runtime|oversized attachments|connected hosts|password-protected daemon refuses|replays selected OMP history"',
  );
  const serverConfig = readFileSync(new URL("packages/server/vitest.config.ts", repoRoot), "utf8");
  assert.doesNotMatch(serverConfig, /maxWorkers/);

  function condition(job) {
    return /    if: \$\{\{ (.+) \}\}/.exec(job)[1];
  }
  function selected(expression, outputs, cancelled = false) {
    return runInNewContext(expression, {
      needs: { changes: { outputs } },
      cancelled: () => cancelled,
    });
  }
  const serverCondition = condition(ubuntu);
  const serverStep = /      - name: Run server tests\n        if: \$\{\{ (.+) \}\}/.exec(ubuntu)[1];
  const hubStep =
    /      - &server_hub_contract\n        name: Run Hub CLI\/daemon contract\n        if: \$\{\{ (.+) \}\}/.exec(
      ubuntu,
    )[1];
  const pluginStep =
    /      - &server_plugin_tests\n        name: Run built-in plugin tests\n        if: \$\{\{ (.+) \}\}/.exec(
      ubuntu,
    )[1];
  for (const [outputs, serverJob, serverTests, hub] of [
    [{ full: "true", server: "false", hub: "false" }, true, true, false],
    [{ full: "false", server: "true", hub: "false" }, true, true, false],
    [{ full: "false", server: "false", hub: "true" }, true, false, true],
    [{ full: "false", server: "false", hub: "false" }, false, false, false],
    [{}, true, true, false],
  ]) {
    assert.equal(selected(serverCondition, outputs), serverJob);
    assert.equal(selected(serverStep, outputs), serverTests);
    assert.equal(selected(pluginStep, outputs), serverTests);
    assert.equal(selected(hubStep, outputs), hub);
    assert.equal(selected(serverCondition, outputs, true), false);
  }
});

test("platform desktop beta refs build only their selected platform", () => {
  const mac = load(
    readFileSync(new URL(".github/workflows/mac-desktop-release.yml", repoRoot), "utf8"),
  );
  assert.ok(mac.on.push.tags.includes("desktop-macos-v*"));
  assert.ok(!mac.on.push.tags.includes("desktop-linux-v*"));
  assert.ok(!mac.on.push.tags.includes("desktop-windows-v*"));
  assert.deepEqual(mac.jobs.build["runs-on"], ["self-hosted", "macOS", "ARM64", "clawmuse-ios"]);
  const cnb = load(readFileSync(new URL(".cnb.yml", repoRoot), "utf8"));
  for (const platform of ["linux", "windows"]) {
    const pipelines = cnb[`release-build/desktop-${platform}-v*`].push;
    assert.equal(pipelines.length, 1);
    const scripts = new Set(pipelines[0].stages.map((stage) => stage.script));
    assert.ok(scripts.has(`bash scripts/cnb/desktop-release.sh ${platform}`));
    const other = platform === "linux" ? "windows" : "linux";
    assert.ok(!scripts.has(`bash scripts/cnb/desktop-release.sh ${other}`));
  }
  assert.ok(!Object.hasOwn(cnb, "release-build/desktop-macos-v*"));
});

test("Mac platform releases stamp the desktop and bundled daemon with the same version", () => {
  const workflow = load(
    readFileSync(new URL(".github/workflows/mac-desktop-release.yml", repoRoot), "utf8"),
  );
  const step = workflow.jobs.build.steps.find((entry) =>
    entry.run?.includes("pkg.version = process.env.DESKTOP_VERSION"),
  );
  assert.ok(step);
  const root = mkdtempSync(join(tmpdir(), "mac-release-version-"));
  try {
    const packages = ["desktop", "server", "cli", "app"];
    mkdirSync(join(root, "scripts"));
    writeFileSync(
      join(root, "scripts/sync-workspace-versions.mjs"),
      readFileSync(new URL("scripts/sync-workspace-versions.mjs", repoRoot)),
    );
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ version: "1.5.5", workspaces: packages.map((name) => `packages/${name}`) }),
    );
    for (const name of packages) {
      mkdirSync(join(root, "packages", name), { recursive: true });
      writeFileSync(
        join(root, "packages", name, "package.json"),
        JSON.stringify({ name: `@getpaseo/${name}`, version: "1.5.5" }),
      );
    }
    execFileSync("bash", ["-e", "-c", step.run], {
      cwd: root,
      env: {
        ...process.env,
        DESKTOP_VERSION: "1.5.6-beta.2",
        DESKTOP_PACKAGE_PATH: "packages/desktop",
      },
    });
    for (const name of packages) {
      const pkg = JSON.parse(readFileSync(join(root, "packages", name, "package.json"), "utf8"));
      assert.equal(pkg.version, "1.5.6-beta.2", name);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Mac credential inspection cannot start a build or upload", () => {
  const workflow = load(
    readFileSync(new URL(".github/workflows/mac-desktop-release.yml", repoRoot), "utf8"),
  );
  assert.equal(workflow.on.workflow_dispatch.inputs.credentials_only.type, "boolean");
  for (const credentials_only of [true, false, undefined]) {
    const context = {
      github: { event: { repository: { private: true } } },
      inputs: { credentials_only },
    };
    const evaluate = (condition) => runInNewContext(condition.slice(3, -2).trim(), context);
    assert.equal(evaluate(workflow.jobs.credentials.if), credentials_only === true);
    assert.equal(evaluate(workflow.jobs.build.if), credentials_only !== true);
  }
  const inspect = workflow.jobs.credentials.steps;
  assert.equal(inspect.length, 3);
  assert.equal(
    inspect.at(-1).run,
    "node packages/desktop/scripts/mac-credentials.mjs --probe-signing",
  );
});

test("Mac signing retains Mach-O binaries and bundles without signing binary resources", () => {
  const directory = mkdtempSync(`${tmpdir()}/clawmuse-code-signing-`);
  try {
    const bundle = `${directory}/ClawMuse.app`;
    mkdirSync(bundle);
    assert.equal(isMacCodePath(bundle), true);
    for (const magic of [
      0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xcafebabf, 0xbebafeca,
      0xbfbafeca,
    ]) {
      const file = `${directory}/native-${magic}.node`;
      const header = Buffer.alloc(8);
      header.writeUInt32BE(magic, 0);
      if ([0xbebafeca, 0xbfbafeca].includes(magic)) header.writeUInt32LE(1, 4);
      else header.writeUInt32BE(1, 4);
      writeFileSync(file, header);
      assert.equal(isMacCodePath(file), true);
    }
    for (const [name, bytes] of [
      ["image.png", Buffer.from("89504e470d0a1a0a", "hex")],
      ["locale.pak", Buffer.alloc(32)],
      ["empty", Buffer.alloc(0)],
      ["Example.class", Buffer.from("cafebabe00000040", "hex")],
      ["script", Buffer.from("#!/bin/sh\n")],
    ]) {
      const file = `${directory}/${name}`;
      writeFileSync(file, bytes);
      assert.equal(isMacCodePath(file), false, name);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Mac test packaging does not require Apple signing credentials", () => {
  const workflow = load(
    readFileSync(new URL(".github/workflows/mac-desktop-release.yml", repoRoot), "utf8"),
  );
  const build = workflow.jobs.build.steps.find((step) => step.name === "构建 macOS 包（arm64）");
  assert.ok(!build.run.includes("macos-signing-env"));
  assert.match(build.run, /mac-signing\.mjs "\$DESKTOP_VERSION"/);
  const config = load(
    readFileSync(new URL("packages/desktop/electron-builder.yml", repoRoot), "utf8"),
  );
  assert.equal(config.mac.notarize, true);
  assert.equal(config.mac.forceCodeSigning, true);
  assert.deepEqual(resolveMacSigning({ version: "0.13.0-beta.7", env: {} }), {
    identity: "-",
    notarize: false,
    forceCodeSigning: false,
  });
  assert.ok(config.mac.publish.url.endsWith("/desktop/macos/"));
  for (const file of [config.mac.entitlements, config.mac.entitlementsInherit]) {
    const entitlements = readFileSync(new URL(`packages/desktop/${file}`, repoRoot), "utf8");
    assert.match(
      entitlements,
      /<key>com\.apple\.security\.cs\.disable-library-validation<\/key>\s*<true\/>/,
    );
  }
});

const macReleaseEnv = {
  APPLE_SIGN_IDENTITY: "Developer ID Application: ClawMuse Test (ABCDEFGHIJ)",
  APPLE_TEAM_ID: "ABCDEFGHIJ",
  APPLE_KEYCHAIN_PROFILE: "clawmuse-notary",
};

test("Mac stable builds require an explicit Developer ID and notarization credentials", () => {
  assert.throws(() => resolveMacSigning({ version: "0.13.0", env: {} }), /Developer ID/);
  assert.throws(
    () =>
      resolveMacSigning({
        version: "0.13.0",
        env: {
          ...macReleaseEnv,
          APPLE_SIGN_IDENTITY: "Apple Distribution: ClawMuse Test (ABCDEFGHIJ)",
        },
      }),
    /Developer ID/,
  );
  assert.throws(
    () =>
      resolveMacSigning({
        version: "0.13.0",
        env: { ...macReleaseEnv, APPLE_TEAM_ID: "WRONGTEAM1" },
      }),
    /APPLE_TEAM_ID/,
  );
  assert.throws(
    () =>
      resolveMacSigning({
        version: "0.13.0",
        env: { ...macReleaseEnv, APPLE_KEYCHAIN_PROFILE: "" },
      }),
    /notarization credentials/,
  );
  assert.deepEqual(resolveMacSigning({ version: "0.13.0", env: macReleaseEnv }), {
    identity: "ClawMuse Test (ABCDEFGHIJ)",
    forceCodeSigning: true,
    notarize: true,
  });
});

test("Mac notarization accepts complete credential sets and rejects incomplete higher-priority ones", () => {
  for (const credentials of [
    { APPLE_ID: "developer@example.com", APPLE_APP_SPECIFIC_PASSWORD: "test-password" },
    {
      APPLE_API_KEY: "/tmp/AuthKey_TEST.p8",
      APPLE_API_KEY_ID: "TESTKEY123",
      APPLE_API_ISSUER: "test-issuer",
    },
  ]) {
    const env = { ...macReleaseEnv, APPLE_KEYCHAIN_PROFILE: "", ...credentials };
    assert.equal(resolveMacSigning({ version: "0.13.0", env }).notarize, true);
  }
  for (const credentials of [
    { APPLE_ID: "developer@example.com" },
    { APPLE_API_KEY_ID: "TESTKEY123" },
  ]) {
    assert.throws(
      () => resolveMacSigning({ version: "0.13.0", env: { ...macReleaseEnv, ...credentials } }),
      /notarization requires/,
    );
  }
});

function macVerificationHarness({ signature, assessment, failTool } = {}) {
  const calls = [];
  const run = (command, args) => {
    calls.push({ command, args });
    if (command === failTool) throw new Error("Verification failed");
    if (args.includes("--display"))
      return (
        signature ??
        `Authority=${macReleaseEnv.APPLE_SIGN_IDENTITY}\nTeamIdentifier=ABCDEFGHIJ\nCodeDirectory flags=0x10000(runtime)`
      );
    if (command === "/usr/sbin/spctl")
      return assessment ?? "accepted\nsource=Notarized Developer ID";
    return "";
  };
  return { calls, run };
}

test("Mac stable artifact gate requires the matching signed, stapled, Gatekeeper-approved app", () => {
  const harness = macVerificationHarness();
  verifyMacDistribution({
    appPath: "/Applications/ClawMuse.app",
    version: "0.13.0",
    env: macReleaseEnv,
    run: harness.run,
  });
  assert.deepEqual(
    harness.calls.map(({ command }) => command),
    ["/usr/bin/codesign", "/usr/bin/codesign", "/usr/bin/xcrun", "/usr/sbin/spctl"],
  );
  assert.deepEqual(harness.calls[2].args, ["stapler", "validate", "/Applications/ClawMuse.app"]);
  for (const options of [
    { signature: "Signature=adhoc\nTeamIdentifier=not set" },
    {
      signature: `Authority=${macReleaseEnv.APPLE_SIGN_IDENTITY}\nTeamIdentifier=WRONGTEAM1\nflags=0x10000(runtime)`,
    },
    {
      signature: `Authority=${macReleaseEnv.APPLE_SIGN_IDENTITY}\nTeamIdentifier=ABCDEFGHIJ\nflags=0x0`,
    },
    { failTool: "/usr/bin/xcrun" },
    { assessment: "accepted\nsource=Developer ID" },
  ]) {
    const rejected = macVerificationHarness(options);
    assert.throws(() =>
      verifyMacDistribution({
        appPath: "/Applications/ClawMuse.app",
        version: "0.13.0",
        env: macReleaseEnv,
        run: rejected.run,
      }),
    );
  }
});

test("Mac beta verification never requires a certificate or invokes Apple tools", () => {
  const harness = macVerificationHarness();
  verifyMacDistribution({
    appPath: "/Applications/ClawMuse.app",
    version: "0.13.0-beta.7",
    env: {},
    run: harness.run,
  });
  assert.deepEqual(harness.calls, []);
});

test("electron-builder loads signed stable and credential-free beta configurations", () => {
  const script = `
    const assert = require('node:assert/strict');
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    require(process.cwd() + '/packages/desktop/package.json').version = '0.13.0-beta.7';
    process.env.CSC_LINK = 'must-not-be-imported';
    process.env.APPLE_APP_SPECIFIC_PASSWORD = 'must-not-be-used';
    const { getConfig } = require('app-builder-lib/out/util/config/config.js');
    getConfig(process.cwd() + '/packages/desktop', 'electron-builder.config.cjs').then(async config => {
      assert.equal(config.mac.identity, '-');
      assert.equal(config.mac.notarize, false);
      assert.equal(config.mac.forceCodeSigning, false);
      assert.equal(config.dmg.sign, false);
      assert.equal(config.mac.publish.url, 'https://agent-relay.clawmuse.com/updates/desktop/macos/');
      assert.equal(process.env.CSC_LINK, undefined);
      assert.equal(process.env.APPLE_APP_SPECIFIC_PASSWORD, undefined);
      require(process.cwd() + '/packages/desktop/package.json').version = '0.13.0';
      Object.assign(process.env, ${JSON.stringify(macReleaseEnv)});
      const stable = await getConfig(process.cwd() + '/packages/desktop', 'electron-builder.config.cjs');
      assert.equal(stable.mac.identity, 'ClawMuse Test (ABCDEFGHIJ)');
      assert.equal(stable.mac.notarize, true);
      assert.equal(stable.mac.forceCodeSigning, true);
      assert.equal(typeof stable.mac.sign, 'function');
      assert.equal(stable.dmg.sign, true);
      assert.equal(stable.mac.publish.url, config.mac.publish.url);
      require(process.cwd() + '/packages/desktop/package.json').version = '1.5.5+1108';
      const dated = await getConfig(process.cwd() + '/packages/desktop', 'electron-builder.config.cjs');
      assert.equal(dated.mac.bundleShortVersion, '1.5.5');
      assert.equal(dated.mac.bundleVersion, '1108');
      assert.equal(dated.mac.extendInfo.ClawMuseReleaseVersion, '1.5.5+1108');
      assert.equal(dated.buildVersion, '1.5.5.1108');
      assert.equal(dated.mac.notarize, true);
      // Exercise the actual metadata normalization path, not only the config object.
      const { Packager } = require('app-builder-lib/out/packager.js');
      const packager = new Packager({
        projectDir: process.cwd() + '/packages/desktop',
        config: 'electron-builder.config.cjs',
      });
      await packager.validateConfig();
      const { AppInfo } = require('app-builder-lib/out/appInfo.js');
      const info = new AppInfo(packager, null);
      assert.equal(info.version, '1.5.5+1108');
      assert.equal(info.channel, null);
      const { expandMacro } = require('app-builder-lib/out/util/macroExpander.js');
      assert.equal(expandMacro(dated.mac.artifactName, 'arm64', info, { ext: 'zip' }),
        'ClawMuse-1.5.5+1108-arm64.zip');
    }).catch(error => { console.error(error); process.exitCode = 1; });
  `;
  execFileSync(process.execPath, ["-e", script], { cwd: repoRoot, stdio: "pipe" });
});

test("release preflight rejects the historical node:test/Vitest mismatch before builds", async () => {
  const { checkDesktopTestRunners } = await import("./cnb/preflight.mjs");
  const directory = mkdtempSync(new URL("clawmuse-preflight-", `file://${tmpdir()}/`));
  try {
    const file = `${directory}/package-desktop.test.mjs`;
    writeFileSync(file, 'import test from "node:test"; test("pack", () => {});');
    assert.throws(() => checkDesktopTestRunners([file]), /node:test.*Vitest/);
    writeFileSync(file, 'import { test } from "vitest"; test("pack", () => {});');
    assert.doesNotThrow(() => checkDesktopTestRunners([file]));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("parallel gates preserve every suite and reject failed, skipped or incomplete children", async () => {
  const { childPipeline, gateGroups, inspectChild, websiteBrowserRuntime } =
    await import("./cnb/gates.mjs");
  const lock = JSON.parse(readFileSync(new URL("package-lock.json", repoRoot), "utf8"));
  assert.equal(
    websiteBrowserRuntime.playwrightVersion,
    lock.packages["node_modules/playwright"].version,
  );
  assert.match(websiteBrowserRuntime.image, /@sha256:[a-f0-9]{64}$/);
  assert.deepEqual(inspectChild({ status: "error" }, []), { state: "running", stages: [] });
  const commands = Object.values(gateGroups)
    .flat()
    .map((stage) => stage.script)
    .sort();
  assert.deepEqual(
    commands,
    ["quality", "website", "server", "app", "sdk", "cli", "desktop", "e2e 1/2", "e2e 2/2"]
      .map((suite) => `bash scripts/cnb/ci.sh ${suite}`)
      .sort(),
  );
  for (const group of Object.keys(gateGroups)) {
    const plan = childPipeline({ group, source: "a".repeat(40), branch: "ci/cnb-test" });
    const [pipeline] = plan["ci/cnb-test"].api_trigger;
    assert.deepEqual(pipeline.services, ["docker", "vscode"]);
    for (const stage of pipeline.stages) {
      assert.equal(
        stage.image,
        stage.script === "bash scripts/cnb/ci.sh website"
          ? websiteBrowserRuntime.image
          : "node:22-bookworm",
      );
    }
    const stages = pipeline.stages.map((stage) => ({
      name: stage.name,
      status: "success",
      duration: 1,
    }));
    const status = { status: "pending", pipelinesStatus: { p: { stages } } };
    assert.equal(inspectChild(status, pipeline.stages).state, "passed");
    stages.at(-1).status = "skipped";
    assert.equal(inspectChild(status, pipeline.stages).state, "failed");
    stages.at(-1).status = "start";
    assert.equal(inspectChild(status, pipeline.stages).state, "running");
    stages.pop();
    assert.throws(() => inspectChild(status, pipeline.stages), /coverage/);
  }
});

test("completed ordinary CNB builds allow skipped optional debug detection", async () => {
  const { inspectChild } = await import("./cnb/gates.mjs");
  const stages = [
    { name: "Prepare", status: "success" },
    { name: "desktop unit + xvfb e2e", status: "success" },
    { name: "BeforeEnd", status: "success" },
    { name: "DebugDetection", status: "skipped" },
    { name: "End", status: "success" },
  ];
  const status = { status: "success", pipelinesStatus: { p: { stages } } };
  const expected = [{ name: "desktop unit + xvfb e2e" }];
  assert.equal(inspectChild(status, expected).state, "passed");
  stages[3].status = "error";
  assert.equal(inspectChild(status, expected).state, "failed");
  stages[3].status = "skipped";
  stages[1].status = "skipped";
  assert.equal(inspectChild(status, expected).state, "failed");
});

test("native dependency preflight catches missing target packages and corrupted archives", async () => {
  const { nativeDependencyPlan, verifyNativeArchive } =
    await import("./cnb/native-dependencies.mjs");
  const lock = JSON.parse(readFileSync(new URL("package-lock.json", repoRoot), "utf8"));
  const linux = nativeDependencyPlan(lock, "linux");
  assert.deepEqual(
    linux.map((item) => item.name),
    [
      "@esbuild/linux-x64",
      "@esbuild/linux-arm64",
      "sherpa-onnx-linux-x64",
      "sherpa-onnx-linux-arm64",
    ],
  );
  assert.throws(() => verifyNativeArchive(Buffer.from("corrupt"), linux[0]), /integrity mismatch/);
  delete lock.packages["node_modules/sherpa-onnx-linux-arm64"];
  assert.throws(() => nativeDependencyPlan(lock, "linux"), /sherpa-onnx-linux-arm64/);
  assert.deepEqual(
    nativeDependencyPlan(lock, "windows").map((item) => item.name),
    ["@esbuild/win32-x64", "@esbuild/win32-arm64", "sherpa-onnx-win-x64"],
  );
});

test("parallel coordinator waits for independent results and resumes without duplicate builds", async () => {
  const { runGates } = await import("./cnb/parallel-gates.mjs");
  const directory = mkdtempSync(`${tmpdir()}/clawmuse-gates-`);
  const builds = new Map();
  let starts = 0;
  let failures = true;
  let reads = 0;
  async function request(endpoint, body) {
    if (endpoint === "start") {
      const plan = JSON.parse(body.config)[body.branch].api_trigger[0];
      const sn = `build-${++starts}`;
      builds.set(sn, plan);
      return { success: true, sn };
    }
    const sn = endpoint.split("/")[1];
    const plan = builds.get(sn);
    reads++;
    // All children must be started before status collection can finish.
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(starts, 5);
    const stages = plan.stages.map((stage) => ({
      name: stage.name,
      status: "success",
      duration: 5,
    }));
    if (failures && plan.name === "ci-desktop") stages.at(-1).status = "skipped";
    return { status: "pending", pipelinesStatus: { p: { stages } } };
  }
  const options = {
    source: "a".repeat(40),
    branch: "ci/cnb-test",
    repo: "test/repo",
    token: "test",
    directory,
    request,
    pollMs: 1,
  };
  try {
    await assert.rejects(runGates(options), /Parallel gates failed/);
    assert.equal(reads, 5);
    const failed = JSON.parse(readFileSync(`${directory}/parallel-gates.json`, "utf8"));
    assert.equal(failed.passed, false);
    assert.equal(failed.groups.browser2.state, "passed");
    failures = false;
    const resumed = await runGates(options);
    assert.equal(resumed.passed, true);
    assert.equal(starts, 5);
    await assert.rejects(runGates({ ...options, source: "b".repeat(40) }), /another source/);
    assert.equal(starts, 5);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("macOS release retries only transient stapling failures without rebuilding the signed app", async (t) => {
  const workflow = readFileSync(new URL(".github/workflows/desktop-release.yml", repoRoot), "utf8");
  const wrapper = workflow
    .match(/<<'STAPLER'\n([\s\S]*?)\n          STAPLER/)[1]
    .replace(/^          /gm, "");
  const networkError =
    'Error Domain=NSURLErrorDomain Code=-1005 "The network connection was lost."';
  const cases = [
    {
      name: "success",
      outcomes: [0],
      output: "stapled",
      command: "stapler",
      expected: 0,
      attempts: 1,
    },
    {
      name: "transient then success",
      outcomes: [68, 0],
      output: networkError,
      command: "stapler",
      expected: 0,
      attempts: 2,
    },
    {
      name: "exhausted network retries",
      outcomes: [68, 68, 68, 68, 0],
      output: networkError,
      command: "stapler",
      expected: 68,
      attempts: 4,
    },
    {
      name: "non-network staple error",
      outcomes: [68, 0],
      output: "ticket not found",
      command: "stapler",
      expected: 68,
      attempts: 1,
    },
    {
      name: "different exit code",
      outcomes: [1, 0],
      output: networkError,
      command: "stapler",
      expected: 1,
      attempts: 1,
    },
    {
      name: "notary submission is not retried",
      outcomes: [68, 0],
      output: networkError,
      command: "notarytool",
      expected: 68,
      attempts: 1,
    },
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, () => {
      const directory = mkdtempSync(join(tmpdir(), "stapler-retry-"));
      try {
        const statePath = join(directory, "state.json");
        const realXcrun = join(directory, "real-xcrun");
        const wrapperPath = join(directory, "xcrun");
        writeFileSync(wrapperPath, wrapper, { mode: 0o755 });
        writeFileSync(join(directory, "sleep"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
        writeFileSync(
          statePath,
          JSON.stringify({ outcomes: scenario.outcomes, output: scenario.output, calls: [] }),
        );
        writeFileSync(
          realXcrun,
          `#!/usr/bin/env node
const fs = require("node:fs");
const state = JSON.parse(fs.readFileSync(process.env.STAPLER_STATE, "utf8"));
state.calls.push(process.argv.slice(2));
const code = state.outcomes.shift();
fs.writeFileSync(process.env.STAPLER_STATE, JSON.stringify(state));
console.log(state.output);
process.exit(code);
`,
          { mode: 0o755 },
        );
        const args = [scenario.command, "staple", "-v", "Paseo signed.app"];
        const result = spawnSync("bash", [wrapperPath, ...args], {
          encoding: "utf8",
          env: {
            ...process.env,
            PASEO_REAL_XCRUN: realXcrun,
            STAPLER_STATE: statePath,
            PATH: `${directory}:${process.env.PATH}`,
          },
          timeout: 5000,
        });
        assert.equal(result.status, scenario.expected, result.stdout + result.stderr);
        const state = JSON.parse(readFileSync(statePath, "utf8"));
        assert.deepEqual(
          state.calls,
          Array.from({ length: scenario.attempts }, () => args),
        );
        assert.match(result.stdout, /stapled|network connection was lost|ticket not found/);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  }
});
