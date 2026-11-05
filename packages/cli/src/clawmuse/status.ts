import { readFile } from "node:fs/promises";
import { hostname } from "node:os";
import { Command } from "commander";
import { resolvePaseoHome } from "@getpaseo/server/daemon-control";
import {
  CLAWMUSE_GOALS_MAX_CONCURRENT_RUNS,
  ClawMuseStatusClient,
  clearClawMuseStatusRelationship,
  deriveRelayHostId,
  formatClawMuseGoalsProviderTarget,
  getClawMuseStatusHostTokenPath,
  getOrCreateServerId,
  normalizeClawMuseStatusUrl,
  readClawMuseGoalsSettings,
  readClawMuseStatusHostToken,
  readClawMuseStatusRelationship,
  removeClawMuseStatusHostToken,
  saveClawMuseGoalsSettings,
  saveClawMuseStatusRelationship,
  writeClawMuseStatusHostToken,
  type ClawMuseGoalsSettings,
  type ClawMuseGoalsSettingsPatch,
} from "@getpaseo/server/clawmuse-status";

const MIN_TOKEN_LENGTH = 32;

export interface ClawMuseStatusTokenSource {
  tokenStdin?: boolean;
  tokenFile?: string;
}

interface ReadableInput {
  isTTY?: boolean;
  [Symbol.asyncIterator](): AsyncIterableIterator<string | Buffer>;
}

export interface ClawMuseStatusConnectOptions extends ClawMuseStatusTokenSource {
  name?: string;
  home?: string;
}

export interface ClawMuseStatusHomeOptions {
  home?: string;
}

async function readStdin(input: ReadableInput): Promise<string> {
  let value = "";
  for await (const chunk of input) {
    value += chunk.toString();
  }
  return value;
}

/**
 * A host token is a bearer credential for this machine's status identity, so it
 * never becomes a command argument: arguments land in shell history and in
 * every process list on the box.
 */
export async function readClawMuseStatusToken(
  source: ClawMuseStatusTokenSource,
  stdin: ReadableInput = process.stdin,
): Promise<string> {
  if (source.tokenStdin === true && source.tokenFile !== undefined) {
    throw new Error("Pass either --token-stdin or --token-file, not both");
  }
  if (source.tokenFile === undefined && source.tokenStdin !== true) {
    throw new Error("Provide the status host token with --token-stdin or --token-file <path>");
  }
  const raw =
    source.tokenFile === undefined
      ? await readStdin(stdin)
      : await readFile(source.tokenFile, "utf8");
  const token = raw.trim();
  if (token.length < MIN_TOKEN_LENGTH) {
    throw new Error(`The status host token must be at least ${MIN_TOKEN_LENGTH} characters`);
  }
  return token;
}

export interface ClawMuseStatusConnectInput {
  url: string;
  token: string;
  displayName: string;
  paseoHome: string;
}

export interface ClawMuseStatusConnectResult {
  baseUrl: string;
  relayHostId: string;
  displayName: string;
}

/**
 * Verifies the credential with one real host session before anything is written,
 * so a typo cannot leave the daemon retrying a relationship that can never work.
 */
export async function connectClawMuseStatus(
  input: ClawMuseStatusConnectInput,
  request?: typeof fetch,
): Promise<ClawMuseStatusConnectResult> {
  const baseUrl = normalizeClawMuseStatusUrl(input.url);
  const relayHostId = deriveRelayHostId(getOrCreateServerId(input.paseoHome));
  const client = request
    ? new ClawMuseStatusClient(baseUrl, (url, init) => request(url, init))
    : new ClawMuseStatusClient(baseUrl);
  await client.createHostSession({
    hostToken: input.token,
    relayHostId,
    displayName: input.displayName,
  });
  writeClawMuseStatusHostToken(input.paseoHome, input.token);
  saveClawMuseStatusRelationship(input.paseoHome, {
    url: baseUrl,
    displayName: input.displayName,
  });
  return { baseUrl, relayHostId, displayName: input.displayName };
}

export interface ClawMuseStatusShowResult {
  configured: boolean;
  baseUrl: string | null;
  displayName: string | null;
  relayHostId: string | null;
  hostTokenStored: boolean;
  hostTokenPath: string;
}

export function showClawMuseStatus(paseoHome: string): ClawMuseStatusShowResult {
  const relationship = readClawMuseStatusRelationship(paseoHome);
  return {
    configured: relationship !== null,
    baseUrl: relationship?.baseUrl ?? null,
    displayName: relationship?.displayName ?? null,
    relayHostId: relationship ? deriveRelayHostId(getOrCreateServerId(paseoHome)) : null,
    hostTokenStored: readClawMuseStatusHostToken(paseoHome) !== null,
    hostTokenPath: getClawMuseStatusHostTokenPath(paseoHome),
  };
}

export function disconnectClawMuseStatus(paseoHome: string): void {
  clearClawMuseStatusRelationship(paseoHome);
  removeClawMuseStatusHostToken(paseoHome);
}

function resolveHome(options: ClawMuseStatusHomeOptions): string {
  return options.home ?? resolvePaseoHome(process.env);
}

export interface ClawMuseGoalsSetOptions extends ClawMuseStatusHomeOptions {
  enable?: boolean;
  disable?: boolean;
  planner?: string;
  executor?: string;
  isolation?: string;
  maxConcurrent?: string;
}

/** Translate CLI flags into a settings patch; validation of the values happens in the server package. */
export function buildClawMuseGoalsPatch(
  options: ClawMuseGoalsSetOptions,
): ClawMuseGoalsSettingsPatch {
  if (options.enable && options.disable) {
    throw new Error("Pass either --enable or --disable, not both");
  }
  const patch: ClawMuseGoalsSettingsPatch = {};
  if (options.enable) {
    patch.enabled = true;
  }
  if (options.disable) {
    patch.enabled = false;
  }
  if (options.planner !== undefined) {
    patch.planner = options.planner;
  }
  if (options.executor !== undefined) {
    patch.executor = options.executor;
  }
  if (options.isolation !== undefined) {
    if (options.isolation !== "local" && options.isolation !== "worktree") {
      throw new Error("--isolation must be `local` or `worktree`");
    }
    patch.isolation = options.isolation;
  }
  if (options.maxConcurrent !== undefined) {
    const parsed = Number(options.maxConcurrent);
    if (!Number.isInteger(parsed)) {
      throw new Error("--max-concurrent must be an integer");
    }
    patch.maxConcurrentRuns = parsed;
  }
  if (Object.keys(patch).length === 0) {
    throw new Error(
      "Nothing to change: pass --enable/--disable, --planner, --executor, --isolation, or --max-concurrent",
    );
  }
  return patch;
}

export function formatClawMuseGoalsSettings(settings: ClawMuseGoalsSettings): string {
  return [
    `Goals: ${settings.enabled ? "enabled" : "disabled"}`,
    `Planner: ${formatClawMuseGoalsProviderTarget(settings.planner)}`,
    `Executor: ${formatClawMuseGoalsProviderTarget(settings.executor)}`,
    `Isolation: ${settings.isolation}`,
    `Max concurrent runs: ${settings.maxConcurrentRuns}`,
    "",
  ].join("\n");
}

/**
 * The documented surface is `clawmuse status connect|disconnect|show`. The
 * top-level `status` command already exists as the local daemon status alias,
 * so these attach to it instead of claiming the name a second time.
 */
export function addClawMuseStatusCommands(command: Command): Command {
  command
    .command("connect")
    .description("Connect this daemon to a ClawMuse Status service")
    .argument("<url>", "Status service base URL (HTTPS, or HTTP on loopback)")
    .option("--token-stdin", "Read the host token from standard input")
    .option("--token-file <path>", "Read the host token from a file")
    .option("--name <name>", "Host display name", hostname())
    .option("--home <path>", "Daemon home directory")
    .action(async (url: string, options: ClawMuseStatusConnectOptions) => {
      const paseoHome = resolveHome(options);
      const token = await readClawMuseStatusToken(options);
      const result = await connectClawMuseStatus({
        url,
        token,
        displayName: options.name ?? hostname(),
        paseoHome,
      });
      process.stdout.write(
        `Connected to ${result.baseUrl}\nHost: ${result.displayName}\nrelayHostId: ${result.relayHostId}\nA running daemon picks this up without a restart.\n`,
      );
    });
  command
    .command("disconnect")
    .description("Stop publishing status and remove the stored host token")
    .option("--home <path>", "Daemon home directory")
    .action((options: ClawMuseStatusHomeOptions) => {
      disconnectClawMuseStatus(resolveHome(options));
      process.stdout.write("Disconnected from ClawMuse Status.\n");
    });
  command
    .command("show")
    .description("Show the stored ClawMuse Status relationship")
    .option("--home <path>", "Daemon home directory")
    .action((options: ClawMuseStatusHomeOptions) => {
      const result = showClawMuseStatus(resolveHome(options));
      if (!result.configured) {
        process.stdout.write("Not connected to ClawMuse Status.\n");
        return;
      }
      process.stdout.write(
        `Service: ${result.baseUrl}\nHost: ${result.displayName ?? hostname()}\nrelayHostId: ${result.relayHostId}\nHost token: ${
          result.hostTokenStored ? `stored at ${result.hostTokenPath}` : "missing"
        }\n`,
      );
    });
  const goals = command
    .command("goals")
    .description(
      "Unattended goal runs: which models plan and execute, and whether this host takes runs",
    );
  goals
    .command("show")
    .description("Show the goal settings stored for this daemon")
    .option("--home <path>", "Daemon home directory")
    .action((options: ClawMuseStatusHomeOptions) => {
      process.stdout.write(
        formatClawMuseGoalsSettings(readClawMuseGoalsSettings(resolveHome(options))),
      );
    });
  goals
    .command("set")
    .description("Change goal settings; a running daemon applies them to its next lease")
    .option("--enable", "Let this host lease and run goals")
    .option("--disable", "Stop leasing goals (running agents finish)")
    .option(
      "--planner <provider[/model]>",
      "Model that scans repositories and proposes goals (use a cheap one)",
    )
    .option("--executor <provider[/model]>", "Model that works on accepted goals")
    .option("--isolation <local|worktree>", "Where execute runs work; default worktree")
    .option(
      "--max-concurrent <n>",
      `Runs this host takes at once, 1-${CLAWMUSE_GOALS_MAX_CONCURRENT_RUNS}`,
    )
    .option("--home <path>", "Daemon home directory")
    .action((options: ClawMuseGoalsSetOptions) => {
      const settings = saveClawMuseGoalsSettings(
        resolveHome(options),
        buildClawMuseGoalsPatch(options),
      );
      process.stdout.write(formatClawMuseGoalsSettings(settings));
    });
  return command;
}
