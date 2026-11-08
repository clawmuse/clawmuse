# Over-the-air updates

The mobile app fetches JS bundles from EAS Update at launch. A published update
reaches phones without an App Store review or a TestFlight build, which is the
only way a JS-only fix lands the same day.

## What an update can carry

JS, TypeScript, and assets bundled by Metro. Nothing else.

Anything that changes the native project needs a real build and a store release:
a new native module, the Live Activity extension, `app.json` permissions and
capabilities, Expo SDK upgrades, icons, the splash screen. `runtimeVersion` is
what enforces this — see below.

## runtimeVersion is a fingerprint

`packages/app/app.config.js` sets `runtimeVersion: { policy: "fingerprint" }`.
The fingerprint is computed from the native side of the project, so an update
only reaches a binary whose native state is identical to the one it was
published from. A bundle that calls a native module the installed app does not
have can never be delivered to it.

The cost is that any native change produces a new fingerprint, and phones on the
old binary stop receiving updates until they install a new build. That is the
intended failure mode: no update is better than one that crashes on launch.

Publish from a tree whose native side matches the binary. A publish from a tree
with different native dependencies lands under a fingerprint nobody is running,
and silently reaches nobody.

The resolved Expo config is part of the fingerprint, and that config carries the
iOS build number. Every TestFlight build from the Mac is its own runtime, even
with no native change: 12000013 and 12000014 of the same commit get different
fingerprints. An iOS publish therefore targets one build, and has to run with
the environment that build was made with — `APP_VARIANT=production`,
`EAS_PROJECT_ID`, and `CLAWMUSE_IOS_BUILD_NUMBER` set to the installed build.
Check before publishing: the installed value is in
`<archive>/Products/Applications/ClawMuse.app/EXUpdates.bundle/fingerprint`, and
`npx expo-updates fingerprint:generate --platform ios` under that environment
must print the same `hash`.

## Channels

| Build                                                                  | Where its channel comes from                                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| EAS Build — the tag-triggered store builds in [release.md](release.md) | `channel` in `packages/app/eas.json`                                                               |
| Local iOS and Android releases from the Mac                            | `expo-channel-name` in the `updates.requestHeaders` that `packages/app/updates-config.js` resolves |

Two sources because the local release scripts do not use EAS Build. For iOS,
see [ios-release-from-mac.md](ios-release-from-mac.md). Keep them naming the same
channels. `CLAWMUSE_UPDATE_CHANNEL` overrides the resolved one for a one-off
build.

Updates are off when `EAS_PROJECT_ID` is unset, because there is no project to
fetch from. Local iOS and Android release scripts require this variable; neither
may silently produce a production binary without OTA enabled.

## F-Droid never gets updates

F-Droid publishes an APK it built from source and must be able to reproduce what
runs on the device. A bundle fetched at runtime is not in that APK.

`PASEO_FDROID_BUILD=1` therefore disables updates in the config _and_ drops
`expo-updates` from Android autolinking, so the code that could fetch a bundle is
not in the artifact at all. `packages/app/updates-config.test.ts` holds that
invariant. Do not make it conditional on anything.

## Publishing

Log into the Expo account that owns the configured project on the publishing
Mac (`npx eas-cli login`). App Store Connect credentials do not authenticate to
Expo. Keep the login or an `EXPO_TOKEN` outside the repository.

Publish from the Mac that built the target binary: local patches to native
packages also participate in the fingerprint. Use the archive for the build
installed on the phone:

```bash
cd packages/app
node scripts/publish-ios-update.mjs \
  --archive "/path/to/ClawMuse.xcarchive" \
  --check
node scripts/publish-ios-update.mjs \
  --archive "/path/to/ClawMuse.xcarchive" \
  --message "what changed"
```

The command reads the project, channel, and build number from the archive,
checks the source fingerprint against the binary, then publishes an iOS update
with the production EAS environment. A mismatch stops publication. Do not force
the archive's runtime onto incompatible sources. Keep EAS environment variables
consistent with the native build.

Expo also fingerprints `package.json` scripts. Adding a convenience npm alias
can change the runtime even when the native dependencies did not change; invoke
the publisher with Node directly when targeting an existing binary.

The branch maps to a channel in the EAS dashboard. Phones pick the update up on
their next cold start: the running launch uses the cached bundle, downloads the
new one in the background, and applies it on the launch after that. Returning
from the background is not a cold start.

On mobile, **Settings → About → App updates** shows the native build number,
the running OTA update ID (or the embedded bundle), and its timestamp. Downloaded
updates are shown separately until applied. **Check for updates** downloads a
compatible update; **Restart to update** asks for confirmation before reloading
the client. This does not restart the host daemon or its agents. A failed update
check does not mean the installed version is current. Disabled builds cannot
check for updates; F-Droid still excludes the native updater entirely.

## This widens the version drift

[protocol-compatibility.md](protocol-compatibility.md) already assumes the app
and the daemon are months apart. Updates make the app side move faster and
without the user noticing, so a capability the app gained this afternoon may meet
a daemon from last quarter. Nothing about the rules changes — gate on
`server_info.features.*`, keep wire schemas compatible both ways — but they now
get exercised harder.

## Bootstrap

Only a binary built after updates were configured can receive them. Installs
predating that build ignore every publish until they are replaced through
TestFlight or a store.
