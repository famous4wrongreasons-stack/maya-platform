#!/bin/bash
set -euo pipefail
out=/tmp/maya-unified-gate-20261006
git rev-parse HEAD > "$out/final-source-sha.txt"
gate() { name="$1"; shift; node "$out/launch.cjs" "$@" > "$out/$name.log" 2>&1; }
gate final-c9-nonutc /usr/bin/env TZ=Europe/Moscow node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/orchestration/c9.c5-source-fingerprint.spec.ts src/orchestration/c9.occupancy-source.spec.ts --json --outputFile="$out/final-c9-nonutc.json"
gate final-typecheck npm run typecheck
gate final-widgets-typecheck npm run typecheck:widgets-live
gate final-focused-lint node node_modules/eslint/bin/eslint.js src/orchestration/c9.sources.ts src/orchestration/c9.c5-source-fingerprint.spec.ts test/widgets-live/development-integration.live-spec.ts test/widgets-live/development-integration.browser-spec.ts
gate final-build npm run build
gate backend-full node node_modules/jest/bin/jest.js --runInBand --json --outputFile="$out/backend-full.json"
gate backend-e2e npm run test:e2e -- --runInBand --json --outputFile="$out/backend-e2e.json"
