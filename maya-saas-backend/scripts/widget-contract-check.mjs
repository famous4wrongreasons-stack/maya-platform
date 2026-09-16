#!/usr/bin/env node
// K2 - the Widget Contract checkers. Executable, not prose.
//
// Shapes are read with the TypeScript compiler API and tables are IMPORTED and counted, never
// regex-matched: a checker whose answer changes when prettier reflows a file is a checker that
// was measuring its own formatting.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const BE = path.resolve(HERE, '..');
const SRC = path.join(BE, 'src/widget-contract');
const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.ts'));
const out = [];
const chk = (n, ok, ev, kind = 'STRUCTURAL') => out.push({ n, ok, ev, kind });

// F88 forbids its keys "at any other depth". A depth-1 member list cannot check that, so members
// are collected to full depth INSIDE a declaration - through inline object literals and array
// element types - and stop at named type references, which the reach walk visits on their own.
// `depth` and `path` are carried so a hit can say where it is rather than only that it exists.
const deepMembers = (node, sf) => {
  const acc = [];
  const visit = (n, path, depth) => {
    const ms = ts.isInterfaceDeclaration(n)
      ? n.members
      : ts.isTypeLiteralNode(n)
        ? n.members
        : null;
    if (ms) {
      for (const m of ms) {
        if (!ts.isPropertySignature(m) || !m.name) continue;
        const key = m.name.getText(sf);
        const here = path ? `${path}.${key}` : key;
        acc.push({
          key,
          path: here,
          depth,
          type: (m.type?.getText(sf) ?? '').replace(/\s+/g, ' '),
        });
        if (m.type) visit(m.type, here, depth + 1);
      }
      return;
    }
    if (ts.isArrayTypeNode(n))
      return visit(n.elementType, path ? `${path}[]` : '[]', depth);
    if (
      ts.isTypeReferenceNode(n) &&
      n.typeName.getText(sf) === 'Array' &&
      n.typeArguments?.length === 1
    )
      return visit(n.typeArguments[0], path ? `${path}[]` : '[]', depth);
    if (ts.isUnionTypeNode(n) || ts.isIntersectionTypeNode(n))
      return n.types.forEach((t) => visit(t, path, depth));
    if (ts.isParenthesizedTypeNode(n)) return visit(n.type, path, depth);
  };
  visit(node, '', 0);
  return acc;
};

// ── parse every module once, properly ───────────────────────────────────────
const unions = {},
  shapes = {},
  declaredIn = {};
for (const f of files) {
  const sf = ts.createSourceFile(
    f,
    fs.readFileSync(path.join(SRC, f), 'utf8'),
    ts.ScriptTarget.ES2022,
    true,
  );
  sf.forEachChild((n) => {
    const nm = n.name?.getText?.(sf);
    if (!nm) return;
    if (
      ts.isTypeAliasDeclaration(n) ||
      ts.isInterfaceDeclaration(n) ||
      ts.isVariableStatement(n) ||
      ts.isFunctionDeclaration(n) ||
      ts.isClassDeclaration(n)
    )
      (declaredIn[nm] ||= []).push(f);
    if (ts.isTypeAliasDeclaration(n) && ts.isUnionTypeNode(n.type))
      unions[nm] = n.type.types
        .filter(ts.isLiteralTypeNode)
        .map((t) => t.literal.getText(sf).replace(/'/g, ''));
    if (ts.isInterfaceDeclaration(n)) shapes[nm] = deepMembers(n, sf);
    if (ts.isTypeAliasDeclaration(n) && ts.isTypeLiteralNode(n.type))
      shapes[nm] = deepMembers(n.type, sf);
  });
  for (const st of sf.statements)
    if (ts.isVariableStatement(st))
      for (const d of st.declarationList.declarations)
        (declaredIn[d.name.getText(sf)] ||= []).push(f);
}
// ── 1. the closed enums ─────────────────────────────────────────────────────
chk(
  'WidgetKind is closed at twenty-two',
  unions.WidgetKind?.length === 22,
  `${unions.WidgetKind?.length} members`,
);
chk(
  'no ERROR, FAILURE or RETRY kind exists',
  !(unions.WidgetKind || []).some((k) => /^(ERROR|FAILURE|RETRY)$/.test(k)),
  'none',
);
chk(
  'EffectClass is closed at eight',
  unions.EffectClass?.length === 8,
  (unions.EffectClass || []).join(','),
);
chk(
  'no MUTATE and no EXECUTE effect class',
  !(unions.EffectClass || []).some((e) => /^(MUTATE|EXECUTE)$/.test(e)),
  'none',
);
chk(
  'VerificationLevel is the five-rung ladder',
  unions.VerificationLevel?.length === 5 &&
    unions.VerificationLevel[0] === 'ANONYMOUS' &&
    unions.VerificationLevel[4] === 'STEP_UP_VERIFIED',
  (unions.VerificationLevel || []).join(' < '),
);
chk(
  'DraftClass is the five-member union, without expense or loyalty_adjustment',
  unions.DraftClass?.length === 5 &&
    !unions.DraftClass.some((d) => /expense|loyalty/.test(d)),
  (unions.DraftClass || []).join(','),
);

// ── 2. the floor tables, IMPORTED and counted ───────────────────────────────
let T = null;
try {
  const probe = path.join(BE, 'scripts/widget-contract/tables-probe.js');
  T = JSON.parse(
    execFileSync('node', ['-r', 'ts-node/register/transpile-only', probe], {
      cwd: BE,
      encoding: 'utf8',
    }),
  );
} catch (e) {
  chk(
    'the floor tables load',
    false,
    String(e.message).slice(0, 140),
    'EXECUTED',
  );
}
if (T) {
  chk(
    'EFFECT_FLOOR is total over the eight effect classes',
    T.EFFECT_FLOOR === 8,
    `${T.EFFECT_FLOOR} rows`,
    'EXECUTED',
  );
  chk(
    'KIND_FLOOR is total over the twenty-two kinds',
    T.KIND_FLOOR === 22,
    `${T.KIND_FLOOR} rows`,
    'EXECUTED',
  );
  chk(
    'RISK_FLOOR is total over the five risk tiers',
    T.RISK_FLOOR === 5,
    `${T.RISK_FLOOR} rows`,
    'EXECUTED',
  );
  chk(
    'CONSENT_CLASS_FLOOR is total over the five consent classes',
    T.CONSENT_CLASS_FLOOR === 5,
    `${T.CONSENT_CLASS_FLOOR} rows`,
    'EXECUTED',
  );
  chk(
    'TARGET_FLOOR covers the five target classes and null',
    T.TARGET_FLOOR === 6,
    `${T.TARGET_FLOOR} rows`,
    'EXECUTED',
  );
  chk(
    'CONTROL_REGISTRY is closed at three keys',
    T.CONTROL_REGISTRY === 3,
    `${T.CONTROL_REGISTRY} rows`,
    'EXECUTED',
  );
  chk(
    "RISK_FLOOR['restricted'] is STEP_UP_VERIFIED",
    T.restricted === 'STEP_UP_VERIFIED',
    'every restricted tier is withheld while P-12 is absent',
    'EXECUTED',
  );
  chk(
    "EFFECT_FLOOR['CONTROL'] is ANONYMOUS, with the fence in CONTROL_FLOOR",
    T.controlEffect === 'ANONYMOUS' && T.runCancel === 'BOUND_CLIENT',
    'the effect class is not the fence; the control key is',
    'EXECUTED',
  );
}
// ── 3. the forbidden-key list, with F88's OWN stated exceptions ─────────────
const FORBIDDEN = [
  'arguments',
  'payload',
  'state',
  'role',
  'permissions',
  'token',
  'tenant_id',
  'client_id',
  'staff_id',
  'record_id',
  'is_staff',
  'is_owner',
  '__meRole',
  '__meIsStaff',
  '__meIsFounder',
  'url',
  'href',
  'endpoint',
  'checkout_url',
  'return_url',
  'provider_ref',
  'bridge_method',
  'required_verification',
  'interaction_model',
  'four_eyes',
  'fourEyes',
  'booking_effect',
  'presentation_hint',
];
// F88's mechanism names the values its walk covers: "applied to `WidgetEnvelope`,
// `WidgetIntentSubmission`, `ChannelProfile`, `NativeBridgeManifest` and `IntentRecord`". It is
// a walk over a SERIALIZED value, so the reachable closure of those five is the domain - and
// `WidgetComposerInput` is deliberately not in it, because a projector input is never serialized
// to a client. Checking every declared shape instead would be checking a stricter rule than the
// contract states, and reporting the difference as a violation.
const WALK_ROOTS = [
  'WidgetEnvelope',
  'WidgetIntentSubmission',
  'ChannelProfile',
  'NativeBridgeManifest',
  'IntentRecord',
];
const reach = new Set();
const queue = [...WALK_ROOTS];
while (queue.length) {
  const n = queue.pop();
  if (!n || reach.has(n)) continue;
  reach.add(n);
  for (const m of shapes[n] || [])
    for (const ref of m.type.match(/\b[A-Z][A-Za-z0-9_]*\b/g) || [])
      if (shapes[ref] && !reach.has(ref)) queue.push(ref);
}
// ── F88.2 ── the structural exemption table ─────────────────────────────────────────────────
// The owner's ruling: F88's exemptions are EXACT STRUCTURAL LOCATIONS, never key names. So the
// table below is the implementation of that sentence, not a convenience over it. Each row is a
// (shape, path, depth, type-predicate) tuple. There is deliberately no field an edit could use to
// write "the key `k` is allowed": `key` is derived FROM `path`, so a row cannot name a key without
// also naming where it sits. A conformance check below asserts that property against this source.
const ROLE_ENUM = [
  'primary',
  'secondary',
  'destructive',
  'escape',
  'more',
  'handoff',
  'remedy',
  'control',
];
const isRoleEnum = (t) => {
  const vals = [...t.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
  return (
    vals.length === ROLE_ENUM.length && ROLE_ENUM.every((v) => vals.includes(v))
  );
};
const F88_EXEMPTIONS = [
  {
    shape: 'Cell',
    path: 'state',
    depth: 0,
    type: (t) => t === 'CellState',
    note: '§1.2 declared body cell state enum',
  },
  {
    shape: 'Lifecycle',
    path: 'state',
    depth: 0,
    type: (t) => t === 'LifecycleState',
    note: '§4.1 declared lifecycle enum',
  },
  {
    shape: 'WidgetEnvelope',
    path: 'tenant_id',
    depth: 0,
    type: (t) => t === 'string',
    note: '§1.1.1 canonical root binding, root only',
  },
  {
    shape: 'IntentRecord',
    path: 'tenant_id',
    depth: 0,
    type: (t) => t === 'string',
    note: '§3.7 internal persistence/audit binding - OWNER RULING, wave 1',
  },
  {
    shape: 'WidgetIntent',
    path: 'role',
    depth: 0,
    type: isRoleEnum,
    note: '§3.1 presentation role, the eight declared members - F88.1',
  },
  {
    shape: 'RenderReceipt',
    path: 'intents_withheld[].role',
    depth: 1,
    type: (t) => t === "WidgetIntent['role']",
    note: '§4.5.5 frozen presentation metadata, the alias LITERALLY - OWNER RULING, wave 1',
  },
];
const EXEMPT = (shape, m) =>
  F88_EXEMPTIONS.some(
    (e) =>
      e.shape === shape &&
      e.path === m.path &&
      e.depth === m.depth &&
      e.type(m.type),
  );

const hits = [];
for (const shape of reach)
  for (const m of shapes[shape] || [])
    if (FORBIDDEN.includes(m.key) && !EXEMPT(shape, m))
      hits.push(`${shape}.${m.path} (depth ${m.depth}): ${m.type}`);
chk(
  `no forbidden key in F88's walked closure (${reach.size} shapes), F88.2's six locations applied`,
  hits.length === 0,
  hits.length
    ? hits.join(' | ')
    : `0 unexempted occurrences of ${FORBIDDEN.length} forbidden keys`,
);

// Every exemption must correspond to something that actually exists, or the table is carrying a
// licence for a shape nobody declares - the quiet way an allowlist outlives its reason.
const unused = F88_EXEMPTIONS.filter(
  (e) =>
    !(shapes[e.shape] || []).some(
      (m) => m.path === e.path && m.depth === e.depth && e.type(m.type),
    ),
);
chk(
  `F88.2's table is exactly ${F88_EXEMPTIONS.length} locations and every one is live`,
  F88_EXEMPTIONS.length === 6 && unused.length === 0,
  unused.length
    ? 'DEAD: ' + unused.map((e) => `${e.shape}.${e.path}`).join(', ')
    : F88_EXEMPTIONS.map((e) => `${e.shape}.${e.path}`).join(' · '),
);

// CONFORMANCE: F88.2 forbids an implementation that CAN express a key-name exemption, whatever it
// currently contains. Checked against this file's own source: no exemption row may carry a bare
// `key:` field, and EXEMPT must compare shape, path and depth - not m.key.
// A check that reads this file must not be satisfiable BY ITS OWN TEXT. The previous version of
// the "no generic exception" check searched the whole source for a literal it also contained, so
// it passed by finding itself and measured nothing for one reported run. Source-reading checks now
// read only the two named regions, never the whole file, and a guard below proves the regions do
// not contain the assertions.
const SELF = fs.readFileSync(new URL(import.meta.url).pathname, 'utf8');
const region = (from, to) => SELF.slice(SELF.indexOf(from), SELF.indexOf(to));
const tableSrc = region('const F88_EXEMPTIONS', 'const EXEMPT =');
const exemptSrc = region('const EXEMPT =', 'const hits = []');
const keyNameShaped = /\bkey\s*:/.test(tableSrc) || /m\.key/.test(exemptSrc);
chk(
  'F88.2 conformance: no exemption is expressible by key name alone',
  !keyNameShaped &&
    /e\.shape === shape/.test(exemptSrc) &&
    /e\.path === m\.path/.test(exemptSrc) &&
    /e\.depth === m\.depth/.test(exemptSrc),
  'every row is (shape, path, depth, type); EXEMPT compares all four; no `key:` field exists to widen',
);

// ── the required vectors ────────────────────────────────────────────────────────────────────
// Pushed through the SAME predicates the walk uses, so widening a predicate flips a vector.
const verdict = (shape, path, type, depth = 0) => {
  const key = path.split('.').pop().replace(/\[\]$/, '');
  return FORBIDDEN.includes(key) && !EXEMPT(shape, { path, depth, type })
    ? 'FAIL'
    : 'PASS';
};
const R8 =
  "| 'primary' | 'secondary' | 'destructive' | 'escape' | 'more' | 'handoff' | 'remedy' | 'control'";
const VECTORS = [
  // F88.1's nine, as the owner fixed them
  ['owner role on the wire', 'WidgetEnvelope', 'role', "'owner'", 0, 'FAIL'],
  [
    'staff role on the wire',
    'WidgetIntentSubmission',
    'role',
    "'staff'",
    0,
    'FAIL',
  ],
  ['client role on the wire', 'ChannelProfile', 'role', "'client'", 0, 'FAIL'],
  ['__meRole', 'WidgetEnvelope', '__meRole', 'string', 0, 'FAIL'],
  ['is_owner', 'WidgetEnvelope', 'is_owner', 'boolean', 0, 'FAIL'],
  ['is_staff', 'WidgetIntentSubmission', 'is_staff', 'boolean', 0, 'FAIL'],
  ['undeclared nested role', 'WidgetEnvelope', 'body.meta.role', R8, 2, 'FAIL'],
  [
    'role on a shape that is not WidgetIntent',
    'IntentRecord',
    'role',
    R8,
    0,
    'FAIL',
  ],
  [
    'WidgetIntent.role, declared type, depth 0',
    'WidgetIntent',
    'role',
    R8,
    0,
    'PASS',
  ],
  [
    'WidgetIntent.role with a ninth value',
    'WidgetIntent',
    'role',
    R8 + " | 'owner'",
    0,
    'FAIL',
  ],
  // F88.2's five required negative tests
  [
    'NEG 1  nested arbitrary role',
    'ChannelProfile',
    'caps.role',
    'string',
    1,
    'FAIL',
  ],
  [
    'NEG 2  nested owner/staff/client role',
    'IntentRecord',
    'audit.role',
    "'owner' | 'staff' | 'client'",
    1,
    'FAIL',
  ],
  [
    'NEG 3  nested arbitrary tenant_id',
    'WidgetEnvelope',
    'body.tenant_id',
    'string',
    1,
    'FAIL',
  ],
  [
    'NEG 4  receipt role OUTSIDE intents_withheld',
    'RenderReceipt',
    'role',
    "WidgetIntent['role']",
    0,
    'FAIL',
  ],
  [
    'NEG 4b receipt role, right path wrong depth',
    'RenderReceipt',
    'intents_withheld[].role',
    "WidgetIntent['role']",
    2,
    'FAIL',
  ],
  [
    'NEG 4c receipt role, right path wrong type',
    'RenderReceipt',
    'intents_withheld[].role',
    R8,
    1,
    'FAIL',
  ],
  // the two admitted locations, and the roots
  [
    'IntentRecord.tenant_id, the ruled location',
    'IntentRecord',
    'tenant_id',
    'string',
    0,
    'PASS',
  ],
  [
    'RenderReceipt withheld role, the ruled one',
    'RenderReceipt',
    'intents_withheld[].role',
    "WidgetIntent['role']",
    1,
    'PASS',
  ],
  [
    'tenant_id at the envelope root',
    'WidgetEnvelope',
    'tenant_id',
    'string',
    0,
    'PASS',
  ],
  [
    'tenant_id nested in the envelope',
    'WidgetEnvelope',
    'meta.tenant_id',
    'string',
    1,
    'FAIL',
  ],
  // One wrong-type vector per exemption row. Without these the TYPE arm of a row is dead weight:
  // mutation-testing this file found that widening row 4's type predicate to `() => true` changed
  // no verdict, because nothing ever presented a wrong-typed tenant_id at the ruled location. A
  // fence arm that no test can distinguish is not a fence arm.
  ['TYPE 1  Cell.state, not CellState', 'Cell', 'state', 'string', 0, 'FAIL'],
  [
    'TYPE 2  Lifecycle.state, not LifecycleState',
    'Lifecycle',
    'state',
    'string',
    0,
    'FAIL',
  ],
  [
    'TYPE 3  envelope tenant_id, not string',
    'WidgetEnvelope',
    'tenant_id',
    'TenantRef',
    0,
    'FAIL',
  ],
  [
    'TYPE 4  IntentRecord tenant_id, not string',
    'IntentRecord',
    'tenant_id',
    'TenantRef',
    0,
    'FAIL',
  ],
  [
    'TYPE 5  WidgetIntent.role, seven members',
    'WidgetIntent',
    'role',
    "| 'primary' | 'secondary'",
    0,
    'FAIL',
  ],
  [
    'TYPE 6  receipt role, expanded not aliased',
    'RenderReceipt',
    'intents_withheld[].role',
    R8,
    1,
    'FAIL',
  ],
  [
    'tenant_id on a third shape',
    'ChannelProfile',
    'tenant_id',
    'string',
    0,
    'FAIL',
  ],
];
const vres = VECTORS.map(([n, sh, p, t, d, want]) => ({
  n,
  got: verdict(sh, p, t, d),
  want,
}));
const vbad = vres.filter((v) => v.got !== v.want);
chk(
  `F88.2 vectors execute the refusal (${VECTORS.length} vectors, 5 of them the required negatives)`,
  vbad.length === 0,
  vbad.length
    ? vbad.map((v) => `${v.n}: got ${v.got}, want ${v.want}`).join(' | ')
    : vres.map((v) => `${v.want}  ${v.n}`).join('\n        '),
  'EXECUTED',
);

// The reach walk must FOLLOW named type references, or the fence passes by not looking: with the
// five roots alone, WidgetIntent, RenderReceipt, Cell and Lifecycle all leave the walk and the hit
// list empties out. Mutation testing found this arm untested. Every shape the exemption table
// names must be reachable FROM a root, which is the property that makes the table meaningful.
const unreachableExemptions = F88_EXEMPTIONS.filter((e) => !reach.has(e.shape));
chk(
  'the walk follows type references: every exempted shape is reachable from a root',
  unreachableExemptions.length === 0 && reach.size > WALK_ROOTS.length,
  unreachableExemptions.length
    ? 'OUTSIDE THE WALK: ' +
        unreachableExemptions.map((e) => e.shape).join(', ')
    : `${reach.size} shapes reached from ${WALK_ROOTS.length} roots; all ${F88_EXEMPTIONS.length} exempted shapes are inside`,
);

// ── the walker itself, proven against a synthetic shape ─────────────────────────────────────
// Mutation-testing this file found that capping the walk at depth 1 changed no verdict, because
// no shape the contract currently declares carries a forbidden key deeper than depth 1. So the
// UNBOUNDEDNESS of the walk - the property F88 states as "at any other depth" - was resting on
// nothing. It is now proven directly: the real deepMembers() and the real EXEMPT() are run over a
// synthetic declaration that buries forbidden keys at depths 2, 3 and 4, in BOTH array spellings
// (`Array<T>` and `T[]`) - mutation testing found the `T[]` arm dead, because the contract as it
// stands happens to use only one of the two.
// This tests the walker rather than today's shapes, so it survives the shapes changing.
const PROBE = `
interface DepthProbe {
  a: { role: string };
  b: { c: { tenant_id: string } };
  d: Array<{ e: { f: { is_owner: boolean } } }>;
  i: { j: { permissions: string } }[];
  g: { h: { role: 'primary' | 'secondary' | 'destructive' | 'escape' | 'more' | 'handoff' | 'remedy' | 'control' } };
}`;
const probeSf = ts.createSourceFile(
  'probe.ts',
  PROBE,
  ts.ScriptTarget.ES2022,
  true,
);
let probeDecl = null;
probeSf.forEachChild((n) => {
  if (ts.isInterfaceDeclaration(n)) probeDecl = n;
});
const probeMembers = deepMembers(probeDecl, probeSf);
const probeHits = probeMembers.filter(
  (m) => FORBIDDEN.includes(m.key) && !EXEMPT('DepthProbe', m),
);
const deepest = Math.max(0, ...probeMembers.map((m) => m.depth));
chk(
  'the walk is unbounded in depth: forbidden keys at depths 2-4 are found and refused',
  probeHits.length === 5 && deepest >= 3,
  probeHits.length === 5 && deepest >= 3
    ? probeHits.map((m) => `${m.path} (depth ${m.depth})`).join(' · ') +
        ` - deepest member reached: depth ${deepest}`
    : `found ${probeHits.length} of 5 planted keys, deepest depth ${deepest} - the walk is capped`,
  'EXECUTED',
);

// ── NEG 5 and the invariance, both proven by ABSENCE OF A READ ──────────────────────────────
// "IntentRecord.tenant_id copied into an authority decision -> FAIL" and "changing a presentation
// role cannot change an authority result" are the same kind of claim, and the same proof answers
// both: a field that nothing reads cannot be branched on. An AST read-count is stronger than
// replaying fixtures, because it refuses the CAPABILITY to branch rather than sampling branches.
const readsOf = (name) => {
  let n = 0;
  for (const f of files) {
    const sf = ts.createSourceFile(
      f,
      fs.readFileSync(path.join(SRC, f), 'utf8'),
      ts.ScriptTarget.ES2022,
      true,
    );
    const walk = (node) => {
      if (ts.isPropertyAccessExpression(node) && node.name.text === name) n++;
      if (
        ts.isElementAccessExpression(node) &&
        ts.isStringLiteral(node.argumentExpression || {}) &&
        node.argumentExpression.text === name
      )
        n++;
      node.forEachChild(walk);
    };
    walk(sf);
  }
  return n;
};
const roleReads = readsOf('role');
const tenantReads = readsOf('tenant_id');
chk(
  'NEG 5  IntentRecord.tenant_id is never read into an authority decision',
  tenantReads === 0,
  `0 property reads of .tenant_id in ${files.length} modules - the stored binding is evidence about` +
    ` the past, and no declared function consults it; the current tenant is re-resolved server-side`,
  'EXECUTED',
);
chk(
  'INVARIANCE  changing a presentation role cannot change an authority result',
  roleReads === 0,
  `0 property reads of .role in ${files.length} modules - no function reads it at either admitted` +
    ` location, so none can branch on it for identical authority inputs`,
  'EXECUTED',
);
// The guard that makes the two source-reading checks above honest: the regions they search must
// contain no assertion, so an assertion can never be its own evidence.
const regionsAreInert =
  !/\bchk\(/.test(tableSrc) &&
  !/\bchk\(/.test(exemptSrc) &&
  tableSrc.length > 400;
const shapeRows = (tableSrc.match(/shape:/g) || []).length;
const pathRows = (tableSrc.match(/path:/g) || []).length;
const depthRows = (tableSrc.match(/depth:/g) || []).length;
chk(
  'no generic exception exists: every exemption row names a shape, a path and a depth',
  regionsAreInert &&
    shapeRows === F88_EXEMPTIONS.length &&
    pathRows === F88_EXEMPTIONS.length &&
    depthRows === F88_EXEMPTIONS.length,
  regionsAreInert
    ? `${shapeRows} shape / ${pathRows} path / ${depthRows} depth fields over ${F88_EXEMPTIONS.length} rows;` +
        ` the searched regions hold no assertion, so none can satisfy itself`
    : 'the searched region contains an assertion - a source check could satisfy itself',
);
chk(
  'IntentProposal is outside the walk, so its role is not admitted by exception but by scope',
  !reach.has('WidgetComposerInput') && !reach.has('IntentProposal'),
  'a projector input is never serialized to a client; F88 does not name it',
);

chk(
  'no four_eyes member on any shape',
  !Object.values(shapes)
    .flat()
    .some((m) => /four_?[Ee]yes/.test(m.key)),
  'absent',
);

// ── 4. the wire format cannot carry an endpoint ─────────────────────────────
for (const shape of [
  'WidgetIntentSubmission',
  'WidgetIntent',
  'IntentTarget',
  'IntentRecord',
]) {
  const bad = (shapes[shape] || [])
    .filter((m) =>
      [
        'url',
        'endpoint',
        'href',
        'provider',
        'host',
        'origin',
        'query',
      ].includes(m.key),
    )
    .map((m) => m.key);
  chk(
    `${shape} has no member able to carry an endpoint`,
    bad.length === 0,
    bad.join(',') || 'none',
  );
}
// ── 5. one declaration per identifier ───────────────────────────────────────
const ADMITTED = { subjectCapability: ['intent.ts', 'verification-floor.ts'] }; // F6a admits this one by name
const dupes = Object.entries(declaredIn).filter(
  ([k, v]) =>
    new Set(v).size > 1 &&
    !(
      ADMITTED[k] && [...new Set(v)].sort().join() === ADMITTED[k].sort().join()
    ),
);
chk(
  'every identifier is declared in exactly one module',
  dupes.length === 0,
  dupes.map(([k, v]) => `${k}:${[...new Set(v)].join('+')}`).join(' ') ||
    `${Object.keys(declaredIn).length} identifiers, one admitted pair`,
);

// ── 6. the registries, by execution ─────────────────────────────────────────
try {
  const got = execFileSync(
    'node',
    [
      '-r',
      'ts-node/register/transpile-only',
      path.join(BE, 'scripts/widget-contract/registry-probe.js'),
    ],
    { cwd: BE, encoding: 'utf8' },
  ).trim();
  chk(
    'the three registries load at their declared cardinalities',
    got === '226/221/47/56',
    got,
    'EXECUTED',
  );
} catch (e) {
  chk(
    'the three registries load at their declared cardinalities',
    false,
    String(e.message).slice(0, 120),
    'EXECUTED',
  );
}

const PENDING = [
  [
    'KIND_REGISTRY totality over the 22 kinds',
    'the table is `declare const` until K2 populates it against K1’s canon; P-10',
  ],
  [
    'R1 portability, per kind per profile',
    'needs the renderer conformance corpus; P-19, built by K5',
  ],
  [
    'the forbidden-key WALK at every depth of a live envelope',
    'needs a live envelope; P-01, built by K3',
  ],
  [
    'WIDGET_CAPABILITY_POLICY totality over C9-CAP’s 56 rows',
    'the table is `declare const` until K2 fills it; P-10',
  ],
];
let bad = 0;
console.log('WIDGET CONTRACT CHECKS\n');
for (const o of out) {
  if (!o.ok) bad++;
  console.log(`${o.ok ? 'PASS' : 'FAIL'}  [${o.kind}] ${o.n}\n        ${o.ev}`);
}
console.log(
  '\nNOT CHECKED YET, and why - each a named prerequisite, not an omission:',
);
for (const [n, w] of PENDING) console.log(`  PENDING  ${n}\n           ${w}`);
console.log(
  `\n${out.length - bad}/${out.length} checks pass, ${PENDING.length} pending on a later package`,
);
process.exit(bad ? 1 : 0);
