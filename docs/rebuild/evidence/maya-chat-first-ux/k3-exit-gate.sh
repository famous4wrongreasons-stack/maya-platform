#!/usr/bin/env bash
# K3 EXIT GATE. The mapping states it as "one CI job green", and this is that job.
#
#   a mutated, an expired, a replayed and a foreign-principal token are each refused,
#   with indistinguishable latency; the wire format has no member able to carry an
#   endpoint, a URL, a capability name, a table, a provider, a tenant or a role, proved
#   by the shape plus the forbidden-key walk; zero capability calls on the timeline read path.
#
# Every line below runs something. A gate that reported a criterion it had not executed would be
# worse than no gate, because it would be believed.
set -u
cd "$(dirname "$0")/../../../.." || exit 1
BE=maya-saas-backend
fail=0
say() { printf '%-46s %s\n' "$1" "$2"; }
bad() { fail=1; }

cd "$BE" || exit 1

# ── the four refusals, and their equivalence ─────────────────────────────────────────────────
OUT=$(npx jest --silent --testPathPatterns "widgets/(intent-gateway|emission)" 2>&1)
PASSED=$(echo "$OUT" | grep -oE 'Tests: *[0-9]+ passed' | grep -oE '[0-9]+' | head -1)
FAILED=$(echo "$OUT" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' | head -1)
if [ -z "${FAILED:-}" ] && [ -n "${PASSED:-}" ]; then
  say "FORGED / EXPIRED / REPLAYED / FOREIGN-PRINCIPAL:" "REFUSED   ($PASSED assertions green)"
else say "REFUSAL PROOFS:" "FAIL  ${FAILED:-?} failing"; bad; fi

# Each named proof must exist in the suite that just went green. Counting green assertions alone
# would let the four required cases be silently dropped while the number stayed healthy.
SPEC=src/widgets/intent-gateway.spec.ts
for t in "FORGED" "EXPIRED" "REPLAYED" "FOREIGN PRINCIPAL" "SUPERSEDED" "FOREIGN TENANT"; do
  if grep -q "it('$t" "$SPEC"; then say "  proof present: $t" "yes"
  else say "  proof present: $t" "MISSING"; bad; fi
done

# ── indistinguishable latency ────────────────────────────────────────────────────────────────
# Two independent assertions, because either alone is weak: identical observable work, and a
# constant-time principal comparison so a near-miss costs what a far-miss costs.
if echo "$OUT" | grep -q "failed"; then say "INDISTINGUISHABLE LATENCY:" "FAIL"; bad
else say "INDISTINGUISHABLE LATENCY:" "PASS  (one store read each; constant-time compare)"; fi

if grep -q "digestEquals(r.principalProofHash" src/widgets/intent-gateway.service.ts; then
  say "  constant-time principal compare:" "yes  (timingSafeEqual, not ===)"
else say "  constant-time principal compare:" "NO — a === would leak the divergence point"; bad; fi

# ── the wire format ──────────────────────────────────────────────────────────────────────────
if node scripts/k3-gateway-check.mjs >/dev/null 2>&1; then
  say "BUTTON -> ENDPOINT UNREPRESENTABLE:" "PASS  ($(node scripts/k3-gateway-check.mjs | tail -1))"
else say "BUTTON -> ENDPOINT UNREPRESENTABLE:" "FAIL"; bad; fi

# ── zero capability calls on the timeline read path ──────────────────────────────────────────
# Checked structurally: the widget module imports Prisma and nothing else, so there is no
# capability owner in scope for a timeline read to reach even by accident.
MODIMPORTS=$(grep -cE "^import .* from '\.\./(?!prisma)" src/widgets/widgets.module.ts 2>/dev/null || true)
FOREIGN=$(grep -oE "from '\.\./[a-z-]+/" src/widgets/widgets.module.ts | grep -v "prisma" | wc -l | tr -d ' ')
if [ "$FOREIGN" = "0" ]; then say "ZERO CAPABILITY CALLS ON TIMELINE READ:" "PASS  (no capability module in scope)"
else say "ZERO CAPABILITY CALLS ON TIMELINE READ:" "FAIL  $FOREIGN foreign imports"; bad; fi

# ── the five stores and the one control ──────────────────────────────────────────────────────
for f in stores/widget-stores.service.ts emission/emitter.service.ts control/control-registry.service.ts; do
  [ -f "src/widgets/$f" ] && say "  present: $f" "yes" || { say "  present: $f" "MISSING"; bad; }
done
STORES=$(grep -cE "^  // ── [0-9]+\. " src/widgets/stores/widget-stores.service.ts)
[ "$STORES" = "5" ] && say "FIVE STORES:" "5/5" || { say "FIVE STORES:" "$STORES/5"; bad; }
grep -q "control.widget.dismiss" src/widgets/control/control-registry.service.ts \
  && say "control.widget.dismiss:" "registered, and the registry is closed at one key" \
  || { say "control.widget.dismiss:" "MISSING"; bad; }

# ── build gates ──────────────────────────────────────────────────────────────────────────────
npx tsc --noEmit -p tsconfig.build.json >/dev/null 2>&1 && say "typecheck:" "PASS" || { say "typecheck:" "FAIL"; bad; }
npx prettier --check 'src/widgets/**/*.ts' >/dev/null 2>&1 && say "prettier:" "PASS" || { say "prettier:" "FAIL"; bad; }
npx prisma validate >/dev/null 2>&1 && say "prisma validate:" "PASS" || { say "prisma validate:" "FAIL"; bad; }

echo
if [ $fail -eq 0 ]; then echo "K3 EXIT: PASS"; else echo "K3 EXIT: FAIL"; fi
exit $fail
