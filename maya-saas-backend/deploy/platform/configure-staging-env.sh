#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-}"
HOST="${2:-}"
HOST_PATTERN='^([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9-]{0,61}[A-Za-z0-9])(\.([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9-]{0,61}[A-Za-z0-9]))+$'

if [[ -z "$TARGET" || ! -f "$TARGET" || -z "$HOST" || ! "$HOST" =~ $HOST_PATTERN ]]; then
  printf 'Usage: %s /path/to/runtime.env platform.example.com\n' "$0" >&2
  exit 64
fi

umask 077
cp -p "$TARGET" "${TARGET}.platform-host-backup.$(date -u +%Y%m%dT%H%M%SZ)"

set_env() {
  local key="$1"
  local value="$2"
  local escaped="${value//&/\\&}"
  escaped="${escaped//|/\\|}"

  if grep -q "^${key}=" "$TARGET"; then
    sed -i "s|^${key}=.*$|${key}=\"${escaped}\"|" "$TARGET"
  else
    printf '%s="%s"\n' "$key" "$value" >> "$TARGET"
  fi
}

WEB_CALLBACK="https://${HOST}/oauth-callback.html"
NATIVE_CALLBACK="https://${HOST}/api/auth/oauth/native/callback"

set_env CORS_ALLOWED_ORIGINS "https://malesthetic.pro,https://www.malesthetic.pro,https://${HOST},capacitor://localhost"
set_env TENANT_BASE_DOMAIN "$HOST"
set_env PWA_TENANT_INSTALL_ENABLED "true"
set_env PWA_PUBLIC_APP_URL "https://${HOST}/app.html"
set_env PWA_PUBLIC_API_URL "https://${HOST}/api"
set_env OAUTH_ALLOWED_REDIRECT_URIS "${WEB_CALLBACK},${NATIVE_CALLBACK}"
set_env OAUTH_NATIVE_REDIRECT_URI "$NATIVE_CALLBACK"

printf 'Updated public host, PWA and OAuth callback settings for %s.\n' "$HOST"
printf 'Social providers remain disabled until their credentials pass acceptance.\n'
