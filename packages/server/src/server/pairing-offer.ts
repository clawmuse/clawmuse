import { RemoteAccess } from "./remote-access.js";
import { brand } from "../brand.generated.js";
import type { Logger } from "pino";

import { createConnectionOfferV2, encodeOfferToFragmentUrl } from "./connection-offer.js";
import { loadOrCreateDaemonKeyPair } from "./daemon-keypair.js";
import { renderPairingQr } from "./pairing-qr.js";
import { getOrCreateServerId } from "./server-id.js";
import { getHostedRelayPublicEndpoint } from "./regional-relay.js";

export interface LocalPairingOffer {
  relayEnabled: boolean;
  url: string | null;
  qr: string | null;
}

export async function generateLocalPairingOffer(args: {
  paseoHome: string;
  relayEnabled?: boolean;
  relayEndpoint?: string;
  relayPublicEndpoint?: string;
  relayUseTls?: boolean;
  relayPublicUseTls?: boolean;
  /** Stamp the offer so new clients require protected endpoint security from their first handshake. */
  relayRequireProtectedSecurity?: boolean;
  appBaseUrl?: string;
  includeQr?: boolean;
  logger?: Logger;
}): Promise<LocalPairingOffer> {
  const relayEnabled = args.relayEnabled ?? true;
  if (!relayEnabled) {
    return {
      relayEnabled: false,
      url: null,
      qr: null,
    };
  }

  const relayEndpoint = args.relayEndpoint ?? brand.relayEndpoint;
  const relayPublicEndpoint =
    args.relayPublicEndpoint ?? getHostedRelayPublicEndpoint(relayEndpoint);
  const relayUseTls = args.relayUseTls ?? relayEndpoint === brand.relayEndpoint;
  const relayPublicUseTls = args.relayPublicUseTls ?? relayUseTls;
  const appBaseUrl = args.appBaseUrl ?? brand.appBaseUrl;
  const serverId = getOrCreateServerId(args.paseoHome, { logger: args.logger });
  const daemonKeyPair = await loadOrCreateDaemonKeyPair(args.paseoHome, args.logger);
  const access = new RemoteAccess(args.paseoHome);
  const offer = await createConnectionOfferV2({
    requiresAuthorization: access.enabled,
    serverId,
    daemonPublicKeyB64: daemonKeyPair.publicKeyB64,
    relay: { endpoint: relayPublicEndpoint, useTls: relayPublicUseTls },
    ...(args.relayRequireProtectedSecurity === true || access.enabled
      ? { minimumSecurityMode: "protected" as const }
      : {}),
  });
  const url = encodeOfferToFragmentUrl({ offer, appBaseUrl });

  if (args.includeQr === false) {
    return {
      relayEnabled: true,
      url,
      qr: null,
    };
  }

  let qr: string | null = null;
  try {
    qr = await renderPairingQr(url);
  } catch (error) {
    args.logger?.debug({ error }, "Failed to render pairing QR");
  }

  return {
    relayEnabled: true,
    url,
    qr,
  };
}
