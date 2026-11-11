import { createServerFn } from "@tanstack/react-start";
import { getWebsiteCacheContext } from "./cloudflare-cache";
import { getGitHubStars } from "./github-stars";

export const getStarCount = createServerFn({ method: "GET" }).handler(async () => ({
  stars: await getGitHubStars(getWebsiteCacheContext()),
}));
