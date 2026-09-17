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

const ARGS_NAME = 'intentSubmitArgs';
const ARGS_MODULE = './intent-submit-args';

/** Every identifier spelled `name` in `sf`, wherever it stands. */
const identifiersNamed = (sf: ts.SourceFile, name: string): ts.Identifier[] => {
  const found: ts.Identifier[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n) && n.text === name) found.push(n);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
};

/**
 * Every way the controller's `intentSubmitArgs` could stop being the derivation in
 * `intent-submit-args.ts`, the file this test and K3 check 6 read. Without it, a controller importing
 * the name from a sibling that lets the body override the tenant passed both (U0 S3 review, mutant
 * M1). Closed, and the same rule as K3 check 6: the controller has one import declaration of
 * './intent-submit-args', which binds the name by name, un-aliased and as a value, and every other
 * occurrence of the name is a call's callee; `intent-submit-args.ts` declares the name once, as its
 * exported top-level const arrow, has no export declaration, and sets `tenantId` only inside it.
 */
const submitArgsBindingBreaks = (
  ctrlSrc: string,
  argsSrc: string,
): string[] => {
  const out: string[] = [];
  const ctrlSf = parseSource('widgets.controller.ts', ctrlSrc);
  const argsSf = parseSource('intent-submit-args.ts', argsSrc);
  const at = (sf: ts.SourceFile, n: ts.Node): string =>
    `${sf.fileName}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;

  const imports = ctrlSf.statements.filter(
    (s): s is ts.ImportDeclaration =>
      ts.isImportDeclaration(s) &&
      ts.isStringLiteral(s.moduleSpecifier) &&
      s.moduleSpecifier.text === ARGS_MODULE,
  );
  let imported: ts.Identifier | null = null;
  if (imports.length !== 1)
    out.push(
      `widgets.controller.ts has ${imports.length} import declarations of '${ARGS_MODULE}'`,
    );
  else {
    const clause = imports[0].importClause;
    const bound =
      clause &&
      !clause.isTypeOnly &&
      clause.namedBindings &&
      ts.isNamedImports(clause.namedBindings)
        ? clause.namedBindings.elements.filter(
            (e) =>
              !e.isTypeOnly && !e.propertyName && e.name.text === ARGS_NAME,
          )
        : [];
    if (bound.length === 1) imported = bound[0].name;
    else
      out.push(
        `'${ARGS_MODULE}' does not bind ${ARGS_NAME} by name, un-aliased, as a value`,
      );
  }
  for (const id of identifiersNamed(ctrlSf, ARGS_NAME))
    if (
      id !== imported &&
      !(ts.isCallExpression(id.parent) && id.parent.expression === id)
    )
      out.push(
        `${at(ctrlSf, id)}: ${ARGS_NAME} in a ${ts.SyntaxKind[id.parent.kind]}`,
      );

  const derivations: ts.VariableDeclaration[] = [];
  for (const s of argsSf.statements) {
    if (ts.isExportDeclaration(s) || ts.isExportAssignment(s))
      out.push(`${at(argsSf, s)}: an export declaration`);
    if (
      ts.isVariableStatement(s) &&
      (ts.getModifiers(s) ?? []).some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword,
      ) &&
      (s.declarationList.flags & ts.NodeFlags.Const) !== 0
    )
      for (const d of s.declarationList.declarations)
        if (
          ts.isIdentifier(d.name) &&
          d.name.text === ARGS_NAME &&
          d.initializer &&
          ts.isArrowFunction(d.initializer)
        )
          derivations.push(d);
  }
  const derivation = derivations.length === 1 ? derivations[0] : null;
  if (!derivation)
    out.push(
      `intent-submit-args.ts has ${derivations.length} exported top-level const arrow ${ARGS_NAME}`,
    );
  for (const id of identifiersNamed(argsSf, ARGS_NAME))
    if (id !== derivation?.name)
      out.push(
        `${at(argsSf, id)}: ${ARGS_NAME} in a ${ts.SyntaxKind[id.parent.kind]}`,
      );
  const body = derivation?.initializer;
  const visitTenant = (n: ts.Node): void => {
    if (
      ts.isPropertyAssignment(n) &&
      n.name.getText(argsSf) === 'tenantId' &&
      !(body && n.pos >= body.pos && n.end <= body.end)
    )
      out.push(
        `${at(argsSf, n)}: a tenantId member outside the exported ${ARGS_NAME}`,
      );
    ts.forEachChild(n, visitTenant);
  };
  visitTenant(argsSf);
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
    // What was read above is what the controller runs: its `intentSubmitArgs` is the one
    // `intent-submit-args.ts` declares and exports.
    expect(submitArgsBindingBreaks(ctrlSrc, argsSrc)).toEqual([]);
  });

  describe("the controller's intentSubmitArgs is the derivation read above (mutations)", () => {
    // Mutants are applied inside each test, so a change to the real files fails that test, not the
    // collection of the suite.
    const IMPORT = `import { ${ARGS_NAME} } from '${ARGS_MODULE}';`;
    const DECL = `export const ${ARGS_NAME} = (`;
    const CALL = `const result = await this.gateway.submit(${ARGS_NAME}(dto, actor));`;
    const swap =
      (from: string, to: string) =>
      (source: string): string => {
        if (source.split(from).length !== 2)
          throw new Error(`not exactly one ${JSON.stringify(from)}`);
        return source.replace(from, () => to);
      };
    const breaksOf = (
      target: 'controller' | 'derivation',
      mutate: (source: string) => string,
    ): string[] => {
      const ctrlSrc = readWidget('widgets.controller.ts');
      const argsSrc = readWidget('intent-submit-args.ts');
      return target === 'controller'
        ? submitArgsBindingBreaks(mutate(ctrlSrc), argsSrc)
        : submitArgsBindingBreaks(ctrlSrc, mutate(argsSrc));
    };

    it('CONTROL: the sources as they are, and a type binding added to the import, are clean', () => {
      expect(breaksOf('controller', (s) => s)).toEqual([]);
      expect(
        breaksOf(
          'controller',
          swap(
            IMPORT,
            `import { ${ARGS_NAME}, type IntentSubmitArgs } from '${ARGS_MODULE}';\ntype Unused = IntentSubmitArgs;`,
          ),
        ),
      ).toEqual([]);
    });

    // [name, the file mutated, the mutation, the break it must be red for]
    const mutants: ReadonlyArray<
      readonly [
        string,
        'controller' | 'derivation',
        (source: string) => string,
        RegExp,
      ]
    > = [
      [
        'M1: the controller imports the name from a sibling file',
        'controller',
        swap(IMPORT, `import { ${ARGS_NAME} } from './evil-args';`),
        /has 0 import declarations of '\.\/intent-submit-args'/,
      ],
      [
        'the derivation imported under an alias, the name declared beside it',
        'controller',
        swap(
          IMPORT,
          `import { ${ARGS_NAME} as derive } from '${ARGS_MODULE}';\nconst ${ARGS_NAME} = (d: SubmitIntentDto, a: AuthenticatedUser) => ({ ...derive(d, a), tenantId: (d as unknown as { t: string }).t });`,
        ),
        /does not bind intentSubmitArgs by name, un-aliased/,
      ],
      [
        'a second import of the module',
        'controller',
        swap(IMPORT, `${IMPORT}\nimport '${ARGS_MODULE}';`),
        /has 2 import declarations of '\.\/intent-submit-args'/,
      ],
      [
        'the name also imported, aliased, from a sibling',
        'controller',
        swap(
          IMPORT,
          `${IMPORT}\nimport { ${ARGS_NAME} as evil } from './evil-args';`,
        ),
        /widgets\.controller\.ts:\d+: intentSubmitArgs in a ImportSpecifier/,
      ],
      [
        'a default import of the name from a sibling',
        'controller',
        swap(IMPORT, `import ${ARGS_NAME} from './evil-args';`),
        /widgets\.controller\.ts:\d+: intentSubmitArgs in a ImportClause/,
      ],
      [
        'a type-only import of the name',
        'controller',
        swap(IMPORT, `import type { ${ARGS_NAME} } from '${ARGS_MODULE}';`),
        /does not bind intentSubmitArgs by name, un-aliased, as a value/,
      ],
      [
        'the import kept, the name shadowed inside the handler',
        'controller',
        swap(CALL, `const ${ARGS_NAME} = evilArgs;\n    ${CALL}`),
        /widgets\.controller\.ts:\d+: intentSubmitArgs in a VariableDeclaration/,
      ],
      [
        'the import kept, the name reassigned',
        'controller',
        swap(CALL, `${ARGS_NAME} = evilArgs;\n    ${CALL}`),
        /widgets\.controller\.ts:\d+: intentSubmitArgs in a BinaryExpression/,
      ],
      [
        'intent-submit-args.ts re-exports the name from a sibling',
        'derivation',
        swap(
          DECL,
          `export { ${ARGS_NAME} } from './evil-args';\nexport const derive = (`,
        ),
        /intent-submit-args\.ts:\d+: an export declaration/,
      ],
      [
        'intent-submit-args.ts exports a wrapper under the name, the derivation renamed',
        'derivation',
        (s) =>
          swap(DECL, 'const derive = (')(s) +
          `\nexport const ${ARGS_NAME} = (dto: SubmitIntentDto, actor: AuthenticatedUser): IntentSubmitArgs => ({ ...derive(dto, actor), ['tenant' + 'Id']: (dto as unknown as { t: string }).t });\n`,
        /a tenantId member outside the exported intentSubmitArgs/,
      ],
      [
        'intent-submit-args.ts declares the name as a function, not the exported const',
        'derivation',
        (s) =>
          swap(
            '): IntentSubmitArgs => {',
            '): IntentSubmitArgs {',
          )(swap(DECL, `export function ${ARGS_NAME}(`)(s)),
        /has 0 exported top-level const arrow intentSubmitArgs/,
      ],
    ];

    it.each(mutants)('RED: %s', (_name, target, mutate, reason) => {
      const breaks = breaksOf(target, mutate);
      expect({ breaks, red: breaks.some((b) => reason.test(b)) }).toEqual({
        breaks,
        red: true,
      });
    });
  });

  it("Gate 6 — its slot and every file the slot calls — does not read the actor's role", () => {
    const units = pipelineSources().slotUnits.filter((u) => u.slot === '6');
    expect(units.map((u) => u.file)).toEqual(
      expect.arrayContaining([`${GATEWAY}#slot-6`, 'gates/gate6.ts']),
    );
    expect(units.flatMap(gate6ActorViolations)).toEqual([]);
  });

  // R6-5 (U6-L1's merge) — the positive half of the same fence. The rule above says where slot 6 may
  // NOT get a role; this one says it has exactly one source and names it: `ctx.principal.role`, which
  // P-PRINCIPAL sets from the tenancy owner's `FOR SHARE` Membership read INSIDE `T` (B-02,
  // C11:7189-7191) through `PRINCIPAL_RESOLVER`. Closed, and at the source: every `role` read in
  // slot 6 or in a file the slot calls must be rooted at `principal`, and the adapter that produces
  // it must take the role from the owner's service and from nothing else. Without this half, deleting
  // the actor read and substituting a role from the RECORD would pass the rule above.
  it('R6-5: the only role input to slot 6 is the owner port’s transaction-scoped Membership read', () => {
    const rootOf = (n: ts.PropertyAccessExpression): string => {
      let e: ts.Expression = n.expression;
      while (ts.isPropertyAccessExpression(e)) e = e.expression;
      return ts.isIdentifier(e) ? e.text : e.getText();
    };
    const roleRootViolations = (units: readonly SourceUnit[]): string[] => {
      const out: string[] = [];
      for (const unit of units) {
        const sf = parseSource(unit.file, unit.source);
        const visit = (n: ts.Node): void => {
          if (ts.isPropertyAccessExpression(n) && n.name.text === 'role') {
            const chain = n.expression.getText(sf);
            if (!/(^|\.)principal\b/.test(chain) && rootOf(n) !== 'principal')
              out.push(`${unit.file}: role read off ${chain}`);
          }
          ts.forEachChild(n, visit);
        };
        visit(sf);
      }
      return out;
    };

    expect(
      roleRootViolations(
        pipelineSources().slotUnits.filter((u) => u.slot === '6'),
      ),
    ).toEqual([]);

    // The rule is vacuous over today's slot 6 — the held lane (AMB-01a) reads no role at all until
    // U6-L3 binds the live principal — so it is also run over a PLANTED read, and must go red. Without
    // this arm the fence would report green the day it stopped seeing.
    expect(
      roleRootViolations([
        {
          slot: '6',
          file: 'gate6-planted.ts',
          source:
            'declare const ctx: any;\nexport const gate6 = () => ctx.record.role;\n',
        },
        {
          slot: '6',
          file: 'gate6-planted-2.ts',
          source:
            'declare const ctx: any;\nexport const gate6 = () => ctx.principal.role;\n',
        },
      ]),
    ).toEqual(['gate6-planted.ts: role read off ctx.record']);

    // ...and the producer of that member is the owner, called inside `T`.
    const adapter = readWidget('owner-ports/principal.adapter.ts');
    expect(adapter).toMatch(/MembershipsService/);
    expect(/role\s*[:,]/.test(adapter)).toBe(true);
    // The role never comes from the request body or from the record.
    expect(/role\s*[:=]\s*(?:dto|submission|record|r)\./.test(adapter)).toBe(
      false,
    );
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
const methodSelect = (gatewaySource: string, method: string): SelectTree => {
  const sf = parseSource(GATEWAY, gatewaySource);
  const selects: ts.ObjectLiteralExpression[] = [];
  const visit = (n: ts.Node): void => {
    if (
      ts.isMethodDeclaration(n) &&
      n.name.getText(sf) === method &&
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
    throw new Error(`${method} has ${selects.length} top-level selects`);
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

const findRecordSelect = (gatewaySource: string): SelectTree =>
  methodSelect(gatewaySource, 'findRecord');

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
    // R7-1 (U7a's merge) adds the SECOND read this file admits, and it is enumerated rather than
    // counted away. `findRecord` reads the SUBMITTED record once and serves every gate; slot 7's
    // `findProducingRecord` reads a DIFFERENT row — the one a non-draft COMMIT names in
    // `confirmation_of_ref` (F74, C5a) — and only for that shape. Two reads, two methods, and the
    // gateway may hold no third: a third `findFirst` fails this line.
    expect(gatewaySource.match(/\.findFirst\(/g)).toHaveLength(2);
    const producing = methodSelect(gatewaySource, 'findProducingRecord');
    expect([...producing.columns].sort()).toEqual(
      ['effect', 'capabilitySpace', 'capabilityKey', 'consumedAt'].sort(),
    );
    expect(producing.emission).toEqual([]);
    // Tenant-scoped IN THE QUERY, for the same reason `findRecord` is: a filter applied after the
    // read would have read the foreign row first.
    const producingBody = gatewaySource.slice(
      gatewaySource.indexOf('private findProducingRecord('),
    );
    expect(producingBody).toMatch(
      /where:\s*\{\s*intentTokenHash,\s*tenantId\s*\}/,
    );
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
