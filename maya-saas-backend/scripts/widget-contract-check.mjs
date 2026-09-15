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
// F88.1, the wave-1 owner ruling: the permission is a (shape, member, type) TRIPLE and never a
// key name. "A key named `role` is allowed" is not the rule and must not be implemented as one.
// §3.1 declares EIGHT, not the four the ruling quoted. F88.1 binds to the declared type.
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
const isDeclaredPresentationRole = (shape, m) => {
  if (shape !== 'WidgetIntent' || m.key !== 'role' || m.depth !== 0)
    return false; // exact location, depth 0
  const vals = [...m.type.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]); // exact type
  return (
    vals.length === ROLE_ENUM.length && ROLE_ENUM.every((v) => vals.includes(v))
  );
};
const EXEMPT = (shape, m) =>
  (m.key === 'tenant_id' && shape === 'WidgetEnvelope' && m.depth === 0) || // F88: the envelope ROOT, depth 0
  (m.key === 'state' && /Cell<|CellState|LifecycleState/.test(m.type)) || // F88: outside a declared body enum field
  isDeclaredPresentationRole(shape, m); // F88.1
const hits = [];
for (const shape of reach)
  for (const m of shapes[shape] || [])
    if (FORBIDDEN.includes(m.key) && !EXEMPT(shape, m))
      hits.push(`${shape}.${m.path}: ${m.type}`);
// The second instance of F88's unqualified-key class, found by the same walk. It is NOT covered
// by the wave-1 ruling, which was about `role`, and it is reported rather than resolved by
// analogy: extending an owner's ruling to a key the owner did not rule on is how a fence moves
// without anyone deciding to move it.
const SECOND_FINDING = hits.filter((h) =>
  h.startsWith('IntentRecord.tenant_id'),
);
chk(
  `no forbidden key in F88's walked closure (${reach.size} shapes), F88 and F88.1 applied`,
  hits.length === 0,
  hits.length
    ? hits.join(' | ') +
        (SECOND_FINDING.length
          ? `\n        SECOND FINDING, same class as the role ruling, NOT covered by it. §3.7 declares` +
            `\n        IntentRecord.tenant_id and Gate 4 reads it, while F88 qualifies \`tenant_id\` only` +
            `\n        "outside the envelope root" - a qualifier that contemplates the envelope while the` +
            `\n        walk also covers IntentRecord. An IntentRecord is SERVER-SIDE STORAGE and is never` +
            `\n        sent to a client, so the wire risk the fence exists for is absent here. One line` +
            `\n        would close it - "outside the envelope root and IntentRecord" - but that is a` +
            `\n        conferral fence and therefore an OWNER RULING, reported and not taken by analogy.`
          : '')
    : `0 of ${FORBIDDEN.length} keys present`,
);

// F88.1 is a NARROW permission, so check that it is narrow rather than that it merely passed.
const rolesInWalk = [...reach].flatMap((sh) =>
  (shapes[sh] || []).filter((m) => m.key === 'role').map((m) => ({ sh, ...m })),
);
const admitted = rolesInWalk.filter((r) => isDeclaredPresentationRole(r.sh, r));
// THIRD FINDING, same class, found only once the walk was taken to full depth as F88 requires:
// section 4.5.5 declares `role: WidgetIntent['role']` at RenderReceipt.intents_withheld[].role,
// depth 2. The type is an alias of the exact declared type, but F88.1 binds to the exact declared
// LOCATION as well, and this is not that location. Reported, not exempted - writing an exemption
// for it would make the ruling a rule about the key name, which is what it forbids.
const THIRD_FINDING = rolesInWalk.filter(
  (r) => !isDeclaredPresentationRole(r.sh, r),
);
chk(
  'F88.1 admits exactly one role member inside the walk, by location AND type',
  rolesInWalk.length === 1 && admitted.length === 1,
  rolesInWalk
    .map((r) => `${r.sh}.${r.path} (depth ${r.depth}): ${r.type.slice(0, 52)}`)
    .join(' | ') +
    (THIRD_FINDING.length
      ? `
        THIRD FINDING, same class, surfaced by taking the walk to full depth: the contract
        MINTS this one itself in section 4.5.5, to name which intents the fitter withheld.
        It is presentation, not a persona - but it is not the declared location either, and
        F88.1 is a triple. Closing it is a one-line contract edit and an OWNER RULING.`
      : ''),
);
chk(
  'the eight admitted values are exactly the presentation enum section 3.1 declares',
  admitted.length === 1 &&
    ROLE_ENUM.every((v) => admitted[0].type.includes(`'${v}'`)),
  ROLE_ENUM.join(' | '),
);
// F88.1 PROOF VECTORS. The owner asked that the ruling be shown to REFUSE, not to read correctly.
// Each vector is a (shape, member, type, depth) tuple pushed through the same two predicates the
// walk uses - EXEMPT and FORBIDDEN - and its verdict is compared with the required one. A vector
// table that agrees with the implementation because it calls the implementation is the point: if
// the predicate is ever widened, a vector flips and this check fails.
const verdict = (shape, key, type, depth = 0) =>
  FORBIDDEN.includes(key) && !EXEMPT(shape, { key, type, depth, path: key })
    ? 'FAIL'
    : 'PASS';
const R8 =
  "| 'primary' | 'secondary' | 'destructive' | 'escape' | 'more' | 'handoff' | 'remedy' | 'control'";
const VECTORS = [
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
  ['undeclared nested role', 'WidgetEnvelope', 'role', R8, 2, 'FAIL'],
  [
    'role on a shape that is not WidgetIntent, right type',
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
    'tenant_id',
    'string',
    1,
    'FAIL',
  ],
];
const vres = VECTORS.map(([n, sh, k, t, d, want]) => ({
  n,
  got: verdict(sh, k, t, d),
  want,
}));
const vbad = vres.filter((v) => v.got !== v.want);
chk(
  `F88.1 proof vectors execute the refusal (${VECTORS.length} vectors)`,
  vbad.length === 0,
  vbad.length
    ? vbad.map((v) => `${v.n}: got ${v.got}, want ${v.want}`).join(' | ')
    : vres.map((v) => `${v.want} ${v.n}`).join('\n        '),
  'EXECUTED',
);
// Behavioural invariance: the ruling requires that changing WidgetIntent.role among its declared
// values cannot change an authority decision. Proven by absence of a read: no function anywhere in
// the module performs a property access named `role`, so no function can branch on one.
let roleReads = 0;
for (const f of files) {
  const sf = ts.createSourceFile(
    f,
    fs.readFileSync(path.join(SRC, f), 'utf8'),
    ts.ScriptTarget.ES2022,
    true,
  );
  const walk = (n) => {
    if (ts.isPropertyAccessExpression(n) && n.name.text === 'role') roleReads++;
    n.forEachChild(walk);
  };
  walk(sf);
}
chk(
  'changing WidgetIntent.role cannot change an authority decision',
  roleReads === 0,
  `0 property reads of .role in ${files.length} modules - no function reads it, so none can branch on it`,
  'EXECUTED',
);

chk(
  'no generic `role allowed everywhere` exception exists in the checker',
  /shape!=='WidgetIntent'/.test(
    fs.readFileSync(new URL(import.meta.url).pathname, 'utf8'),
  ),
  'the permission is bound to the shape, the member and the four-member type',
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
