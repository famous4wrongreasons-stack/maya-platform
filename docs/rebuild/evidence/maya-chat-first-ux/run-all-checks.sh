#!/usr/bin/env bash
# Every checker, with the argument each one actually wants. Three of them take a document path and
# print a misleading "absent" when handed the wrong file, so the invocation is recorded here rather
# than remembered.
set -u
cd "$(dirname "$0")/../../../.." || exit 1; ROOT=$(pwd)
D=docs/rebuild; E=$D/evidence/maya-chat-first-ux; fail=0
run(){ printf '%-34s ' "$1"; shift; all=$(node "$@" 2>&1); rc=$?; out=$(printf '%s\n' "$all" | tail -1); echo "$out"
       [ "$rc" -eq 0 ] || fail=1
       case "$out" in *FAIL*|*Error*|*error*) fail=1;; esac; }
# A gate or a backend check: its exit status decides, and its last line is printed. The status is read from
# the checker itself, never through `| tail`, which would replace it with tail's.
gate(){ printf '%-34s ' "$1"; shift; all=$("$@" 2>&1); rc=$?; out=$(printf '%s\n' "$all" | tail -1); echo "$out"
        [ "$rc" -eq 0 ] || { fail=1; printf '%-34s exit %s\n' '' "$rc"; }; }
inbe(){ ( cd maya-saas-backend && "$@" ); }
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
run contract-version-record-check  $E/contract-version-record-check.mjs
# GATES-PLAN-V11 I-HAR: the gate audit is schema /2, pinned to the contract, keyed exactly by the clause inventory;
# the self-test proves each of its checks can go red (HAR-5).
run gate-audit-check               $E/gate-audit-check.mjs
run gate-audit-check-self-test     $E/gate-audit-check.mjs --self-test
gate widget-contract-check          inbe node scripts/widget-contract-check.mjs
# GATES-PLAN-V11 P-F88 (IR-F88-4): the generated F88 union and the six F88.2 exemption rows are what the
# contract says, or the generator exits 1. Without it `f88.generated.ts` could drift from §0.15 silently.
gate emit-f88-check                 inbe node scripts/widget-contract/emit-f88.mjs --check
gate k3-gateway-check               inbe node scripts/k3-gateway-check.mjs
gate k3-exit-gate                   "$ROOT/$E/k3-exit-gate.sh"
gate k4-exit-gate                   "$ROOT/$E/k4-exit-gate.sh"
gate k5-exit-gate                   "$ROOT/$E/k5-exit-gate.sh"
gate k6-exit-gate                   "$ROOT/$E/k6-exit-gate.sh"
gate wave-3-final-gate              "$ROOT/$E/wave-3-final-gate.sh"
gate wave-4-final-gate              "$ROOT/$E/wave-4-final-gate.sh"
gate f88-mutation-battery           inbe "$ROOT/$E/f88-mutation-battery.sh"
exit $fail
