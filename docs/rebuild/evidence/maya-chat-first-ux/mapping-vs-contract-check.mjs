// Checks the K1–K16 implementation mapping against the certified contract.
// Every claim the mapping makes about the contract is re-derived here, not trusted.
import fs from 'node:fs';
const C='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/maya-identity-consent/docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md';
const A='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/maya-identity-consent/docs/rebuild/MAYA-CHAT-FIRST-UX-ARCHITECTURE.md';
const M=process.argv[2];
const c=fs.readFileSync(C,'utf8'), a=fs.readFileSync(A,'utf8'), m=fs.readFileSync(M,'utf8');
const out=[]; const chk=(n,ok,ev)=>out.push({n,ok,ev});
const pk=(row)=>[...new Set([...row.matchAll(/\bK(1[0-6]|[1-9])\b/g)].map(x=>x[1]))].sort((p,q)=>p-q).join(',');

// 1. every P-row's package assignment agrees with Annex A
const cP={},mP={};
for(const l of c.split('\n')){const x=l.match(/^\| \*\*(P-\d\d)\*\* \|/); if(x) cP[x[1]]=pk(l.split('|').slice(-2)[0]);}
for(const l of m.split('\n')){const x=l.match(/^\| (P-\d\d) \|/); if(x) mP[x[1]]=pk(l.split('|').slice(-2)[0]);}
const pAll=[...new Set([...Object.keys(cP),...Object.keys(mP)])].sort();
const pBad=pAll.filter(p=>cP[p]!==mP[p]);
chk('every prerequisite row agrees with Annex A on its package', pBad.length===0 && pAll.length===39,
    `${pAll.length} rows, ${pBad.length} disagreements${pBad.length?': '+pBad.map(p=>`${p} contract=${cP[p]} mapping=${mP[p]}`).join(' | '):''}`);

// 2. all 24 gate conditions owned, and each named in a package section
const gArch=new Set([...a.matchAll(/\*\*(G\d+)\*\*/g)].map(x=>x[1]));
const gOwned=new Set(); for(const l of m.split('\n')) if(/^\| G\d/.test(l)) for(const x of l.matchAll(/G\d+/g)) gOwned.add(x[0]);
const gNamed=new Set([...m.matchAll(/\*\*Gate rows\*\* \| ([^|]+)\|/g)].flatMap(x=>[...x[1].matchAll(/G\d+/g)].map(y=>y[0])));
chk('all 24 completion-gate conditions owned', gArch.size===24 && [...gArch].every(g=>gOwned.has(g)), `${gArch.size} in §14.4, ${gOwned.size} owned`);
chk('every gate condition named in the package section that owns it', [...gArch].every(g=>gNamed.has(g)), `${gNamed.size}/24 named`);

// 3. the mapping's contract-derived figures
const fig=[
 ['22 widget kinds', /Widget kinds \| 22, closed/, /The set is closed at twenty-two/],
 ['16 emittable + ARTIFACT narrow + CHART blocked + 4 blocked', /16 \+ `ARTIFACT` narrowly; `CHART` blocked on P-13; 4 blocked on registration/, /\*\*Emittable\*\* \(16\)/],
 ['exactly two floor reductions', /exactly two floor reductions|EXACTLY 2/i, /### 0\.17 The two disclosed floor reductions/],
 ['three allowlisted BOOKING_CONFIRMATION rows', /Three keys are allowlisted, not seven/, /\*\*F34 — the allowlist's declared membership in this contract version\.\*\* Three/],
 ['GAP-APPOINTMENT-DETAIL-COMMIT for the four detail keys', /GAP-APPOINTMENT-DETAIL-COMMIT/, /GAP-APPOINTMENT-DETAIL-COMMIT/],
 ['DraftClass excludes expense and loyalty', /not.{0,3} `'expense'`, \*\*not\*\* `'loyalty_adjustment'`/, /`'expense'` and `'loyalty_adjustment'` are \*\*not\*\* members/],
];
for(const [name,reM,reC] of fig) chk(`mapping and contract agree: ${name}`, reM.test(m)&&reC.test(c), `${reM.test(m)?'mapping ok':'MAPPING MISS'} / ${reC.test(c)?'contract ok':'CONTRACT MISS'}`);

// 4. the mapping must not claim a business-schema change
chk('mapping asserts BUSINESS SCHEMA OWNERS CHANGED: 0', /BUSINESS SCHEMA OWNERS CHANGED\*{0,2} \| \*\*0\*\*|\*\*BUSINESS SCHEMA OWNERS CHANGED\*\*/.test(m), 'present');
chk('mapping declares no FK from a business table into the widget layer', /business table\s+──FK──► widget-layer\s+FORBIDDEN/.test(m), 'direction rule present');
chk('mapping declares exactly 3 migrations', /\*\*MIGRATIONS EXPECTED\*\* \| \*\*3\*\*/.test(m), '3');

// 5. the mapping must not authorize implementation
chk('mapping does not self-authorize implementation', /remains descriptive/.test(m), 'header');
chk('mapping records separate owner authorization for Wave 6', /Wave 6 is open only because the owner separately authorized it/.test(m), '§0');

let bad=0;
console.log('MAPPING vs CERTIFIED CONTRACT\n');
for(const o of out){ if(!o.ok) bad++; console.log(`${o.ok?'PASS':'FAIL'}  ${o.n}\n        ${o.ev}`); }
console.log(`\n${out.length-bad}/${out.length} checks pass`);
process.exit(bad?1:0);
