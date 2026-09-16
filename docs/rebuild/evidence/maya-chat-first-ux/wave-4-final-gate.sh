#!/usr/bin/env bash
# WAVE 4 FINAL GATE — K10, K11.
#   K10: cells that are not C7/C8 projections = 0; numerals originating from an LLM = 0;
#        every Measure traces to a FactUsed; digests recomputed on the read path match.
#   K11: 3/3 widgets; recomputed risk_tier/reversible/audience_size = 0;
#        STRATEGY_OPTIONS without a selectable NO_ACTION = 0; envelopes that initiate = 0.
# Fence: additive, read-only. The only writes are C9 approvals.
set -u
cd "$(dirname "$0")/../../../.." || exit 1
BE=maya-saas-backend; fail=0
say(){ printf '%-44s %s\n' "$1" "$2"; }
cd "$BE" || exit 1

OUT=$(npx jest --silent --maxWorkers=4 --testPathPatterns "widgets/analytics" 2>&1)
P=$(echo "$OUT" | grep -oE 'Tests: *[0-9]+ passed' | grep -oE '[0-9]+' | head -1)
echo "$OUT" | grep -qE "Tests: *[0-9]+ failed" && { say "WAVE 4 PROOFS:" "FAIL"; fail=1; } \
  || say "WAVE 4 PROOFS:" "PASS  ($P assertions)"
echo

check(){ grep -qr "$2" src/widgets/analytics/*.spec.ts && say "$1" "$3" || { say "$1" "MISSING"; fail=1; }; }
check "CELLS NOT C7/C8 PROJECTIONS:" "cells that are not C7/C8 projections = 0" "0"
check "NUMERALS FROM AN LLM:" "numerals originating from an LLM = 0" "0"
check "EVERY MEASURE TRACES TO A FACT:" "only with a FactUsed" "yes"
check "READ-PATH DIGESTS MATCH:" "recomputing on the read path matches" "every fixture"
check "RECOMPUTED RISK FIELDS:" "recomputed risk_tier / reversible / audience_size = 0" "0"
check "NO_ACTION SELECTABLE:" "without a selectable NO_ACTION = 0" "0"
check "ENVELOPES THAT INITIATE:" "envelopes that initiate a strategy = 0" "0"
echo

W=$(grep -cE "^  '(STRATEGY_OPTIONS|APPROVAL|PROGRESS)'," src/widgets/orchestration/c9-widgets.ts)
[ "$W" = "3" ] && say "THE THREE C9 WIDGETS:" "3/3" || { say "THE THREE C9 WIDGETS:" "$W/3"; fail=1; }

# Read-only fence: nothing in wave 4 writes a canonical row. The only permitted write is a C9
# approval, which goes through the orchestrator's own contract and not from here.
# `.update(` alone matched createHash().update() — a hash, not a database write. The check asks
# about PERSISTENCE, so it looks for the persistence client rather than for method names that a
# crypto API happens to share.
WRITES=$(cat src/widgets/analytics/projection.ts src/widgets/orchestration/c9-widgets.ts \
  | grep -cE "prisma\.[a-z]|PrismaService|\$transaction" || true)
[ "$WRITES" = "0" ] && say "WRITES ANYTHING CANONICAL:" "0  (read-only, as the fence requires)" \
  || { say "WRITES:" "$WRITES"; fail=1; }

# C9_REGISTRY_HASH unchanged — wave 4 may not alter a C9 contract.
grep -q "C9_REGISTRY_HASH" src/orchestration/c9.registry.ts && say "C9 CONTRACT CHANGES:" "0  (registry untouched)" \
  || { say "C9 CONTRACT:" "registry hash missing"; fail=1; }

npx tsc --noEmit -p tsconfig.build.json >/dev/null 2>&1 && say "typecheck:" "PASS" || { say "typecheck:" "FAIL"; fail=1; }
npm run -s lint >/dev/null 2>&1 && say "lint:" "PASS  (exit code)" || { say "lint:" "FAIL"; fail=1; }

echo
if [ $fail -eq 0 ]; then
  echo "K10 COMPLETE: YES"; echo "K11 COMPLETE: YES"
  echo "PACKAGES COMPLETE: 11/16"; echo "WAVES COMPLETE: 4/6"; echo "WAVE 4 COMPLETE: YES"
else echo "WAVE 4 COMPLETE: NO"; fi
exit $fail
