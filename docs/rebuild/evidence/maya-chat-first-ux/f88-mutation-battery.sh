#!/usr/bin/env bash
# F88.2 mutation battery. A checker that cannot fail is not a checker: each mutation widens or
# narrows exactly one arm of the fence and MUST reduce the pass count. Three arms were found dead
# by this battery and are now covered: row 4's type predicate, the walk's depth-unboundedness, and
# the walk's reference-following. Run from maya-saas-backend.
BASE=$(node scripts/widget-contract-check.mjs 2>&1 | grep -oE "^[0-9]+")
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT; bad=0
mut(){ cp scripts/widget-contract-check.mjs "$TMP/m.mjs"
  python3 - "$TMP/m.mjs" "$2" "$3" <<'PY' || { printf '  %-52s NOT APPLIED\n' "$1"; return 1; }
import sys; p,o,n=sys.argv[1],sys.argv[2],sys.argv[3]
s=open(p,encoding='utf-8').read()
sys.exit(2) if o not in s else open(p,'w',encoding='utf-8').write(s.replace(o,n,1))
PY
  cp "$TMP/m.mjs" scripts/.mut.mjs; r=$(node scripts/.mut.mjs 2>&1|tail -1); rm -f scripts/.mut.mjs
  n=$(echo "$r"|grep -oE "^[0-9]+")
  if [ "${n:-999}" -lt "$BASE" ]; then printf '  %-52s CAUGHT\n' "$1"; else printf '  %-52s SURVIVED  <-- dead fence arm\n' "$1"; bad=1; fi }
echo "baseline $BASE/$BASE"
mut "EXEMPT stops comparing depth"   "      e.depth === m.depth &&
" ""
mut "EXEMPT stops comparing path"    "      e.path === m.path &&
" ""
mut "EXEMPT stops comparing shape"   "      e.shape === shape &&
" ""
mut "EXEMPT stops checking the type" "      e.type(m.type)," "      true,"
mut "row 1 Cell.state any type"      "    type: (t) => t === 'CellState'," "    type: () => true,"
mut "row 2 Lifecycle.state any type" "    type: (t) => t === 'LifecycleState'," "    type: () => true,"
mut "row 4 IntentRecord tenant any type" "    type: (t) => t === 'string',
    note: '§3.7" "    type: () => true,
    note: '§3.7"
mut "row 5 WidgetIntent.role any type" "    type: isRoleEnum," "    type: () => true,"
mut "row 6 RenderReceipt role any type" "    type: (t) => t === \"WidgetIntent['role']\"," "    type: () => true,"
mut "a 7th row for an undeclared shape" "const EXEMPT = (shape, m) =>" "F88_EXEMPTIONS.push({shape:'Ghost',path:'role',depth:0,type:()=>true,note:'x'});
const EXEMPT = (shape, m) =>"
mut "a key-name-shaped row is added"  "  {
    shape: 'Cell'," "  { key: 'role' },
  {
    shape: 'Cell',"
mut "ROLE_ENUM accepts a ninth value" "const ROLE_ENUM = [" "const ROLE_ENUM = ['owner',"
mut "row 4 deleted (under-permissive)" "  {
    shape: 'IntentRecord',
    path: 'tenant_id',
    depth: 0,
    type: (t) => t === 'string'," "  {
    shape: 'IntentRecordX',
    path: 'tenant_id',
    depth: 0,
    type: (t) => t === 'string',"
mut "the walk stops at depth 1"       "if (m.type) visit(m.type, here, depth + 1);" "if (m.type && depth < 1) visit(m.type, here, depth + 1);"
mut "the walk stops at depth 2"       "if (m.type) visit(m.type, here, depth + 1);" "if (m.type && depth < 2) visit(m.type, here, depth + 1);"
mut "the walk skips T[] arrays"       "    if (ts.isArrayTypeNode(n))" "    if (false && ts.isArrayTypeNode(n))"
mut "the walk skips Array<T>"         "n.typeName.getText(sf) === 'Array' &&" "false &&"
mut "reach stops following references" "if (shapes[ref] && !reach.has(ref)) queue.push(ref);" "if (false) queue.push(ref);"
mut "FORBIDDEN loses tenant_id"       "'tenant_id'," ""
mut "FORBIDDEN loses role"            "  'role'," ""

# ── GATES-PLAN-V11 P-F88 (IR-F88-5): the RUNTIME list cannot drift from the contract ──────────
# The card says "append runtime mutants" here. This script's mechanism is "mutate
# `widget-contract-check.mjs`, count its passes", and it cannot measure the runtime walk: the
# per-arm runtime mutants are `test/widgets-live/mutations/gateP-f88.json` F88-M1..M14, which the
# plan's own runner executes. What this script CAN measure, in exactly its own style, is the
# GENERATOR - that `src/widget-contract/f88.generated.ts` is what §0.15 says and cannot silently
# stop being it. It measures an exit code rather than a pass count, so it has its own runner.
#
# Only arms that are CAUGHT today are listed. Dropping `emit-f88.mjs`'s own count guards
# (`unique.length !== 28`, `rows.length !== 6`) and widening its unmappable-type branch are
# deliberately NOT listed: with the contract unedited the parse is still correct, so `--check` still
# passes and the arm would read as a dead fence when it is only unreachable from here. Each is
# covered by the slice mutations below, which make the parse wrong and prove the comparison bites.
echo
echo "the generator (P-F88): emit-f88.mjs --check must go red for each arm"
gmut(){ cp scripts/widget-contract/emit-f88.mjs "$TMP/g.mjs"
  python3 - "$TMP/g.mjs" "$2" "$3" <<'GPY' || { printf '  %-52s NOT APPLIED\n' "$1"; bad=1; return 1; }
import sys; p,o,n=sys.argv[1],sys.argv[2],sys.argv[3]
s=open(p,encoding='utf-8').read()
sys.exit(2) if o not in s else open(p,'w',encoding='utf-8').write(s.replace(o,n,1))
GPY
  cp "$TMP/g.mjs" scripts/widget-contract/.emit-f88.mut.mjs
  node scripts/widget-contract/.emit-f88.mut.mjs --check >/dev/null 2>&1; r=$?
  rm -f scripts/widget-contract/.emit-f88.mut.mjs
  if [ $r -ne 0 ]; then printf '  %-52s CAUGHT\n' "$1"; else printf '  %-52s SURVIVED  <-- dead fence arm\n' "$1"; bad=1; fi }
gmut "the F88.2 table slice ends at row 5"    "    '**Rows 4 and 6 are the wave-1 rulings'," "    '| 5 |',"
gmut "the union's paragraph slice ends early" "    '*Mechanism:* one structural validator'," "    '\`role\` *(F88.2)*',"

echo; [ $bad -eq 0 ] && echo "ALL MUTATIONS CAUGHT - every arm of the fence is load-bearing" || echo "A MUTATION SURVIVED"
exit $bad
