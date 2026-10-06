#!/bin/bash
set -euo pipefail
out=/tmp/maya-unified-gate-20261006
test "$(git rev-parse HEAD)" = be7a4a5f08fe34369c11d548741724bae13a2618
test -z "$(git status --porcelain)"
# Exactly one worker, recycled only between suites to bound cumulative TS/AST memory.
# The same full catalogue is executed; no test filters or exclusions.
node "$out/launch.cjs" node node_modules/jest/bin/jest.js --maxWorkers=1 --workerIdleMemoryLimit=768MB --logHeapUsage --json --outputFile="$out/backend-full-final-attempt2.json" > "$out/backend-full-final-attempt2.log" 2>&1
node "$out/launch.cjs" npm run test:e2e -- --runInBand --json --outputFile="$out/backend-e2e-final.json" > "$out/backend-e2e-final.log" 2>&1
bash "$out/smoke.sh"
