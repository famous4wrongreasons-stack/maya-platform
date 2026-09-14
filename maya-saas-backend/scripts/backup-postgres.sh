#!/usr/bin/env bash

set -euo pipefail

destination="${1:?Backup destination is required}"
database_url="${DATABASE_URL:?DATABASE_URL is required}"
database_url="${database_url%%\?*}"

umask 077
pg_dump "${database_url}" | gzip > "${destination}"
test -s "${destination}"
