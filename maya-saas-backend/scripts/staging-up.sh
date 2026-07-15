#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env.staging ]]; then
  printf 'Missing %s/.env.staging. Run scripts/bootstrap-staging-env.sh first.\n' "$ROOT_DIR" >&2
  exit 66
fi

docker compose --env-file .env.staging -f compose.staging.yml up -d --build
docker compose --env-file .env.staging -f compose.staging.yml exec -T backend npm run prisma:seed
docker compose --env-file .env.staging -f compose.staging.yml ps
