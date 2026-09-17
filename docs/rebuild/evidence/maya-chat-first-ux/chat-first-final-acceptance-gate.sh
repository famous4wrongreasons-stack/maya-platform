#!/usr/bin/env bash
# MAYA CHAT-FIRST FINAL ACCEPTANCE GATE — one job, one commit, twenty-four conditions.
#
# §9: "Anything yellow or unmeasured means the cycle is not finished. There is no partial completion
# and no 'complete with caveats'." This gate is written to honour that literally: it prints the real
# value of every figure, and it refuses to print PASS for anything it cannot substantiate from this
# repository. Where a condition needs a production observation, it says so and fails rather than
# accepting a simulation in its place.
#
# Run: bash docs/rebuild/evidence/maya-chat-first-ux/chat-first-final-acceptance-gate.sh
set -u
cd "$(dirname "$0")/../../../.." || exit 1
BE=maya-saas-backend
fail=0; green=0; red=0
say(){ printf '%-52s %s\n' "$1" "$2"; }
row(){ # id, condition, ok(0/1), value
  if [ "$3" = "1" ]; then green=$((green+1)); printf '  %-5s %-40s %s\n' "$1" "$2" "PASS  $4"
  else red=$((red+1)); fail=1; printf '  %-5s %-40s %s\n' "$1" "$2" "NOT PROVEN  $4"; fi; }

echo "MAYA CHAT-FIRST FINAL ACCEPTANCE GATE"
echo "commit $(git rev-parse --short HEAD)   $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "======================================================================================"
echo

# ── 1. the wave gates, re-run on THIS commit ────────────────────────────────────────────────────
echo "WAVE GATES, re-run on this commit"
G=docs/rebuild/evidence/maya-chat-first-ux
# The wave gates run their own proofs; the FULL regression is run once, here, rather than once per
# gate. Nesting two concurrent jest runs over the same 469 suites is what made wave 2 report FAIL
# inside this job while passing standalone — a defect in this gate, not in wave 2.
export REGRESSION_RUN_BY_CALLER=1
for w in wave-1-exit-gate wave-2-final-gate wave-3-final-gate wave-4-final-gate wave-5-final-gate; do
  if [ -f "$G/$w.sh" ]; then
    if bash "$G/$w.sh" >/tmp/.fg-$w.txt 2>&1; then say "  $w" "PASS"
    else say "  $w" "FAIL  (see /tmp/.fg-$w.txt)"; fail=1; fi
  else say "  $w" "MISSING"; fail=1; fi
done
unset REGRESSION_RUN_BY_CALLER

# --maxWorkers=2, because this runs AFTER five wave gates have each run a compiler, a linter, a
# build and their own scoped suites. At 4 workers a jest worker was OS-killed here and the gate
# reported "a test failed" — which is a different and much more alarming statement than "a worker
# died". The three outcomes are now distinguished, and 20 lines are captured rather than 8 because
# Nest's own logging pushes the summary out of a shorter tail.
J=$( cd "$BE" && npx jest --silent --maxWorkers=2 2>&1 | tail -20 )
# The captured tail is kept, deliberately. When this step once said "a test failed" the summary it
# had actually captured said 471 passed — the tail is what settles which of the two is true.
printf '%s\n' "$J" > /tmp/.fg-regression-tail.txt
REG_TESTS=$(echo "$J" | grep -oE 'Tests: *[0-9]+ passed[^,]*' | head -1)
REG_SUITES=$(echo "$J" | grep -oE 'Suites: *[0-9]+ passed[^,]*' | head -1)
if echo "$J" | grep -qE "Tests: *[0-9]+ failed"; then REG="FAIL — a test failed"; fail=1
elif echo "$J" | grep -qE "Suites: *[0-9]+ failed"; then REG="FAIL — a suite could not RUN"; fail=1
elif [ -z "$REG_TESTS" ]; then REG="FAIL — jest produced no summary (a worker was killed?)"; fail=1
else REG="PASS  ${REG_SUITES#Test Suites: } suites, ${REG_TESTS#Tests: }"; fi
say "  MANDATORY REGRESSION (run once, here)" "$REG"
echo

# ── 2. the wave-6 ledgers ───────────────────────────────────────────────────────────────────────
echo "WAVE 6 LEDGERS — K14, K15, K16"
node "$G/k14-telegram-ledger.mjs" --json >/tmp/.fg-k14.json 2>/dev/null || { say "  k14 ledger" "FAILED TO RUN"; fail=1; }
node "$G/k15-bundle-census.mjs"   --json >/tmp/.fg-k15.json 2>/dev/null || { say "  k15 census" "FAILED TO RUN"; fail=1; }
node "$G/k16-cutover-evaluator.mjs"  --json >/tmp/.fg-k16.json 2>/dev/null || { say "  k16 ledger" "FAILED TO RUN"; fail=1; }

jqn(){ node -e "const d=require('$1');console.log(eval('d.'+process.argv[1]))" "$2" 2>/dev/null || echo "?"; }

K14_CMDS=$(jqn /tmp/.fg-k14.json commandsRegistered)
K14_UNREACH=$(jqn /tmp/.fg-k14.json commandsExecutingIntoAnUnreachableBody)
K15_BUNDLES=$(jqn /tmp/.fg-k15.json legacyBundlesCarryingAShell)
K15_LEGACY_AUTH=$(jqn /tmp/.fg-k15.json clientSideAuthorityValuesInLegacy)
K15_SUCC_AUTH=$(jqn /tmp/.fg-k15.json clientSideAuthorityValuesInSuccessor)
K15_PROBE=$(jqn /tmp/.fg-k15.json mayaOsSiteUnreachableProven)
K15_SERVED=$(jqn /tmp/.fg-k15.json productionServedLegacyCopies)
K16_TOTAL=$(jqn /tmp/.fg-k16.json summary.toRetire)
K16_DELETABLE=$(jqn /tmp/.fg-k16.json summary.retirableNow)

say "  K14 commands registered / into an unreachable body" "$K14_CMDS / $K14_UNREACH"
say "  K15 legacy shell bundles / legacy authority values" "$K15_BUNDLES / $K15_LEGACY_AUTH"
say "  K15 successor authority values / maya-os-site unreachable proven" "$K15_SUCC_AUTH / $K15_PROBE"
say "  K16 rows to retire / retirable today / deleted" "$K16_TOTAL / $K16_DELETABLE / 0"
echo

# ── 3. the derived figures ──────────────────────────────────────────────────────────────────────
DERIVED=$(node "$G/final-figures.mjs" 2>/dev/null) || { echo "final-figures.mjs failed"; exit 1; }
eval "$DERIVED"

echo "THE TWENTY-FOUR CONDITIONS"
row G1  "All surfaces classified"          "$([ "$F_UNCLASSIFIED" = "0" ] && echo 1 || echo 0)" "$F_DISPOSITIONED/$F_SURFACES classified, $F_UNCLASSIFIED unassigned"
row G2  "Successor closure"                "$F_G2_OK"  "$F_G2_WHY"
row G3  "Capabilities reachable"           "$F_G3_OK"  "$F_G3_WHY"
row G4  "Capability gaps closed"           "$F_G4_OK"  "$F_G4_WHY"
row G5  "Widget contract certified"        "$F_G5_OK"  "$F_G5_WHY"
row G6  "Number provenance"                "$F_G6_OK"  "$F_G6_WHY"
row G7  "Role modes removed from UX"       "$F_G7_OK"  "$F_G7_WHY"
row G8  "Backend authority: R-01 reads, R-04 door" "$F_G8_OK"  "$F_G8_WHY"
row G9  "Fullscreen parity, no overlays"   "$F_G9_OK"  "$F_G9_WHY"
row G10 "Bundle disposition"               "$([ "$K15_BUNDLES" = "1" ] && [ "$K15_PROBE" = "true" ] && echo 1 || echo 0)" "$K15_BUNDLES legacy shell bundles in the repository, $K15_SERVED legacy copies served in production (target 1 successor); maya-os-site unreachable proven: $K15_PROBE"
row G11 "Primary-nav target achieved"      "$F_G11_OK" "$F_G11_WHY"
row G12 "Router honesty"                   "$F_G12_OK" "$F_G12_WHY"
row G13 "Intent unforgeability"            "$F_G13_OK" "$F_G13_WHY"
row G14 "Booking end-to-end"               "$F_G14_OK" "$F_G14_WHY"
row G15 "No direct provider writes"        "$F_G15_OK" "$F_G15_WHY"
row G16 "PII and preview fences"           "$F_G16_OK" "$F_G16_WHY"
row G17 "Never-chat-actuated fence"        "$F_G17_OK" "$F_G17_WHY"
row G18 "Analytics use canonical facts"    "$F_G18_OK" "$F_G18_WHY"
row G19 "C9 strategy/approval/progress"    "$F_G19_OK" "$F_G19_WHY"
row G20 "Consent receipts canonical"       "$F_G20_OK" "$F_G20_WHY"
row G21 "History is never business state"  "$F_G21_OK" "$F_G21_WHY"
row G22 "No C10 autonomy"                  "$F_G22_OK" "$F_G22_WHY"
row G23 "Accessibility, reduced motion"    "$F_G23_OK" "$F_G23_WHY"
# G24 measures BAD deletions, not deletions. Its three quantities are "deletions without a named
# successor, a passing test and a rollback = 0", "deletions before the dark window closed = 0" and
# "Telegram commands into an unreachable body = 0". With zero deletions performed the first two are
# zero, and K14 derives the third. An adversarial pass caught this gate inverting G24's polarity by
# folding the nav ratchet in — that belongs to G11, which reports it separately and fails there.
row G24 "Legacy retired only after parity" "$([ "$K16_DELETABLE" = "0" ] && [ "$K14_UNREACH" = "0" ] && echo 1 || echo 0)" "0 deletions of $K16_TOTAL rows awaiting the dark window; $K14_UNREACH Telegram commands into an unreachable body"
echo
say "CONDITIONS GREEN" "$green / 24"
say "CONDITIONS NOT PROVEN" "$red / 24"
echo

# ── 4. the required figure block, with REAL values ──────────────────────────────────────────────
echo "REQUIRED FIGURES"
say "K1-K16" "$F_PACKAGES/16"
say "WAVES" "$F_WAVES/6"
say "SURFACE DISPOSITION/PARITY" "$F_DISPOSITIONED/$F_SURFACES dispositioned; parity $F_PARITY_ROWS/$K16_TOTAL"
echo
say "PRIMARY NAV" "$F_PRIMARY_NAV  (successor shell: $F_SHELL_ROUTES)"
say "OWNER/STAFF/CLIENT PRESENTATION MODES" "$F_PRESENTATION_MODES"
say "BACKEND AUTHORITY ROLES" "$F_BACKEND_ROLES"
echo
# The Contract V1.1 clause-level audit (schema /2), recomputed from its clause states by final-figures.mjs.
# The /1 label "GATES EXECUTABLE" read module presence as conformance; this figure is live contract-completeness.
say "GATES LIVE CONTRACT-COMPLETE" "$F_GATES"
say "WIDGET CONTRACT" "$F_CONTRACT_CHECK"
say "BUTTON -> ENDPOINT PATHS" "$F_BUTTON_ENDPOINT"
say "DIRECT UI -> PROVIDER WRITES" "$F_UI_PROVIDER"
say "VOICE-SPECIFIC AUTHORITY PATHS" "$F_VOICE_AUTH"
echo
say "CLIENT BOOKING" "$F_BOOKING"
say "ANALYTICS WIDGETS" "$F_ANALYTICS"
say "C9 STRATEGY/APPROVAL/PROGRESS" "$F_C9"
say "PRIVACY/CONSENT SURFACES" "$F_CONSENT"
echo
say "NATIVE/PWA SHARED CONTRACT" "$F_NATIVE"
say "ACCESSIBILITY" "$F_A11Y"
say "REDUCED MOTION" "$F_REDUCED_MOTION"
echo
say "BUSINESS SCHEMA OWNERS CHANGED" "$F_SCHEMA_OWNERS"
say "BUSINESS TABLE -> WIDGET TABLE FK" "$F_BUSINESS_FK"
echo
say "MANDATORY REGRESSION" "$REG"
say "PENDING MIGRATIONS" "$F_PENDING_MIGRATIONS"
say "DRIFT" "$F_DRIFT"
say "HEALTH/READINESS" "$F_HEALTH"
echo
say "KNOWN CHAT-FIRST REMAINDER" "$F_REMAINDER"
say "UNRESOLVED UX DECISIONS" "$F_UX_DECISIONS"
say "WIP" "$F_WIP"
echo

# ── 5. the approved out-of-scope limitations, listed and NOT masked ─────────────────────────────
echo "APPROVED OUT-OF-SCOPE LIMITATIONS — listed separately, not masked"
echo "  FUNDAMENTAL RULES FAIL-CLOSED ONLY:      13/21"
echo "  STEP_UP_VERIFIED:                        UNREACHABLE"
echo "  GATE 10:                                 REFUSAL ON EFFECT-CLASS DIVERGENCE (owner ruling);"
echo "                                           the router is exact-match, and an unresolved utterance is not compared"
echo "  APPROVAL:                                ROLE-GATED, NOT SEPARATION-OF-DUTIES"
echo "  GAP-ATTENDANCE-CONFIRM:                  OPEN"
echo "  K13 14-DAY PRODUCTION OBSERVATION:       NOT PROVEN UNTIL ACTUALLY OBSERVED"
echo "                                           (a simulated 504-attempt window is NOT one)"
echo

# ── 6. where wave 6 stopped, stated exactly ─────────────────────────────────────────────────────
echo "WAVE 6 — THE EXACT CUTOVER CONDITION"
echo "  The ledger state machine (D10, OWNER-DECISIONS) is:"
echo "    MAPPED -> PARITY_PROVEN -> ENTRY_POINT_DARK (14 days) -> ROUTE_SEALED (30 days;"
echo "    45 for any capability touching period close) -> DELETED, one-step rollback at each."
echo
echo "  NO SURFACE HAS ENTERED ENTRY_POINT_DARK. Entering it means removing a nav entry from a"
echo "  live bundle while the route still resolves and logs, which is a PRODUCTION change; and"
echo "  leaving it means observing that nobody used it, which is a PRODUCTION observation."
echo "  PRODUCTION EFFECTS FOR PROOF: 0, so neither was done and nothing was deleted."
echo
echo "  Pre-cutover readiness is NOT met, so Wave 6 was not entered. The exact remaining conditions,"
echo "  row by row, are in docs/rebuild/WAVE-6-PRE-CUTOVER-DETERMINATION.md:"
echo "    no successor surface is served, and no package delivers one;"
echo "    $K15_SERVED legacy bundle copies are publicly reachable at non-canonical URLs;"
echo "    G2 successors are not verified for every row; K14 needs bot.py; native evidence is absent."
echo "  K16: $K16_TOTAL rows await ENTRY_POINT_DARK; $K16_DELETABLE retirable; 0 deleted."
echo

echo "======================================================================================"
if [ $fail -eq 0 ]; then
  echo "MAYA CHAT-FIRST FINAL ACCEPTANCE: PASS"
  echo "MAYA CHAT-FIRST COMPLETE: YES"
else
  echo "MAYA CHAT-FIRST FINAL ACCEPTANCE: NOT PASS"
  echo "MAYA CHAT-FIRST COMPLETE: NO"
fi
echo "CHAPTER 10 STARTED: NO"
echo "PRODUCTION EFFECTS FOR PROOF: 0"
exit $fail
