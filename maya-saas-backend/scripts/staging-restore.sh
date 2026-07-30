#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DUMP="${1:-}"
CONFIRM="${2:-}"
cd "$ROOT_DIR"

if [[ ! -f "$DUMP" || "$CONFIRM" != "RESTORE-STAGING" ]]; then
  printf 'Usage: %s /absolute/path/to.dump RESTORE-STAGING\n' "$0" >&2
  exit 64
fi

set -a
source .env.staging
set +a

docker compose --env-file .env.staging -f compose.staging.yml stop backend
docker compose --env-file .env.staging -f compose.staging.yml exec -T postgres \
  dropdb --if-exists --username "$POSTGRES_USER" "$POSTGRES_DB"
docker compose --env-file .env.staging -f compose.staging.yml exec -T postgres \
  createdb --username "$POSTGRES_USER" "$POSTGRES_DB"
docker compose --env-file .env.staging -f compose.staging.yml exec -T postgres \
  pg_restore --no-owner --no-acl --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" < "$DUMP"
docker compose --env-file .env.staging -f compose.staging.yml start backend

printf 'Staging database restored from %s.\n' "$DUMP"
