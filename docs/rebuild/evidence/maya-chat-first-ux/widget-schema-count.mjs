// Re-derives §5.0's frozen numbers from the schema EMBEDDED IN THE MAPPING and
// compares them to the numbers §5.0 prints. A transcribed count is a count that drifts.
import fs from 'node:fs';
const M=process.argv[2];
const doc=fs.readFileSync(M,'utf8');
const sch=doc.slice(doc.indexOf('```prisma')+9, doc.indexOf('\n```', doc.indexOf('```prisma')));
const REG=new Set(['WidgetCapabilityGap','WidgetMechanismGap','WidgetCapabilityPolicy']);
const EXTRA={WidgetIntentRecord:1,WidgetEmission:3,WidgetTimelineTurn:1,WidgetRenderReceipt:2};
let models=0,F=0,R=0,U=0,I=0,C=0,RT=0,cls={A:0,C:0,X:0,'—':0},cur=null;
for(const l of sch.split('\n')){
  const m=l.match(/^model\s+(\w+)\s*\{/);
  if(m){models++;cur=m[1];C+=EXTRA[cur]||0;continue;}
  if(!cur)continue;
  if(/^\}/.test(l)){cur=null;continue;}
  if(/^\s*@@unique/.test(l)){U++;continue;}
  if(/^\s*@@index/.test(l)){I++;continue;}
  if(/^\s*\w+\s+\w+\s+@relation/.test(l)){R++; if(/\s+Tenant\s+@relation/.test(l))RT++; continue;}
  if(/^\s{2}\w+\s+\S/.test(l)&&!/^\s*@@/.test(l)){F++; if(/CHECK:/.test(l))C++;
    const k=l.match(/\/\/\s*([ACX—])(?:\s|$)/); if(k)cls[k[1]]++;}
}
const enums=new Set([...sch.matchAll(/CHECK: ([A-Za-z][A-Za-z0-9]*) \(\d+\)/g)].map(x=>x[1]));
const printed=(re)=>{const x=doc.match(re); return x?Number(x[1].replace(/[^\d]/g,'')):null;};
const rows=[
 ['NEW WIDGET MODELS', models, printed(/\*\*NEW WIDGET MODELS\*\* \| \*\*(\d+)\*\*/)],
 ['WIDGET-LAYER PHYSICAL FIELDS', F, printed(/\*\*WIDGET-LAYER PHYSICAL FIELDS\*\* \| \*\*(\d+)\*\*/)],
 ['ENUMS', enums.size, printed(/\*\*ENUMS\*\*[^|]*\| \*\*(\d+)\*\*/)],
 ['FK', R, printed(/\*\*FK\*\* \| \*\*(\d+)\*\*/)],
 ['CHECK', C, printed(/\*\*CHECK\*\* \| \*\*(\d+)\*\*/)],
 ['UNIQUE', U, printed(/\*\*UNIQUE\*\* \| \*\*(\d+)\*\*/)],
 ['INDEXES', I, printed(/\*\*INDEXES\*\* \| \*\*(\d+)\*\*/)],
];
let bad=0;
console.log('§5.0 PRINTED vs DERIVED FROM THE EMBEDDED SCHEMA\n');
for(const [n,d,p] of rows){const ok=d===p; if(!ok)bad++; console.log(`${ok?'PASS':'FAIL'}  ${n.padEnd(30)} derived ${String(d).padStart(4)}   printed ${p===null?'(absent)':String(p).padStart(4)}`);}
const total=cls.A+cls.C+cls.X+cls['—'];
const ok=total===F; if(!ok)bad++;
console.log(`${ok?'PASS':'FAIL'}  every column classified exactly once  A ${cls.A} · C ${cls.C} · X ${cls.X} · registry ${cls['—']} = ${total} of ${F}`);
const okT=RT===10; if(!okT)bad++;
console.log(`${okT?'PASS':'FAIL'}  FKs to Tenant                   derived ${RT}   (widget→widget ${R-RT})`);
const okB=!/business table[^\n]*──FK──► widget-layer\s+ALLOWED/.test(doc); if(!okB)bad++;
console.log(`${okB?'PASS':'FAIL'}  no business → widget FK is declared anywhere`);
console.log(`\n${rows.length+3-bad}/${rows.length+3} checks pass`);
process.exit(bad?1:0);
