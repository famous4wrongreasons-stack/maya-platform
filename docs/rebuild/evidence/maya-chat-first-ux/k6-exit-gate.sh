#!/usr/bin/env bash
# K6 EXIT GATE. "One CI job green": every intents_withheld and body_reductions entry names a
# reachable_via / restored_by PRESENT in the emitted envelope, or the fitter throws rather than
# emitting; the escape verb is reachable on every tier.
#
# And one property this package is uniquely at risk of losing: it must not re-implement a rule K3
# or K4 already owns. Two answers to "may this happen" is worse than a missing one.
set -u
cd "$(dirname "$0")/../../../.." || exit 1
BE=maya-saas-backend; fail=0
say() { printf '%-46s %s\n' "$1" "$2"; }
cd "$BE" || exit 1

OUT=$(npx jest --silent --testPathPatterns "widgets/carriers" 2>&1)
P=$(echo "$OUT" | grep -oE 'Tests: *[0-9]+ passed' | grep -oE '[0-9]+' | head -1)
echo "$OUT" | grep -q "failed" && { say "CARRIER PROOFS:" "FAIL"; fail=1; } || say "CARRIER PROOFS:" "PASS  ($P assertions)"

for t in "REFUSES rather than emitting" "never withholds the escape verb" \
         "reduces a body rather than truncating" "does not re-implement K3 or K4"; do
  grep -qr "$t" src/widgets/carriers/*.spec.ts && say "  proof: $t" "present" || { say "  proof: $t" "MISSING"; fail=1; }
done

CARRIERS=$(grep -cE "^    (pwa|'telegram-bot'|'web-push'|'realtime-voice'|sms|email):" src/widgets/carriers/channel-profile.ts)
[ "$CARRIERS" = "6" ] && say "FIVE CARRIERS PLUS VOICE:" "6 profiles" || { say "CARRIERS:" "$CARRIERS"; fail=1; }

# The separation of concerns, checked in code rather than trusted: the fitter may not name an
# authority symbol at all.
LEAK=$(grep -cE "verificationFloor|subjectFloorFor|principalProofHash|FLOOR_EXEMPT" src/widgets/carriers/fitter.ts || true)
[ "$LEAK" = "0" ] && say "NO SECOND AUTHORITY IMPLEMENTATION:" "the fitter names no floor symbol" \
  || { say "NO SECOND AUTHORITY IMPLEMENTATION:" "FAIL — $LEAK authority references"; fail=1; }

npx tsc --noEmit -p tsconfig.build.json >/dev/null 2>&1 && say "typecheck:" "PASS" || { say "typecheck:" "FAIL"; fail=1; }

echo
[ $fail -eq 0 ] && echo "K6 EXIT: PASS" || echo "K6 EXIT: FAIL"
exit $fail
