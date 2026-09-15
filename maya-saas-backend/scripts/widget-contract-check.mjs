#!/usr/bin/env node
// K2 - the Widget Contract checkers. Executable, not prose.
//
// Shapes are read with the TypeScript compiler API and tables are IMPORTED and counted, never
// regex-matched: a checker whose answer changes when prettier reflows a file is a checker that
// was measuring its own formatting.
import fs from 'node:fs'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
import ts from 'typescript';
const HERE=path.dirname(new URL(import.meta.url).pathname);
const BE=path.resolve(HERE,'..');
const SRC=path.join(BE,'src/widget-contract');
const files=fs.readdirSync(SRC).filter(f=>f.endsWith('.ts'));
const out=[]; const chk=(n,ok,ev,kind='STRUCTURAL')=>out.push({n,ok,ev,kind});

// ── parse every module once, properly ───────────────────────────────────────
const unions={}, shapes={}, declaredIn={};
for(const f of files){
  const sf=ts.createSourceFile(f, fs.readFileSync(path.join(SRC,f),'utf8'), ts.ScriptTarget.ES2022, true);
  sf.forEachChild(n=>{
    const nm=n.name?.getText?.(sf);
    if(!nm) return;
    if(ts.isTypeAliasDeclaration(n)||ts.isInterfaceDeclaration(n)||ts.isVariableStatement(n)||
       ts.isFunctionDeclaration(n)||ts.isClassDeclaration(n)) (declaredIn[nm] ||= []).push(f);
    if(ts.isTypeAliasDeclaration(n)&&ts.isUnionTypeNode(n.type))
      unions[nm]=n.type.types.filter(ts.isLiteralTypeNode).map(t=>t.literal.getText(sf).replace(/'/g,''));
    if(ts.isInterfaceDeclaration(n))
      shapes[nm]=n.members.filter(ts.isPropertySignature).map(m=>({key:m.name.getText(sf), type:m.type?.getText(sf)??''}));
    if(ts.isTypeAliasDeclaration(n)&&ts.isTypeLiteralNode(n.type))
      shapes[nm]=n.type.members.filter(ts.isPropertySignature).map(m=>({key:m.name.getText(sf), type:m.type?.getText(sf)??''}));
  });
  for(const st of sf.statements) if(ts.isVariableStatement(st))
    for(const d of st.declarationList.declarations) (declaredIn[d.name.getText(sf)] ||= []).push(f);
}
// ── 1. the closed enums ─────────────────────────────────────────────────────
chk('WidgetKind is closed at twenty-two', unions.WidgetKind?.length===22, `${unions.WidgetKind?.length} members`);
chk('no ERROR, FAILURE or RETRY kind exists', !(unions.WidgetKind||[]).some(k=>/^(ERROR|FAILURE|RETRY)$/.test(k)), 'none');
chk('EffectClass is closed at eight', unions.EffectClass?.length===8, (unions.EffectClass||[]).join(','));
chk('no MUTATE and no EXECUTE effect class', !(unions.EffectClass||[]).some(e=>/^(MUTATE|EXECUTE)$/.test(e)), 'none');
chk('VerificationLevel is the five-rung ladder',
  unions.VerificationLevel?.length===5 && unions.VerificationLevel[0]==='ANONYMOUS' && unions.VerificationLevel[4]==='STEP_UP_VERIFIED',
  (unions.VerificationLevel||[]).join(' < '));
chk('DraftClass is the five-member union, without expense or loyalty_adjustment',
  unions.DraftClass?.length===5 && !unions.DraftClass.some(d=>/expense|loyalty/.test(d)), (unions.DraftClass||[]).join(','));

// ── 2. the floor tables, IMPORTED and counted ───────────────────────────────
let T=null;
try{
  const probe=path.join(BE,'scripts/widget-contract/tables-probe.js');
  T=JSON.parse(execFileSync('node',['-r','ts-node/register/transpile-only',probe],{cwd:BE,encoding:'utf8'}));
}catch(e){ chk('the floor tables load', false, String(e.message).slice(0,140),'EXECUTED'); }
if(T){
  chk('EFFECT_FLOOR is total over the eight effect classes', T.EFFECT_FLOOR===8, `${T.EFFECT_FLOOR} rows`,'EXECUTED');
  chk('KIND_FLOOR is total over the twenty-two kinds', T.KIND_FLOOR===22, `${T.KIND_FLOOR} rows`,'EXECUTED');
  chk('RISK_FLOOR is total over the five risk tiers', T.RISK_FLOOR===5, `${T.RISK_FLOOR} rows`,'EXECUTED');
  chk('CONSENT_CLASS_FLOOR is total over the five consent classes', T.CONSENT_CLASS_FLOOR===5, `${T.CONSENT_CLASS_FLOOR} rows`,'EXECUTED');
  chk('TARGET_FLOOR covers the five target classes and null', T.TARGET_FLOOR===6, `${T.TARGET_FLOOR} rows`,'EXECUTED');
  chk('CONTROL_REGISTRY is closed at three keys', T.CONTROL_REGISTRY===3, `${T.CONTROL_REGISTRY} rows`,'EXECUTED');
  chk("RISK_FLOOR['restricted'] is STEP_UP_VERIFIED", T.restricted==='STEP_UP_VERIFIED',
    'every restricted tier is withheld while P-12 is absent','EXECUTED');
  chk("EFFECT_FLOOR['CONTROL'] is ANONYMOUS, with the fence in CONTROL_FLOOR",
    T.controlEffect==='ANONYMOUS' && T.runCancel==='BOUND_CLIENT',
    'the effect class is not the fence; the control key is','EXECUTED');
}
// ── 3. the forbidden-key list, with F88's OWN stated exceptions ─────────────
const FORBIDDEN=['arguments','payload','state','role','permissions','token','tenant_id','client_id','staff_id',
 'record_id','is_staff','is_owner','__meRole','__meIsStaff','__meIsFounder','url','href','endpoint','checkout_url',
 'return_url','provider_ref','bridge_method','required_verification','interaction_model','four_eyes','fourEyes',
 'booking_effect','presentation_hint'];
const EXEMPT=(shape,m)=>
  (m.key==='tenant_id' && shape==='WidgetEnvelope') ||                       // F88: outside the envelope root
  (m.key==='state' && /Cell<|CellState|LifecycleState/.test(m.type));        // F88: outside a declared body enum field
const hits=[]; for(const [shape,ms] of Object.entries(shapes)) for(const m of ms)
  if(FORBIDDEN.includes(m.key) && !EXEMPT(shape,m)) hits.push(`${shape}.${m.key}`);
chk('no forbidden key is a member of any compiled shape, F88 exceptions applied', hits.length===0,
  hits.length
   ? hits.join(', ')+`\n        CONTRACT TENSION, not a code defect. F88 lists \`role\` with no qualifier, while`
     +`\n        section 3.1 declares WidgetIntent.role as a closed PRESENTATION set`
     +`\n        ('primary'|'secondary'|'destructive'|'escape') that confers nothing, and CLIENT.3,`
     +`\n        APPROVAL.4 and ARTIFACT.5 are rules ABOUT it. F88 qualifies its two sibling keys in`
     +`\n        place - \`state\` (outside a declared body enum field), \`tenant_id\` (outside the`
     +`\n        envelope root) - and \`role\` carries no such qualifier. As written, F88's own walk`
     +`\n        over any envelope would refuse every envelope. OWNER DECISION: reported, not resolved.`
   : `0 of ${FORBIDDEN.length} keys present`);
chk('no four_eyes member on any shape', !Object.values(shapes).flat().some(m=>/four_?[Ee]yes/.test(m.key)), 'absent');

// ── 4. the wire format cannot carry an endpoint ─────────────────────────────
for(const shape of ['WidgetIntentSubmission','WidgetIntent','IntentTarget','IntentRecord']){
  const bad=(shapes[shape]||[]).filter(m=>['url','endpoint','href','provider','host','origin','query'].includes(m.key)).map(m=>m.key);
  chk(`${shape} has no member able to carry an endpoint`, bad.length===0, bad.join(',')||'none');
}
// ── 5. one declaration per identifier ───────────────────────────────────────
const ADMITTED={subjectCapability:['intent.ts','verification-floor.ts']};   // F6a admits this one by name
const dupes=Object.entries(declaredIn).filter(([k,v])=>new Set(v).size>1
  && !(ADMITTED[k]&&[...new Set(v)].sort().join()===ADMITTED[k].sort().join()));
chk('every identifier is declared in exactly one module', dupes.length===0,
  dupes.map(([k,v])=>`${k}:${[...new Set(v)].join('+')}`).join(' ')||`${Object.keys(declaredIn).length} identifiers, one admitted pair`);

// ── 6. the registries, by execution ─────────────────────────────────────────
try{
  const got=execFileSync('node',['-r','ts-node/register/transpile-only',path.join(BE,'scripts/widget-contract/registry-probe.js')],{cwd:BE,encoding:'utf8'}).trim();
  chk('the three registries load at their declared cardinalities', got==='226/221/47/56', got, 'EXECUTED');
}catch(e){ chk('the three registries load at their declared cardinalities', false, String(e.message).slice(0,120), 'EXECUTED'); }

const PENDING=[
 ['KIND_REGISTRY totality over the 22 kinds','the table is `declare const` until K2 populates it against K1’s canon; P-10'],
 ['R1 portability, per kind per profile','needs the renderer conformance corpus; P-19, built by K5'],
 ['the forbidden-key WALK at every depth of a live envelope','needs a live envelope; P-01, built by K3'],
 ['WIDGET_CAPABILITY_POLICY totality over C9-CAP’s 56 rows','the table is `declare const` until K2 fills it; P-10'],
];
let bad=0;
console.log('WIDGET CONTRACT CHECKS\n');
for(const o of out){ if(!o.ok) bad++; console.log(`${o.ok?'PASS':'FAIL'}  [${o.kind}] ${o.n}\n        ${o.ev}`); }
console.log('\nNOT CHECKED YET, and why - each a named prerequisite, not an omission:');
for(const [n,w] of PENDING) console.log(`  PENDING  ${n}\n           ${w}`);
console.log(`\n${out.length-bad}/${out.length} checks pass, ${PENDING.length} pending on a later package`);
process.exit(bad?1:0);
