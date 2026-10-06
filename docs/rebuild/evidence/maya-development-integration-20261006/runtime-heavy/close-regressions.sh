#!/bin/bash
set -euo pipefail
out=/tmp/maya-unified-gate-20261006
gate() { name="$1"; shift; node "$out/launch.cjs" "$@" > "$out/$name.log" 2>&1; }
gate closing-types npm run typecheck
gate closing-live-types npm run typecheck:widgets-live
gate closing-c9 node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/orchestration/c9.release.spec.ts src/orchestration/c9.occupancy-source.spec.ts --json --outputFile="$out/closing-c9.json"
gate closing-profile node scripts/widget-contract/registry-probe.js --release-snapshot --check
gate closing-floor node scripts/widget-contract/emit-runtime-floor.mjs --check
gate closing-confirmation node scripts/widget-contract/emit-confirmation-guard.mjs --check
gate closing-tables node scripts/widget-contract/build-tables.mjs --check
gate closing-ledgers node scripts/widget-contract/emit-ledgers.mjs --check
gate closing-f88 node scripts/widget-contract/emit-f88.mjs --check
gate closing-k3 node scripts/k3-gateway-check.mjs
gate closing-contract node scripts/widget-contract-check.mjs
gate closing-build npm run build
