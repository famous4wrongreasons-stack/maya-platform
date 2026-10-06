#!/bin/bash
set -euo pipefail
out=/tmp/maya-unified-gate-20261006
gate() { name="$1"; shift; node "$out/launch.cjs" "$@" > "$out/$name.log" 2>&1; }
git rev-parse HEAD > "$out/source-sha.txt"
gate g1-typecheck-final npm run typecheck
gate g1-k3 node scripts/k3-gateway-check.mjs
gate g1-build npm run build
gate g1-lint npm run lint
