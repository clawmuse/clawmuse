#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "${APP_ROOT}/../.." && pwd)"
SIGNING_DIR="${HOME}/.private_keys/clawmuse-android"
SIGNING_ENV="${CLAWMUSE_ANDROID_SIGNING_ENV:-${SIGNING_DIR}/release.env}"

[ -n "${EAS_PROJECT_ID:-}" ] || {
  echo 'EAS_PROJECT_ID is required for production OTA updates.' >&2
  exit 1
}
[ -z "${EXPO_PUBLIC_LOCAL_DAEMON:-}" ] || {
  echo 'Unset EXPO_PUBLIC_LOCAL_DAEMON before a production release.' >&2
  exit 1
}

for tool in node npm java keytool; do
  command -v "$tool" >/dev/null || { echo "Missing Android build tool: $tool" >&2; exit 1; }
done
export ANDROID_HOME="${ANDROID_HOME:-${HOME}/Library/Android/sdk}"
[ -d "$ANDROID_HOME" ] || { echo "ANDROID_HOME is missing" >&2; exit 1; }

if [ ! -f "$SIGNING_ENV" ]; then
  # The first ClawMuse Android distribution owns its own application id and key.
  # Never replace an existing key when only its environment file is missing.
  [ "$SIGNING_ENV" = "$SIGNING_DIR/release.env" ] || { echo "Signing env file is missing: $SIGNING_ENV" >&2; exit 1; }
  [ ! -e "$SIGNING_DIR/release.keystore" ] || { echo "Existing keystore found; restore its signing env instead of generating another key." >&2; exit 1; }
  umask 077
  mkdir -p "$SIGNING_DIR"
  export CLAWMUSE_ANDROID_KEYSTORE_PATH="$SIGNING_DIR/release.keystore"
  export CLAWMUSE_ANDROID_KEYSTORE_PASSWORD="$(node -p 'require("node:crypto").randomBytes(32).toString("hex")')"
  export CLAWMUSE_ANDROID_KEY_PASSWORD="$CLAWMUSE_ANDROID_KEYSTORE_PASSWORD"
  export CLAWMUSE_ANDROID_KEY_ALIAS=clawmuse
  keytool -genkeypair -noprompt -storetype PKCS12 -keyalg RSA -keysize 3072 -validity 10000 \
    -dname 'CN=ClawMuse' -keystore "$CLAWMUSE_ANDROID_KEYSTORE_PATH" \
    -alias "$CLAWMUSE_ANDROID_KEY_ALIAS" -storepass:env CLAWMUSE_ANDROID_KEYSTORE_PASSWORD \
    -keypass:env CLAWMUSE_ANDROID_KEY_PASSWORD
  for name in CLAWMUSE_ANDROID_KEYSTORE_PATH CLAWMUSE_ANDROID_KEYSTORE_PASSWORD CLAWMUSE_ANDROID_KEY_ALIAS CLAWMUSE_ANDROID_KEY_PASSWORD; do
    printf '%s=%q\n' "$name" "${!name}" >> "$SIGNING_ENV"
  done
fi
set -a
# shellcheck disable=SC1090
. "$SIGNING_ENV"
set +a
[ -f "$CLAWMUSE_ANDROID_KEYSTORE_PATH" ] || { echo 'The release keystore is missing.' >&2; exit 1; }

export APP_VARIANT=production
export ANDROID_APPLICATION_ID=com.clawmuse
export CI=1
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"
cd "$REPO_ROOT"
npm run build:app-deps
cd "$APP_ROOT"
npx expo prebuild --platform android --no-install
cd android
# Finish Metro/Hermes before the native compilation competes for memory.
./gradlew --no-daemon --max-workers 2 --init-script "$APP_ROOT/scripts/android-release-signing.gradle" \
  :app:createBundleReleaseJsAndAssets
./gradlew --no-daemon --max-workers 2 --init-script "$APP_ROOT/scripts/android-release-signing.gradle" \
  :app:assembleRelease -x lint -x lintVitalAnalyzeRelease -x lintVitalRelease \
  -x generateReleaseLintModel -x generateReleaseLintVitalModel \
  -PreactNativeArchitectures=armeabi-v7a,arm64-v8a,x86_64
version="$(node -p "require('${APP_ROOT}/package.json').version")"
mkdir -p "$APP_ROOT/build"
output="$APP_ROOT/build/ClawMuse-${version}-android.apk"
cp app/build/outputs/apk/release/app-release.apk "$output"
apksigner="$(find "$ANDROID_HOME/build-tools" -name apksigner -type f | sort | tail -1)"
"$apksigner" verify --verbose --print-certs "$output"
printf 'Signed Android installer: %s\n' "$output"
