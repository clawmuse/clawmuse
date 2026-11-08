import { createServer, type ServerResponse } from "node:http";
import { getGitHubStars } from "./github-stars";
import { describe, expect, it } from "vitest";
import {
  getLatestAndroidVersionFromReleases,
  selectReleaseChannels,
  type GitHubRelease,
} from "./latest-release";

function release({
  version,
  hasApk,
  prerelease = false,
}: {
  version: string;
  hasApk: boolean;
  prerelease?: boolean;
}): GitHubRelease {
  const tag = `v${version}`;
  return {
    tag_name: tag,
    assets: hasApk ? [{ name: `paseo-${tag}-android.apk` }] : [],
    prerelease,
    draft: false,
  };
}

function desktopRelease({
  version,
  prerelease = false,
  draft = false,
}: {
  version: string;
  prerelease?: boolean;
  draft?: boolean;
}): GitHubRelease {
  return {
    tag_name: `v${version}`,
    assets: [
      { name: `Paseo-${version}-arm64.dmg` },
      { name: "Paseo-x86_64.AppImage" },
      { name: `Paseo-Setup-${version}-x64.exe` },
      { name: `Paseo-Setup-${version}-arm64.exe` },
    ],
    prerelease,
    draft,
  };
}

describe("getLatestAndroidVersionFromReleases", () => {
  it("selects the latest stable release that contains an Android APK", () => {
    const releases = [
      release({ version: "0.1.109", hasApk: true, prerelease: true }),
      release({ version: "0.1.108", hasApk: false }),
      release({ version: "0.1.107", hasApk: true }),
    ];

    expect(getLatestAndroidVersionFromReleases(releases)).toBe("0.1.107");
  });
});

describe("selectReleaseChannels", () => {
  it("offers the newest prerelease when it leads stable", () => {
    const channels = selectReleaseChannels([
      desktopRelease({ version: "0.3.0-beta.2", prerelease: true }),
      desktopRelease({ version: "0.3.0-beta.1", prerelease: true }),
      desktopRelease({ version: "0.2.5" }),
    ]);

    expect(channels.stable.version).toBe("0.2.5");
    expect(channels.beta?.version).toBe("0.3.0-beta.2");
    expect(channels.beta?.windowsArm64Asset).toBe("Paseo-Setup-0.3.0-beta.2-arm64.exe");
  });

  it("retires the beta channel once stable ships the same version", () => {
    const channels = selectReleaseChannels([
      desktopRelease({ version: "0.3.0" }),
      desktopRelease({ version: "0.3.0-beta.2", prerelease: true }),
    ]);

    expect(channels.stable.version).toBe("0.3.0");
    expect(channels.beta).toBeNull();
  });

  it("skips drafts and releases whose desktop assets are still uploading", () => {
    const channels = selectReleaseChannels([
      desktopRelease({ version: "0.3.0-beta.3", prerelease: true, draft: true }),
      release({ version: "0.3.0-beta.2", hasApk: true, prerelease: true }),
      desktopRelease({ version: "0.3.0-beta.1", prerelease: true }),
      release({ version: "0.2.5", hasApk: true }),
      desktopRelease({ version: "0.2.4" }),
    ]);

    expect(channels.stable.version).toBe("0.2.4");
    expect(channels.beta?.version).toBe("0.3.0-beta.1");
  });
});

async function withGitHubResponse(
  status: number,
  body: unknown,
  run: (request: typeof fetch) => Promise<void>,
) {
  const server = createServer((_request, response) => {
    response.writeHead(status, { "content-type": "application/json" });
    if (typeof body === "function") body(response);
    else response.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test server address");
  try {
    await run((_input, init) => fetch(`http://127.0.0.1:${address.port}/repo`, init));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

describe("GitHub stars in the shared page header", () => {
  it.each([403, 504])("omits an unavailable count when GitHub returns %i", async (status) => {
    await withGitHubResponse(status, { message: "Unavailable" }, async (request) => {
      await expect(
        getGitHubStars({ cache: null, waitUntil: () => undefined }, request),
      ).resolves.toBe("");
    });
  });

  it.each([
    [0, "0"],
    [999, "999"],
    [1000, "1k"],
    [1250, "1.3k"],
  ])("formats a valid count of %i", async (count, formatted) => {
    await withGitHubResponse(200, { stargazers_count: count }, async (request) => {
      await expect(
        getGitHubStars({ cache: null, waitUntil: () => undefined }, request),
      ).resolves.toBe(formatted);
    });
  });

  it.each([
    null,
    {},
    { stargazers_count: -1 },
    { stargazers_count: 1.5 },
    { stargazers_count: "12" },
    { stargazers_count: Number.MAX_SAFE_INTEGER + 1 },
  ])("omits invalid star data %j", async (body) => {
    await withGitHubResponse(200, body, async (request) => {
      await expect(
        getGitHubStars({ cache: null, waitUntil: () => undefined }, request),
      ).resolves.toBe("");
    });
  });

  it("omits malformed JSON", async () => {
    await withGitHubResponse(
      200,
      (response: ServerResponse) => response.end("not json"),
      async (request) => {
        await expect(
          getGitHubStars({ cache: null, waitUntil: () => undefined }, request),
        ).resolves.toBe("");
      },
    );
  });

  it("bounds the wait even when the response body never finishes", async () => {
    await withGitHubResponse(
      200,
      (response: ServerResponse) => response.write('{"stargazers_count":'),
      async (request) => {
        await expect(
          getGitHubStars({ cache: null, waitUntil: () => undefined }, request),
        ).resolves.toBe("");
      },
    );
  });

  it("omits stars when the connection closes without a response", async () => {
    await withGitHubResponse(
      200,
      (response: ServerResponse) => response.destroy(),
      async (request) => {
        await expect(
          getGitHubStars({ cache: null, waitUntil: () => undefined }, request),
        ).resolves.toBe("");
      },
    );
  });
});
