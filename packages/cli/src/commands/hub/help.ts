import type { Command } from "commander";
import { DEFAULT_HUB_ORIGIN } from "./authority.js";

const resolutionHelp = `\nHub origin precedence: command origin/--hub, PASEO_HUB_URL, active stored login, then ${DEFAULT_HUB_ORIGIN}.\nCredential precedence: --api-key, PASEO_HUB_API_KEY, then a stored login for the exact resolved origin.\n`;

export function addHubResolutionHelp(command: Command): Command {
  return command.addHelpText("after", resolutionHelp);
}
