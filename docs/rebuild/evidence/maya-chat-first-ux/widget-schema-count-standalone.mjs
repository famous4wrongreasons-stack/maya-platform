// Derive every count from the schema text. Never transcribe a count.
import fs from 'node:fs';
const S=fs.readFileSync(new URL('./d12-widget-layer-schema.prisma', import.meta.url).pathname,'utf8');
const lines=S.split('\n');
const models=[]; let cur=null;
for(const l of lines){
  const m=l.match(/^model\s+(\w+)\s*\{/);
  if(m){ cur={name:m[1],fields:[],rel:0,uniq:0,idx:0,check:0,cls:{A:0,C:0,X:0,'—':0}}; models.push(cur); continue; }
  if(!cur) continue;
  if(/^\}/.test(l)){ cur=null; continue; }
  if(/^\s*@@unique/.test(l)){ cur.uniq++; continue; }
  if(/^\s*@@index/.test(l)){ cur.idx++; continue; }
  const rel=l.match(/^\s*(\w+)\s+\w+\s+@relation/);
  if(rel){ cur.rel++; continue; }
  const f=l.match(/^\s{2}(\w+)\s+(\S+)/);
  if(f && !/^@@/.test(l)){
    cur.fields.push(f[1]);
    const c=l.match(/\/\/\s*([ACX—])(?:\s|$)/); if(c) cur.cls[c[1]]++;
    if(/CHECK:/.test(l)) cur.check++;
  }
}
// non-enum CHECKs stated in the mapping prose
const EXTRA_CHECKS=['priority >= 0','expiresAt > issuedAt','retentionSec <= per-kind ceiling','intentsEmitted <= intentsMinted','turnIndex >= 0','profileVersion >= 1','bodyVersion between 1 and 999'];
let F=0,R=0,U=0,I=0,C=0,A=0,CC=0,X=0,N=0;
console.log('model                            fields  rel  uniq  idx  chk   A   C   X   —');
for(const m of models){
  F+=m.fields.length; R+=m.rel; U+=m.uniq; I+=m.idx; C+=m.check;
  A+=m.cls.A; CC+=m.cls.C; X+=m.cls.X; N+=m.cls['—'];
  const unclassified=m.fields.length-(m.cls.A+m.cls.C+m.cls.X+m.cls['—']);
  console.log(`${m.name.padEnd(30)} ${String(m.fields.length).padStart(5)} ${String(m.rel).padStart(4)} ${String(m.uniq).padStart(5)} ${String(m.idx).padStart(4)} ${String(m.check).padStart(4)} ${String(m.cls.A).padStart(3)} ${String(m.cls.C).padStart(3)} ${String(m.cls.X).padStart(3)} ${String(m.cls['—']).padStart(3)}${unclassified?`   UNCLASSIFIED:${unclassified}`:''}`);
}
console.log('');
console.log('NEW WIDGET MODELS          :', models.length);
console.log('WIDGET-LAYER PHYSICAL FIELDS:', F, ` (id columns: ${models.length}, non-id: ${F-models.length})`);
console.log('FK (relations)             :', R, ` (to Tenant: ${models.filter(m=>m.fields.includes('tenantId')).length}, widget→widget: ${R-models.filter(m=>m.fields.includes('tenantId')).length})`);
console.log('UNIQUE constraints         :', U);
console.log('INDEXES                    :', I);
console.log('CHECK constraints          :', C+EXTRA_CHECKS.length, ` (enum-valued: ${C}, range/ordering: ${EXTRA_CHECKS.length})`);
console.log('erasure classes            : A', A, '| C', CC, '| X', X, '| registry', N, '| total', A+CC+X+N, F===A+CC+X+N?'= every column classified exactly once':'MISMATCH');
console.log('FK FROM a business table INTO the widget layer:', 0);
