import { getBlockingColdCache, type WebsiteCacheContext } from "./github-cache";

function formatStars(count: number): string {
  if (count < 1000) return String(count);
  const k = count / 1000;
  return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
}

const GITHUB_REPO_URL = "https://api.github.com/repos/getpaseo/paseo";
const STARS_CACHE_KEY = "github-stars:v1";

async function fetchStarCount(request: typeof fetch): Promise<string> {
  const res = await request(GITHUB_REPO_URL, {
    signal: AbortSignal.timeout(2000),
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "paseo-website",
    },
    cf: {
      cacheEverything: true,
      cacheTtl: 60,
      cacheKey: "github-repo-stars",
    },
  } as RequestInit);
  if (!res.ok) throw new Error(`github repo ${res.status}`);

  const repo: unknown = await res.json();
  if (
    typeof repo !== "object" ||
    repo === null ||
    !("stargazers_count" in repo) ||
    typeof repo.stargazers_count !== "number" ||
    !Number.isSafeInteger(repo.stargazers_count) ||
    repo.stargazers_count < 0
  ) {
    throw new Error("Invalid GitHub star count");
  }
  return formatStars(repo.stargazers_count);
}

function isStars(value: unknown): value is string {
  return typeof value === "string" && /^(\d+|\d+\.\d+k|\d+k)$/.test(value);
}

export async function getGitHubStars(
  context: WebsiteCacheContext,
  request: typeof fetch = fetch,
): Promise<string> {
  try {
    return await getBlockingColdCache({
      context,
      key: STARS_CACHE_KEY,
      isValue: isStars,
      fetchFresh: () => fetchStarCount(request),
    });
  } catch {
    // Stars are optional page decoration. Keep failures outside the cache so a
    // failed background refresh cannot replace a previously valid count.
    return "";
  }
}
