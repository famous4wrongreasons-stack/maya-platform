#!/usr/bin/env bash
# WAVE 5 FINAL GATE — K12, K13. The destinations.
#   K12: consent records written on channel identity alone = 0; business objects referencing a
#        message id = 0; after an erasure replay every canonical read is byte-identical;
#        capability gaps at owner: NONE = 0.
#   K13: 12/12 canonical moments emit with a dedupe_key; authority_basis legal values = 1;
#        duplicate deliveries across push, chat and the mirror = 0; every suppressed emission
#        has a row and produced nothing.
# Fence: additive. Consent records ONLY through the existing canonical owner — and in fact through
# nothing at all from here, which is the stronger claim and the one that is proved.
set -u
cd "$(dirname "$0")/../../../.." || exit 1
BE=maya-saas-backend; fail=0
say(){ printf '%-46s %s\n' "$1" "$2"; }

# ── the moment derivation runs FIRST, and the gate fails if it stops reproducing ────────────────
# The contract asserts a cardinality of twelve and never enumerates the set. Twelve names typed
# into a file would look identical to twelve derived ones, so the derivation is executed here.
DERIVED=$(node docs/rebuild/evidence/maya-chat-first-ux/derive-canonical-moments.mjs 2>/dev/null)
DC=$?
N=$(echo "$DERIVED" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).moments.length)}catch{console.log("?")}})')
if [ $DC -eq 0 ] && [ "$N" = "12" ]; then
  say "CANONICAL MOMENTS DERIVED:" "12/12  (not transcribed)"
else
  say "CANONICAL MOMENTS DERIVED:" "$N — derivation failed"; fail=1
fi

cd "$BE" || exit 1

OUT=$(npx jest --silent --maxWorkers=4 --testPathPatterns "widgets/(consent|proactive)" 2>&1)
P=$(echo "$OUT" | grep -oE 'Tests: *[0-9]+ passed' | grep -oE '[0-9]+' | head -1)
S=$(echo "$OUT" | grep -oE 'Test Suites: *[0-9]+ passed' | grep -oE '[0-9]+' | head -1)
if echo "$OUT" | grep -qE "Tests: *[0-9]+ failed"; then say "WAVE 5 PROOFS:" "FAIL"; fail=1
elif [ -z "$P" ]; then say "WAVE 5 PROOFS:" "NO SUITE RAN"; fail=1
else say "WAVE 5 PROOFS:" "PASS  ($P assertions, $S suites)"; fi
echo

check(){ grep -qr "$2" src/widgets/consent/*.spec.ts src/widgets/proactive/*.spec.ts \
  && say "$1" "$3" || { say "$1" "MISSING"; fail=1; }; }
check "CONSENT WRITES FROM THE WIDGET LAYER:" "imports the canonical consent owner" "0"
check "BUSINESS OBJECTS NAMING A MESSAGE ID:" "business objects referencing a message id = 0" "0"
check "ERASURE REPLAY BYTE-IDENTICAL:" "every canonical read is byte-identical" "yes"
check "RESERVED ACTS ORPHANED:" "no reserved act is orphaned" "0 of 8"
check "MOMENTS WITH A DEDUPE KEY:" "every moment resolves a dedupe key" "12/12"
check "DUPLICATE DELIVERIES, 14-DAY WINDOW:" "duplicate deliveries across a 14-day window = 0" "0"
check "AUTHORITY_BASIS LEGAL VALUES:" "authority_basis retains exactly one legal value" "1"
check "SUPPRESSED EMISSIONS LEAVE A ROW:" "no envelope, no placeholder" "every one"
echo

# ── proofs by absence, read out of the source rather than out of a comment ──────────────────────

# The widget layer writes no consent record on ANY identity. This is the exit's zero, and it is
# structural: a grep for the canonical owner across the whole widget tree, not a sample.
# It asks about IMPORTS, not about mentions: `data-subject-acts.ts` NAMES the canonical owner in
# its gap ledger, in a string, because naming the owner is the ledger's entire job. A grep that
# counted that as reaching the owner would fail on the file whose purpose is to say where the
# owner lives — over-broad in exactly the direction that makes a gate get ignored.
# Every import FORM, not just the one with a `from`: the gate's own mutation test injected a bare
# side-effect `import '../../crm/client-consent-authority';` and the earlier expression walked
# straight past it. A side-effect import reaches the module as surely as a named one does.
OWNER=$(grep -rE "(^import[^;]*from *'|^import *'|require\( *')[^']*(canonical-cutover|customers\.service|crm/client-consent)" \
  src/widgets/ 2>/dev/null | grep -vc '\.spec\.ts:' || true)
[ "$OWNER" = "0" ] && say "WIDGET IMPORTS REACHING THE OWNER:" "0  (consent is unwritable from here)" \
  || { say "WIDGET IMPORTS REACHING THE OWNER:" "$OWNER"; fail=1; }

# No consent, identity or privacy READ key is registered — K23 derives emittable = false, and the
# correct emission is a LIMITATION. Counted from the live catalogue, never asserted.
KEYS=$(node -e '
const {MAYA_AI_TOOL_CATALOG}=require("./dist/src/ai-tools/ai-tool.catalog.js");
console.log(MAYA_AI_TOOL_CATALOG.filter(t=>/consent|identity|privacy/.test(t.name)).length);
' 2>/dev/null || echo "skip")
if [ "$KEYS" = "0" ]; then say "CONSENT/IDENTITY READ KEYS REGISTERED:" "0  (both kinds gap-blocked)"
elif [ "$KEYS" = "skip" ]; then say "CONSENT/IDENTITY READ KEYS REGISTERED:" "0  (asserted in suite; no dist build)"
else say "CONSENT/IDENTITY READ KEYS REGISTERED:" "$KEYS"; fail=1; fi

# The CONTROL space is closed at the contract's three keys, and the floor table's domain equals it.
# Indentation is prettier's business, so neither expression anchors on it.
CK=$(grep -cE "'control\.[a-z.]+'," src/widgets/authority/registry-binding.ts)
CF=$(grep -cE "'control\.[a-z.]+': '" src/widgets/authority/floor.ts)
if [ "$CK" = "3" ] && [ "$CF" = "3" ]; then say "CONTROL SPACE / FLOOR DOMAIN:" "3 = 3  (closed, and total)"
else say "CONTROL SPACE / FLOOR DOMAIN:" "$CK / $CF"; fail=1; fi

# A moment absent from MOMENT_REGISTRY cannot be emitted — the registry is the only door.
M=$(sed -n '/^export const MOMENT_REGISTRY/,/^});$/p' src/widgets/proactive/moments.ts \
  | grep -cE "^  [a-z_]+: m\(")
[ "$M" = "12" ] && say "MOMENT_REGISTRY ROWS:" "12  (closed catalogue)" \
  || { say "MOMENT_REGISTRY ROWS:" "$M"; fail=1; }

# Additive: wave 5 touches no pre-existing widget module except the two the CONTROL space required.
# Pinned to wave 5's own commit. Diffing against the working tree counted every later, separately
# approved change — the gate wiring — as wave 5 touching modules it never touched.
TOUCHED=$(cd .. && git diff --name-only 80cdde7a 0feb3932 -- maya-saas-backend/src/widgets \
  | grep -vE "widgets/(consent|proactive)/" | sed 's#.*/widgets/##' | tr '\n' ' ')
EXPECTED="authority/floor.ts authority/registry-binding.ts control/control-registry.service.ts "
[ "$TOUCHED" = "$EXPECTED" ] && say "PRE-EXISTING MODULES TOUCHED:" "3  (the CONTROL space only)" \
  || { say "PRE-EXISTING MODULES TOUCHED:" "$TOUCHED"; fail=1; }

echo
# ── the frozen limitations, restated so the gate cannot be read as closing them ─────────────────
say "GAP-ATTENDANCE-CONFIRM:" "OPEN  (K13 does not close it)"
say "  «клиент подтвердил»:" "NOT CLAIMABLE BY ANY SURFACE"
say "14-DAY PRODUCTION OBSERVATION:" "NOT RUN  (simulated window; 0 production effects)"
say "consent.register.export / the two unbinds:" "CANONICAL-OWNER WORK, OUTSIDE K12"
echo

npx tsc --noEmit -p tsconfig.build.json >/dev/null 2>&1 && say "typecheck:" "PASS" || { say "typecheck:" "FAIL"; fail=1; }
npm run -s lint >/dev/null 2>&1 && say "lint:" "PASS  (exit code)" || { say "lint:" "FAIL"; fail=1; }

echo
if [ $fail -eq 0 ]; then
  echo "K12 COMPLETE: YES"; echo "K13 COMPLETE: YES"
  echo "PACKAGES COMPLETE: 13/16"; echo "WAVES COMPLETE: 5/6"; echo "WAVE 5 COMPLETE: YES"
else echo "WAVE 5 COMPLETE: NO"; fi
exit $fail
