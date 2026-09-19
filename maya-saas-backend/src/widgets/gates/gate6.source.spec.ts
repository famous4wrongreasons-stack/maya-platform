// S-* — Gate 6's source fences (GATES-PLAN-V11 U6-L1). Class [BUILD].
//
// Behaviour tests cannot see most of what this gate is about. "The subject is bound once", "the
// HANDOFF branch resolves no execute-admission test" and "no authority decision reads a presentation
// field" are all statements about which code EXISTS, not about which answer a fixture happens to
// get — and every one of them stays true on a build where the rule has been deleted, as long as no
// fixture happens to distinguish the two. FR-14 is the sharpest case: a gate that branched on
// `presentation_mode` would agree with this one on every input a conformant minter can produce.
//
// So the properties are held where they are visible. "Slot 6" is not a hand-kept list: it is what
// `gate-slots.spec-helper.spec.ts` derives from the gateway's own array — the slot-6 element plus
// every relative module whose imported names that element uses. A rewiring that moved a check into a
// new file would bring that file into this scope automatically.
//
// The rules:
//   S-1       no read of `authority_hint`, in any spelling (G6-2, R3.1.3)
//   S-1b      slot 6 never reaches into the submission: the client's bytes are not an authority input
//   S-2       the only `ActionSourceType` slot 6 names is `'authenticated_request'` (F33, G6-10)
//   S-3       no read of a presentation member anywhere in slot 6 (FR-14)
//   S-4       the subject is bound EXACTLY ONCE, and no ref column is read beside the binding (G6-1)
//   S-5       no branch passes by default: every switch is total with a fail-closed default
//   S-6       the HANDOFF branch names no execute-admission mechanism (G6-7)
//   S-7       no `role` read on a record, an envelope or a submission (F88.1 C11:1690-1696)
//   S-8       no Prisma delegate and no store client under slot 6 (FR-1)
//   S-SURFACE the catalogue surface is the literal `'web'`, stated once
//   S-TX      the only role input to slot 6 is the live principal — never `ctx.actor` (D-9, B-02)
//   S-FR14    S-3, extended to `owner-ports/gate6.owners.provider.ts`, which is Gate 6's owner edge
//
// Each rule is also run over a PLANTED violation, in memory, so a fence that has stopped seeing goes
// red for its own reason instead of staying quietly green.

import ts from 'typescript';

import {
  GATEWAY,
  memberUses,
  parseSource,
  pipelineSources,
  readWidget,
  type SourceUnit,
} from '../gate-slots.spec-helper.spec';

const GATE6 = 'gates/gate6.ts';
const OWNERS = 'owner-ports/gate6.owners.provider.ts';

const slot6 = (): readonly SourceUnit[] =>
  pipelineSources().slotUnits.filter((u) => u.slot === '6');

/** The slot's own files, plus one planted unit, so every rule can be run over a violation. */
const withPlanted = (body: string): SourceUnit => ({
  slot: '6',
  file: 'gate6-mutant.ts',
  source: `declare const ctx: any;\ndeclare const owners: any;\nexport const gate6 = async () => {\n${body}\n};\n`,
});

/** Every identifier, property name and string literal in a unit, as text. */
const namesIn = (unit: SourceUnit): string[] => {
  const sf = parseSource(unit.file, unit.source);
  const out: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n)) out.push(n.text);
    else if (ts.isStringLiteralLike(n)) out.push(n.text);
    else if (ts.isPrivateIdentifier(n)) out.push(n.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
};

/** Every property READ in a unit, as `<object text>.<name>`. */
interface Read {
  readonly object: string;
  readonly name: string;
  readonly at: string;
}
const readsIn = (unit: SourceUnit): Read[] => {
  const sf = parseSource(unit.file, unit.source);
  const out: Read[] = [];
  const at = (n: ts.Node) =>
    `${unit.file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
  const visit = (n: ts.Node): void => {
    if (ts.isPropertyAccessExpression(n))
      out.push({
        object: n.expression.getText(sf),
        name: n.name.text,
        at: at(n),
      });
    else if (
      ts.isElementAccessExpression(n) &&
      ts.isStringLiteralLike(n.argumentExpression)
    )
      out.push({
        object: n.expression.getText(sf),
        name: n.argumentExpression.text,
        at: at(n),
      });
    else if (ts.isBindingElement(n)) {
      const key = n.propertyName ?? n.name;
      if (ts.isIdentifier(key) || ts.isStringLiteralLike(key))
        out.push({
          object: n.parent.parent.getText(sf),
          name: key.text,
          at: at(n),
        });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
};

/** The source text of one named function declaration or `const fn = …` in a unit. */
const bodyOf = (unit: SourceUnit, name: string): string => {
  const sf = parseSource(unit.file, unit.source);
  let found: string | null = null;
  const visit = (n: ts.Node): void => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === name &&
      n.initializer
    )
      found = n.initializer.getText(sf);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (found === null)
    throw new Error(`${unit.file}: no declaration of ${name}`);
  return found;
};

/** Comments removed: a fence that matched a comment would be satisfied by a sentence about the rule. */
const codeOnly = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

// ── the rules ────────────────────────────────────────────────────────────────────────────────────

const HINT = /^authority[_-]?hint$/i;
const s1 = (units: readonly SourceUnit[]): string[] =>
  units.flatMap((u) =>
    [...readsIn(u), ...namesIn(u).map((name) => ({ name, at: u.file }))]
      .filter((r) => HINT.test(r.name))
      .map((r) => `${r.at}: ${r.name}`),
  );

const s1b = (units: readonly SourceUnit[]): string[] =>
  units.flatMap((u) =>
    memberUses(parseSource(u.file, u.source), 'submission').map(
      (use) => `${u.file}: submission ${use.kind}`,
    ),
  );

/** F33: the source types the contract knows. Only one of them may appear in slot 6. */
const SOURCE_TYPES = [
  'agent_task',
  'authenticated_request',
  'scheduler',
  'webhook',
  'legacy_bridge',
  'synthetic_shadow',
];
const s2 = (units: readonly SourceUnit[]): string[] =>
  units.flatMap((u) =>
    namesIn(u)
      .filter((n) => SOURCE_TYPES.includes(n) && n !== 'authenticated_request')
      .map((n) => `${u.file}: ${n}`),
  );

const PRESENTATION = /^(?:presentation[_-]?mode|profile[_-]?id|a11y[_-]?env)$/i;
const s3 = (units: readonly SourceUnit[]): string[] =>
  units.flatMap((u) =>
    readsIn(u)
      .filter((r) => PRESENTATION.test(r.name))
      .map((r) => `${r.at}: ${r.object}.${r.name}`),
  );

const BINDERS = ['subjectOf', 'subjectCapability'];
const REF_COLUMNS = [
  'capabilitySpace',
  'capabilityKey',
  'handoffSpace',
  'handoffKey',
];
const s4 = (units: readonly SourceUnit[]): string[] => {
  const problems: string[] = [];
  let bindings = 0;
  for (const u of units) {
    const sf = parseSource(u.file, u.source);
    const visit = (n: ts.Node): void => {
      if (ts.isCallExpression(n)) {
        const callee = n.expression.getText(sf);
        if (BINDERS.includes(callee)) bindings += 1;
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    problems.push(
      ...readsIn(u)
        .filter((r) => REF_COLUMNS.includes(r.name))
        .map((r) => `${r.at}: reads ${r.object}.${r.name} beside the binding`),
    );
  }
  if (bindings !== 1)
    problems.push(`the subject is bound ${bindings} times, not exactly once`);
  return problems;
};

const s5 = (units: readonly SourceUnit[]): string[] =>
  units.flatMap((u) => {
    const sf = parseSource(u.file, u.source);
    const out: string[] = [];
    const visit = (n: ts.Node): void => {
      if (ts.isSwitchStatement(n)) {
        const def = n.caseBlock.clauses.find((c) => ts.isDefaultClause(c));
        if (!def) out.push(`${u.file}: a switch with no default clause`);
        else if (/return\s+pass/.test(codeOnly(def.getText(sf))))
          out.push(`${u.file}: a default clause that passes`);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    return out;
  });

const EXECUTE_ADMISSION = [
  'assertCanExecute',
  'c9Capability',
  'AE_WIDGET_COMMIT_ALLOWLIST',
  'MAYA_AI_TOOL_CATALOG_BY_NAME',
  'grantsRequiredFeatures',
  'actionPolicy',
  'policyDecision',
  'allowedSourceTypes',
  'isAllowlisted',
];
const s6 = (handoffBranch: string): string[] => {
  const sf = parseSource('handoff.ts', `const x = ${handoffBranch};\n`);
  const out: string[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n) && EXECUTE_ADMISSION.includes(n.text))
      out.push(`the HANDOFF branch names ${n.text}`);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
};

/** F88.1's absence proof, scoped to Gate 6: a `role` read on anything but the live principal. */
const s7 = (units: readonly SourceUnit[]): string[] =>
  units.flatMap((u) =>
    readsIn(u)
      .filter((r) => r.name === 'role' && !/principal$/.test(r.object.trim()))
      .map((r) => `${r.at}: ${r.object}.role`),
  );

const PRISMA = /^(?:prisma|tx|client)$/i;
const s8 = (units: readonly SourceUnit[]): string[] =>
  units.flatMap((u) => {
    const out = readsIn(u)
      .filter((r) => PRISMA.test(r.object.trim().replace(/^this\./, '')))
      .map((r) => `${r.at}: ${r.object}.${r.name}`);
    if (/from '\.\.\/\.\.\/prisma\//.test(u.source))
      out.push(`${u.file}: imports the store client`);
    return out;
  });

const s10actor = (units: readonly SourceUnit[]): string[] =>
  units.flatMap((u) =>
    memberUses(parseSource(u.file, u.source), 'actor').map(
      (use) => `${u.file}: actor ${use.kind}`,
    ),
  );

// ── the suite ────────────────────────────────────────────────────────────────────────────────────

describe('Gate 6 source fences — slot 6 is what the gateway array says it is', () => {
  it('derives slot 6 from the pipeline, and it is the gateway element plus `gates/gate6.ts`', () => {
    const files = slot6().map((u) => u.file);
    expect(files).toContain(`${GATEWAY}#slot-6`);
    expect(files).toContain(GATE6);
    // Non-vacuity: the units carry real source, so an empty scan is a defect and not a pass.
    expect(slot6().every((u) => u.source.length > 40)).toBe(true);
  });

  it('S-1: slot 6 never reads `authority_hint` (G6-2)', () => {
    expect(s1(slot6())).toEqual([]);
    expect(
      s1([withPlanted('if (ctx.record.authority_hint) return pass;')]),
    ).not.toEqual([]);
    expect(
      s1([withPlanted("const h = ctx.record['authorityHint'];")]),
    ).not.toEqual([]);
  });

  it('S-1b: slot 6 never reaches into the submission — the client’s bytes are not an authority input', () => {
    expect(s1b(slot6())).toEqual([]);
    expect(s1b([withPlanted('const i = ctx.submission.inputs;')])).not.toEqual(
      [],
    );
    expect(
      s1b([withPlanted('const { submission } = ctx; submission.x;')]),
    ).not.toEqual([]);
  });

  it("S-2: the only source type slot 6 names is 'authenticated_request' (F33, G6-10)", () => {
    expect(s2(slot6())).toEqual([]);
    expect(
      s2([
        withPlanted(
          "if (cap.allowedSourceTypes.includes('agent_task')) return pass;",
        ),
      ]),
    ).not.toEqual([]);
  });

  it('S-3 / S-FR14: neither slot 6 nor Gate 6’s owner edge reads a presentation member (FR-14, C11:1798)', () => {
    const owners: SourceUnit = {
      slot: '6',
      file: OWNERS,
      source: readWidget(OWNERS),
    };
    expect(s3([...slot6(), owners])).toEqual([]);
    // The middle planted violation spells its member from parts. `f88-walk.spec.ts`'s F88-7 ratchet
    // is a TEXT scan for a `profile_id` read anywhere under `src/widgets`, and a planted fixture in a
    // spec is not a read by the widget layer — but the scan cannot tell the two apart, so this file
    // does not put the literal in its own text. What is tested is unchanged: the planted SOURCE the
    // rule parses still contains the read.
    const profileId = ['profile', 'id'].join('_');
    for (const planted of [
      'if (ctx.principal.presentationMode === "owner") return pass;',
      `const p = ctx.record.${profileId};`,
      'const { a11y_env } = ctx.principal;',
    ])
      expect(s3([withPlanted(planted)])).not.toEqual([]);
  });

  it('S-4: the subject is bound exactly once, and no ref column is read beside the binding (G6-1)', () => {
    expect(s4(slot6())).toEqual([]);
    expect(
      s4([withPlanted('const a = subjectOf(r); const b = subjectOf(r);')]),
    ).not.toEqual([]);
    expect(
      s4([
        withPlanted(
          'const ref = subjectOf(r); if (ctx.record.capabilityKey === "x") return pass;',
        ),
      ]),
    ).not.toEqual([]);
  });

  it('S-5: no switch in slot 6 passes by default', () => {
    expect(s5(slot6())).toEqual([]);
    expect(
      s5([
        withPlanted(
          'switch (ref.space) { case "C9": return pass; default: return pass; }',
        ),
      ]),
    ).not.toEqual([]);
    expect(
      s5([withPlanted('switch (ref.space) { case "C9": return pass; }')]),
    ).not.toEqual([]);
  });

  it('S-6: the HANDOFF branch resolves no execute-admission mechanism (G6-7, C11:4746-4747)', () => {
    const unit: SourceUnit = {
      slot: '6',
      file: GATE6,
      source: readWidget(GATE6),
    };
    expect(s6(bodyOf(unit, 'handoffDestination'))).toEqual([]);
    expect(
      s6('(r, ref) => { await owners.assertCanExecute(p, def); return pass; }'),
    ).not.toEqual([]);
    expect(
      s6('(r, ref) => AE_WIDGET_COMMIT_ALLOWLIST[ref.key] ? pass : refuse()'),
    ).not.toEqual([]);
  });

  it('S-7: slot 6 performs no `role` read on a record, an envelope or a submission (F88.1)', () => {
    expect(s7(slot6())).toEqual([]);
    expect(
      s7([withPlanted('if (ctx.record.role === "escape") return pass;')]),
    ).not.toEqual([]);
    expect(
      s7([withPlanted('if (ctx.actor.role === "admin") return pass;')]),
    ).not.toEqual([]);
    // The live principal's role is not a presentation role (C11:1691-1696), so it is admitted.
    expect(s7([withPlanted('const r = ctx.principal.role;')])).toEqual([]);
  });

  it('S-8: slot 6 references no store client (FR-1)', () => {
    expect(s8(slot6())).toEqual([]);
    expect(
      s8([withPlanted('await prisma.membership.findFirst();')]),
    ).not.toEqual([]);
  });

  it('S-SURFACE: the catalogue surface is the literal `web`, stated once (C11:4762)', () => {
    const source = codeOnly(readWidget(OWNERS));
    const surfaces = source.match(/'web'/g) ?? [];
    expect(surfaces).toHaveLength(1);
    expect(/GATE6_SURFACE = 'web' as const/.test(source)).toBe(true);
    // ...and it is never read from an input: no member named `surface` is read off the context.
    expect(
      readsIn({ slot: '6', file: OWNERS, source: readWidget(OWNERS) }).filter(
        (r) => r.name === 'surface' && /ctx|record|submission/.test(r.object),
      ),
    ).toEqual([]);
  });

  it('S-TX: the only role input to slot 6 is the live principal — `ctx.actor` is not read at all (D-9, B-02)', () => {
    // The Membership read that supplies `principal.role` happens in the request transaction, in the
    // tenancy owner, and reaches slot 6 only through `ctx.principal` (P-PRINCIPAL, R6-4). A role the
    // gate took from the JWT-validated actor would be a second answer to the same question.
    expect(s10actor(slot6())).toEqual([]);
    expect(s10actor([withPlanted('const role = ctx.actor.role;')])).not.toEqual(
      [],
    );
  });
});
