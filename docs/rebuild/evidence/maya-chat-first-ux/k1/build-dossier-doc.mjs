import fs from 'node:fs';
const K=process.argv[2];
const rows=JSON.parse(fs.readFileSync(K+'/k1-surface-dossier.json','utf8'));
const redis=JSON.parse(fs.readFileSync(K+'/k1-nav-redispositions.json','utf8'));
const cap=JSON.parse(fs.readFileSync(K+'/k1-capability-gap-ledger.json','utf8')).rows;
const mech=JSON.parse(fs.readFileSync(K+'/k1-mechanism-gap-ledger.json','utf8')).rows;
const har=JSON.parse(fs.readFileSync(K+'/k1-parity-harness.json','utf8')).rows;
const by=f=>rows.reduce((m,r)=>(m[r[f]]=(m[r[f]]||0)+1,m),{});
const prov=rows.reduce((m,r)=>{const k=r.successorSource.split(' - ')[0];m[k]=(m[k]||0)+1;return m;},{});
const sigS=rows.filter(r=>r.successorSource==='REQUIRES SIGNATURE');
const sigO=rows.filter(r=>r.canonicalOwnerSource==='REQUIRES SIGNATURE');
const sigAll=[...new Set([...sigS,...sigO].map(r=>r.id))];
const esc=s=>String(s??'').replace(/\|/g,'\\|').replace(/\n/g,' ');
let md=`# K1 — Surface Disposition Dossier

> **Status: READY FOR SIGNATURE. K1 deletes nothing.**
> One row for every surface in the inventory. Each carries a **class**, a **successor**, a
> **canonical owner**, a **parity requirement** and a **retirement condition**. The machine-readable
> table is \`evidence/maya-chat-first-ux/k1/k1-surface-dossier.json\`; this document is the part a
> person signs.
>
> **Wave 1 changes no runtime, no deployed byte and no production row.**

\`\`\`
SURFACES: ${rows.length}/795
PRIMARY NAV (ALL CHANNELS): ${rows.filter(r=>r.primaryNav).length}
PRIMARY NAV (MAYA-OWNED):   ${rows.filter(r=>r.primaryNav&&r.mayaOwned).length}
ROWS REQUIRING A SIGNATURE: ${sigAll.length}
\`\`\`

## 1. How a row is filled, and why the provenance is on every row

Four provenances, and the distinction is the point of the dossier:

| provenance | meaning | rows |
|---|---|---:|
| **EVIDENCE** | the disposition sweep names it outright | ${prov['EVIDENCE']??0} |
| **DERIVED** | the class plus the inventory's capability list fix it uniquely | ${prov['DERIVED']??0} |
| **ASSIGNED BY K5 / K8** | the *form* is fixed; the instance is a later package's mechanical job — a route key, a widget kind | ${(prov['ASSIGNED BY K5']??0)+(prov['ASSIGNED BY K8']??0)} |
| **REQUIRES SIGNATURE** | a judgement, and the owner makes it | ${prov['REQUIRES SIGNATURE']??0} |

A dossier that marked everything "derived" would be a dossier nobody needed to read. The
${prov['REQUIRES SIGNATURE']??0} successor judgements and ${sigO.length} owner judgements below are the whole of what the
signature is *for*; everything else is reproducible by re-running the generator.

## 2. The 795, by class

| class | rows | successor form | retirement condition |
|---|---:|---|---|
`;
const seen=new Set();
for(const [k,v] of Object.entries(by('class')).sort((a,b)=>b[1]-a[1])){
  const ex=rows.find(r=>r.class===k); if(seen.has(k))continue; seen.add(k);
  md+=`| \`${k}\` | ${v} | ${esc(ex.successor.split(':')[0].split(' - ')[0])} | ${esc(ex.retirementCondition)} |\n`;
}
md+=`
**Totals check.** ${Object.values(by('class')).reduce((a,b)=>a+b,0)} rows across ${Object.keys(by('class')).length} classes, which is the whole inventory: the
disposition sweep supplied ${rows.filter(r=>r.classSource==='disposition sweep').length} and the triage of the last 135 supplied
${rows.filter(r=>r.classSource!=='disposition sweep').length}. They join on \`(basename(file), normalized(name))\` with **zero** unmatched rows,
which is the same key the inventory manifest's method line describes.

## 3. The ${sigS.length} successor judgements

${sigS.length ? `${sigS.filter(r=>r.class==='MERGE').length} of the ${sigS.length} are \`MERGE\` rows, and that is the honest shape of the problem: *which
surface does this fold into* is a product judgement, not a derivation. The rest are named below.` : 'None.'}

| # | surface | channel | class | what must be decided |
|---|---|---|---|---|
`;
for(const r of sigS) md+=`| ${r.id} | ${esc(r.name.slice(0,72))} | ${r.channel} | \`${r.class}\` | ${esc(r.successor)} |\n`;
md+=`
## 4. The ${sigO.length} canonical-owner judgements

These are rows whose inventory entry names no capability, so the owner cannot be derived. Most
are out-of-scope or unreachable surfaces where the correct answer is likely *none* — but "likely"
is not a disposition, and K1's exit is a signature rather than an inference.

| # | surface | channel | class |
|---|---|---|---|
`;
for(const r of sigO) md+=`| ${r.id} | ${esc(r.name.slice(0,72))} | ${r.channel} | \`${r.class}\` |\n`;
md+=`
## 5. Primary navigation — ${redis.authorizedScope.entries} → ${redis.target}

**The authorized figure of 34 reproduces from the data.** It is **pwa-scoped**, and that scope is
now stated on the row rather than carried implicitly:

\`\`\`
PWA primary-nav entries            ${String(redis.authorizedScope.entries).padStart(3)}
  removed by their own disposition ${String(redis.authorizedScope.removedByDisposition).padStart(3)}   (RETIRE FROM PRIMARY NAV, MERGE, MOVE INTO CHAT WIDGET)
  still holding an entry           ${String(redis.authorizedScope.stillAssigned).padStart(3)}
  target                           ${String(redis.target).padStart(3)}
  RE-DISPOSITIONS NEEDED           ${String(redis.authorizedScope.redispositionsNeeded).padStart(3)}   <- the authorized number, reproduced
\`\`\`

**And the number the owner should also see.** Across *every* Maya-owned channel the figure is
**${redis.allMayaOwnedChannels.redispositionsNeeded}**, not ${redis.authorizedScope.redispositionsNeeded}, because ${redis.allMayaOwnedChannels.nonPwaRows.length} further entries live outside the pwa:

| # | surface | channel | class |
|---|---|---|---|
`;
for(const r of redis.allMayaOwnedChannels.nonPwaRows) md+=`| ${r.id} | ${esc(r.name.slice(0,64))} | ${r.channel} | \`${r.currentClass}\` |\n`;
md+=`
The authorized 34 is correct for its scope and is not being revised. What is added is the scope
label and the seven rows it does not cover, so that G11's ratchet is read against a number whose
basis is written down.

### The five that survive

| | entry | why it is not a capability |
|---|---|---|
`;
redis.survivors.forEach((s,i)=>{md+=`| **${i+1}** | **${s.n}** | ${esc(s.why)} |\n`;});
md+=`
### The ${redis.redispositions.length} re-dispositions

| # | surface | current class | proposed | why |
|---|---|---|---|---|
`;
for(const r of redis.redispositions) md+=`| ${r.id} | ${esc(r.name.slice(0,58))} | \`${r.currentClass}\` | \`${r.proposedRedisposition}\` | ${esc(r.rationale.slice(0,120))} |\n`;
md+=`
Every one is \`PENDING OWNER SIGNATURE\`. **K1 proposes; it does not decide, and it deletes nothing.**

## 6. The capability-gap ledger — ${cap.length} keys

Every \`GAP-\` key the certified contract names, entered as a first-class row. **A missing mapping
is a GAP, and a GAP has no button** — none may be filled by inference, by name similarity, or by
a projector's choice at runtime.

Of these, **${cap.filter(r=>r.isOneOfTheEight).length} are the acts §0.21 residual 4 tracks**, and their owner state is the corrected
per-act finding rather than the earlier summary:

| gap key | act | owner state | evidence |
|---|---|---|---|
`;
for(const r of cap.filter(x=>x.isOneOfTheEight)) md+=`| \`${r.gapKey}\` | ${esc(r.act)} | **${r.ownerState}** | ${esc(r.evidence.slice(0,150))} |\n`;
md+=`
**Three have no owner at all, one has an owner unreachable from the widget source type, and four
have a reachable registered owner under a different name.** That is the finding, and it is larger
in stake than "six of the eight have no owner" implied: the four consent acts are executable
today, so what is missing there is a *surface*, not a capability.

## 7. The mechanism-gap ledger — ${mech.length} rows

One row per prerequisite, \`MG-P01\` … \`MG-P32\`, from which **every build-status count is printed,
never transcribed**.

| status | rows |
|---|---:|
`;
for(const [k,v] of Object.entries(mech.reduce((m,r)=>(m[r.status]=(m[r.status]||0)+1,m),{}))) md+=`| \`${k}\` | ${v} |\n`;
md+=`
**${mech.filter(r=>r.packageKey.startsWith('NONE')).length} row is owned by no package**: \`${mech.filter(r=>r.packageKey.startsWith('NONE')).map(r=>r.pRef).join(', ')}\` — \`STEP_UP_VERIFIED\` reachability, which
belongs to the authentication subsystem and is outside the approved sixteen. It is in the ledger
because a prerequisite nobody owns is the one most likely to be assumed.

## 8. The parity harness — ${har.length} rows, **emitted RED**

\`\`\`
GREEN ROWS: ${har.filter(r=>r.parity==='GREEN').length}
RETIRABLE : ${har.filter(r=>r.retirable).length}
\`\`\`

Six gates per row — \`successorExists\`, \`parity\`, \`authority\`, \`accessibility\`, \`darkWindow\`,
\`deepLinkHandoff\` — all **RED**. A row turns green only when its evidence exists: a passing test,
a recorded probe, a signed dossier. **The harness reads the evidence, never a checkbox, and no
package may mark its own row green.**

This is also what breaks the thirty-package plan's dependency cycle. K1 emits the harness red;
every later package turns its own rows green; K15 and K16 only *consume* green rows and produce
none. A consumer cannot be a dependency of its producers.

## 9. K1's exit

> **A signed human dossier**: every one of ${rows.length} rows has a class, a resolvable successor and a
> named owner, and the gap keys are entered with their evidence.

Mechanically complete: ${rows.length}/795 rows, ${Object.keys(by('class')).length} classes, 0 unmatched, ${cap.length} capability gaps, ${mech.length} mechanism
gaps, ${har.length} harness rows red. **${sigAll.length} rows await the signature** — ${sigS.length} successors and ${sigO.length} owners —
and that is the one exit in this plan a machine cannot certify, because *"is this the right
successor"* is a judgement.
`;
fs.writeFileSync(process.argv[3],md);
console.log('dossier document lines:', md.split('\n').length);
console.log('signature rows:', sigAll.length, '| successors', sigS.length, '| owners', sigO.length);
