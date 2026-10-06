#!/bin/bash
set -euo pipefail
out=/tmp/maya-unified-gate-20261006
gate() { name="$1"; shift; node "$out/launch.cjs" "$@" > "$out/$name.log" 2>&1; }
gate g1-typecheck-regression npm run typecheck
gate g1-widgets-typecheck-regression npm run typecheck:widgets-live
gate g1-build-regression npm run build
gate targeted-regression node node_modules/jest/bin/jest.js --runInBand --runTestsByPath src/entitlements/widget-release-profile.contract.spec.ts src/entitlements/widget-release-access.spec.ts src/ai-tools/ai-core.development-integration.spec.ts src/ai-tools/ai-core.service.spec.ts src/widgets/emission/emitter.spec.ts src/widgets/owner-ports/schedule-approval.adapter.spec.ts --json --outputFile=/tmp/maya-unified-gate-20261006/targeted-regression.json
