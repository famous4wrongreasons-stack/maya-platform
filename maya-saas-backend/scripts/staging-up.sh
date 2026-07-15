#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f .env.staging ]]; then
  printf 'Missing %s/.env.staging. Run scripts/bootstrap-staging-env.sh first.\n' "$ROOT_DIR" >&2
  exit 66
fi

if [[ ! -x node_modules/.bin/ts-node ]]; then
  printf 'Missing locked dependencies. Run npm ci before staging-up.\n' >&2
  exit 69
fi

npm run release:preflight -- --env .env.staging --skip-db
docker compose --env-file .env.staging -f compose.staging.yml up -d --build
docker compose --env-file .env.staging -f compose.staging.yml exec -T backend \
  npm run release:preflight
docker compose --env-file .env.staging -f compose.staging.yml exec -T backend npm run prisma:seed
docker compose --env-file .env.staging -f compose.staging.yml ps
