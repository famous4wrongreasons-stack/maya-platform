#!/usr/bin/env bash
# Every checker, with the argument each one actually wants. Three of them take a document path and
# print a misleading "absent" when handed the wrong file, so the invocation is recorded here rather
# than remembered.
set -u
cd "$(dirname "$0")/../../../.." || exit 1; ROOT=$(pwd)
D=docs/rebuild; E=$D/evidence/maya-chat-first-ux; fail=0
run(){ printf '%-34s ' "$1"; shift; out=$(node "$@" 2>&1 | tail -1); echo "$out"
       case "$out" in *FAIL*|*Error*|*error*) fail=1;; esac; }
run consolidated-mechanical-audit  $E/consolidated-mechanical-audit.mjs
run citation-target-check          $E/citation-target-check.mjs
run per-kind-totality-check        $E/per-kind-totality-check.mjs
run f6a-one-declaration-check      $E/f6a-one-declaration-check.mjs
run predicate-restatement-check    $E/predicate-restatement-check.mjs
run r3115-constructibility-proof   $E/r3115-constructibility-proof.mjs
run envelope-check                 $E/envelope-check.mjs            $D/MAYA-CHAT-FIRST-IMPLEMENTATION-ENVELOPE.md
run mapping-vs-contract-check      $E/mapping-vs-contract-check.mjs $D/MAYA-CHAT-FIRST-K1-K16-IMPLEMENTATION-MAPPING.md
run widget-schema-count            $E/widget-schema-count.mjs       $D/MAYA-CHAT-FIRST-K1-K16-IMPLEMENTATION-MAPPING.md
run k1-dossier-check               $E/k1/k1-dossier-check.mjs
run k1-human-dossier               $E/k1/build-human-dossier.mjs
run k1-signature-check             $E/k1/k1-signature-check.mjs
run widget-check-generator         $E/build-widget-checks.mjs
run enum-member-check              $E/enum-member-check.mjs
printf '%-34s ' widget-contract-check
( cd maya-saas-backend && node scripts/widget-contract-check.mjs 2>&1 | tail -1 )
printf '%-34s ' k3-gateway-check
( cd maya-saas-backend && node scripts/k3-gateway-check.mjs 2>&1 | tail -1 )
printf '%-34s ' k3-exit-gate
( "$ROOT/$E/k3-exit-gate.sh" 2>&1 | tail -1 )
printf '%-34s ' k4-exit-gate
( "$ROOT/$E/k4-exit-gate.sh" 2>&1 | tail -1 )
printf '%-34s ' k5-exit-gate
( "$ROOT/$E/k5-exit-gate.sh" 2>&1 | tail -1 )
printf '%-34s ' k6-exit-gate
( "$ROOT/$E/k6-exit-gate.sh" 2>&1 | tail -1 )
printf '%-34s ' wave-3-final-gate
( "$ROOT/$E/wave-3-final-gate.sh" 2>&1 | tail -1 )
printf '%-34s ' wave-4-final-gate
( "$ROOT/$E/wave-4-final-gate.sh" 2>&1 | tail -1 )
printf '%-34s ' f88-mutation-battery
( cd maya-saas-backend && "$ROOT/$E/f88-mutation-battery.sh" 2>&1 | tail -1 )
exit $fail
