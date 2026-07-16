#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups/staging}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$BACKUP_DIR/maya-staging-$STAMP.dump"
cd "$ROOT_DIR"

if [[ ! -f .env.staging ]]; then
  printf 'Missing .env.staging.\n' >&2
  exit 66
fi

mkdir -p "$BACKUP_DIR"
set -a
source .env.staging
set +a

docker compose --env-file .env.staging -f compose.staging.yml exec -T postgres \
  pg_dump --format=custom --no-owner --no-acl \
  --username "$POSTGRES_USER" "$POSTGRES_DB" > "$TARGET"

chmod 600 "$TARGET"
printf 'Created encrypted-storage-ready database dump: %s\n' "$TARGET"
