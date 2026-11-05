import type { GoalRepo, GoalRepoHost, GoalTarget } from "./types";

/** Sentinel for "any live host" in the host picker; the service sees `null`. */
export const AUTO_HOST_OPTION = "auto";

/** `provider/model` → parts; a bare `provider` has no model. Mirrors the daemon's parser. */
export function splitGoalAgent(agent: string | null): { provider: string; model: string } {
  if (!agent) {
    return { provider: "", model: "" };
  }
  const slash = agent.indexOf("/");
  return slash === -1
    ? { provider: agent, model: "" }
    : { provider: agent.slice(0, slash), model: agent.slice(slash + 1) };
}

export function joinGoalAgent(provider: string, model: string): string | null {
  const trimmedProvider = provider.trim();
  if (!trimmedProvider) {
    return null;
  }
  const trimmedModel = model.trim();
  return trimmedModel ? `${trimmedProvider}/${trimmedModel}` : trimmedProvider;
}

/**
 * What a form starts with: the goal's own target when it has one, otherwise the
 * repository's remembered choice for this kind of run. A remembered host that
 * no longer has the repository is dropped, matching the service.
 */
export function initialGoalTarget(input: {
  repo: GoalRepo | null;
  kind: "plan" | "execute";
  own?: GoalTarget | null;
}): GoalTarget {
  const repo = input.repo;
  const ownHost = input.own?.hostId ?? null;
  const ownAgent = input.own?.agent ?? null;
  const rememberedAgent = input.kind === "plan" ? repo?.planAgent : repo?.executeAgent;
  const candidateHost = ownHost ?? repo?.preferredHostId ?? null;
  const hostStillHasRepo =
    candidateHost !== null && (repo?.hosts.some((host) => host.hostId === candidateHost) ?? false);
  return {
    hostId: hostStillHasRepo ? candidateHost : null,
    agent: ownAgent ?? rememberedAgent ?? null,
  };
}

/**
 * The host whose provider list feeds the model picker: the chosen host, or for
 * automatic placement the first live host this client is paired with.
 */
export function resolveModelSourceHost(input: {
  repo: GoalRepo | null;
  hostId: string | null;
  serverIdForRelayHost: (relayHostId: string) => string | null;
}): { host: GoalRepoHost; serverId: string } | null {
  const hosts = input.repo?.hosts ?? [];
  const ordered =
    input.hostId === null
      ? [...hosts].sort(
          (left, right) =>
            Number(right.connectivity === "live") - Number(left.connectivity === "live"),
        )
      : hosts.filter((host) => host.hostId === input.hostId);
  for (const host of ordered) {
    const serverId = host.relayHostId ? input.serverIdForRelayHost(host.relayHostId) : null;
    if (serverId) {
      return { host, serverId };
    }
  }
  return null;
}
