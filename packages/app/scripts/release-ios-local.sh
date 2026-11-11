#!/usr/bin/env bash
# Release ClawMuse to TestFlight from a Mac, without GitHub Actions or EAS.
#
# Ported from the EndToAI/Orca fork (agent/mobile/scripts/release-ios-local.sh).
# Uses the signing identity already in the login keychain, so the throwaway-
# keychain dance a hosted runner needs is unnecessary. For an unattended runner,
# set CLAWMUSE_IOS_KEYCHAIN_PATH and CLAWMUSE_IOS_KEYCHAIN_PASSWORD instead.
#
# Credentials load from ~/.private_keys/appstoreconnect.env, matching the other
# EndToAI release jobs. Nothing secret is read from, or written to, the repository.
# See docs/ios-release-from-mac.md.
#
# The marketing version is whatever packages/app/package.json says — cut a
# release (docs/release.md) to change it. This script only resolves the build
# number and never edits a tracked file.
#
#   ./scripts/release-ios-local.sh                 build, upload, release to internal testers
#   ./scripts/release-ios-local.sh --distribute    also release it to the external testers
#   ./scripts/release-ios-local.sh --keep-version  reuse the build number already resolved
#   ./scripts/release-ios-local.sh --keep-native   reuse the existing ios/ instead of regenerating
set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "${APP_ROOT}/../.." && pwd)"
ASC_ENV_FILE="${CLAWMUSE_IOS_ASC_ENV:-${HOME}/.private_keys/appstoreconnect.env}"
RELEASE_VERSION_FILE="${APP_ROOT}/build/ios-release-version.json"

distribute=0
keep_version=0
keep_native=0
changelog="${TESTFLIGHT_CHANGELOG:-}"

while [ $# -gt 0 ]; do
  case "$1" in
    --distribute) distribute=1 ;;
    --keep-version) keep_version=1 ;;
    --keep-native) keep_native=1 ;;
    --changelog) changelog="${2:?--changelog needs a value}"; shift ;;
    -h|--help) awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown option: $1 (try --help)" >&2; exit 2 ;;
  esac
  shift
done

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
die() { printf '\033[31merror:\033[0m %s\n' "$1" >&2; exit 1; }

# ── Preflight ────────────────────────────────────────────────────────────────
[ "$(uname -s)" = "Darwin" ] || die "iOS releases need macOS with Xcode; this is $(uname -s)."

if [ -f "${ASC_ENV_FILE}" ]; then
  # shellcheck disable=SC1090
  set -a; . "${ASC_ENV_FILE}"; set +a
else
  echo "note: ${ASC_ENV_FILE} not found; expecting the credentials in the environment."
fi

for tool in xcodebuild node npm bundle pod; do
  command -v "$tool" >/dev/null 2>&1 || die "\`${tool}\` is not on PATH. See docs/ios-release-from-mac.md."
done

# 0.12.0 (12000012) shipped from a branch that had forked from main and silently dropped 16
# fixes. A hotfix cut from a tag sets CLAWMUSE_IOS_ALLOW_BEHIND_MAIN=1 on purpose.
if [ "${CLAWMUSE_IOS_ALLOW_BEHIND_MAIN:-0}" != "1" ]; then
  git -C "${REPO_ROOT}" fetch --quiet origin main || die "could not fetch origin/main to check the release base."
  missing="$(git -C "${REPO_ROOT}" rev-list --count HEAD..origin/main)"
  [ "${missing}" = "0" ] || die "HEAD is missing ${missing} commit(s) from origin/main; merge main first (git log HEAD..origin/main)."
fi

# Listed one by one rather than through indirect expansion: macOS still ships
# bash 3.2 as /bin/bash, and this reports every missing name in one pass.
missing=""
[ -n "${ASC_KEY_ID:-}" ] || missing="${missing} ASC_KEY_ID"
[ -n "${ASC_ISSUER_ID:-}" ] || missing="${missing} ASC_ISSUER_ID"
[ -n "${ASC_API_KEY_P8:-}" ] || [ -n "${ASC_KEY_PATH:-}" ] || missing="${missing} ASC_KEY_PATH"
APPLE_TEAM_ID="${APPLE_TEAM_ID:-2G7W265XBV}"
export APPLE_TEAM_ID
# Not a secret, but the bundle bakes it in: without it getExpoPushTokenAsync
# fails at runtime and per-agent push notifications silently never arrive.
[ -n "${EAS_PROJECT_ID:-}" ] || missing="${missing} EAS_PROJECT_ID"
[ -z "${missing}" ] || die "unset:${missing}. Configure the shared App Store Connect env or export the values."

if [ -z "${ASC_API_KEY_P8:-}" ] && [ -n "${ASC_KEY_PATH:-}" ]; then
  [ -r "${ASC_KEY_PATH}" ] || die "ASC_KEY_PATH is not readable: ${ASC_KEY_PATH}."
  ASC_API_KEY_P8="$(base64 -i "${ASC_KEY_PATH}" | tr -d '\n')"
  export ASC_API_KEY_P8
fi

export EAS_PROJECT_ID
export APP_VARIANT=production
[ -z "${EXPO_PUBLIC_LOCAL_DAEMON:-}" ] || die "unset EXPO_PUBLIC_LOCAL_DAEMON before a production release; it overrides the user's host."
export FASTLANE_SKIP_UPDATE_CHECK=1
export FASTLANE_HIDE_CHANGELOG=1
[ -n "${changelog}" ] && export TESTFLIGHT_CHANGELOG="${changelog}"
# `bundle install` may only resolve to the committed versions, but the lockfile
# is created by the first run on a Mac and cannot exist before then.
[ -f "${APP_ROOT}/Gemfile.lock" ] && export BUNDLE_FROZEN=true

# Pin signing to the login keychain. The user keychain search list on this Mac starts
# with a shared runner keychain that also carries the same Apple Distribution cert but a
# key codesign cannot reach, and resolving the identity through that list lands on the
# unreachable copy (errSecInternalComponent). --keychain picks the login copy directly.
CLAWMUSE_IOS_KEYCHAIN_PATH="${CLAWMUSE_IOS_KEYCHAIN_PATH:-${HOME}/Library/Keychains/login.keychain-db}"
export CLAWMUSE_IOS_KEYCHAIN_PATH
unset CLAWMUSE_IOS_KEYCHAIN_PASSWORD

echo "team ${APPLE_TEAM_ID} · keychain ${CLAWMUSE_IOS_KEYCHAIN_PATH}"

cd "${APP_ROOT}"

# The React Native and Hermes podspecs download ~150 MB of prebuilt tarballs with plain `curl`
# and no retry. From the release Mac, Maven and repo.reactnative.dev drop TLS handshakes now
# and then (curl exit 35); a dropped Hermes download leaves an empty Pods/hermes-engine that
# only fails at archive time. Every curl in this build reads this config.
CURL_HOME="$(mktemp -d)"
printf '%s\n' 'retry = 6' 'retry-all-errors' 'retry-delay = 5' 'connect-timeout = 30' >"${CURL_HOME}/.curlrc"
export CURL_HOME

# ── Build ────────────────────────────────────────────────────────────────────
step "Install JS dependencies"
npm --prefix "${REPO_ROOT}" ci

step "Build the workspace packages the app bundles"
npm --prefix "${REPO_ROOT}" run build:app-deps

step "Install fastlane"
bundle install

if [ "${keep_version}" -eq 0 ]; then
  step "Resolve the release version and next build number"
  bundle exec fastlane ios prepare_release_version
else
  step "Keeping the build number already in ${RELEASE_VERSION_FILE}"
fi

[ -f "${RELEASE_VERSION_FILE}" ] || die "${RELEASE_VERSION_FILE} is missing; run without --keep-version."
version="$(node -p "require('${RELEASE_VERSION_FILE}').version")"
build_number="$(node -p "require('${RELEASE_VERSION_FILE}').buildNumber")"
# app.config.js reads this instead of a tracked file being rewritten per release.
export CLAWMUSE_IOS_BUILD_NUMBER="${build_number}"
echo "releasing ${version} (${build_number})"

if [ "${keep_native}" -eq 0 ]; then
  # ios/ is gitignored generated output; a stale one is the usual cause of a
  # local build diverging. --keep-native trades that for a faster loop.
  step "Expo prebuild (clean)"
  npx expo prebuild --platform ios --clean --no-install
else
  step "Expo prebuild (reusing ios/)"
  npx expo prebuild --platform ios --no-install
fi

step "Install CocoaPods"
pod install --project-directory=ios
[ -d ios/Pods/hermes-engine/destroot/Library/Frameworks/universal/hermesvm.xcframework ] \
  || die "pod install left no Hermes framework (its tarball download failed); rerun the release."

step "Build, sign, and upload"
bundle exec fastlane ios build_and_upload

step "Release to internal testers"
bundle exec fastlane ios distribute_internal_testflight version:"${version}" build_number:"${build_number}"

if [ "${distribute}" -eq 1 ]; then
  step "Distribute to external testers"
  bundle exec fastlane ios distribute_testflight version:"${version}" build_number:"${build_number}"
else
  echo
  echo "Released ${version} (${build_number}) to internal testers; it is not yet released to external testers."
  echo "To distribute this processed build externally:"
  echo "  bundle exec fastlane ios distribute_testflight version:${version} build_number:${build_number}"
fi

printf '\n\033[32mdone\033[0m — %s (%s)\n' "${version}" "${build_number}"
