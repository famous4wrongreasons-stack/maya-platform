// K2 — emit the certified contract's TypeScript as compiling modules.
// The contract IS the source; nothing is retyped, so nothing can drift from it.
import fs from 'node:fs';
const mods=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const OUT=process.argv[3];
fs.rmSync(OUT,{recursive:true,force:true}); fs.mkdirSync(OUT,{recursive:true});
const ORDER=['capability-ref','envelope-roots','envelope','kinds','intent','lifecycle','verification-floor','registries','confirmation-guard'];
const HEAD=m=>`// GENERATED FROM THE CERTIFIED CONTRACT - do not hand-edit.
// Source:     docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md
// Regenerate: node scripts/widget-contract/emit.mjs
// Module:     ${m}
/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
`;
// ── 1. mask what is specification rather than TypeScript ────────────────────
function mask(body){
  const outl=[]; let spec=false, frag=false, fragDepth=0, depth=0;
  for(const l of body.split('\n')){
    const t=l.trim();
    if(spec){ if(t===''||t.startsWith('//')){spec=false;outl.push(l);} else outl.push('// [SPEC, not code] '+l); continue; }
    if(frag){
      if(t.startsWith('// ---') || /^(export\s+)?(declare\s+)?(interface|type|const|function|class)\s+\w+/.test(t)){
        frag=false; fragDepth=0;            // a divider or a real declaration ends any fragment
      } else {
      outl.push('// [MEMBER FRAGMENT] '+l);
      for(const ch of l){ if('{(<['.includes(ch))fragDepth++; else if('})>]'.includes(ch))fragDepth--; }
      if(fragDepth<=0 && /;\s*(\/\/.*)?$/.test(t)){frag=false;fragDepth=0;}
      continue; }
    }
    if(/^(produced|reading_order)\s*=/.test(t) || /^∀\s/.test(t)){ spec=true; outl.push('// [SPEC, not code] '+l); continue; }
    if(depth===0 && /^[A-Za-z_$][\w$]*\??\s*:/.test(t) && !/^(case|default)\b/.test(t)){
      frag=true; outl.push('// [MEMBER FRAGMENT] '+l);
      for(const ch of l){ if('{(<['.includes(ch))fragDepth++; else if('})>]'.includes(ch))fragDepth--; }
      if(fragDepth<=0 && /;\s*(\/\/.*)?$/.test(t)){frag=false;fragDepth=0;}
      continue;
    }
    outl.push(l);
    for(const ch of l){ if('{(['.includes(ch))depth++; else if('})]'.includes(ch))depth--; }
  }
  return outl.join('\n');
}
// ── 2. build every module body and record what it declares ──────────────────
const bodies={}, names={};
const declRe=/^(export\s+)?(declare\s+)?(interface|type|const|function|class)\s+(\w+)/gm;
for(const [m,bs] of Object.entries(mods)){
  if(m==='misc') continue;
  let body=mask(bs.map(b=>`// --- section ${b.sec} (contract line ${b.line}) ---\n${b.body}`).join('\n\n'));
  names[m]=new Set();
  body=body.replace(declRe,(mm,exp,dec,kw,nm)=>{ names[m].add(nm); return exp?mm:'export '+mm; });
  bodies[m]=body;
}
// ── 3. resolve cross-module references from the ownership map ───────────────
const owner={}; for(const [m,set] of Object.entries(names)) for(const n of set) if(!(n in owner)) owner[n]=m;
const EXTERNAL={
  C9Capability:['../orchestration/c9.registry',true],
  AiToolDefinition:['../ai-tools/ai-tool.types',true],
  RegisteredActionCapabilityV1:['../action-engine/action-engine.contract',true],
};
const AMBIENT=new Set(['refuseMint','maxLevel','targetFloor','stableActionJson','c9Registry','actionCapabilityRegistry',
 'aiToolRegistry','AiToolPolicyService','c9Capability','C9_REGISTRY_HASH','validateEnvelope','buildCellIndex',
 'renderPhrase','renderNarrative','renderTextEquivalent','renderCellLabel','C9_CAPABILITIES','MAYA_AI_TOOL_CATALOG',
 'ActionCapabilityRegistry','emitted','produced','C9Domain','WidgetBody','RenderTier']);
const KW=new Set(['string','number','boolean','null','undefined','true','false','void','never','any','unknown','object',
 'Record','Readonly','ReadonlyMap','ReadonlySet','Partial','Omit','Pick','Extract','Exclude','Array','Map','Set','Date',
 'Promise','Math','JSON','Object','if','else','return','const','let','for','of','in','new','this','typeof','keyof',
 'extends','infer','import','export','declare','interface','type','function','class','case','default','switch','break',
 'throw','catch','try','finally','while','do','yield','await','async','as','is','readonly','K','R','T','V','E','S']);
for(const [m,body] of Object.entries(bodies)){
  const mine=names[m];
  const used=new Set([...body.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)].map(x=>x[1]));
  const need={};
  for(const u of used){
    if(mine.has(u)||KW.has(u)||AMBIENT.has(u)) continue;
    if(owner[u]&&owner[u]!==m){ (need['./'+owner[u]] ||= []).push(u); }
    else if(EXTERNAL[u]){ (need[EXTERNAL[u][0]] ||= []).push(u); }
  }
  const imp=Object.entries(need).sort().map(([mod,ns])=>{
    const uniq=[...new Set(ns)].sort();
    const t = mod.startsWith('..') && EXTERNAL[uniq[0]]?.[1];
    return `import ${t?'type ':''}{ ${uniq.join(', ')} } from '${mod}';`;
  });
  fs.writeFileSync(`${OUT}/${m}.ts`, HEAD(m)+(imp.length?imp.join('\n')+'\n\n':'')+body+'\n');
}
// ── 4. the ambient surface the contract names and does not declare ──────────
fs.writeFileSync(`${OUT}/ambient.ts`, HEAD('ambient')+`import type { VerificationLevel } from './envelope';
import type { IntentTarget } from './intent';
import type { CapabilityRef } from './capability-ref';

// The contract NAMES these and declares no shape for them: they are the refusal, lookup and
// render surface its pseudo-code calls. Each is a K3 or K5 deliverable, and each is declared
// here so that a rule citing one is a rule against a typed thing rather than a free name.
export declare function refuseMint(code: string): never;
export declare function maxLevel(...levels: VerificationLevel[]): VerificationLevel;
export declare function targetFloor(t: IntentTarget | null): VerificationLevel;
export declare function stableActionJson(v: unknown): string;
export declare function capKeyOf(ref: CapabilityRef): string;
`);
fs.writeFileSync(`${OUT}/index.ts`, HEAD('barrel')+ORDER.filter(m=>bodies[m]).map(m=>`export * from './${m}';`).join('\n')+"\nexport * from './ambient';\n");
console.log('emitted', Object.keys(bodies).length+2, 'files');
for(const m of ORDER) if(names[m]) console.log(`  ${m.padEnd(20)} ${String(names[m].size).padStart(3)} declarations`);
