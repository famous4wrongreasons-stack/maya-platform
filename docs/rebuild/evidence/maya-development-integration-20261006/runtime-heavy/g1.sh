#!/bin/bash
set -euo pipefail
out=/tmp/maya-unified-gate-20261006
gate() { name="$1"; shift; node "$out/launch.cjs" "$@" > "$out/$name.log" 2>&1; }
gate g1-widgets-typecheck-attempt2 npm run typecheck:widgets-live
gate g1-scripts-typecheck npm run typecheck:scripts
gate g1-prisma-validate node node_modules/prisma/build/index.js validate
gate g1-profile-check node -r ts-node/register/transpile-only scripts/widget-contract/registry-probe.js --release-snapshot --check
gate g1-tables node scripts/widget-contract/build-tables.mjs --check
gate g1-floor node scripts/widget-contract/emit-runtime-floor.mjs --check
gate g1-confirmation node scripts/widget-contract/emit-confirmation-guard.mjs --check
gate g1-ledgers node scripts/widget-contract/emit-ledgers.mjs --check
gate g1-f88 node scripts/widget-contract/emit-f88.mjs --check
gate g1-contract-typecheck node node_modules/typescript/bin/tsc --noEmit --project tsconfig.widget-contract.json --incremental false
gate g1-contract-check node scripts/widget-contract-check.mjs
gate g1-k3 node scripts/k3-gateway-check.mjs
gate g1-build npm run build
