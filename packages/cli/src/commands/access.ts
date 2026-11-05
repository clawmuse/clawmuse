import { Command } from "commander";
import { withOutput, type CommandOptions, type CommandResult } from "../output/index.js";
import { addJsonAndDaemonHostOptions } from "../utils/command-options.js";
import { connectToDaemon } from "../utils/client.js";

interface AccessOptions extends CommandOptions {
  controlledOnly?: boolean;
  manager?: boolean;
  persistent?: boolean;
}
async function runAccess(
  action: string,
  id: string | undefined,
  options: AccessOptions,
): Promise<CommandResult<Record<string, unknown>>> {
  const client = await connectToDaemon({ target: options.daemonTarget, timeout: 10 * 60_000 });
  try {
    let data: Record<string, unknown>;
    if (action === "link") {
      const { config } = await client.getDaemonConfig();
      if (!config.relay?.enabled)
        throw new Error(
          "Enable relay with `clawmuse daemon pair --relay` before creating an access link",
        );
      data = await client.createRemoteAccessInvitation({
        bootstrap: options.controlledOnly,
        manager: options.manager,
      });
    } else if (action === "approve" || action === "deny") {
      data = await client.decideRemotePairing({
        controllerId: id!,
        approve: action === "approve",
        persistent: options.persistent === true,
      });
    } else if (action === "revoke") data = await client.revokeRemoteController(id!);
    else if (action === "allow-outbound") data = await client.setControlledOnly(false);
    else if (action === "restrict-outbound") data = await client.setControlledOnly(true);
    else data = await client.getRemoteAccessState();
    return {
      type: "single",
      data,
      schema: {
        idField: "requestId",
        columns: [],
        renderHuman: () => JSON.stringify(data, null, 2),
      },
    };
  } finally {
    await client.close();
  }
}

export function createAccessCommand(): Command {
  const access = new Command("access").description(
    "Pair and manage independent remote controllers through relay links",
  );
  addJsonAndDaemonHostOptions(
    access.command("link").description("Create a single-use relay pairing link"),
  )
    .option("--controlled-only", "Initialize controlled-only mode and pair its first manager")
    .option("--manager", "Delegate management authority")
    .action(
      withOutput((options: AccessOptions, _command: Command) =>
        runAccess("link", undefined, options),
      ),
    );
  for (const action of ["ls", "allow-outbound", "restrict-outbound"]) {
    addJsonAndDaemonHostOptions(access.command(action)).action(
      withOutput((options: AccessOptions, _command: Command) =>
        runAccess(action, undefined, options),
      ),
    );
  }
  for (const action of ["approve", "deny", "revoke"]) {
    addJsonAndDaemonHostOptions(access.command(`${action} <controller-id>`))
      .option("--persistent", "Allow reconnecting without another approval (required for managers)")
      .action(
        withOutput((id: string, options: AccessOptions, _command: Command) =>
          runAccess(action, id, options),
        ),
      );
  }
  return access;
}
