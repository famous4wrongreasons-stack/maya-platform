// K2 — the deterministic post-processing the emitter cannot do from the contract alone:
// the ambient surface, the cross-module imports for tables and derived shapes, `declare` on
// initializer-less consts, and the barrel's one explicit disambiguation.
import fs from 'node:fs'; import path from 'node:path';
const d=process.argv[2];
// 1. ambient
fs.writeFileSync(d+'/ambient.ts',`// K2 - the surface the contract NAMES and declares no shape for: its refusal, lookup and
// render helpers, and the three registries it reads. Each is a K3 or K5 deliverable, declared
// here so that a rule citing one is a rule against a typed thing rather than a free name.
import type { VerificationLevel } from './envelope';
import type { IntentTarget } from './intent';
import type { C9Capability } from '../orchestration/c9.registry';
import type { AiToolDefinition } from '../ai-tools/ai-tool.types';
import type { RegisteredActionCapabilityV1 } from '../action-engine/action-engine.contract';

export declare function refuseMint(code: string): never;
export declare function maxLevel(...levels: VerificationLevel[]): VerificationLevel;
export declare function targetFloor(t: IntentTarget | null): VerificationLevel;
export declare function stableActionJson(v: unknown): string;

// The three registries the widget layer READS and changes none of.
export declare const C9_CAPABILITIES: readonly C9Capability[];
export declare const MAYA_AI_TOOL_CATALOG: readonly AiToolDefinition[];
export declare const C9_REGISTRY_HASH: string;
export declare const c9Registry: { tryGet(key: string): C9Capability | undefined };
export declare const actionCapabilityRegistry: {
  get(key: string): RegisteredActionCapabilityV1;
  tryGet(key: string): RegisteredActionCapabilityV1 | undefined;
};
export declare class ActionCapabilityRegistry { list(): RegisteredActionCapabilityV1[] }

// The orchestrator's own published union - imported, never redeclared (section 3.7 R3.7.1).
export type C9Domain = 'ADMIN' | 'CLIENT_LIFECYCLE' | 'OCCUPANCY' | 'BUSINESS_INTELLIGENCE';
`);
// 2. per-module imports + declare on initializer-less consts
const AMB={refuseMint:1,maxLevel:1,targetFloor:1,stableActionJson:1,C9_CAPABILITIES:1,MAYA_AI_TOOL_CATALOG:1,
  C9_REGISTRY_HASH:1,c9Registry:1,actionCapabilityRegistry:1,ActionCapabilityRegistry:1,C9Domain:1};
const TAB={EFFECT_FLOOR:1,KIND_FLOOR:1,RISK_FLOOR:1,CONSENT_CLASS_FLOOR:1,TARGET_FLOOR:1,CONTROL_FLOOR:1,
  CONTROL_REGISTRY:1,WIDGET_CAPABILITY_POLICY:1,BOOKING:1,CONSENT:1,IDENTITY:1,MARKETING_FANOUT:1,
  TENANT_AUTHORITY:1,MONEY:1,RiskTier:1,ConsentClass:1,TargetClass:1,MONEY_FACETS:1,MONEY_TARGET_KINDS:1};
const DER={WidgetBody:1,CorrelationRefs:1,IntentProposal:1,BridgeKey:1,BridgeSession:1};
const XMOD={DraftClass:'./confirmation-guard'};
for(const f of fs.readdirSync(d)){
  if(!f.endsWith('.ts')||['index.ts','ambient.ts','tables.ts','derived-shapes.ts'].includes(f)) continue;
  const p=path.join(d,f); let s=fs.readFileSync(p,'utf8');
  s=s.replace(/^export const (\w+)(\s*:[^=\n]*);$/gm,'export declare const $1$2;');
  const decl=new Set([...s.matchAll(/^export (?:declare )?(?:interface|type|const|function|class) (\w+)/gm)].map(m=>m[1]));
  const used=new Set([...s.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)].map(m=>m[1]));
  const need={};
  for(const [grp,mod] of [[AMB,'./ambient'],[TAB,'./tables'],[DER,'./derived-shapes']])
    for(const n of Object.keys(grp)) if(used.has(n)&&!decl.has(n)) (need[mod] ||= []).push(n);
  const already=new Set([...s.matchAll(/^import\s+(?:type\s+)?\{([^}]*)\}/gm)].flatMap(m=>m[1].split(',').map(x=>x.trim())));
  for(const [n,mod] of Object.entries(XMOD)) if(used.has(n)&&!decl.has(n)&&!already.has(n)&&'./'+f.replace('.ts','')!==mod) (need[mod] ||= []).push(n);
  for(const m of Object.keys(need)) need[m]=need[m].filter(n=>!already.has(n));
  for(const m of Object.keys(need)) if(!need[m].length) delete need[m];
  const add=Object.entries(need).sort().map(([m,ns])=>`import { ${[...new Set(ns)].sort().join(', ')} } from '${m}';`);
  if(add.length){ const i=s.indexOf('*/\n')+3; s=s.slice(0,i)+add.join('\n')+'\n'+s.slice(i); }
  // the contract's own totality, recorded where TypeScript cannot see it
  s=s.replace('return { label: el.row.cells[rowHeaderKey(el.table)].label,',
    '// rowHeaderKey is total over the table by section 4.8.1\'s own rule, so the lookup cannot\n'
    +'                      // miss; the assertion records that the totality is the contract\'s.\n'
    +'                      return { label: el.row.cells[rowHeaderKey(el.table)]!.label,');
  fs.writeFileSync(p,s);
}
// 3. the barrel, with the one ambiguity the contract creates resolved explicitly
const mods=fs.readdirSync(d).filter(f=>f.endsWith('.ts')&&f!=='index.ts').map(f=>f.replace('.ts',''));
const ORDER=['capability-ref','envelope-roots','envelope','kinds','lifecycle','verification-floor','registries',
  'confirmation-guard','tables','derived-shapes','ambient'];
const rest=ORDER.filter(m=>mods.includes(m));
fs.writeFileSync(d+'/index.ts',`// K2 - the certified contract, compiled.
// \`subjectCapability\` has its SIGNATURE in verification-floor (section 0.8 F41) and its one BODY
// in intent (section 3.5). That is one declaration and not two - section 0.2 F6a admits it by
// name - but a barrel must still choose which to re-export. It re-exports the body.
${rest.map(m=>`export * from './${m}';`).join('\n')}
export { subjectCapability, NEVER_CHAT_ACTUATED } from './intent';
export type { WidgetIntent, AuthorityHint, EffectClass, IntentTarget, ShellRoute, DetailRouteKey,
  ConfirmationRequirement, InputSchema, InputField, IntentRecord, WidgetIntentSubmission,
  ReadbackAck } from './intent';
`);
console.log('post-processed', mods.length+1, 'files');
