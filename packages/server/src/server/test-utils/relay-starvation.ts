import assert from "node:assert/strict";
import { open } from "node:fs/promises";
import { openSync, closeSync, constants } from "node:fs";
import { once } from "node:events";
import { WebSocketServer } from "ws";
import pino from "pino";
import { startRelayTransport } from "../relay-transport.js";

// Run with UV_THREADPOOL_SIZE=1. The FIFO consumes that one thread until cleanup;
// unlike a mocked fs promise this also prevents Node's default DNS lookup.
const fifo = process.argv[2];
assert.ok(fifo);
const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
await once(server, "listening");
const address = server.address();
assert.ok(typeof address === "object" && address);
const blocked = open(fifo, "r");
let completed = false;
void blocked.then(() => {
  completed = true;
  return undefined;
});
let controls = 0;
let data = 0;
const received = new Promise<void>((resolve) => {
  server.on("connection", (socket, request) => {
    const url = new URL(request.url!, "http://localhost");
    if (!url.searchParams.has("connectionId")) {
      controls++;
      socket.send(JSON.stringify({ type: "sync", connectionIds: [`client-${controls}`] }));
    } else {
      socket.on("message", (message) => {
        assert.equal(message.toString(), "remote-command-result");
        data++;
        if (data === 1) {
          // Reconnect and open another data channel while fs is still blocked.
          for (const client of server.clients) client.terminate();
        } else resolve();
      });
    }
  });
});
const controller = startRelayTransport({
  logger: pino({ level: "silent" }),
  relayEndpoint: `localhost:${address.port}`,
  relayUseTls: false,
  serverId: "starvation-test",
  attachSocket: async (socket) => {
    socket.send("remote-command-result");
  },
});
const deadline = setTimeout(() => {
  process.stderr.write("Relay could not reconnect while filesystem threadpool was blocked\n");
  process.exit(1);
}, 8_000);
try {
  await received;
  assert.equal(completed, false);
  assert.equal(controls, 2);
  process.stdout.write("remote-control-and-data-survived");
} finally {
  clearTimeout(deadline);
  await controller.stop();
  for (const socket of server.clients) socket.terminate();
  server.close();
  const writer = openSync(fifo, constants.O_WRONLY | constants.O_NONBLOCK);
  closeSync(writer);
  await (await blocked).close();
}
