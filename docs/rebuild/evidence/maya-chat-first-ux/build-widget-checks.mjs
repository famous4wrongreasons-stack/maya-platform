#!/usr/bin/env node
// Generates all 34 CHECK constraints for the widget layer from CANONICAL DEFINITIONS, and refuses
// to guess. Every member set below is traced to one of the three kinds of evidence the owner ruling
// admits — a normative union, the contract compiled from it, or a registry whose exact domain the
// contract defines — and each emitted constraint carries its provenance in a comment, so a reader
// of the migration can check the claim without leaving the file.
//
// What it will NOT do: infer members from examples, guess from a name, or pad a set to reach an
// expected count. An enum with no canonical definition is reported and left unemitted, which is
// what makes the 34/34 figure mean something.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../../../..');
const BE = path.join(ROOT, 'maya-saas-backend');
const SRC = path.join(BE, 'src/widget-contract');
const ts = createRequire(path.join(BE, 'package.json'))('typescript');
const CONTRACT = fs.readFileSync(path.join(ROOT, 'docs/rebuild/MAYA-WIDGET-CONTRACT-V1.md'), 'utf8');
const K1 = path.join(ROOT, 'docs/rebuild/evidence/maya-chat-first-ux/k1');

// ── evidence source 1: named unions in the module generated from the contract ────────────────
const named = {};
const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.ts'));
const sources = {};
for (const f of files) {
  const sf = ts.createSourceFile(f, fs.readFileSync(path.join(SRC, f), 'utf8'), ts.ScriptTarget.ES2022, true);
  sources[f] = sf;
  sf.forEachChild((n) => {
    if (ts.isTypeAliasDeclaration(n) && ts.isUnionTypeNode(n.type)) {
      const vals = n.type.types.filter(ts.isLiteralTypeNode).map((t) => t.literal.getText(sf).replace(/'/g, ''));
      if (vals.length) named[n.name.text] = { members: vals, why: `contract union \`${n.name.text}\` (${f})` };
    }
  });
}

// ── evidence source 2: inline property unions in the same module ─────────────────────────────
// Some sets the contract declares are members of a shape rather than named types. They are no less
// normative for it, and they are read here by walking to the exact property rather than by regex.
const inlineUnion = (shape, prop) => {
  for (const [f, sf] of Object.entries(sources)) {
    let found = null;
    const walk = (n, owner) => {
      if (ts.isInterfaceDeclaration(n) && n.name) owner = n.name.text;
      if (ts.isPropertySignature(n) && n.name?.getText(sf) === prop && owner === shape && n.type && ts.isUnionTypeNode(n.type)) {
        const vals = n.type.types.filter(ts.isLiteralTypeNode).map((t) => t.literal.getText(sf).replace(/'/g, ''));
        if (vals.length) found = { members: vals, why: `contract \`${shape}.${prop}\` (${f}:${sf.getLineAndCharacterOfPosition(n.pos).line + 1})` };
      }
      n.forEachChild((c) => walk(c, owner));
    };
    walk(sf, null);
    if (found) return found;
  }
  return null;
};

// ── evidence source 3: a normative vocabulary stated in contract prose ───────────────────────
// F5 names its statuses in one sentence. They are extracted from that sentence rather than retyped,
// so a change to F5 changes the constraint.
const f5 = (() => {
  const i = CONTRACT.indexOf('**F5 — status vocabulary.**');
  const block = CONTRACT.slice(i, CONTRACT.indexOf('### 0.2', i));
  const bracketed = [...block.matchAll(/`(\[[A-Z-]+\])`/g)].map((m) => m[1]);
  const pending = /`NORMATIVE-PENDING`/.test(block) ? ['NORMATIVE-PENDING'] : [];
  const all = [...new Set([...bracketed, ...pending])];
  return all.length ? { members: all, why: 'contract §0.1 F5 status vocabulary, extracted from its own sentence' } : null;
})();

// ── evidence source 4: a registry whose exact domain the contract defines ────────────────────
const registryDomain = (file, field, why) => {
  const p = path.join(K1, file);
  if (!fs.existsSync(p)) return null;
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  const rows = Array.isArray(d) ? d : Object.values(d).find(Array.isArray) || [];
  const vals = [...new Set(rows.map((r) => r[field]).filter((v) => typeof v === 'string'))];
  return vals.length ? { members: vals, why, observed: true } : null;
};

// ── the seventeen sets, each with its evidence ───────────────────────────────────────────────
const SETS = {
  WidgetKind: named.WidgetKind,
  EffectClass: named.EffectClass,
  LifecycleState: named.LifecycleState,
  VerificationLevel: named.VerificationLevel,
  ChannelId: named.ChannelId,
  ConsentClass: named.ConsentClass,
  DraftClass: named.DraftClass,
  CapabilitySpace: named.CapabilitySpace,
  C9Domain: named.C9Domain,
  RenderTier: named.RenderTier,
  FreshnessClass: inlineUnion('Lifecycle', 'freshness_class'),
  ConfirmationOfKind: inlineUnion('IntentRecord', 'kind') || inlineUnion('ConfirmationOfRef', 'kind'),
  MechanismGapStatus: f5,
  IntentReceiptOutcome: { members: ['ACCEPTED', 'REFUSED', 'NEEDS_CONFIRMATION', 'NEEDS_VERIFICATION'],
    why: 'mapping §5.5 states the four members in full (not a count)' },
  TombstoneStore: { members: ['timeline', 'intent_audit'],
    why: 'mapping §5.5 states both members in full — the two erasable stores' },
  GapOwnerState: (() => {
    const stated = ['none', 'unreachable', 'registered_elsewhere'];
    const reg = registryDomain('k1-capability-gap-ledger.json', 'ownerState', 'K1 capability-gap registry');
    const agree = reg && reg.members.every((m) => stated.includes(m));
    return { members: stated, why: 'mapping §5.5 states all three in full' + (agree ? ', and the K1 capability-gap registry uses only those' : '') };
  })(),
  // OWNER RULING, wave 2. The only set here that is not derived from the contract, because the
  // contract never declared one — which is why it needed a ruling rather than a lookup. The
  // timeline records the conversation a person can see: two participants, the human and Maya.
  // Tool calls, AgentResult, orchestrator coordination, ActionExecution, receipts, system
  // instructions, hidden reasoning and delivery events stay in their own canonical records and
  // do not become messages. Voice is not a role — a spoken turn is a `user` turn whose modality
  // lives in `spokenTranscript`. A widget is not a role — Maya's answer is one `assistant` turn
  // plus zero or more widgets, and interacting with one mints a new typed user intent.
  TurnRole: { members: ['user', 'assistant'], why: 'OWNER RULING, wave 2 — the two participants a conversation has' },
};

// ── the seven range/ordering constraints ─────────────────────────────────────────────────────
// The mapping fixes their COUNT per model (27 enum + 7 range = 34) but names none of them. Each one
// below is the ordering the column's own contract semantics already require, so none adds a rule:
// an envelope that expires before it is issued, or a fitter that emits more intents than it minted,
// is not a policy question.
const RANGES = [
  ['WidgetTimelineTurn', 'turnIndex_nonneg', '"turnIndex" >= 0', 'a turn index is a position in a conversation'],
  ['WidgetEmission', 'expiry_after_issue', '"expiresAt" > "issuedAt"', 'an envelope cannot expire before it is issued'],
  ['WidgetEmission', 'retention_positive', '"retentionSec" > 0', 'zero retention would drop the body before it is written'],
  ['WidgetEmission', 'retention_after_issue', '"retentionUntil" >= "issuedAt"', 'retention cannot end before issue'],
  ['WidgetIntentRecord', 'expiry_after_issue', '"expiresAt" > "issuedAt"', 'Gate 1 reads expiry; an inverted window is never valid'],
  ['WidgetRenderReceipt', 'emitted_within_minted', '"intentsEmitted" <= "intentsMinted"', '§4.5.5 — the fitter withholds, it cannot mint'],
  ['WidgetRenderReceipt', 'emitted_nonneg', '"intentsEmitted" >= 0', 'a count of emitted intents is not negative'],
];

// ── the columns each enum constrains, read from the D12 block ────────────────────────────────
const MAP = fs.readFileSync(path.join(ROOT, 'docs/rebuild/MAYA-CHAT-FIRST-K1-K16-IMPLEMENTATION-MAPPING.md'), 'utf8');
const d12 = MAP.slice(MAP.indexOf('```prisma') + 9, MAP.indexOf('\n```', MAP.indexOf('```prisma')));
const cols = [];
let model = null;
for (const line of d12.split('\n')) {
  const m = /^model\s+(\w+)/.exec(line);
  if (m) { model = m[1]; continue; }
  const c = /^\s+(\w+)\s+\S+.*\/\/.*CHECK:\s*([A-Za-z][A-Za-z0-9]*)/.exec(line);
  if (c && model) cols.push({ model, col: c[1], set: c[2] });
}

const REG = ['WidgetCapabilityGap', 'WidgetMechanismGap', 'WidgetCapabilityPolicy'];
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const emit = [], blocked = [];
for (const c of cols) {
  const s = SETS[c.set];
  if (!s) { blocked.push(c); continue; }
  emit.push({
    migration: REG.includes(c.model) ? 1 : 2,
    model: c.model,
    sql: `ALTER TABLE "${c.model}" ADD CONSTRAINT "${c.model}_${c.col}_check" CHECK ("${c.col}" IN (${s.members.map(q).join(', ')}));`,
    why: `-- ${c.set} (${s.members.length}) — ${s.why}`,
  });
}
for (const [model, name, expr, why] of RANGES)
  emit.push({ migration: REG.includes(model) ? 1 : 2, model,
    sql: `ALTER TABLE "${model}" ADD CONSTRAINT "${model}_${name}_check" CHECK (${expr});`, why: `-- ${why}` });

const m1 = emit.filter((e) => e.migration === 1), m2 = emit.filter((e) => e.migration === 2);
const OUT = path.join(ROOT, 'docs/rebuild/evidence/maya-chat-first-ux/k3-migrations-staged');
fs.mkdirSync(OUT, { recursive: true });
for (const [n, list] of [[1, m1], [2, m2]]) {
  const body = ['-- CHECK constraints, generated by build-widget-checks.mjs from canonical definitions.',
    '-- Do not hand-edit: every line below is derived, and its provenance is the comment above it.', '']
    .concat(list.flatMap((e) => [e.why, e.sql, ''])).join('\n');
  fs.writeFileSync(path.join(OUT, `checks-migration-${n}.sql`), body);
}

// The resolved sets are written out so the checker compares against what was ACTUALLY emitted,
// rather than re-deriving them and agreeing with itself.
fs.writeFileSync(path.join(OUT, 'widget-enum-sets.json'), JSON.stringify(
  Object.fromEntries(Object.entries(SETS).map(([k, v]) => [k, v ? { members: v.members, why: v.why } : null])), null, 1));

// The member lists are written INTO the mapping, between markers this file owns. A summary table
// maintained by hand is how three enums drifted from the contract they cited; a block regenerated
// from the canonical definitions cannot drift, because regenerating it is the only way to change it.
const MAPPATH = path.join(ROOT, 'docs/rebuild/MAYA-CHAT-FIRST-K1-K16-IMPLEMENTATION-MAPPING.md');
let mapdoc = fs.readFileSync(MAPPATH, 'utf8');
const B = '<!-- BEGIN GENERATED ENUM MEMBERS', Eend = '<!-- END GENERATED ENUM MEMBERS -->';
const bi = mapdoc.indexOf(B), ei = mapdoc.indexOf(Eend);
if (bi >= 0 && ei > bi) {
  const lines = ['<!-- BEGIN GENERATED ENUM MEMBERS — build-widget-checks.mjs owns this block; do not hand-edit -->',
    '', '**The exact members, derived.** Each set below is resolved from a canonical definition and',
    'the provenance is printed with it. `enum-member-check.mjs` compares this block, the counts in the',
    'table above, and the emitted `CHECK` constraints against one another.', '',
    '```', ...Object.entries(SETS).map(([k, v]) =>
      v ? `${k.padEnd(22)} ${String(v.members.length).padStart(2)}  ${v.members.join(' ')}`
        : `${k.padEnd(22)}  ?  NO CANONICAL DEFINITION — constraint not generated`),
    '```', ''];
  mapdoc = mapdoc.slice(0, bi) + lines.join('\n') + mapdoc.slice(ei);
  fs.writeFileSync(MAPPATH, mapdoc);
}

console.log(`CHECKS EXPECTED:   34`);
console.log(`CHECKS GENERATED:  ${emit.length}   (migration 1: ${m1.length}, migration 2: ${m2.length})`);
console.log(`  enum-valued      ${emit.length - RANGES.length}`);
console.log(`  range/ordering   ${RANGES.length}`);
if (blocked.length) {
  console.log(`\nBLOCKED — no canonical exact member definition:`);
  for (const b of blocked) console.log(`  ${b.set.padEnd(20)} constrains ${b.model}.${b.col}`);
}
process.exit(emit.length === 34 ? 0 : 1);
