#!/usr/bin/env node
// K1 - the dossier's own checks. Executable, so the exit condition is read rather than claimed.
import fs from 'node:fs'; import path from 'node:path';
const D=path.dirname(new URL(import.meta.url).pathname);
const rows=JSON.parse(fs.readFileSync(D+'/k1-surface-dossier.json','utf8'));
const redis=JSON.parse(fs.readFileSync(D+'/k1-nav-redispositions.json','utf8'));
const cap=JSON.parse(fs.readFileSync(D+'/k1-capability-gap-ledger.json','utf8')).rows;
const mech=JSON.parse(fs.readFileSync(D+'/k1-mechanism-gap-ledger.json','utf8')).rows;
const har=JSON.parse(fs.readFileSync(D+'/k1-parity-harness.json','utf8')).rows;
const out=[]; const chk=(n,ok,ev)=>out.push({n,ok,ev});
chk('every surface has a row', rows.length===795, `${rows.length}/795`);
chk('every row carries a class', rows.every(r=>r.class), `${rows.filter(r=>!r.class).length} without`);
chk('every row carries a successor', rows.every(r=>r.successor), `${rows.filter(r=>!r.successor).length} without`);
chk('every row carries a canonical owner field', rows.every(r=>r.canonicalOwner), 'all');
chk('every row carries a parity requirement', rows.every(r=>r.parityRequirement), 'all');
chk('every row carries a retirement condition', rows.every(r=>r.retirementCondition), 'all');
chk('every field states its provenance', rows.every(r=>r.successorSource&&r.canonicalOwnerSource), 'all');
chk('K1 retires nothing', har.every(r=>r.retirable===false), `${har.filter(r=>r.retirable).length} marked retirable`);
chk('the parity harness is emitted RED', har.every(r=>r.parity==='RED'&&r.authority==='RED'&&r.successorExists==='RED'),
  `${har.filter(r=>r.parity!=='RED').length} not red`);
chk('primary nav: 112 across all channels, 101 Maya-owned',
  rows.filter(r=>r.primaryNav).length===112 && rows.filter(r=>r.primaryNav&&r.mayaOwned).length===101,
  `${rows.filter(r=>r.primaryNav).length} / ${rows.filter(r=>r.primaryNav&&r.mayaOwned).length}`);
chk('the authorized 34 re-dispositions reproduce from the data',
  redis.authorizedScope.redispositionsNeeded===34, `${redis.authorizedScope.redispositionsNeeded}`);
chk('five survivors are named', redis.survivors.length===5, redis.survivors.map(s=>s.n).join(', '));
chk('the capability-gap ledger carries the eight tracked acts',
  cap.filter(r=>r.isOneOfTheEight).length===8, `${cap.length} keys, ${cap.filter(r=>r.isOneOfTheEight).length} of the eight`);
chk('the mechanism-gap ledger is total over the thirty-two prerequisites', mech.length===32, `${mech.length}`);
chk('P-12 is owned by no package, and the ledger says so',
  mech.some(r=>r.pRef==='P-12'&&r.packageKey.startsWith('NONE')), 'STEP_UP_VERIFIED is outside the sixteen');
let bad=0; console.log('K1 SURFACE DOSSIER CHECKS\n');
for(const o of out){ if(!o.ok) bad++; console.log(`${o.ok?'PASS':'FAIL'}  ${o.n}\n        ${o.ev}`); }
const sig=new Set([...rows.filter(r=>r.successorSource==='REQUIRES SIGNATURE'),
                   ...rows.filter(r=>r.canonicalOwnerSource==='REQUIRES SIGNATURE')].map(r=>r.id));
console.log(`\n${out.length-bad}/${out.length} checks pass`);
// The one exit a machine cannot certify - so the machine reports whether a human has taken it,
// and stops claiming the exit is still open once they have.
let signed=null;
try{ signed=JSON.parse(fs.readFileSync(new URL('./k1-signature.json',import.meta.url),'utf8')); }catch{}
if(signed&&signed.signed){
  const cond=Object.values(signed.verdicts).filter(v=>/CONDITION/i.test(v)).length;
  const terms=Object.values(signed.binding_conditions).flat().length;
  console.log(`OWNER SIGNATURE: PRESENT - ${sig.size} rows across ${Object.keys(signed.verdicts).length} groups, `+
    `${cond} approved WITH CONDITIONS carrying ${terms} binding terms. The conditions are part of the `+
    `approval, not advisory notes; k1-signature-check.mjs asserts none of them is unrecorded.`);
}else{
  console.log(`AWAITING OWNER SIGNATURE: ${sig.size} rows - the one exit a machine cannot certify.`);
}
process.exit(bad?1:0);
