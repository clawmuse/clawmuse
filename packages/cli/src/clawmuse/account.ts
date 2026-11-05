import { hostname } from "node:os";
import { z } from "zod";
import { Command } from "commander";
import { isCancel, password, text } from "@clack/prompts";
import { resolvePaseoHome } from "@getpaseo/server/daemon-control";
import {
  parseConnectionOfferFromUrl,
  type ConnectionOffer,
} from "@getpaseo/protocol/connection-offer";
import { brand } from "../brand.generated.js";
import { resolveLocalPairingOffer } from "../commands/daemon/pair.js";
import { connectToDaemon } from "../utils/client.js";

export async function enrollAccountDevice(
  input: {
    email: string;
    password: string;
    label: string;
    offer: ConnectionOffer;
    bindAccount: (accountId: string) => Promise<{ offer: ConnectionOffer; accountKey: string }>;
  },
  request: typeof fetch = fetch,
): Promise<{ sessionRevoked: boolean }> {
  if (
    !brand.relayEndpoints.some((endpoint) => endpoint === input.offer.relay.endpoint) ||
    input.offer.relay.useTls !== true
  )
    throw new Error("This daemon must use the ClawMuse relay before account login.");
  const headers = { "Content-Type": "application/json", Origin: brand.hubOrigin };
  const login = await request(`${brand.hubOrigin}/api/auth/sign-in/email`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email: input.email.trim(), password: input.password }),
    signal: AbortSignal.timeout(20000),
  });
  if (!login.ok)
    throw new Error(`Account login failed (${login.status}). Check your email and password.`);
  const token = login.headers.get("set-auth-token");
  if (!token) throw new Error("The account server did not return a signed session.");
  const authenticated = { ...headers, Authorization: `Bearer ${token}` };
  let sessionRevoked = false;
  try {
    const registered = await request(`${brand.hubOrigin}/api/auth/clawmuse/devices`, {
      method: "POST",
      headers: authenticated,
      body: JSON.stringify({ label: input.label, offer: input.offer }),
      signal: AbortSignal.timeout(20000),
    });
    if (!registered.ok)
      throw new Error(
        `Device enrollment failed (${registered.status}). Check account permissions and whether this device belongs to another account.`,
      );
    const session = z.object({ user: z.object({ id: z.string() }) }).parse(await login.json());
    const binding = await input.bindAccount(session.user.id);
    if (
      binding.offer.serverId !== input.offer.serverId ||
      binding.offer.daemonPublicKeyB64 !== input.offer.daemonPublicKeyB64
    )
      throw new Error("The daemon identity changed during account login; retry enrollment.");
    const authorized = await request(`${brand.hubOrigin}/api/auth/clawmuse/devices`, {
      method: "POST",
      headers: authenticated,
      body: JSON.stringify({ label: input.label, ...binding }),
      signal: AbortSignal.timeout(20000),
    });
    if (!authorized.ok)
      throw new Error(
        `Account authorization enrollment failed (${authorized.status}). Retry account login.`,
      );
  } finally {
    // This session only authorizes enrollment; the daemon retains its own device key.
    try {
      const logout = await request(`${brand.hubOrigin}/api/auth/sign-out`, {
        method: "POST",
        headers: authenticated,
        body: "{}",
        signal: AbortSignal.timeout(20000),
      });
      sessionRevoked = logout.ok;
    } catch {
      sessionRevoked = false;
    }
  }
  return { sessionRevoked };
}

export function createAccountCommand(): Command {
  const command = new Command("account").description(
    "Connect this daemon to your ClawMuse account",
  );
  command
    .command("login")
    .description("Sign in once and make this daemon available on your account devices")
    .option("--name <name>", "Device display name", hostname())
    .option("--home <path>", "Daemon home directory")
    .action(async (options: { name: string; home?: string }) => {
      if (!process.stdin.isTTY)
        throw new Error(
          "Run account login in an interactive terminal (ssh -t). Passwords are not accepted as command arguments.",
        );
      const paseoHome = options.home ?? resolvePaseoHome(process.env);
      const pairing = await resolveLocalPairingOffer({
        paseoHome,
        enableRelay: true,
      });
      const offer = pairing.url ? parseConnectionOfferFromUrl(pairing.url) : null;
      if (!offer) throw new Error("Start the ClawMuse daemon with relay enabled first.");
      const email = await text({
        message: "ClawMuse email",
        validate: (value) => (value?.includes("@") ? undefined : "Enter your account email"),
      });
      if (isCancel(email)) return;
      const secret = await password({
        message: "ClawMuse password",
        validate: (value) => (value ? undefined : "Enter your password"),
      });
      if (isCancel(secret)) return;
      const result = await enrollAccountDevice({
        email,
        password: secret,
        label: options.name,
        offer,
        bindAccount: async (accountId) => {
          const client = await connectToDaemon({ target: { kind: "instance", home: paseoHome } });
          try {
            const { accountKey } = await client.bindClawMuseAccount(accountId);
            const managedPairing = await client.getDaemonPairingOffer();
            const managedOffer = parseConnectionOfferFromUrl(managedPairing.url);
            if (!managedOffer) throw new Error("Cannot read the account connection offer");
            return { offer: managedOffer, accountKey };
          } finally {
            await client.close();
          }
        },
      });
      process.stdout.write(
        `Connected: ${options.name}\nOpen ClawMuse on your phone with the same account. Your password and account session are not saved on this machine.\n`,
      );
      if (!result.sessionRevoked)
        process.stderr.write(
          "The temporary account session could not be revoked. Review active sessions in your account settings.\n",
        );
    });
  return command;
}
