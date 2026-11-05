import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Command } from "commander";

import {
  addClawMuseStatusCommands,
  buildClawMuseGoalsPatch,
  connectClawMuseStatus,
  disconnectClawMuseStatus,
  readClawMuseStatusToken,
  showClawMuseStatus,
} from "./status.js";
import { createCli } from "../cli.js";

const TOKEN = "clawmuse-status-host-token-0123456789";
let paseoHome: string;

function stdinWith(value: string): Readable {
  return Readable.from([value]);
}

function hostSessionResponse(): Response {
  return new Response(
    JSON.stringify({
      hostId: "00000000-0000-0000-0000-000000000000",
      epoch: "00000000-0000-0000-0000-000000000001",
      accessToken: "host-access-token",
      expiresIn: 600,
      heartbeatInterval: 20,
      snapshotSchemaVersion: 4,
      hostSessionClose: true,
    }),
    { status: 201 },
  );
}

beforeEach(() => {
  paseoHome = mkdtempSync(path.join(tmpdir(), "clawmuse-status-cli-"));
});

afterEach(() => {
  rmSync(paseoHome, { recursive: true, force: true });
});

function statusCommand(): Command {
  return addClawMuseStatusCommands(new Command("status"));
}

describe("clawmuse status command surface", () => {
  it("offers connect, disconnect, and show", () => {
    expect(statusCommand().commands.map((command) => command.name())).toEqual([
      "connect",
      "disconnect",
      "show",
      "goals",
    ]);
  });

  it("keeps the documented commands reachable under the daemon status alias", () => {
    const status = createCli().commands.find((command) => command.name() === "status");

    expect(status?.commands.map((command) => command.name())).toEqual([
      "connect",
      "disconnect",
      "show",
      "goals",
    ]);
  });

  it("translates goal flags into a settings patch and rejects contradictions", () => {
    expect(
      buildClawMuseGoalsPatch({
        enable: true,
        planner: "zai/glm-4.6",
        isolation: "worktree",
        maxConcurrent: "2",
      }),
    ).toEqual({
      enabled: true,
      planner: "zai/glm-4.6",
      isolation: "worktree",
      maxConcurrentRuns: 2,
    });
    expect(() => buildClawMuseGoalsPatch({ enable: true, disable: true })).toThrow(/not both/);
    expect(() => buildClawMuseGoalsPatch({ isolation: "sandbox" })).toThrow(/--isolation/);
    expect(() => buildClawMuseGoalsPatch({ maxConcurrent: "two" })).toThrow(/--max-concurrent/);
    expect(() => buildClawMuseGoalsPatch({})).toThrow(/Nothing to change/);
  });

  it("stores goal settings under the daemon home and prints them back", async () => {
    let output = "";
    const write = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      output += String(chunk);
      return true;
    });
    try {
      await statusCommand().parseAsync(
        ["goals", "set", "--enable", "--planner", "zai/glm-4.6", "--home", paseoHome],
        { from: "user" },
      );
      await statusCommand().parseAsync(["goals", "show", "--home", paseoHome], { from: "user" });
    } finally {
      write.mockRestore();
    }
    expect(output).toContain("Goals: enabled");
    expect(output).toContain("Planner: zai/glm-4.6");
    expect(output).toContain("Executor: claude");
    const config = JSON.parse(readFileSync(path.join(paseoHome, "config.json"), "utf8"));
    expect(config.clawmuseStatus.goals).toEqual({ enabled: true, planner: "zai/glm-4.6" });
  });

  it("takes the host token from stdin or a file, never as an argument", () => {
    const connect = statusCommand().commands.find((command) => command.name() === "connect");
    const help = connect?.helpInformation() ?? "";

    expect(help).toContain("--token-stdin");
    expect(help).toContain("--token-file <path>");
    expect(help).toContain("<url>");
    expect(help).not.toContain("<token>");
    expect(connect?.registeredArguments.map((argument) => argument.name())).toEqual(["url"]);
  });
});

describe("readClawMuseStatusToken", () => {
  it("reads standard input", async () => {
    await expect(
      readClawMuseStatusToken({ tokenStdin: true }, stdinWith(`${TOKEN}\n`)),
    ).resolves.toBe(TOKEN);
  });

  it("reads a file", async () => {
    const tokenFile = path.join(paseoHome, "token");
    writeFileSync(tokenFile, `  ${TOKEN}\n`);

    await expect(readClawMuseStatusToken({ tokenFile })).resolves.toBe(TOKEN);
  });

  it("insists on exactly one source", async () => {
    await expect(readClawMuseStatusToken({})).rejects.toThrow("--token-stdin or --token-file");
    await expect(
      readClawMuseStatusToken({ tokenStdin: true, tokenFile: "/tmp/token" }),
    ).rejects.toThrow("not both");
  });

  it("rejects a token the service would refuse", async () => {
    await expect(readClawMuseStatusToken({ tokenStdin: true }, stdinWith("short"))).rejects.toThrow(
      "at least 32 characters",
    );
  });
});

describe("connectClawMuseStatus", () => {
  it("verifies the token with one host session before persisting anything", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(hostSessionResponse());

    const result = await connectClawMuseStatus(
      { url: "https://status.example/", token: TOKEN, displayName: "workshop", paseoHome },
      request,
    );

    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]![0]).toBe("https://status.example/v1/host/sessions");
    expect(JSON.parse(String(request.mock.calls[0]![1]?.body))).toEqual({
      relayHostId: result.relayHostId,
      displayName: "workshop",
    });
    expect(result.relayHostId).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(showClawMuseStatus(paseoHome)).toMatchObject({
      configured: true,
      baseUrl: "https://status.example",
      displayName: "workshop",
      relayHostId: result.relayHostId,
      hostTokenStored: true,
    });
  });

  it("leaves nothing behind when the service rejects the token", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "invalid_host_token" }), { status: 401 }),
      );

    await expect(
      connectClawMuseStatus(
        { url: "https://status.example", token: TOKEN, displayName: "workshop", paseoHome },
        request,
      ),
    ).rejects.toThrow("clawmuse_status_request_failed_401");
    expect(showClawMuseStatus(paseoHome)).toMatchObject({
      configured: false,
      hostTokenStored: false,
    });
  });

  it("refuses plain HTTP off loopback before the token leaves the machine", async () => {
    const request = vi.fn<typeof fetch>();

    await expect(
      connectClawMuseStatus(
        { url: "http://status.example", token: TOKEN, displayName: "workshop", paseoHome },
        request,
      ),
    ).rejects.toThrow("HTTPS");
    expect(request).not.toHaveBeenCalled();
  });

  it("accepts a loopback service over plain HTTP for local development", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(hostSessionResponse());

    const result = await connectClawMuseStatus(
      { url: "http://127.0.0.1:8787", token: TOKEN, displayName: "workshop", paseoHome },
      request,
    );

    expect(result.baseUrl).toBe("http://127.0.0.1:8787");
  });
});

describe("disconnectClawMuseStatus", () => {
  it("removes the relationship and the stored token", async () => {
    await connectClawMuseStatus(
      { url: "https://status.example", token: TOKEN, displayName: "workshop", paseoHome },
      vi.fn<typeof fetch>().mockResolvedValue(hostSessionResponse()),
    );

    disconnectClawMuseStatus(paseoHome);

    expect(showClawMuseStatus(paseoHome)).toMatchObject({
      configured: false,
      baseUrl: null,
      relayHostId: null,
      hostTokenStored: false,
    });
    expect(readFileSync(path.join(paseoHome, "config.json"), "utf8")).not.toContain(
      "status.example",
    );
  });
});
