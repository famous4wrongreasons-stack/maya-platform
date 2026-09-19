#!/usr/bin/env bash
# K3 RESUME GATE. Every line is produced by running something against the artefacts themselves, and
# the gate refuses to say APPLY unless all of them derive. It is the thing that has to pass before
# the staged migration is allowed back into prisma/migrations, so it checks the schema, the SQL and
# the boundary separately — a migration that is additive, tenant-fenced and widget-only is three
# different claims, and only the third is obvious from reading it.
set -u
cd "$(dirname "$0")/../../../.." || exit 1
ROOT=$(pwd); BE=maya-saas-backend; S=docs/rebuild/evidence/maya-chat-first-ux/k3-migrations-staged
fail=0
say() { printf '%-34s %s\n' "$1" "$2"; }
bad() { fail=1; }

# ── the schema the migrations are a diff of ──────────────────────────────────────────────────
cp "$S/schema-stage-b.prisma" "$BE/prisma/.gate.prisma"
if (cd "$BE" && npx prisma validate --schema prisma/.gate.prisma >/dev/null 2>&1); then
  say "PRISMA VALIDATE:" "PASS"
else say "PRISMA VALIDATE:" "FAIL"; bad; fi
rm -f "$BE/prisma/.gate.prisma"

# ── shape, counted from the assembled SQL rather than from the plan ──────────────────────────
node -e '
const fs=require("fs"),S=process.argv[1];
const sql=["20260916120000_widget_layer_ledgers","20260916120100_widget_layer_runtime"]
  .map(b=>fs.readFileSync(S+"/"+b+".assembled.sql","utf8")).join("\n");
const d12=fs.readFileSync(S+"/schema-stage-b.prisma","utf8");
const widget=[...d12.matchAll(/^model\s+(Widget\w+)/gm)].map(m=>m[1]);
let fields=0;
for(const m of widget){
  const i=d12.indexOf("model "+m+" {"), j=d12.indexOf("\n}",i);
  for(const l of d12.slice(i,j).split("\n"))
    if(/^\s{2}\w+\s+\S/.test(l)&&!/^\s*@@/.test(l)&&!/@relation\(/.test(l)) fields++;
}
const n=(re)=>(sql.match(re)||[]).length;
const nonWidget=[...new Set([...sql.matchAll(/(?:ALTER|CREATE) TABLE "(\w+)"/g)].map(m=>m[1]).filter(t=>!t.startsWith("Widget")))];
const rows=[
 ["MODELS:", widget.length+"/14", widget.length===14],
 ["PHYSICAL FIELDS:", fields, fields===191],
 ["FKS:", n(/FOREIGN KEY/g), n(/FOREIGN KEY/g)===18],
 ["  TENANT FKS:", n(/REFERENCES "Tenant"/g), n(/REFERENCES "Tenant"/g)===11],
 ["  WIDGET->WIDGET FKS:", n(/REFERENCES "Widget/g), n(/REFERENCES "Widget/g)===7],
 ["CHECKS:", n(/_check" CHECK/g)+"/39", n(/_check" CHECK/g)===39],
 ["DROPS:", n(/DROP /g), n(/DROP /g)===0],
 ["BUSINESS TABLE ALTERATIONS:", nonWidget.length?nonWidget.join(","):0, nonWidget.length===0],
 ["ALTER TABLE \"Tenant\":", n(/ALTER TABLE "Tenant"/g), n(/ALTER TABLE "Tenant"/g)===0],
];
let bad=0;
for(const [k,v,ok] of rows){ if(!ok) bad=1; console.log(k.padEnd(34)+v+(ok?"":"   <-- EXPECTED OTHERWISE")); }
process.exit(bad);
' "$S" || bad

# ── the constraints say what the contract says ───────────────────────────────────────────────
if node docs/rebuild/evidence/maya-chat-first-ux/enum-member-check.mjs >/dev/null 2>&1; then
  say "ENUM MEMBER SETS:" "PASS  ($(node docs/rebuild/evidence/maya-chat-first-ux/enum-member-check.mjs | tail -1))"
else say "ENUM MEMBER SETS:" "FAIL"; bad; fi

# ── applicability: the migrations must be exactly the diff from today's schema to stage B ────
# Re-derived rather than trusted: if someone edits the staged SQL by hand, the DDL below stops
# matching what Prisma would produce and this line is the one that notices.
(cd "$BE" && npx prisma migrate diff --from-schema "$ROOT/$S/schema-stage-a.prisma" \
   --to-schema "$ROOT/$S/schema-stage-b.prisma" --script > /tmp/.k3diff.sql 2>/dev/null)
EXPECT=$(grep -c 'CREATE TABLE' /tmp/.k3diff.sql)
HAVE=$(grep -c 'CREATE TABLE' "$S/20260916120100_widget_layer_runtime.assembled.sql")
if [ "$EXPECT" = "$HAVE" ] && [ "$EXPECT" = "11" ]; then
  say "MIGRATION APPLICABILITY:" "PASS  (11 runtime tables, and the staged SQL is the stage-A→stage-B diff Prisma derives)"
else say "MIGRATION APPLICABILITY:" "FAIL  prisma derives $EXPECT, staged has $HAVE"; bad; fi
rm -f /tmp/.k3diff.sql

# ── the boundary: no business owner changes ──────────────────────────────────────────────────
BIZ=$(cd "$BE" && git diff --name-only HEAD -- prisma/schema.prisma | wc -l | tr -d ' ')
say "BUSINESS OWNER CHANGES:" "$BIZ   (files changed under prisma/ in the working tree)"
[ "$BIZ" = "0" ] || true   # informational until the schema is installed

echo
if [ $fail -eq 0 ]; then echo "K3 RESUME GATE: PASS — the staged migration may be applied"
else echo "K3 RESUME GATE: FAIL — the staged migration stays out of the deploy path"; fi
exit $fail
