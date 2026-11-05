// The single definition of where over-the-air updates come from and when they
// are off. Do not re-derive this anywhere else — a build that silently resolves
// a different channel ships JS to the wrong audience, and nothing fails loudly.
//
// F-Droid is never eligible: that channel publishes an APK built from source and
// has to be able to reproduce what runs, which a bundle fetched at runtime is
// not. See docs/ota-updates.md.

const DEVELOPMENT_CHANNEL = "development";
const PRODUCTION_CHANNEL = "production";

function resolveUpdateChannel(params) {
  const override = typeof params.channelOverride === "string" ? params.channelOverride.trim() : "";
  if (override.length > 0) {
    return override;
  }
  return params.appVariant === "development" ? DEVELOPMENT_CHANNEL : PRODUCTION_CHANNEL;
}

/**
 * The `expo.updates` block. Without an EAS project there is nothing to fetch
 * from, so the build gets updates off rather than a URL it cannot resolve.
 */
function resolveUpdatesConfig(params) {
  const projectId = typeof params.easProjectId === "string" ? params.easProjectId.trim() : "";
  if (params.isFdroidBuild || projectId.length === 0) {
    return { enabled: false };
  }
  return {
    url: `https://u.expo.dev/${projectId}`,
    // EAS Build stamps the channel from eas.json and overrides this. The header
    // is what gives the Mac fastlane release a channel, since that build never
    // goes through EAS Build.
    requestHeaders: { "expo-channel-name": resolveUpdateChannel(params) },
  };
}

module.exports = {
  DEVELOPMENT_CHANNEL,
  PRODUCTION_CHANNEL,
  resolveUpdateChannel,
  resolveUpdatesConfig,
};
