import { execFile } from "node:child_process";
import type { LookupAddress, LookupOptions } from "node:dns";
import type { LookupFunction } from "node:net";
import { z } from "zod";
import { buildSelfNodeCommand } from "./paseo-env.js";

const ReplySchema = z.union([
  z.object({ addresses: z.array(z.object({ address: z.string(), family: z.number() })) }),
  z.object({ error: z.object({ message: z.string(), code: z.string().optional() }) }),
]);

// Keep getaddrinfo's OS resolver semantics (hosts, VPNs, split DNS, fake-IP proxies).
// dns.resolve would bypass those; a Worker using dns.lookup still shares our fs pool.
// Builtins-only inline code also starts when the daemon's module-loading IO is stuck.
const LOOKUP_SOURCE = `
const { lookup } = require('node:dns');
const { hostname, options } = JSON.parse(process.argv[1]);
lookup(hostname, { ...options, all: true }, (error, addresses) => {
  process.stdout.write(JSON.stringify(error
    ? { error: { message: error.message, code: error.code } }
    : { addresses }));
});
`;

const pending = new Map<string, Promise<LookupAddress[]>>();

function resolveInProcess(hostname: string, options: LookupOptions): Promise<LookupAddress[]> {
  const input = JSON.stringify({ hostname, options: { ...options, all: true } });
  const existing = pending.get(input);
  if (existing) return existing;
  // Retain slots until the helper actually exits, even after its deadline.
  if (pending.size >= 2) {
    return Promise.reject(
      Object.assign(new Error("Relay DNS resolver busy"), { code: "EAI_AGAIN" }),
    );
  }
  const command = buildSelfNodeCommand(["--input-type=commonjs", "-e", LOOKUP_SOURCE, input], {
    NODE_OPTIONS: undefined,
  });
  const result = new Promise<LookupAddress[]>((resolve, reject) => {
    execFile(
      command.command,
      command.args,
      {
        env: command.env,
        cwd: process.platform === "win32" ? undefined : "/",
        timeout: 5_000,
        killSignal: "SIGKILL",
        maxBuffer: 64 * 1024,
        windowsHide: true,
        encoding: "utf8",
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        try {
          const reply = ReplySchema.parse(JSON.parse(stdout));
          if ("error" in reply) reject(Object.assign(new Error(reply.error.message), reply.error));
          else if (reply.addresses.length === 0)
            reject(
              Object.assign(new Error("Relay DNS returned no addresses"), { code: "ENOTFOUND" }),
            );
          else resolve(reply.addresses);
        } catch (parseError) {
          reject(parseError);
        }
      },
    );
  }).finally(() => pending.delete(input));
  pending.set(input, result);
  return result;
}

export const relayLookup: LookupFunction = (hostname, options, callback) => {
  // net.connect requires a callback even though coalesced lookups are promises.
  /* eslint-disable promise/no-callback-in-promise */
  void resolveInProcess(hostname, options).then(
    (addresses) => {
      if (options.all) return callback(null, addresses);
      return callback(null, addresses[0].address, addresses[0].family);
    },
    (error: NodeJS.ErrnoException) => callback(error, []),
  );
  /* eslint-enable promise/no-callback-in-promise */
};
