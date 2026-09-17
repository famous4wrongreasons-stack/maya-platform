// What a gate may read about the request and the record, held at the source.
//
// D-9: the context carries the JWT-validated actor, and the resolved-roles member is gone. Carrying the actor
// constructs no principal (K5), but it does put a `role` within reach of Gate 6 — and which read
// supplies the live principal's role is AMB-03, unruled. So Gate 6's code may not read the actor's
// role until that ruling is made and this test is changed in the same commit. Held at the source, and
// closed rather than enumerated: Gate 6 may use the actor object only by reading a literal member
// name other than `role`. Any other use (a helper, a spread, `Object.*`, `JSON.*`, a rest element)
// hands the object to code where a role read could not be seen, so it is red itself. The spellings
// that reach the object are shared with T-ARCH-FACTS (`memberUses`). Not seen: the actor reached by a
// computed key on the context itself, or the whole context handed to a module outside Gate 6's slot.
//
// S-ROW / D-3: the record a gate sees is the plan's §2.4 union, every column of it AUDIT_RETAINED.
// The classification is read from `schema.prisma`'s own `// A` / `// C` / `// X` markers, not copied
// here. `confirmationJson` is selected only to be projected: the raw object is never a row member.
//
// Class BUILD: structure only. Each rule also runs over mutated sources, each red for its own reason.

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import {
  GATEWAY,
  memberUses,
  parseSource,
  patternMembers,
  pipelineSources,
  readWidget,
  type SourceUnit,
} from './gate-slots.spec-helper.spec';

const typesSource = readWidget('gate.types.ts');
const RESOLVED_ROLES = 'resolved' + 'Roles'; // spelled in parts so this file does not match itself

const interfaceMembers = (source: string, name: string): string[] => {
  const sf = parseSource('gate.types.ts', source);
  const decl = sf.statements.find(
    (s): s is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(s) && s.name.text === name,
  );
  if (!decl) throw new Error(`no interface ${name}`);
  return decl.members.map((m) => (m.name ? m.name.getText(sf) : '?'));
};

const interfaceMemberType = (
  source: string,
  name: string,
  member: string,
): string | null => {
  const sf = parseSource('gate.types.ts', source);
  const decl = sf.statements.find(
    (s): s is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(s) && s.name.text === name,
  );
  const m = decl?.members.find(
    (x): x is ts.PropertySignature =>
      ts.isPropertySignature(x) && x.name.getText(sf) === member,
  );
  return m?.type ? m.type.getText(sf) : null;
};

// ── D-9 ──────────────────────────────────────────────────────────────────────────────────────────

/** Every read of the actor's role in `unit`: `.role`, `['role']`, a computed key or a `role` binding, through aliases. */
const actorRoleReads = (unit: SourceUnit): string[] => {
  const out: string[] = [];
  const sf = parseSource(unit.file, unit.source);
  const at = (n: ts.Node): string =>
    `${unit.file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
  for (const use of memberUses(sf, 'actor')) {
    if (use.kind === 'member' && use.name === 'role')
      out.push(`${at(use.node)}: reads the actor's role`);
    if (use.kind === 'computed')
      out.push(`${at(use.node)}: reads the actor by a computed key`);
    if (use.kind === 'destructure')
      for (const el of patternMembers(use.pattern))
        if (el.name === 'role')
          out.push(`${at(el.node)}: destructures the actor's role`);
        else if (!el.rest && el.name === null)
          out.push(`${at(el.node)}: destructures the actor by a computed key`);
  }
  return out;
};

/**
 * Every way `unit` lets the actor object go somewhere a role read could no longer be seen: any use of
 * it other than a read of a literal member name (a call argument, a spread, a return, `Object.*`,
 * `JSON.*`, `in`, an assignment) and a rest element that copies it. Applied to Gate 6's code, where
 * AMB-03 forbids the role, and not to the controller, whose job is to hand the actor on.
 */
const actorEscapes = (unit: SourceUnit): string[] => {
  const out: string[] = [];
  const sf = parseSource(unit.file, unit.source);
  const at = (n: ts.Node): string =>
    `${unit.file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
  for (const use of memberUses(sf, 'actor')) {
    if (use.kind === 'escape')
      out.push(
        `${at(use.node)}: uses the actor other than by a named read (${use.how})`,
      );
    if (use.kind === 'destructure')
      for (const el of patternMembers(use.pattern))
        if (el.rest)
          out.push(`${at(el.node)}: copies the actor by a rest element`);
  }
  return out;
};

/** What Gate 6's code may not do with the actor until AMB-03 is ruled. */
const gate6ActorViolations = (unit: SourceUnit): string[] => [
  ...actorRoleReads(unit),
  ...actorEscapes(unit),
];

describe('D-9 — the actor is carried, the resolved-roles member is gone, and Gate 6 reads no role (AMB-03)', () => {
  it('GateContext carries the JWT-validated actor and J-1 facts, and no resolved roles', () => {
    const members = interfaceMembers(typesSource, 'GateContext');
    expect(members).toEqual(expect.arrayContaining(['actor', 'facts']));
    expect(members).not.toContain(RESOLVED_ROLES);
    expect(interfaceMemberType(typesSource, 'GateContext', 'actor')).toBe(
      'Readonly<AuthenticatedUser>',
    );
  });

  it('no file of the widget layer, spec or not, mentions resolved roles any more', () => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        return e.isDirectory() ? walk(full) : [full];
      });
    const offenders = walk(__dirname)
      .filter((f) => f.endsWith('.ts'))
      .filter((f) => fs.readFileSync(f, 'utf8').includes(RESOLVED_ROLES))
      .map((f) => path.relative(__dirname, f));
    expect(offenders).toEqual([]);
  });

  it('the controller hands the gateway the actor, and no role, roles or principal member', () => {
    // Since U0 item 8 the controller submits `intentSubmitArgs(dto, actor)` and nothing else, so the
    // argument object is read where it is built. Both files are held to "no role read".
    const ctrlSrc = readWidget('widgets.controller.ts');
    const ctrlSf = parseSource('widgets.controller.ts', ctrlSrc);
    const submitCalls: string[] = [];
    const visitCtrl = (n: ts.Node): void => {
      if (
        ts.isCallExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        n.expression.name.text === 'submit'
      )
        submitCalls.push(n.getText(ctrlSf));
      ts.forEachChild(n, visitCtrl);
    };
    visitCtrl(ctrlSf);
    expect(submitCalls).toEqual([
      'this.gateway.submit(intentSubmitArgs(dto, actor))',
    ]);

    const argsSrc = readWidget('intent-submit-args.ts');
    const argsSf = parseSource('intent-submit-args.ts', argsSrc);
    const returned: string[][] = [];
    const visitArgs = (n: ts.Node): void => {
      if (
        ts.isReturnStatement(n) &&
        n.expression &&
        ts.isObjectLiteralExpression(n.expression)
      )
        returned.push(
          n.expression.properties.map((p) =>
            p.name ? p.name.getText(argsSf) : '...',
          ),
        );
      ts.forEachChild(n, visitArgs);
    };
    visitArgs(argsSf);
    expect(returned).toHaveLength(1);
    expect(returned[0]).toContain('actor');
    for (const forbidden of [RESOLVED_ROLES, 'role', 'roles', 'principal'])
      expect(returned[0]).not.toContain(forbidden);
    for (const [file, source] of [
      ['widgets.controller.ts', ctrlSrc],
      ['intent-submit-args.ts', argsSrc],
    ] as const)
      expect(actorRoleReads({ slot: null, file, source })).toEqual([]);
  });

  it("Gate 6 — its slot and every file the slot calls — does not read the actor's role", () => {
    const units = pipelineSources().slotUnits.filter((u) => u.slot === '6');
    expect(units.map((u) => u.file)).toEqual(
      expect.arrayContaining([`${GATEWAY}#slot-6`, 'gates/gate6.ts']),
    );
    expect(units.flatMap(gate6ActorViolations)).toEqual([]);
  });

  describe('the role fence goes red on each way around it that it names (mutations)', () => {
    const unit = (body: string): SourceUnit => ({
      slot: '6',
      file: 'gate6-mutant.ts',
      source: `declare const ctx: any;\nexport const gate6 = () => {\n${body}\n};\n`,
    });

    it('CONTROL: reading the actor’s other members by name, by any spelling, or a record’s presentation role, is clean', () => {
      expect(
        gate6ActorViolations(
          unit(
            "const u = ctx.actor.userId; const r = ctx.record.role; const t = ctx.actor['tenantId']; return [u, r, t];",
          ),
        ),
      ).toEqual([]);
      expect(
        gate6ActorViolations(
          unit(
            'const { userId, email } = ctx.actor; const a = ctx.actor; const s = a.sessionId; const { actor: b } = ctx; const m = (b as any)!.membershipId; return [userId, email, s, m];',
          ),
        ),
      ).toEqual([]);
    });

    it("CONTROL: handing the actor on (the controller's job) reads no role, but in Gate 6 it is red", () => {
      const handsOn = unit(
        'return submit({ actor: ctx.actor, hash: principalProofHash(ctx.actor) });',
      );
      expect(actorRoleReads(handsOn)).toEqual([]);
      // In Gate 6 the object may not leave by any route a role read could hide behind.
      expect(actorEscapes(handsOn)).toHaveLength(2);
    });

    // [name, mutant body, the violation it must be red for]
    const mutants: ReadonlyArray<readonly [string, string, RegExp]> = [
      ['ctx.actor.role', 'return ctx.actor.role;', /reads the actor's role/],
      [
        "ctx.actor['role']",
        "return ctx.actor['role'];",
        /reads the actor's role/,
      ],
      [
        "ctx['actor'].role",
        "return ctx['actor'].role;",
        /reads the actor's role/,
      ],
      [
        'a computed key on the actor',
        "const k = 'ro' + 'le'; return ctx.actor[k];",
        /reads the actor by a computed key/,
      ],
      [
        'destructured from the actor',
        'const { role } = ctx.actor; return role;',
        /destructures the actor's role/,
      ],
      [
        'renamed while destructured',
        'const { role: r } = ctx.actor; return r;',
        /destructures the actor's role/,
      ],
      [
        'destructured under a computed key',
        "const k = 'role'; const { [k]: r } = ctx.actor; return r;",
        /destructures the actor by a computed key/,
      ],
      [
        'destructured through the context',
        'const { actor: { role } } = ctx; return role;',
        /destructures the actor's role/,
      ],
      [
        'through an alias',
        'const a = ctx.actor; return a.role;',
        /reads the actor's role/,
      ],
      [
        'through a destructured actor',
        'const { actor } = ctx; return actor.role;',
        /reads the actor's role/,
      ],
      [
        'through a renamed destructured actor',
        'const { actor: a } = ctx; return a.role;',
        /reads the actor's role/,
      ],
      [
        'through a parameter',
        'return (({ actor }: any) => actor.role)(ctx);',
        /reads the actor's role/,
      ],
      [
        'R6: the actor handed to a helper that reads the role',
        'const roleOf = (u: { role: string }) => u.role; return roleOf(ctx.actor);',
        /uses the actor other than by a named read \(CallExpression\)/,
      ],
      [
        'the actor spread into a local',
        'const a = { ...ctx.actor }; return a.role;',
        /uses the actor other than by a named read \(SpreadAssignment\)/,
      ],
      [
        'Object.values over the actor',
        'return Object.values(ctx.actor);',
        /uses the actor other than by a named read \(CallExpression\)/,
      ],
      [
        'a JSON round trip of the actor',
        'return JSON.parse(JSON.stringify(ctx.actor)).role;',
        /uses the actor other than by a named read \(CallExpression\)/,
      ],
      [
        'the actor returned whole',
        'return ctx.actor;',
        /uses the actor other than by a named read \(ReturnStatement\)/,
      ],
      [
        'the role key tested with `in`',
        "return 'role' in ctx.actor;",
        /uses the actor other than by a named read \(BinaryExpression\)/,
      ],
      [
        'an alias of the actor handed to a helper',
        'const { actor: a } = ctx; return Object.entries(a);',
        /uses the actor other than by a named read \(CallExpression\)/,
      ],
      [
        'the actor bound by a destructuring assignment of the context',
        'let a: any; ({ actor: a } = ctx); return a.role;',
        /uses the actor other than by a named read \(destructuring assignment\)/,
      ],
      [
        'the actor copied by a rest element',
        'const { userId, ...rest } = ctx.actor; return [userId, rest.role];',
        /copies the actor by a rest element/,
      ],
    ];

    it.each(mutants)('RED: %s', (_name, body, reason) => {
      const violations = gate6ActorViolations(unit(body));
      expect({
        violations,
        red: violations.some((v) => reason.test(v)),
      }).toEqual({ violations, red: true });
    });
  });
});

// ── S-ROW and D-3 ────────────────────────────────────────────────────────────────────────────────

const schema = fs.readFileSync(
  path.join(__dirname, '..', '..', 'prisma', 'schema.prisma'),
  'utf8',
);

/** A model's scalar columns and the erasure class its `// A|C|D|X` marker gives each. */
const columnClasses = (model: string): Map<string, string> => {
  const start = schema.indexOf(`model ${model} {`);
  if (start < 0) throw new Error(`no model ${model}`);
  const body = schema.slice(start, schema.indexOf('\n}', start));
  const out = new Map<string, string>();
  for (const line of body.split('\n')) {
    const m = /^\s+(\w+)\s+\S+.*\/\/\s*([ACDX])\b/.exec(line);
    if (m) out.set(m[1], m[2]);
  }
  return out;
};

interface SelectTree {
  readonly columns: string[];
  readonly emission: string[];
}

/** The `select` of `findRecord`'s one `findFirst`, top level and `emission.select`. */
const findRecordSelect = (gatewaySource: string): SelectTree => {
  const sf = parseSource(GATEWAY, gatewaySource);
  const selects: ts.ObjectLiteralExpression[] = [];
  const visit = (n: ts.Node): void => {
    if (
      ts.isMethodDeclaration(n) &&
      n.name.getText(sf) === 'findRecord' &&
      n.body !== undefined
    ) {
      const inner = (m: ts.Node): void => {
        if (
          ts.isPropertyAssignment(m) &&
          m.name.getText(sf) === 'select' &&
          ts.isObjectLiteralExpression(m.initializer) &&
          !ts.isPropertyAssignment(m.parent.parent)
        )
          selects.push(m.initializer);
        ts.forEachChild(m, inner);
      };
      inner(n.body);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (selects.length !== 1)
    throw new Error(`findRecord has ${selects.length} top-level selects`);
  const columns: string[] = [];
  let emission: string[] = [];
  for (const p of selects[0].properties) {
    if (!ts.isPropertyAssignment(p))
      throw new Error('a select member not a property');
    const name = p.name.getText(sf);
    if (name === 'emission' && ts.isObjectLiteralExpression(p.initializer)) {
      const nested = p.initializer.properties.find(
        (q): q is ts.PropertyAssignment =>
          ts.isPropertyAssignment(q) && q.name.getText(sf) === 'select',
      );
      if (!nested || !ts.isObjectLiteralExpression(nested.initializer))
        throw new Error('emission is not projected with its own select');
      emission = nested.initializer.properties.map((q) =>
        q.name ? q.name.getText(sf) : '?',
      );
    } else columns.push(name);
  }
  return { columns, emission };
};

/** Every S-ROW / D-3 violation of a gateway + gate.types pair. */
const rowViolations = (gatewaySource: string, types: string): string[] => {
  const out: string[] = [];
  const record = columnClasses('WidgetIntentRecord');
  const emission = columnClasses('WidgetEmission');
  const sel = findRecordSelect(gatewaySource);
  for (const c of sel.columns) {
    const cls = record.get(c);
    if (cls === undefined)
      out.push(`select ${c}: not a WidgetIntentRecord column`);
    else if (cls !== 'A') out.push(`select ${c}: class ${cls}`);
  }
  for (const c of sel.emission) {
    const cls = emission.get(c);
    if (cls === undefined)
      out.push(`select emission.${c}: not a WidgetEmission column`);
    else if (cls !== 'A') out.push(`select emission.${c}: class ${cls}`);
  }
  const notA = new Set(
    [...record, ...emission].filter(([, cls]) => cls !== 'A').map(([c]) => c),
  );
  for (const m of interfaceMembers(types, 'IntentRecordRow')) {
    if (notA.has(m)) out.push(`IntentRecordRow.${m}: a class C or X column`);
    if (m === 'confirmationJson')
      out.push(
        'IntentRecordRow.confirmationJson: the raw object is on the row (D-3)',
      );
  }
  return out;
};

describe('S-ROW and D-3 — the record gates read is AUDIT_RETAINED, and confirmation is projected', () => {
  const gatewaySource = readWidget(GATEWAY);

  it('reads the classification from schema.prisma, and it is not empty', () => {
    const record = columnClasses('WidgetIntentRecord');
    expect(record.get('confirmationJson')).toBe('A');
    expect(record.get('renderedUtterance')).toBe('C');
    expect(record.get('utteranceTemplate')).toBe('C');
    expect(columnClasses('WidgetEmission').get('bodyJson')).toBe('C');
  });

  it('findRecord selects the §2.4 union: exactly these columns, one findFirst', () => {
    const sel = findRecordSelect(gatewaySource);
    expect([...sel.columns].sort()).toEqual(
      [
        'intentTokenHash',
        'tenantId',
        'widgetId',
        'widgetKind',
        'effect',
        'principalProofHash',
        'verificationFloor',
        'singleUse',
        'consumedAt',
        'issuedAt',
        'expiresAt',
        'priority',
        'capabilitySpace',
        'capabilityKey',
        'handoffSpace',
        'handoffKey',
        'targetJson',
        'bodyHash',
        'selectionDomain',
        'inputSchemaHash',
        'confirmationOfKind',
        'confirmationOfRef',
        'producedByIntentTokenHash',
        'c9Domain',
        'requestedScopeHash',
        'runId',
        'revisionId',
        'approvalOfIntentRef',
        'frozenNounsJson',
        'confirmationJson',
      ].sort(),
    );
    expect([...sel.emission].sort()).toEqual([
      'deliveryChannel',
      'lifecycleState',
      'supersededByWidgetId',
    ]);
    expect(gatewaySource.match(/\.findFirst\(/g)).toHaveLength(1);
  });

  it('no selected column and no row member is class C or X, and the raw confirmation is not a member', () => {
    expect(rowViolations(gatewaySource, typesSource)).toEqual([]);
    const members = interfaceMembers(typesSource, 'IntentRecordRow');
    expect(members).toEqual(
      expect.arrayContaining(['confirmation', 'confirmationIdempotencyKey']),
    );
  });

  describe('the row fence goes red on each way around it (mutations)', () => {
    const withSelect = (member: string) =>
      gatewaySource.replace(
        'confirmationJson: true,',
        `confirmationJson: true,\n        ${member}: true,`,
      );
    const withEmissionSelect = (member: string) =>
      gatewaySource.replace(
        'lifecycleState: true,',
        `lifecycleState: true,\n            ${member}: true,`,
      );
    const withRowMember = (member: string) =>
      typesSource.replace(
        'readonly approvalOfIntentRef: string | null;',
        `readonly approvalOfIntentRef: string | null;\n  readonly ${member}: unknown;`,
      );

    const mutants: ReadonlyArray<readonly [string, string, string]> = [
      [
        'D-12 reverted: renderedUtterance selected',
        withSelect('renderedUtterance'),
        typesSource,
      ],
      [
        'X-M3: the lowering template selected',
        withSelect('utteranceTemplate'),
        typesSource,
      ],
      [
        'labels JSON selected',
        withSelect('selectionDomainLabelsJson'),
        typesSource,
      ],
      [
        'an emission body selected',
        withEmissionSelect('bodyJson'),
        typesSource,
      ],
      [
        'X-M4: the raw confirmation placed on the row',
        gatewaySource,
        withRowMember('confirmationJson'),
      ],
      [
        'a C column placed on the row',
        gatewaySource,
        withRowMember('spokenTranscript'),
      ],
    ];

    it.each(mutants)('RED: %s', (_name, gw, types) => {
      expect(gw === gatewaySource && types === typesSource).toBe(false);
      expect(rowViolations(gw, types).length).toBeGreaterThan(0);
    });
  });
});
