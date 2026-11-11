import { IDENTITY_COLOR_NAMES, type IdentityColorName } from "@/styles/identity-colors";
import type { HostProfile } from "@/types/host-connection";
import { z } from "zod";

export type HostColor = "none" | IdentityColorName;

export const HOST_COLORS: readonly HostColor[] = ["none", ...IDENTITY_COLOR_NAMES];

export type HostBadgeDisplay = "name" | "icon" | "hidden";

export const HOST_BADGE_DISPLAYS: readonly HostBadgeDisplay[] = ["name", "icon", "hidden"];

/**
 * Host presentation cache. Color and badge display are per-device; account directory
 * visibility is refreshed by the account model. `badgeDisplay` is null while the user has not chosen,
 * because the default differs by host (local hides, remote shows) and local-ness is only
 * knowable from a desktop-only async query — never at parse time.
 *
 * `hidden` drops the host from pickers and sidebar lists without touching its connection,
 * workspaces, or settings entry. Read it through `useVisibleHosts`, never `useHosts` —
 * the registry still has to see every host to keep it connected and manageable.
 */
export interface HostAppearance {
  color: HostColor;
  badgeDisplay: HostBadgeDisplay | null;
  hidden: boolean;
}

export const HostAppearanceSchema: z.ZodType<HostAppearance> = z.strictObject({
  color: z.enum(["none", ...IDENTITY_COLOR_NAMES]),
  badgeDisplay: z.enum(["name", "icon", "hidden"]).nullable(),
  hidden: z.boolean().default(false),
});

export function defaultHostAppearance(): HostAppearance {
  return { color: "none", badgeDisplay: null, hidden: false };
}

export function normalizeStoredHostAppearance(value: unknown): HostAppearance {
  const result = HostAppearanceSchema.safeParse(value);
  return result.success ? result.data : defaultHostAppearance();
}

export function resolveHostBadgeDisplay(input: {
  appearance: HostAppearance;
  isLocalHost: boolean;
  localHostResolutionPending?: boolean;
}): HostBadgeDisplay | null {
  if (input.appearance.badgeDisplay) {
    return input.appearance.badgeDisplay;
  }
  if (input.localHostResolutionPending) {
    return null;
  }
  return input.isLocalHost ? "hidden" : "name";
}

export interface HostBadgeModel {
  serverId: string;
  label: string;
  color: HostColor;
  showLabel: boolean;
}

export type HostAppearanceSource = Pick<HostProfile, "serverId" | "label" | "appearance">;

/**
 * The sidebar's whole host-badge decision, resolved once per host list. Rows look their
 * badge up by serverId and render whatever they find; a host that should show no badge is
 * simply absent from the map.
 */
export function selectHostBadges(input: {
  hosts: readonly HostAppearanceSource[];
  localServerId: string | null;
  localHostResolutionPending?: boolean;
  enabled: boolean;
}): ReadonlyMap<string, HostBadgeModel> {
  const badges = new Map<string, HostBadgeModel>();
  if (!input.enabled) {
    return badges;
  }
  for (const host of input.hosts) {
    const display = resolveHostBadgeDisplay({
      appearance: host.appearance,
      isLocalHost: host.serverId === input.localServerId,
      localHostResolutionPending: input.localHostResolutionPending,
    });
    if (display === null || display === "hidden") {
      continue;
    }
    badges.set(host.serverId, {
      serverId: host.serverId,
      label: host.label.trim() || host.serverId,
      color: host.appearance.color,
      showLabel: display === "name",
    });
  }
  return badges;
}
