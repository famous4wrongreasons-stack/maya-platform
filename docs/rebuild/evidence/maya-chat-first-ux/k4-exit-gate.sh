#!/usr/bin/env bash
# K4 EXIT GATE. The mapping states it as "one CI job green":
#   verificationFloor is total over every key in all four spaces; SECURE_SURFACE_ONLY emissions in
#   chat = 0; floor-reduction count computed from code = 2, compared against §0.17 and failing on
#   any difference.
#
# IR-K4K8-2 (P-K4K8, landed with U12a). Two pins are DROPPED and two replace them.
#   - "fire independently" and the "ARTIFACT PII UNDECLARED refuse" ratchet both grep
#     `src/widgets/authority/*.spec.ts` for strings that lived in the fence section IR-K4K8-1 removes
#     with `authority/pii-fences.ts`. Left in place they would fail this gate for a reason unrelated
#     to K4's floor work. The second is NOT in the plan's IR-K4K8-2 text; it is P-K4K8's own finding.
#   - What replaces them is the mechanism F95 item 2 (C11:1882-1886) actually states — "no
#     widget-layer module may implement PII masking of its own", with masking in the OWNERS, and no
#     count at all — plus F18 with the C.5 correction (C11:292-296, C11:7333): three presentation
#     modes, not the four `client-presentation.ts` carried.
set -u
cd "$(dirname "$0")/../../../.." || exit 1
BE=maya-saas-backend; fail=0
say() { printf '%-44s %s\n' "$1" "$2"; }
cd "$BE" || exit 1

OUT=$(npx jest --silent --testPathPatterns "widgets/authority" 2>&1)
P=$(echo "$OUT" | grep -oE 'Tests: *[0-9]+ passed' | grep -oE '[0-9]+' | head -1)
F=$(echo "$OUT" | grep -oE '[0-9]+ failed' | head -1)
if [ -z "$F" ] && [ -n "${P:-}" ]; then say "AUTHORITY PROOFS:" "PASS  ($P assertions)"; else say "AUTHORITY PROOFS:" "FAIL"; fail=1; fi

for t in "TOTAL over all four spaces" "SENSITIVE_DEST is total" "LOCAL row is unique" "BUILD VETO"; do
  grep -qr "$t" src/widgets/authority/*.spec.ts && say "  proof: $t" "present" || { say "  proof: $t" "MISSING"; fail=1; }
done

# IR-K4K8-2: the replacement pins. Neither lives under `src/widgets/authority/`, so each needs its
# own line rather than another needle in the loop above.
grep -q "K4K8-1" src/widgets/gates/gate12-pii-path.source.spec.ts \
  && say "  proof: NO WIDGET-LAYER PII PATH" "present" \
  || { say "  proof: NO WIDGET-LAYER PII PATH" "MISSING"; fail=1; }
grep -q "ARCH-12-2" src/widgets/projection/*.architecture.spec.ts \
  && say "  proof: F95 item 2 masking stays in the owners" "present" \
  || { say "  proof: F95 item 2 masking stays in the owners" "MISSING"; fail=1; }

# The frozen ratchets, each asserted by a named test rather than by a comment. FOUR since IR-K4K8-2:
# "ARTIFACT PII UNDECLARED refuse" greps for a title that lived in the deleted fence section.
for r in "STEP_UP_VERIFIED unreachable:keeps STEP_UP_VERIFIED unreachable" \
         "THIRD FLOOR REDUCTION none:no third floor reduction exists in code" \
         "UNKNOWN FLOOR fail-closed:fails CLOSED on a level the ladder does not contain" \
         "ZERO-FLOOR COMBINATION refuse:refuses to combine zero floors"; do
  name=${r%%:*}; needle=${r#*:}
  grep -qr "$needle" src/widgets/authority/*.spec.ts && say "  ratchet: $name" "held" || { say "  ratchet: $name" "MISSING"; fail=1; }
done

# The registries are BOUND, not declared: the census must execute and match.
cat > src/widgets/authority/.gate.spec.ts <<'EOF'
import { census, spaceOverlap } from './registry-binding';
it('bound', () => {
  const c = census();
  expect(c.C9).toBe(56); expect(c.TOOL).toBe(47); expect(c.AE).toBe(226);
  expect(spaceOverlap().toolSubsetOfC9).toBe(true);
  expect(spaceOverlap().aeIntersectC9).toBe(0);
});
EOF
if npx jest --silent --testPathPatterns "authority/.gate" >/dev/null 2>&1; then
  say "REGISTRIES BOUND (executed, not declared):" "C9 56 · TOOL 47 · AE 226 · TOOL⊂C9 · AE∩C9=0"
else say "REGISTRIES BOUND:" "FAIL"; fail=1; fi
rm -f src/widgets/authority/.gate.spec.ts

npx tsc --noEmit -p tsconfig.build.json >/dev/null 2>&1 && say "typecheck:" "PASS" || { say "typecheck:" "FAIL"; fail=1; }
npx prettier --check 'src/widgets/**/*.ts' >/dev/null 2>&1 && say "prettier:" "PASS" || { say "prettier:" "FAIL"; fail=1; }

echo
[ $fail -eq 0 ] && echo "K4 EXIT: PASS" || echo "K4 EXIT: FAIL"
exit $fail
