#!/usr/bin/env bash
# Ported from the EndToAI/Orca fork (agent/mobile/scripts/verify-ios-release-signing.sh).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
/bin/bash "${SCRIPT_DIR}/unlock-ios-release-keychain.sh"

keychain_path="${CLAWMUSE_IOS_KEYCHAIN_PATH:-}"
[ -n "${APPLE_TEAM_ID:-}" ] || {
  echo "error: APPLE_TEAM_ID is required to select the distribution identity." >&2
  exit 1
}
if [ -n "${keychain_path}" ]; then
  identity="$(security find-identity -v -p codesigning "${keychain_path}" | awk -v team="${APPLE_TEAM_ID}" '/Apple Distribution/ && index($0, "(" team ")") { print $2; exit }')"
else
  identity="$(security find-identity -v -p codesigning | awk -v team="${APPLE_TEAM_ID}" '/Apple Distribution/ && index($0, "(" team ")") { print $2; exit }')"
fi

[ -n "${identity}" ] || {
  if [ -n "${keychain_path}" ]; then
    echo "error: No valid Apple Distribution identity in ${keychain_path}." >&2
  else
    echo 'error: No valid Apple Distribution identity in the user keychain search list.' >&2
  fi
  exit 1
}

probe="$(mktemp "${TMPDIR:-/tmp}/clawmuse-codesign.XXXXXX")"
trap 'unlink "${probe}"' EXIT
cp /usr/bin/true "${probe}"
if [ -n "${keychain_path}" ]; then
  codesign --force --sign "${identity}" --keychain "${keychain_path}" "${probe}" >/dev/null 2>&1
else
  codesign --force --sign "${identity}" "${probe}" >/dev/null 2>&1
fi || {
  if [ -n "${keychain_path}" ]; then
    echo "error: Apple Distribution cannot sign from ${keychain_path}; check its password and codesign partition list." >&2
  else
    echo 'error: Apple Distribution cannot sign from the user keychain; unlock it and allow codesign access.' >&2
  fi
  exit 1
}
codesign --verify --strict "${probe}"
printf '%s\n' "${identity}"
