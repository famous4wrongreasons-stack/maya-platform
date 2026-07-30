#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="$ROOT_DIR/.env.staging"
TEMPLATE="$ROOT_DIR/.env.staging.example"
HOST="${1:-}"
HOST_PATTERN='^([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9-]{0,61}[A-Za-z0-9])(\.([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9-]{0,61}[A-Za-z0-9]))+$'

if [[ -z "$HOST" || ! "$HOST" =~ $HOST_PATTERN ]]; then
  printf 'Usage: %s staging.example.com\n' "$0" >&2
  exit 64
fi

if [[ -e "$TARGET" ]]; then
  printf '%s already exists; refusing to overwrite secrets.\n' "$TARGET" >&2
  exit 73
fi

umask 077
cp "$TEMPLATE" "$TARGET"

replace_env() {
  local key="$1"
  local value="$2"
  local escaped="${value//|/\\|}"
  sed -i.bak "s|^${key}=.*$|${key}=\"${escaped}\"|" "$TARGET"
  rm -f "$TARGET.bak"
}

random_secret() {
  openssl rand -hex 32
}

DB_PASSWORD="$(openssl rand -hex 24)"
replace_env STAGING_HOST "$HOST"
replace_env POSTGRES_PASSWORD "$DB_PASSWORD"
replace_env DATABASE_URL "postgresql://maya_staging:${DB_PASSWORD}@postgres:5432/maya_staging?schema=public"
replace_env CORS_ALLOWED_ORIGINS "https://${HOST},capacitor://localhost"
replace_env PWA_PUBLIC_APP_URL "https://${HOST}/app.html"
replace_env PWA_PUBLIC_API_URL "https://${HOST}/api"
replace_env TENANT_BASE_DOMAIN "$HOST"
replace_env YOOKASSA_RETURN_URL "https://${HOST}/app.html"

for key in \
  JWT_SECRET \
  AUTH_REFRESH_TOKEN_SECRET \
  AUTH_SESSION_METADATA_SECRET \
  AUTH_RATE_LIMIT_SECRET \
  PHONE_AUTH_SECRET \
  EMAIL_AUTH_SECRET \
  CRM_ENCRYPTION_KEY \
  SEED_PLATFORM_OWNER_PASSWORD \
  SEED_DEMO_TENANT_ADMIN_PASSWORD; do
  replace_env "$key" "$(random_secret)"
done

printf 'Created %s with generated secrets for %s.\n' "$TARGET" "$HOST"
printf 'Provider credentials remain disabled until their individual acceptance gates.\n'
