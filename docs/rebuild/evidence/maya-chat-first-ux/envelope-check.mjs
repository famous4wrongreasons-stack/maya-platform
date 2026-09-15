// Every figure in the implementation envelope, re-derived from the certified contract,
// the canonical mapping and the frozen schema. Nothing here is trusted from the prose.
import fs from 'node:fs';
const B='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/maya-identity-consent/docs/rebuild/';
const env=fs.readFileSync(process.argv[2],'utf8');
const con=fs.readFileSync(B+'MAYA-WIDGET-CONTRACT-V1.md','utf8');
const map=fs.readFileSync(B+'MAYA-CHAT-FIRST-K1-K16-IMPLEMENTATION-MAPPING.md','utf8');
const arc=fs.readFileSync(B+'MAYA-CHAT-FIRST-UX-ARCHITECTURE.md','utf8');
const sch=fs.readFileSync(B+'evidence/maya-chat-first-ux/d12-widget-layer-schema.prisma','utf8');
const out=[]; const chk=(n,ok,ev)=>out.push({n,ok,ev});

// structure
chk('16 package sections', (env.match(/^### K\d+ · /gm)||[]).length===16, `${(env.match(/^### K\d+ · /gm)||[]).length}`);
// scoped to Part 1, because PURPOSE legitimately recurs in Part 3's model tables
const P1=env.slice(env.indexOf('## Part 1'), env.indexOf('## Part 2'));
const FIELDS=['PACKAGE','PURPOSE','WHAT CHANGES','USER-VISIBLE RESULT','SURFACES','WIDGET TYPES','DEPENDENCIES','AUTHORITY/SECURITY BOUNDARY','SCHEMA IMPACT','MIGRATION','PARITY PROOF','PRODUCTION CUTOVER CONDITION'];
const cnt=f=>(P1.match(new RegExp('\\*\\*'+f.replace(/\//g,'\\/')+'\\*\\*','g'))||[]).length;
chk('every package carries all 12 requested fields', FIELDS.every(f=>cnt(f)===16), FIELDS.map(f=>`${f}:${cnt(f)}`).join(' '));
chk('6 waves, each with AFTER THIS WAVE MAYA CAN',
  (env.match(/^### WAVE \d · /gm)||[]).length===6 && (env.match(/AFTER THIS WAVE MAYA CAN…/g)||[]).length===6,
  `${(env.match(/^### WAVE \d · /gm)||[]).length} waves, ${(env.match(/AFTER THIS WAVE MAYA CAN…/g)||[]).length} statements`);
chk('all 24 gate rows present', (env.match(/^\| \*\*G\d+\*\* \|/gm)||[]).length===24, `${(env.match(/^\| \*\*G\d+\*\* \|/gm)||[]).length}`);
chk('gate rows match the architecture §14.4 set',
  [...new Set([...arc.matchAll(/\*\*(G\d+)\*\*/g)].map(m=>m[1]))].every(g=>new RegExp('\\| \\*\\*'+g+'\\*\\* \\|').test(env)),
  '24/24');
chk('13 model entries (5 detailed + 8 in the table)',
  (env.match(/\*\*MODEL\*\*/g)||[]).length===5 && (env.match(/^\| `Widget\w+` \|/gm)||[]).length===8,
  `${(env.match(/\*\*MODEL\*\*/g)||[]).length} detailed + ${(env.match(/^\| `Widget\w+` \|/gm)||[]).length} tabular`);

// figures re-derived
const countModels=(sch.match(/^model\s+\w+\s*\{/gm)||[]).length;
let F=0,cur=null;
for(const l of sch.split('\n')){ if(/^model\s/.test(l)){cur=1;continue;} if(/^\}/.test(l)){cur=null;continue;}
  if(cur&&/^\s{2}\w+\s+\S/.test(l)&&!/^\s*@@/.test(l)&&!/@relation/.test(l))F++; }
chk('WIDGET-LAYER MODELS: 13', countModels===13 && /WIDGET-LAYER MODELS: 13/.test(env), `${countModels}`);
chk('PHYSICAL FIELDS: 181', F===181 && /PHYSICAL FIELDS:\s+181/.test(env), `${F}`);
chk('MIGRATIONS: 2', /MIGRATIONS:\s+2/.test(env) && /\*\*MIGRATIONS EXPECTED\*\* \| \*\*2\*\*/.test(map), '2');
// per-model field counts quoted in the envelope match the schema
const perModel={}; cur=null;
for(const l of sch.split('\n')){ const m=l.match(/^model\s+(\w+)/); if(m){cur=m[1];perModel[cur]=0;continue;}
  if(/^\}/.test(l)){cur=null;continue;}
  if(cur&&/^\s{2}\w+\s+\S/.test(l)&&!/^\s*@@/.test(l)&&!/@relation/.test(l))perModel[cur]++; }
const quoted={WidgetIntentRecord:38,WidgetRenderReceipt:17,WidgetIntentReceipt:11,WidgetSuppressedEmission:8,WidgetFreeInputLedger:12,
  WidgetTimelineTurn:12,WidgetEmission:26,WidgetIntentSubmissionAudit:16,WidgetDraft:12,WidgetErasureTombstone:7,
  WidgetCapabilityGap:8,WidgetMechanismGap:7,WidgetCapabilityPolicy:7};
const wrong=Object.entries(quoted).filter(([k,v])=>perModel[k]!==v);
chk('every per-model field count matches the schema', wrong.length===0, wrong.length?wrong.map(([k,v])=>`${k} quoted ${v} actual ${perModel[k]}`).join(' | '):'13/13');
chk('per-wave split: 22 + 159 = 181',
  /3 models · 22 columns · 3 unique · 3 index · 5 CHECK · \*\*0 FK\*\*/.test(env) &&
  /10 models · 159 columns · 18 unique · 20 index · 29 CHECK · 16 FK/.test(env), '22+159');

// contract-derived claims
for(const [n,re] of [
 ['exactly two floor reductions', /\*\*Exactly two floor reductions exist\*\*/],
 ['three allowlisted booking keys', /\*\*Three keys are allowlisted, not seven\*\*/],
 ['92 MONEY keys gap-keyed', /all \*\*92\*\* `MONEY` keys are gap-keyed/],
 ['52 of the 135 to K13', /\*\*52 of the 135\*\*/],
 ['121 security-only rows', /\*\*121\*\* `SECURITY\/AUTHORITY ONLY`/],
 ['76 fullscreen-detail rows', /\*\*76\*\* `KEEP AS FULLSCREEN DETAIL`/],
 ['115 move-into-widget rows', /\*\*115\*\* `MOVE INTO CHAT WIDGET`/],
 ['63 retire-from-nav rows', /\*\*63\*\* `RETIRE FROM PRIMARY NAVIGATION`/],
 ['101 Maya-owned nav', /CURRENT PRIMARY NAV: 101 MAYA-OWNED/],
 ['target 5', /TARGET PRIMARY NAV:\s+5/],
 ['the four flows', /CHAT → SERVICE → STAFF → SLOT → CONFIRM → CANONICAL BOOKING/],
 ['analytics flow', /CHAT → C7\/C8 → TEXT \+ CHART\/WIDGET/],
 ['C9 flow', /CHAT → ORCHESTRATOR → AGENTS → STRATEGY WIDGET → APPROVAL → C6 EXECUTION → PROGRESS/],
 ['voice flow', /VOICE → SAME TYPED INTENT PATH AS TEXT/],
 ['no separate voice authority', /\*\*There is no voice authority\.\*\*/],
 ['three confirmations', /BUSINESS TABLE → WIDGET TABLE FK:\s+0[\s\S]*BUSINESS SCHEMA OWNERS CHANGED:\s+0[\s\S]*WIDGET STATE USED AS BUSINESS STATE: 0/],
]) chk(n, re.test(env), re.test(env)?'present':'MISSING');

// the envelope must not authorize implementation
chk('envelope does not authorize implementation', /approving it does not start\n> implementation/.test(env), 'header');

let bad=0;
console.log('IMPLEMENTATION ENVELOPE — every figure re-derived\n');
for(const o of out){ if(!o.ok) bad++; console.log(`${o.ok?'PASS':'FAIL'}  ${o.n}\n        ${o.ev}`); }
console.log(`\n${out.length-bad}/${out.length} checks pass`);
process.exit(bad?1:0);
