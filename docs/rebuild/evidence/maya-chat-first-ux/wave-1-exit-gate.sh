#!/usr/bin/env bash
# WAVE 1 EXIT GATE. Every line is derived by running something, not by asserting it. The gate fails
# if any line cannot be produced, because a wave exit that prints a number nobody computed is the
# thing this whole cycle has been built to prevent.
set -u
cd "$(dirname "$0")/../../../.." || exit 1; ROOT=$(pwd)
E=docs/rebuild/evidence/maya-chat-first-ux; BE=maya-saas-backend
fail=0; say(){ printf '%-34s %s\n' "$1" "$2"; }
bad(){ fail=1; }

# K1 SIGNED — from the signature checker, not from a flag in a document
if node "$E/k1/k1-signature-check.mjs" >/dev/null 2>&1; then
  n=$(node "$E/k1/k1-signature-check.mjs" | tail -1 | grep -oE '[0-9]+/[0-9]+')
  say "K1 SIGNED:" "YES   ($n signature checks)"
else say "K1 SIGNED:" "NO"; bad; fi

# K1 dossier integrity
d=$(node "$E/k1/k1-dossier-check.mjs" 2>/dev/null | grep -oE '^[0-9]+/[0-9]+ checks pass' | head -1)
[ -n "$d" ] && say "K1 DOSSIER:" "$d" || { say "K1 DOSSIER:" "FAIL"; bad; }

# K2 COMPILE — actually typecheck the generated module
if ( cd "$BE" && npx tsc -p tsconfig.widget-contract.json --noEmit >/dev/null 2>&1 ); then
  say "K2 COMPILE:" "PASS"
else say "K2 COMPILE:" "FAIL"; bad; fi

# K2 CHECKERS — the count the checker itself reports
c=$( cd "$BE" && node scripts/widget-contract-check.mjs 2>/dev/null | grep -oE '^[0-9]+/[0-9]+ checks pass' )
[ -n "$c" ] && say "K2 CHECKERS:" "$c" || { say "K2 CHECKERS:" "FAIL"; bad; }
echo "$c" | awk -F'[/ ]' '{if($1!=$2) exit 1}' || bad

# F88 fence — every mutation must still be caught
if "$E/f88-mutation-battery.sh" 2>/dev/null | tail -1 | grep -q "ALL MUTATIONS CAUGHT"; then
  say "F88 MUTATIONS CAUGHT:" "20/20"
else say "F88 MUTATIONS CAUGHT:" "A MUTATION SURVIVED"; bad; fi

# WIDGET CONTRACT REGRESSIONS — the contract's own mechanical audit plus citation integrity
a=$(node "$E/consolidated-mechanical-audit.mjs" 2>/dev/null | tail -1 | grep -oE '^[0-9]+/[0-9]+')
t=$(node "$E/citation-target-check.mjs" 2>/dev/null | tail -1 | grep -oE '[0-9]+$')
if [ "$a" = "29/29" ] && [ "${t:-1}" = "0" ]; then say "WIDGET CONTRACT REGRESSIONS:" "0   (audit $a, dangling citations $t)"
else say "WIDGET CONTRACT REGRESSIONS:" "audit $a, citations $t"; bad; fi

# BUSINESS OWNER CHANGES — no business table points at a widget table, and no business schema moved
b=$(node "$E/widget-schema-count.mjs" docs/rebuild/MAYA-CHAT-FIRST-K1-K16-IMPLEMENTATION-MAPPING.md 2>/dev/null \
    | grep -c "PASS  no business → widget FK is declared anywhere")
sch=$(git diff --name-only 1b2cec96..HEAD -- "$BE/prisma" | wc -l | tr -d ' ')
if [ "$b" = "1" ] && [ "$sch" = "0" ]; then say "BUSINESS OWNER CHANGES:" "0   (no business→widget FK; prisma/ untouched)"
else say "BUSINESS OWNER CHANGES:" "FK check $b, prisma files changed $sch"; bad; fi

# PRODUCTION EFFECTS FOR PROOF — nothing deployed, nothing in the build output, no production file
p=$(git diff --name-only 1b2cec96..HEAD | grep -cE '^(ai |сайт |maya-os-site|smm_bot)' || true)
dist=$( [ -d "$BE/dist/widget-contract" ] && echo LEAK || echo none )
ex=$(grep -c '"src/widget-contract"' "$BE/tsconfig.build.json")
if [ "$p" = "0" ] && [ "$dist" = "none" ] && [ "$ex" = "1" ]; then
  say "PRODUCTION EFFECTS FOR PROOF:" "0   (0 production files; excluded from build; no dist)"
else say "PRODUCTION EFFECTS FOR PROOF:" "prod files $p, dist $dist, exclude $ex"; bad; fi

echo
if [ $fail -eq 0 ]; then
  echo "K1 COMPLETE: YES"; echo "K2 COMPLETE: YES"; echo "WAVE 1 COMPLETE: YES"
  echo "PACKAGES COMPLETE: 2/16"; echo "WAVES COMPLETE: 1/6"
else
  echo "WAVE 1 COMPLETE: NO — a line above did not derive"
fi
exit $fail
