#!/usr/bin/env bash
# Source this from the release shell; signing material stays on the Mac.
if [ -n "${CSC_LINK:-}" ]; then
  : "${CSC_KEY_PASSWORD:?需配置 Developer ID 证书的 CSC_KEY_PASSWORD}"
else
  unset CSC_LINK CSC_KEY_PASSWORD
  export CSC_NAME="${CSC_NAME:-Developer ID Application}"
  export CSC_IDENTITY_AUTO_DISCOVERY=true
  security find-identity -v -p codesigning | grep -q 'Developer ID Application:' || {
    echo "Mac 钥匙串里没有有效的 Developer ID Application 证书" >&2
    return 1
  }
fi

# Listing a certificate does not prove SSH may use its private key.
if [ -z "${CSC_LINK:-}" ]; then
  (
    set -e
    if [ -n "${CSC_KEYCHAIN:-}" ]; then
      identities="$(security find-identity -v -p codesigning "$CSC_KEYCHAIN")"
    else
      identities="$(security find-identity -v -p codesigning)"
    fi
    identity="$(printf '%s\n' "$identities" | awk -v name="$CSC_NAME" '/Developer ID Application:/ && index($0, name) { print $2; exit }')"
    [ -n "$identity" ] || { echo "找不到所选 Developer ID 身份" >&2; exit 1; }
    probe="$(mktemp "${TMPDIR:-/tmp}/clawmuse-desktop-codesign.XXXXXX")"
    trap 'rm -f "$probe"' EXIT
    cp /usr/bin/true "$probe"
    if [ -n "${CSC_KEYCHAIN:-}" ]; then
      codesign --force --sign "$identity" --keychain "$CSC_KEYCHAIN" "$probe" >/dev/null 2>&1 || exit 1
    else
      codesign --force --sign "$identity" "$probe" >/dev/null 2>&1 || exit 1
    fi
    codesign --verify --strict "$probe"
  ) || {
    echo "Developer ID 私钥无法签名；请解锁对应钥匙串并允许 codesign 访问。" >&2
    return 1
  }
fi

if [ -n "${APPLE_ID:-}${APPLE_APP_SPECIFIC_PASSWORD:-}" ]; then
  : "${APPLE_ID:?需配置 APPLE_ID}"
  : "${APPLE_APP_SPECIFIC_PASSWORD:?需配置 APPLE_APP_SPECIFIC_PASSWORD}"
  : "${APPLE_TEAM_ID:?需配置 APPLE_TEAM_ID}"
else
  if [ -z "${APPLE_API_KEY:-}" ]; then
    source "${CLAWMUSE_MAC_ASC_ENV:-$HOME/.private_keys/appstoreconnect.env}"
    export APPLE_API_KEY="${ASC_KEY_PATH:?需配置 ASC_KEY_PATH}"
    export APPLE_API_KEY_ID="${ASC_KEY_ID:?需配置 ASC_KEY_ID}"
    export APPLE_API_ISSUER="${ASC_ISSUER_ID:?需配置 ASC_ISSUER_ID}"
  fi
  : "${APPLE_API_KEY_ID:?需配置 APPLE_API_KEY_ID}"
  : "${APPLE_API_ISSUER:?需配置 APPLE_API_ISSUER}"
  test -f "$APPLE_API_KEY" || { echo "App Store Connect 私钥文件不存在" >&2; return 1; }
fi
