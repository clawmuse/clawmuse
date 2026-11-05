#!/usr/bin/env bash
# Ported from the EndToAI/Orca fork (agent/mobile/scripts/unlock-ios-release-keychain.sh).
set -euo pipefail

keychain_path="${CLAWMUSE_IOS_KEYCHAIN_PATH:-}"
[ -n "${keychain_path}" ] || exit 0

keychain_password="${CLAWMUSE_IOS_KEYCHAIN_PASSWORD:-}"
[ -n "${keychain_password}" ] || {
  echo "error: CLAWMUSE_IOS_KEYCHAIN_PASSWORD is required for ${keychain_path}." >&2
  exit 1
}
[ -f "${keychain_path}" ] || {
  echo "error: iOS release keychain not found: ${keychain_path}." >&2
  exit 1
}

security unlock-keychain -p "${keychain_password}" "${keychain_path}"
security set-keychain-settings -lut 7200 "${keychain_path}"
security set-key-partition-list \
  -S apple-tool:,apple:,codesign: \
  -s \
  -k "${keychain_password}" \
  "${keychain_path}" >/dev/null

# xcodebuild resolves the identity through the user search list before it
# invokes codesign, so --keychain alone is not sufficient for archive/export.
keychains=("${keychain_path}")
while IFS= read -r listed_keychain; do
  listed_keychain="${listed_keychain#*\"}"
  listed_keychain="${listed_keychain%\"*}"
  [ -n "${listed_keychain}" ] || continue
  [ "${listed_keychain}" = "${keychain_path}" ] || keychains+=("${listed_keychain}")
done < <(security list-keychains -d user)
security list-keychains -d user -s "${keychains[@]}"
