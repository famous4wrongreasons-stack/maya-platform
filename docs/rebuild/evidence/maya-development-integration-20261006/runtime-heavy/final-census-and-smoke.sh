#!/bin/bash
set -euo pipefail
out=/tmp/maya-unified-gate-20261006
test "$(git rev-parse HEAD)" = be7a4a5f08fe34369c11d548741724bae13a2618
test -z "$(git status --porcelain)"
node "$out/launch.cjs" node node_modules/jest/bin/jest.js --runInBand --json --outputFile="$out/backend-full-final.json" > "$out/backend-full-final.log" 2>&1
node "$out/launch.cjs" npm run test:e2e -- --runInBand --json --outputFile="$out/backend-e2e-final.json" > "$out/backend-e2e-final.log" 2>&1
bash "$out/smoke.sh"
