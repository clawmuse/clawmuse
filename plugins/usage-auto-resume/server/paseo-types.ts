import type { PluginHandlerContext } from "@getpaseo/plugin/server";

// Paseo provides only @getpaseo/plugin to installed plugins, so derive the rest from it.
export type PaseoApi = PluginHandlerContext["paseo"];
export type PaseoAgent = NonNullable<
  Awaited<ReturnType<ReturnType<PaseoApi["agents"]["ref"]>["refresh"]>>
>["agent"];
export type AgentTimelineItem = Awaited<
  ReturnType<ReturnType<PaseoApi["agents"]["ref"]>["timeline"]["refetch"]>
>["entries"][number]["item"];
