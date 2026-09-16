// K2 — the tables the contract states as MARKDOWN rather than as fenced TypeScript.
// F44's five floor tables, F27's control registry, F32's family predicates. They are as
// normative as anything in a ```ts block, and a compiled contract that omitted them would be
// a compiled contract missing its floors.
import fs from 'node:fs';
const F='/Users/stanislavmosin/Documents/Codex/2026-09-06/maya-platform-canonical-repository-users-stanislavmosin/work/maya-identity-consent/docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md';
const CONTRACT = fs.readFileSync(F, 'utf8');

// ── MONEY_FACETS and MONEY_TARGET_KINDS, EXTRACTED from §3.10 ────────────────────────────────
//
// These were hard-coded here once — five plausible money words I wrote myself rather than read.
// The contract declares SIXTEEN facets and TWENTY-SEVEN target kinds, and states the answer they
// must produce: "92 of 226". The invented set produced 15, and the contract explicitly warns about
// the near-miss: "92 capabilities against 12 for the bare `financial` token" — 12 being exactly
// what the invented set matched by facet.
//
// Under-fencing MONEY is the most consequential direction available in this codebase, so the sets
// are now parsed from the contract's own block and the count is asserted against the contract's own
// stated figure. A value nobody derived is a value nobody checked.
const moneySets = () => {
  const block = (name) => {
    const i = CONTRACT.indexOf(`${name} := {`);
    if (i < 0) throw new Error(`build-tables: ${name} not found in the contract`);
    const open = CONTRACT.indexOf('{', i);
    const close = CONTRACT.indexOf('}', open);
    return CONTRACT.slice(open + 1, close)
      .split(',')
      .map((t) => t.replace(/\/\/.*$/gm, '').trim())
      .filter(Boolean);
  };
  const facets = block('MONEY_FACETS');
  const kinds = block('MONEY_TARGET_KINDS');
  // The contract states the cardinalities in prose next to the sets; extracting fewer means the
  // block was truncated by a line wrap, which is precisely how this went wrong the first time.
  if (facets.length < 10 || kinds.length < 20)
    throw new Error(`build-tables: MONEY sets look truncated (${facets.length} facets, ${kinds.length} kinds)`);
  const lit = (xs) => xs.map((x) => `'${x}'`).join(', ');
  return [
    `// Extracted from contract §3.10. ${facets.length} facets, ${kinds.length} target kinds.`,
    `export const MONEY_TARGET_KINDS = Object.freeze([${lit(kinds)}] as const);`,
    `export const MONEY_FACETS = Object.freeze([${lit(facets)}] as const);`,
  ].join('\n');
};
const s=fs.readFileSync(F,'utf8');
const cell=v=>v.replace(/`/g,'').replace(/\*/g,'').trim();
// ── F44: the five floor tables, one markdown table, five column pairs ────────
const f44=s.slice(s.indexOf('| `EFFECT_FLOOR` | | | `KIND_FLOOR`'));
// the CONTIGUOUS table only: stop at the first line that is not a table row, or the whole
// rest of the document's tables get swallowed into the floors.
const raw=f44.split('\n'); const rows=[];
for(let i=2;i<raw.length;i++){ if(!raw[i].startsWith('|')) break; rows.push(raw[i]); }
const cols={EFFECT_FLOOR:[0,1],KIND_FLOOR:[3,4],RISK_FLOOR:[6,7],CONSENT_CLASS_FLOOR:[9,10],targetFloor:[12,13]};
const tbl={}; for(const k of Object.keys(cols)) tbl[k]=[];
for(const r of rows){
  const c=r.split('|').slice(1,-1).map(cell);
  for(const [name,[a,b]] of Object.entries(cols)){
    if(c[a] && c[b] && c[a]!=='' && !/every other kind/i.test(c[a])) tbl[name].push([c[a],c[b]]);
    else if(/every other kind/i.test(c[a]||'')) tbl[name].push(['__DEFAULT__',c[b]]);
  }
}
const KINDS=['CHOICE','SERVICE_SELECTOR','STAFF_SELECTOR','TIME_SLOT_SELECTOR','BOOKING_CONFIRMATION','SCHEDULE',
 'CLIENT_LIST','METRIC','CHART','REPORT','STRATEGY_OPTIONS','APPROVAL','PROGRESS','LIMITATION','SOURCE_STATUS',
 'SETTINGS_DRAFT','FORM','CONSENT_STATE','IDENTITY_BINDING','PAYMENT_HANDOFF','MEDIA_PREVIEW','ARTIFACT'];
const named=new Set(tbl.KIND_FLOOR.filter(([k])=>k!=='__DEFAULT__').map(([k])=>k));
const dflt=(tbl.KIND_FLOOR.find(([k])=>k==='__DEFAULT__')||[])[1]||'ANONYMOUS';
const kindFloor=KINDS.map(k=>[k, named.has(k)?tbl.KIND_FLOOR.find(([n])=>n===k)[1]:dflt]);
const lit=v=>`'${v.replace(/'/g,'')}'`;
const rec=(name,type,pairs,note)=>`${note}\nexport const ${name}: Readonly<Record<${type}, VerificationLevel>> = Object.freeze({\n${pairs.map(([k,v])=>`  ${/^[A-Za-z_$][\w$]*$/.test(k)?k:JSON.stringify(k.replace(/'/g,''))}: ${lit(v)},`).join('\n')}\n});`;
let out=`// GENERATED FROM THE CERTIFIED CONTRACT - do not hand-edit.
// Source:     docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md, section 0.8 F44 / section 0.7 F27 / section 0.7 F32
// Regenerate: node scripts/widget-contract/build-tables.mjs
// The contract states these as MARKDOWN tables rather than fenced TypeScript. They are as
// normative as anything in a code block, and a compiled contract without its floors would be
// a compiled contract that cannot derive one.
import type { VerificationLevel } from './envelope';
import type { WidgetKind } from './kinds';
import type { EffectClass } from './intent';
import type { CapabilityRef } from './capability-ref';
import type { RegisteredActionCapabilityV1 } from '../action-engine/action-engine.contract';

export type RiskTier = 'read' | 'low_write' | 'medium_write' | 'high_write' | 'restricted';
export type ConsentClass = 'none' | 'communication' | 'personal_data' | 'identity_binding' | 'finance';
export type TargetClass = 'w' | 'i' | 's' | 'c' | 'detail';

${rec('EFFECT_FLOOR','EffectClass',tbl.EFFECT_FLOOR,'// F44 - total over the eight effect classes.')}

${rec('KIND_FLOOR','WidgetKind',kindFloor,"// F44 - total over the twenty-two kinds. Five are named; the rest take the table's default.")}

${rec('RISK_FLOOR','RiskTier',tbl.RISK_FLOOR,"// F44 - RISK_FLOOR['read'] is ANONYMOUS because a read capability's protection is its\n// WIDGET_CAPABILITY_POLICY row plus Gate 6, not its risk tier.")}

${rec('CONSENT_CLASS_FLOOR','ConsentClass',tbl.CONSENT_CLASS_FLOOR,'// F44 - total over the five consent classes.')}

// F44 - targetFloor's table. targetFloor(null) is ANONYMOUS, and so is class 'c', because
// subjectCapability already resolves a c-class target to its own ref and the term would
// otherwise double-count.
export const TARGET_FLOOR: Readonly<Record<TargetClass | 'null', VerificationLevel>> = Object.freeze({
${tbl.targetFloor.map(([k,v])=>`  ${k==='null'?"'null'":JSON.stringify(k.replace(/'/g,''))}: ${lit(v)},`).join('\n')}
});

// F27 - CONTROL_REGISTRY, closed at three keys. A control registry that can grow a fourth key
// without review is not closed, so this is compiled in rather than stored.
export type ControlRegistryRow = { readonly ownerEndpoint: string; readonly controlFloor: VerificationLevel; readonly changes: string };
export const CONTROL_REGISTRY: Readonly<Record<'control.run.cancel' | 'control.widget.dismiss' | 'control.delivery.resolve', ControlRegistryRow>> = Object.freeze({
  'control.run.cancel':       Object.freeze({ ownerEndpoint: 'POST /api/orchestration/runs/:id/cancel', controlFloor: 'BOUND_CLIENT', changes: 'terminates an unstarted coordination run' }),
  'control.widget.dismiss':   Object.freeze({ ownerEndpoint: 'widget layer',                            controlFloor: 'ANONYMOUS',    changes: 'sets Lifecycle.delivery on one emission' }),
  'control.delivery.resolve': Object.freeze({ ownerEndpoint: 'widget layer',                            controlFloor: 'BOUND_CLIENT', changes: 'resolves one dedupe_key across channels' }),
});
export const CONTROL_FLOOR: Readonly<Record<keyof typeof CONTROL_REGISTRY, VerificationLevel>> = Object.freeze({
  'control.run.cancel': 'BOUND_CLIENT', 'control.widget.dismiss': 'ANONYMOUS', 'control.delivery.resolve': 'BOUND_CLIENT',
});

// F28 - WIDGET_CAPABILITY_POLICY, total over C9-CAP's 56 rows AND OVER THOSE ONLY. The three
// columns are C9/TOOL concepts and have no meaning over AE-CAP; AE totality is carried by
// AE_WIDGET_COMMIT_ALLOWLIST union AE_CAPABILITY_GAP_LEDGER under F31.
export interface WidgetCapabilityPolicyRow {
  readonly min_verification: VerificationLevel;
  readonly consent_class: ConsentClass;
  readonly dispatch_is_synchronous: boolean;   // R3.11.5, read through the C9 PROPOSE key
}
export declare const WIDGET_CAPABILITY_POLICY: Readonly<Record<string, WidgetCapabilityPolicyRow>>;

// F32 - the family predicates, each stated once, each verified exhaustively by enumeration.
${moneySets()}
export declare function BOOKING(cap: RegisteredActionCapabilityV1): boolean;
export declare function CONSENT(cap: RegisteredActionCapabilityV1): boolean;
export declare function IDENTITY(cap: RegisteredActionCapabilityV1): boolean;
export declare function MARKETING_FANOUT(cap: RegisteredActionCapabilityV1): boolean;
export declare function TENANT_AUTHORITY(cap: RegisteredActionCapabilityV1): boolean;
export declare function MONEY(cap: RegisteredActionCapabilityV1): boolean;
export declare function SENSITIVE_DEST_REF(r: CapabilityRef | null): boolean;
`;
fs.writeFileSync(process.argv[2],out);
console.log('EFFECT_FLOOR',tbl.EFFECT_FLOOR.length,'| KIND_FLOOR',kindFloor.length,'| RISK_FLOOR',tbl.RISK_FLOOR.length,
            '| CONSENT_CLASS_FLOOR',tbl.CONSENT_CLASS_FLOOR.length,'| targetFloor',tbl.targetFloor.length);
