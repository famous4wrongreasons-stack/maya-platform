// K2 — the tables the contract states as MARKDOWN rather than as fenced TypeScript.
// F44's five floor tables, F27's control registry, F32's family predicates. They are as
// normative as anything in a ```ts block, and a compiled contract that omitted them would be
// a compiled contract missing its floors.
//
// U-TAB (GATES-PLAN-V11 D-5) adds the effect tables the gates, the fitter and the minter read, each
// PARSED from the contract text that states it, with an assertion wherever a sentence could change
// shape under a line wrap: §2.4's permitted effects, §2.3.4's target classes, R3.2.2's key spaces,
// §4.5.3's tier table with CH1's allowlists, R3.2.3's NONE rule and F60's escape.
//
//   node scripts/widget-contract/build-tables.mjs [<out>]   write <out> (default src/widget-contract/tables.ts)
//   node scripts/widget-contract/build-tables.mjs --check   exit 1 when tables.ts is not what this script writes
//
// The output is formatted with the repository's prettier configuration before it is written or
// compared, so the committed file is byte-for-byte this script's output and `--check` has no
// formatting noise to hide a drift in.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(HERE, '../..');
// Relative to this script, never an absolute checkout path: the build runs in clean exports and in CI.
const F = path.resolve(BACKEND, '../docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md');
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
// ── U-TAB: the effect tables ─────────────────────────────────────────────────────────────────
//
// Every helper throws rather than guessing. A table the parser cannot find, or finds in a shape it
// was not written for, stops the build: a silently shorter allowlist is a wider gate nowhere and a
// narrower one everywhere, and neither is visible in a diff of the generated file alone.
const fail = (m) => { throw new Error(`build-tables: ${m}`); };
const norm = (t) => t.replace(/\s+/g, ' ').trim();
const ticks = (t) => [...t.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
// A contiguous markdown table under an exact header line. `\|` inside a cell is an escaped pipe.
const mdTable = (header) => {
  const lines = s.split('\n');
  const at = lines.findIndex((l) => l.startsWith(header));
  if (at < 0) fail(`table not found: ${header}`);
  const out = [];
  for (let i = at + 2; i < lines.length && lines[i].startsWith('|'); i++)
    out.push(lines[i].split(/(?<!\\)\|/).slice(1, -1).map((c) => c.replace(/\\\|/g, '|').trim()));
  return out;
};
const unionMembers = (name) => {
  const i = s.indexOf(`\ntype ${name} =`);
  if (i < 0) fail(`type ${name} not found`);
  return [...s.slice(i, s.indexOf(';', i)).matchAll(/'([^']+)'/g)].map((m) => m[1]);
};
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

// §3.2's effect table fixes the eight classes and the order every generated list uses.
const EFFECTS = mdTable('| effect | `intent_token` |').map((c) => ticks(c[0])[0]);
if (EFFECTS.length !== 8) fail(`the effect table has ${EFFECTS.length} rows, not 8`);

// §2.4 — "Permitted effects (ceiling)": the closed set; the bold ceiling phrase is K3's derived label.
const kindRows = mdTable('| # | Kind | Permitted effects (ceiling) |');
if (kindRows.map((c) => ticks(c[1])[0]).join() !== KINDS.join()) fail('§2.4 kind column differs from the 22 kinds');
const kindEffects = kindRows.map((c) => {
  const kind = ticks(c[1])[0];
  const effects = c[2].replace(/\(\*\*[A-Z_]+\*\*\)\s*$/, '').split(',').map((e) => e.trim());
  if (!effects.every((e) => EFFECTS.includes(e))) fail(`§2.4 ${kind}: unknown effect in "${c[2]}"`);
  if (!effects.includes('CONTROL')) fail(`§2.4 ${kind}: CONTROL is a permitted effect on every row`);
  return [kind, effects];
});

// §2.3.4 — allowed_target_classes, derived from its own two sentences and from §2.4.
const targetRule = norm(s).match(
  /The default is `\[([^\]]*)\]` for every kind, plus `'(\w+)'` for every kind whose `permitted_effects` include `(\w+)`\. \*\*`'(\w+)'` is permitted on no kind in this contract version\.\*\*/,
);
if (!targetRule) fail('§2.3.4 target-class sentences not found');
const [, defaults, plusClass, plusWhen, noneClass] = targetRule;
const defaultClasses = [...defaults.matchAll(/'(\w+)'/g)].map((m) => m[1]);
if (defaultClasses.includes(noneClass) || plusClass === noneClass) fail(`§2.3.4 admits '${noneClass}' after all`);
const kindTargets = kindEffects.map(([k, e]) => [k, e.includes(plusWhen) ? [...defaultClasses, plusClass] : defaultClasses]);

// R3.2.2 — which key space each effect's subject capability may name.
const r322 = norm(s.slice(s.indexOf('**R3.2.2 —'), s.indexOf('*Mechanism:*', s.indexOf('**R3.2.2 —'))));
const r322Rule = r322.slice(r322.indexOf('Only `'));
const SPACES = ['C9', 'AE', 'CONTROL', 'TOOL'];
const effectSpaces = Object.fromEntries(EFFECTS.map((e) => [e, []]));
let r322Parts = 0;
for (const clause of r322Rule.split(';'))
  for (const part of clause.split(', and a ')) {
    const m = part.match(/^(.*?) may (?:also )?(?:carry|name) an? `(\w+)` (?:ref|destination)\b/);
    if (!m || !SPACES.includes(m[2])) fail(`R3.2.2: unreadable clause "${part}"`);
    r322Parts++;
    const who = ticks(m[1]).filter((t) => EFFECTS.includes(t));
    if (m[2] === 'TOOL') {
      if (who.length || !/no intent of any effect class/.test(m[1])) fail('R3.2.2: the TOOL clause changed');
      continue;
    }
    if (!who.length) fail(`R3.2.2: no effect named in "${part}"`);
    for (const e of who) if (!effectSpaces[e].includes(m[2])) effectSpaces[e].push(m[2]);
  }
if (r322Parts !== 5) fail(`R3.2.2 has ${r322Parts} clauses, not 5`);
for (const e of EFFECTS) effectSpaces[e].sort((a, b) => SPACES.indexOf(a) - SPACES.indexOf(b));

// §4.5.3 — the tier table, CH1's allowlists and the escape, R3.2.3's NONE rule, F60's escape shape.
const CHANNELS = unionMembers('ChannelId');
const TIERS = unionMembers('RenderTier');
const noneRule = norm(s).match(/A `NONE` intent is legal only on a fitted `render_tier === '(\w+)'`\./);
if (!noneRule || !TIERS.includes(noneRule[1])) fail('R3.2.3 NONE sentence not found');
if (!/on every tier whose cell does not reach `CONTROL`, the one tokened escape intent of §0\.9 F60, carrying `control\.widget\.dismiss` and no other key, is admitted as well/.test(norm(s)))
  fail('CH1 escape sentence not found');
const channelTier = [];
const tierCells = mdTable('| tier | channels | `max_intents` |').map((c) => {
  const tier = ticks(c[0])[0];
  for (const ch of ticks(c[1])) channelTier.push([ch, tier]);
  const upTo = c[4].match(/^up to `(\w+)`/);
  if (upTo && upTo[1] !== 'COMMIT') fail(`${tier}: "up to ${upTo[1]}" has no reading here`);
  let effects = upTo ? [...EFFECTS] : ticks(c[4].split(', plus')[0]);
  if (!effects.length || !effects.every((e) => EFFECTS.includes(e))) fail(`${tier}: unreadable ceiling "${c[4]}"`);
  if (tier !== noneRule[1]) effects = effects.filter((e) => e !== 'NONE');
  effects = EFFECTS.filter((e) => effects.includes(e));
  const escape = !effects.includes('CONTROL');
  if (escape !== /plus the F60 escape \(CH1\)/.test(c[4])) fail(`${tier}: CH1 escape marker disagrees with the cell`);
  return [tier, effects, escape];
});
if (!sameSet(tierCells.map(([t]) => t), TIERS)) fail('the tier table is not total over RenderTier');
if (!sameSet(channelTier.map(([c]) => c), CHANNELS) || channelTier.length !== CHANNELS.length)
  fail('the tier table does not name every ChannelId exactly once');
channelTier.sort((a, b) => CHANNELS.indexOf(a[0]) - CHANNELS.indexOf(b[0]));
const f60 = norm(s.slice(s.indexOf('**F60 — one escape intent'), s.indexOf('*Mechanism:*', s.indexOf('**F60 — one escape intent'))));
const f60Priority = f60.match(/`priority: (\d+)`/);
const f60Other = f60.match(/every other tier → `effect: '(\w+)'`, `capability: '([a-z.]+)'`/);
if (!f60Priority || !f60Other) fail('F60 escape shape not found');
if (!['control.run.cancel', 'control.widget.dismiss', 'control.delivery.resolve'].includes(f60Other[2]))
  fail(`F60 escape key ${f60Other[2]} is not a CONTROL_REGISTRY key`);

const q = (xs) => xs.map((x) => `'${x}'`).join(', ');
const effectTables = `
// ── U-TAB (GATES-PLAN-V11 D-5): the effect tables ────────────────────────────────────────────

// §2.4 - "Permitted effects": the CLOSED set of effect classes mintable onto each kind. The bold
// ceiling phrase is K3's derived label over the ordered members and is not a table.
export const KIND_PERMITTED_EFFECTS: Readonly<Record<WidgetKind, readonly EffectClass[]>> = Object.freeze({
${kindEffects.map(([k, e]) => `  ${k}: Object.freeze([${q(e)}] as const),`).join('\n')}
});

// §2.3.4 - allowed_target_classes: ${q(defaultClasses)} for every kind, plus '${plusClass}' where
// the kind permits ${plusWhen}. '${noneClass}' is permitted on no kind in this contract version.
export const KIND_ALLOWED_TARGET_CLASSES: Readonly<Record<WidgetKind, readonly TargetClass[]>> = Object.freeze({
${kindTargets.map(([k, t]) => `  ${k}: Object.freeze([${q(t)}] as const),`).join('\n')}
});

// R3.2.2 - the key spaces an intent of each effect class may name through subjectCapability. NAVIGATE's
// C9 ref is a class-'c' target's; HANDOFF's refs are handoff_capability_ref, AE referenced and never
// invoked; no effect class may name a TOOL ref.
export const EFFECT_KEY_SPACES: Readonly<Record<EffectClass, readonly CapabilitySpace[]>> = Object.freeze({
${EFFECTS.map((e) => `  ${e}: Object.freeze([${q(effectSpaces[e])}] as const),`).join('\n')}
});

// §4.5.3 - the tier each channel is fitted to. Total over ChannelId.
export const CHANNEL_TIER: Readonly<Record<ChannelId, RenderTier>> = Object.freeze({
${channelTier.map(([c, t]) => `  ${/^[a-z]+$/.test(c) ? c : `'${c}'`}: '${t}',`).join('\n')}
});

// §4.5.3 CH1 - each tier's effect ceiling is an ALLOWLIST, never an ordered ceiling. R3.2.3 keeps NONE
// on ${noneRule[1]} alone. \`escape\` is true exactly where the cell does not reach CONTROL: there the
// one tokened F60 escape (TIER_ESCAPE) is admitted as well, and no other CONTROL intent.
export type TierEffectCell = { readonly effects: readonly EffectClass[]; readonly escape: boolean };
export const TIER_EFFECTS: Readonly<Record<RenderTier, TierEffectCell>> = Object.freeze({
${tierCells.map(([t, e, x]) => `  ${t}: Object.freeze({ effects: Object.freeze([${q(e)}] as const), escape: ${x} }),`).join('\n')}
});

// §0.9 F60 - the escape on every tier other than RICH_INTERACTIVE: this effect, this CONTROL key,
// this priority, and nothing else. Read by carrierAdmits alone.
export const TIER_ESCAPE: Readonly<{ effect: EffectClass; space: 'CONTROL'; key: keyof typeof CONTROL_REGISTRY; priority: number }> = Object.freeze({
  effect: '${f60Other[1]}', space: 'CONTROL', key: '${f60Other[2]}', priority: ${Number(f60Priority[1])},
});
`;

let out=`// GENERATED FROM THE CERTIFIED CONTRACT - do not hand-edit.
// Source:     docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md, section 0.8 F44 / section 0.7 F27 / section 0.7 F32
//             and section 2.3.4 / 2.4 / 3.2 R3.2.2, R3.2.3 / 4.5.3 CH1 / 0.9 F60 (the effect tables)
// Regenerate: node scripts/widget-contract/build-tables.mjs
// The contract states these as MARKDOWN tables rather than fenced TypeScript. They are as
// normative as anything in a code block, and a compiled contract without its floors would be
// a compiled contract that cannot derive one.
import type { VerificationLevel } from './envelope';
import type { WidgetKind } from './kinds';
import type { EffectClass } from './intent';
import type { CapabilityRef, CapabilitySpace } from './capability-ref';
import type { ChannelId, RenderTier } from './lifecycle';
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
${effectTables}`;

const check = process.argv.includes('--check');
const target = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? path.join(BACKEND, 'src/widget-contract/tables.ts'));
const prettier = await import('prettier');
// The configuration is the backend's own, resolved at the committed location whatever <out> is.
const config = await prettier.resolveConfig(path.join(BACKEND, 'src/widget-contract/tables.ts'), { editorconfig: true });
if (!config) fail('no prettier configuration resolves for src/widget-contract/tables.ts');
const formatted = await prettier.format(out, { ...config, filepath: path.join(BACKEND, 'src/widget-contract/tables.ts') });
const counts = ['EFFECT_FLOOR',tbl.EFFECT_FLOOR.length,'| KIND_FLOOR',kindFloor.length,'| RISK_FLOOR',tbl.RISK_FLOOR.length,
            '| CONSENT_CLASS_FLOOR',tbl.CONSENT_CLASS_FLOOR.length,'| targetFloor',tbl.targetFloor.length,
            '| KIND_PERMITTED_EFFECTS',kindEffects.length,'| EFFECT_KEY_SPACES',EFFECTS.length,'| CHANNEL_TIER',channelTier.length,'| TIER_EFFECTS',tierCells.length];
if (check) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  if (current !== formatted) {
    console.error(`build-tables --check: ${path.relative(BACKEND, target)} is not what build-tables.mjs writes; regenerate it`);
    process.exit(1);
  }
  console.log(...counts, `| ${path.relative(BACKEND, target)} is current`);
} else {
  fs.writeFileSync(target, formatted);
  console.log(...counts);
}
