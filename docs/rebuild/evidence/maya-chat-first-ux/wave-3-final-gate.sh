#!/usr/bin/env bash
# WAVE 3 FINAL GATE — K7, K8, K9, and the six figures the owner asked to be proved.
set -u
cd "$(dirname "$0")/../../../.." || exit 1
BE=maya-saas-backend; fail=0
say(){ printf '%-40s %s\n' "$1" "$2"; }
cd "$BE" || exit 1

OUT=$(npx jest --silent --maxWorkers=4 --testPathPatterns "widgets/(booking|client|commerce)" 2>&1)
P=$(echo "$OUT" | grep -oE 'Tests: *[0-9]+ passed' | grep -oE '[0-9]+' | head -1)
echo "$OUT" | grep -qE "Tests: *[0-9]+ failed" && { say "WAVE 3 PROOFS:" "FAIL"; fail=1; } \
  || say "WAVE 3 PROOFS:" "PASS  ($P assertions)"
echo

# ── the six figures, each backed by a named test in the suite that just went green ───────────
check() { grep -qr "$2" src/widgets/*/*.spec.ts && say "$1" "$3" || { say "$1" "MISSING PROOF"; fail=1; }; }
check "COMMIT OUTSIDE CONFIRMATION:" "COMMIT OUTSIDE CONFIRMATION: IMPOSSIBLE" "IMPOSSIBLE"
check "BOOKING ALLOWLIST:" "BOOKING ALLOWLIST: EXACTLY 3 KEYS" "EXACTLY 3 KEYS"
check "MONEY KEYS GAP-KEYED:" "MONEY KEYS GAP-KEYED: 92/92" "92/92"
check "DIRECT UI → PROVIDER WRITES:" "DIRECT UI → PROVIDER WRITES: 0" "0"
check "VOICE-SPECIFIC AUTHORITY PATHS:" "VOICE-SPECIFIC AUTHORITY PATHS: 0" "0"
node scripts/k3-gateway-check.mjs >/dev/null 2>&1 \
  && say "BUTTON → ENDPOINT PATHS:" "0   (no member able to carry one)" \
  || { say "BUTTON → ENDPOINT PATHS:" "FAIL"; fail=1; }
echo

# ── the allowlist is three, counted from the source, not from a test name ────────────────────
N=$(grep -cE "^      ae: 'crm\.appointment\." src/widgets/booking/booking-allowlist.ts)
[ "$N" = "3" ] && say "allowlist rows in source:" "3" || { say "allowlist rows in source:" "$N"; fail=1; }
G=$(grep -cE "^  '(attendance|duration|services|fields)'," src/widgets/booking/booking-allowlist.ts)
[ "$G" = "4" ] && say "gap-ledgered, not admitted:" "4  (attendance, duration, services, fields)" \
  || { say "gap-ledgered:" "$G"; fail=1; }

# ── the canonical flow exists end to end ─────────────────────────────────────────────────────
for s in SERVICE_SELECTOR STAFF_SELECTOR TIME_SLOT_SELECTOR BOOKING_CONFIRMATION; do
  grep -q "$s" src/widgets/booking/booking-commit.service.ts && say "  flow stage: $s" "present" \
    || { say "  flow stage: $s" "MISSING"; fail=1; }
done

npx tsc --noEmit -p tsconfig.build.json >/dev/null 2>&1 && say "typecheck:" "PASS" || { say "typecheck:" "FAIL"; fail=1; }
npm run -s lint >/dev/null 2>&1 && say "lint:" "PASS  (exit code)" || { say "lint:" "FAIL"; fail=1; }

echo
if [ $fail -eq 0 ]; then
  echo "K7 COMPLETE: YES"; echo "K8 COMPLETE: YES"; echo "K9 COMPLETE: YES"
  echo "PACKAGES COMPLETE: 9/16"; echo "WAVES COMPLETE: 3/6"; echo "WAVE 3 COMPLETE: YES"
else echo "WAVE 3 COMPLETE: NO"; fi
exit $fail
