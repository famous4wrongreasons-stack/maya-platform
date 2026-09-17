// What a gate may read about the request and the record, held at the source.
//
// D-9: the context carries the JWT-validated actor, and the resolved-roles member is gone. Carrying the actor
// constructs no principal (K5), but it does put a `role` within reach of Gate 6 — and which read
// supplies the live principal's role is AMB-03, unruled. So Gate 6's code may not read the actor's
// role, by any spelling, until that ruling is made and this test is changed in the same commit.
//
// S-ROW / D-3: the record a gate sees is the plan's §2.4 union, every column of it AUDIT_RETAINED.
// The classification is read from `schema.prisma`'s own `// A` / `// C` / `// X` markers, not copied
// here. `confirmationJson` is selected only to be projected: the raw object is never a row member.
//
// Class BUILD: structure only. Each rule also runs over mutated sources.

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import {
  GATEWAY,
  parseSource,
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

/** Every read of the actor's role in `unit`: `.role`, `['role']` or a `role` binding, through aliases. */
const actorRoleReads = (unit: SourceUnit): string[] => {
  const out: string[] = [];
  const sf = parseSource(unit.file, unit.source);
  const at = (n: ts.Node): string =>
    `${unit.file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;

  const actorNames = new Set<string>(['actor']);
  const isActor = (e: ts.Expression): boolean => {
    let x: ts.Expression = e;
    while (ts.isParenthesizedExpression(x) || ts.isNonNullExpression(x))
      x = x.expression;
    return (
      (ts.isPropertyAccessExpression(x) && x.name.text === 'actor') ||
      (ts.isElementAccessExpression(x) &&
        ts.isStringLiteral(x.argumentExpression) &&
        x.argumentExpression.text === 'actor') ||
      (ts.isIdentifier(x) && actorNames.has(x.text))
    );
  };
  const collect = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && n.initializer !== undefined) {
      if (ts.isIdentifier(n.name) && isActor(n.initializer))
        actorNames.add(n.name.text);
    }
    // `const { actor } = ctx` / `({ actor }) => …` / `const { actor: a } = ctx`
    if (
      ts.isBindingElement(n) &&
      ts.isIdentifier(n.name) &&
      (n.propertyName ?? n.name).getText(sf) === 'actor'
    )
      actorNames.add(n.name.text);
    ts.forEachChild(n, collect);
  };
  collect(sf);

  const visit = (n: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(n) &&
      n.name.text === 'role' &&
      isActor(n.expression)
    )
      out.push(`${at(n)}: reads the actor's role`);
    if (
      ts.isElementAccessExpression(n) &&
      isActor(n.expression) &&
      !(
        ts.isStringLiteral(n.argumentExpression) &&
        n.argumentExpression.text !== 'role'
      )
    )
      out.push(`${at(n)}: reads the actor by a role or computed key`);
    if (ts.isObjectBindingPattern(n)) {
      const parent = n.parent;
      const fromActor =
        (ts.isVariableDeclaration(parent) &&
          parent.initializer !== undefined &&
          isActor(parent.initializer)) ||
        (ts.isBindingElement(parent) &&
          (parent.propertyName ?? parent.name).getText(sf) === 'actor');
      if (fromActor)
        for (const el of n.elements)
          if ((el.propertyName ?? el.name).getText(sf) === 'role')
            out.push(`${at(el)}: destructures the actor's role`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
};

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
    const src = readWidget('widgets.controller.ts');
    const sf = parseSource('widgets.controller.ts', src);
    const submitArgs: string[][] = [];
    const visit = (n: ts.Node): void => {
      if (
        ts.isCallExpression(n) &&
        n.expression.getText(sf) === 'this.gateway.submit'
      ) {
        const arg = n.arguments[0];
        if (arg && ts.isObjectLiteralExpression(arg))
          submitArgs.push(
            arg.properties.map((p) => (p.name ? p.name.getText(sf) : '...')),
          );
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    expect(submitArgs).toHaveLength(1);
    expect(submitArgs[0]).toContain('actor');
    for (const forbidden of [RESOLVED_ROLES, 'role', 'roles', 'principal'])
      expect(submitArgs[0]).not.toContain(forbidden);
    expect(
      actorRoleReads({
        slot: null,
        file: 'widgets.controller.ts',
        source: src,
      }),
    ).toEqual([]);
  });

  it("Gate 6 — its slot and every file the slot calls — does not read the actor's role", () => {
    const units = pipelineSources().slotUnits.filter((u) => u.slot === '6');
    expect(units.map((u) => u.file)).toEqual(
      expect.arrayContaining([`${GATEWAY}#slot-6`, 'gates/gate6.ts']),
    );
    expect(units.flatMap(actorRoleReads)).toEqual([]);
  });

  describe('the role fence goes red on each way around it (mutations)', () => {
    const unit = (body: string): SourceUnit => ({
      slot: '6',
      file: 'gate6-mutant.ts',
      source: `declare const ctx: any;\nexport const gate6 = () => {\n${body}\n};\n`,
    });

    it('CONTROL: reading the actor’s user id, or a record’s presentation role, is clean', () => {
      expect(
        actorRoleReads(
          unit(
            "const u = ctx.actor.userId; const r = ctx.record.role; const t = ctx.actor['tenantId']; return [u, r, t];",
          ),
        ),
      ).toEqual([]);
    });

    const mutants: ReadonlyArray<readonly [string, string]> = [
      ['ctx.actor.role', 'return ctx.actor.role;'],
      ["ctx.actor['role']", "return ctx.actor['role'];"],
      ["ctx['actor'].role", "return ctx['actor'].role;"],
      [
        'a computed key on the actor',
        "const k = 'ro' + 'le'; return ctx.actor[k];",
      ],
      [
        'destructured from the actor',
        'const { role } = ctx.actor; return role;',
      ],
      [
        'renamed while destructured',
        'const { role: r } = ctx.actor; return r;',
      ],
      [
        'destructured through the context',
        'const { actor: { role } } = ctx; return role;',
      ],
      ['through an alias', 'const a = ctx.actor; return a.role;'],
      [
        'through a destructured actor',
        'const { actor } = ctx; return actor.role;',
      ],
      ['through a parameter', 'return (({ actor }: any) => actor.role)(ctx);'],
    ];

    it.each(mutants)('RED: %s', (_name, body) => {
      expect(actorRoleReads(unit(body)).length).toBeGreaterThan(0);
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
