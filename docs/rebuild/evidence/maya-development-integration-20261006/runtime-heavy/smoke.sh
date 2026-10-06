#!/bin/bash
set -euo pipefail
out=/tmp/maya-unified-gate-20261006
export MAYA_GATE_DATABASE_URL=postgresql://maya_gate@127.0.0.1:57463/maya_gates_smoke_unified
node "$out/launch.cjs" npm run prisma:seed > "$out/smoke-seed.log" 2>&1
node "$out/launch.cjs" npm run test:http > "$out/http-smoke.log" 2>&1
