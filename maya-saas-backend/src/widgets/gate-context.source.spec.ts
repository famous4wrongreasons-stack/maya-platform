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
    else if (cls !== 'A' && c !== 'retainedLocalBusinessDate')
      out.push(`select ${c}: class ${cls}`);
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
    if (notA.has(m) && m !== 'retainedLocalBusinessDate')
      out.push(`IntentRecordRow.${m}: a class C or X column`);
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
        'sourceCapabilitySpace',
        'sourceCapabilityKey',
        'bodyHash',
        'selectionDomain',
        'retainedLocalBusinessDate',
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
        'confirmationSubject',
        'approvalDecision',
      ].sort(),
    );
    expect([...sel.emission].sort()).toEqual([
      'deliveryChannel',
      'lifecycleState',
      'supersededByWidgetId',
    ]);
    // R7-1 (U7a's merge) adds a SECOND read to the gateway, and it is enumerated rather than counted
    // away. `findRecord` reads the SUBMITTED record once and serves every gate; slot 7's
    // `findProducingRecord` reads a DIFFERENT row — the one a non-draft COMMIT names in
    // `confirmation_of_ref` (F74, C5a) — and only for that shape. Two reads, two methods, and the
    // gateway may hold no third: a third `findFirst` fails this line. What that second read may
    // select and how it must be scoped is `T7-PRODUCING-SCOPE` below.
    expect(gatewaySource.match(/\.findFirst\(/g)).toHaveLength(2);
  });

  /**
   * The producing-record read, held on its own so a mutant can name it.
   *
   * It is a separate `it` with a leading id because `gate7.json`'s **M7-8** — "the producing-record
   * read without `tenantId` in the `where`" — needs a killer that actually bites it, and `T7-WIRED`
   * does not: its `where:\s*\{[^}]*tenantId[^}]*\}` matches `findRecord`'s clause further up the same
   * file, so it stays green while `findProducingRecord` reads across tenants. Measured, not assumed
   * (Merge-B, §4.2): with M7-8's edit applied in memory, T7-WIRED's three assertions all still pass
   * and this one is the only thing that goes red.
   */
  it('T7-PRODUCING-SCOPE: slot 7’s producing-record read selects C5a’s four AUDIT_RETAINED columns and is tenant-scoped IN THE QUERY', () => {
    const producing = methodSelect(gatewaySource, 'findProducingRecord');
    expect([...producing.columns].sort()).toEqual(
      ['effect', 'capabilitySpace', 'capabilityKey', 'consumedAt'].sort(),
    );
    expect(producing.emission).toEqual([]);
    // Tenant-scoped IN THE QUERY, for the same reason `findRecord` is: a filter applied after the
    // read would have read the foreign row first — it would have READ it.
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

// ── D-1-TX ───────────────────────────────────────────────────────────────────────────────────────
//
// CKPT-W1 review fix (finding 4). D-1 puts slots 1-10 inside the ONE request transaction `T`, and
// `submit()` opens it and hands `tx` to `findRecord`. The two OTHER store reads those slots perform
// did not run in it: Gate 7's C5a producing-record loader and Gate 8's lowering-source read both went
// out on `this.prisma`, i.e. on a second pool connection, while `T` was open. F74's C5a then decided
// "the producing record was consumed" from a different snapshot than the transaction that would
// consume the submitted record, and an interactive transaction issued nested queries on separate
// connections — a pool-exhaustion and deadlock hazard on the very path D-1 exists to make
// single-connection.
//
// The wiring is fixed; this is what keeps it fixed. A slot at or before `LAST_TRANSACTIONAL_SLOT` may
// not read on the ambient store client. It must read through the transaction it was handed, or read
// nothing.
//
// CKPT-W1 CLOSE review fix. The first version of this fence could not have caught the defect it was
// written for, and said so in its commit message anyway. Two independent reasons, both fixed here:
//
//   THE SCAN DID NOT REACH THE READ. It filtered `pipelineSources().slotUnits` to the slot ELEMENTS
//   (`u.file.includes('#slot-')`), and the ambient read was never in an element — it was in the
//   gateway's own private method `findProducingRecord`, which slot 7 calls. `pipelineSources` models
//   a slot as "the element, and the FILES it calls into", and a private method of the gateway is
//   neither: it is the slot's own code, factored out. The reach below closes that gap by pulling in
//   the gateway methods a transactional slot calls, transitively. Measured: reverting the source fix
//   and re-running left this arm GREEN, and planting the read back into the method body while leaving
//   the call site intact left all 66 widget suites / 1082 tests green.
//
//   THE RULE WAS THE WRONG RULE. `/\bthis\.prisma\b/` over the source text cannot tell the defect
//   from the fix: the fix IS `(tx ?? this.prisma)`, and a seam that serves callers outside `T` says
//   `client = this.prisma` as a parameter default. So the rule is not "do not NAME the ambient
//   client" but "do not READ ON it" — no `this.prisma.<model>` dereference. Naming it is how a read
//   is handed a choice between `T` and the pool; dereferencing it is the read going out on the pool,
//   whatever the surrounding code was handed.
//
// `D-1-TX-a` is the non-vacuity arm and is the one that was missing: it asserts the reach actually
// contains the store read this rule is about. A fence that scans nothing passes.
describe('D-1-TX — no slot inside `T` reads on the ambient store client', () => {
  /** The gateway's own methods and method-valued properties, by name. */
  const gatewayMethods = (gatewaySource: string): Map<string, string> => {
    const sf = parseSource(GATEWAY, gatewaySource);
    const cls = sf.statements.find((s): s is ts.ClassDeclaration =>
      ts.isClassDeclaration(s),
    );
    const out = new Map<string, string>();
    for (const m of cls?.members ?? []) {
      if (!m.name) continue;
      const fn =
        ts.isMethodDeclaration(m) ||
        (ts.isPropertyDeclaration(m) &&
          m.initializer !== undefined &&
          (ts.isArrowFunction(m.initializer) ||
            ts.isFunctionExpression(m.initializer)));
      if (fn) out.set(m.name.getText(sf), m.getText(sf));
    }
    return out;
  };

  /** Every `this.<name>` in `source` that names one of those methods. */
  const methodsCalled = (
    file: string,
    source: string,
    methods: ReadonlyMap<string, string>,
  ): string[] => {
    const sf = parseSource(file, source);
    const out: string[] = [];
    const visit = (n: ts.Node): void => {
      if (
        ts.isPropertyAccessExpression(n) &&
        n.expression.kind === ts.SyntaxKind.ThisKeyword &&
        methods.has(n.name.text)
      )
        out.push(n.name.text);
      ts.forEachChild(n, visit);
    };
    visit(sf);
    return out;
  };

  /**
   * The slots that run inside `T`, read from the gateway's own `LAST_TRANSACTIONAL_SLOT` and its own
   * array order rather than pinned here, so moving the commit point moves this rule with it.
   */
  const transactionalSlots = (gatewaySource: string): readonly string[] => {
    const m = /const LAST_TRANSACTIONAL_SLOT = '([^']+)';/.exec(gatewaySource);
    if (!m) throw new Error('the gateway declares no LAST_TRANSACTIONAL_SLOT');
    const { order } = pipelineSources(gatewaySource);
    const last = order.indexOf(m[1]);
    if (last < 0)
      throw new Error(`LAST_TRANSACTIONAL_SLOT ${m[1]} is not a slot`);
    return order.slice(0, last + 1);
  };

  /**
   * Everything that runs as a slot at or before the commit: each element, the files it calls into,
   * and — transitively — the gateway methods it calls. The third is the part `pipelineSources` does
   * not model and the part the defect lived in.
   */
  const transactionalReach = (
    gatewaySource: string = readWidget(GATEWAY),
  ): readonly SourceUnit[] => {
    const inTx = new Set(transactionalSlots(gatewaySource));
    const units = pipelineSources(gatewaySource).slotUnits.filter((u) =>
      inTx.has(u.slot ?? ''),
    );
    const methods = gatewayMethods(gatewaySource);
    const out: SourceUnit[] = [...units];
    const taken = new Set<string>();
    const queue: string[] = units.map((u) => u.source);
    while (queue.length > 0) {
      const source = queue.shift() as string;
      for (const name of methodsCalled(GATEWAY, source, methods)) {
        if (taken.has(name)) continue;
        taken.add(name);
        const wrapped = `class C {\n${methods.get(name) as string}\n}\n`;
        out.push({
          slot: null,
          file: `${GATEWAY}#method-${name}`,
          source: wrapped,
        });
        queue.push(wrapped);
      }
    }
    return out;
  };

  /**
   * Every read that goes out on the ambient store client: a `this.prisma.<x>` or `this.prisma[<x>]`
   * dereference, as `file:line`. Naming the client is not the offence — see the header — so
   * `(tx ?? this.prisma).widgetIntentRecord` and `client: C = this.prisma` are both admitted, and
   * what is refused is the read that reaches a model delegate through the pool while `T` is open.
   */
  const ambientReads = (units: readonly SourceUnit[]): string[] => {
    const isThisPrisma = (n: ts.Node): boolean =>
      ts.isPropertyAccessExpression(n) &&
      n.expression.kind === ts.SyntaxKind.ThisKeyword &&
      n.name.text === 'prisma';
    const out: string[] = [];
    for (const u of units) {
      const sf = parseSource(u.file, u.source);
      const visit = (n: ts.Node): void => {
        if (
          (ts.isPropertyAccessExpression(n) ||
            ts.isElementAccessExpression(n)) &&
          isThisPrisma(n.expression)
        )
          out.push(
            `${u.file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`,
          );
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    return out;
  };

  /** The commit point, as the gateway spells it. The only slot literal this fence carries. */
  const LAST_TRANSACTIONAL_SLOT = '10';

  /** A `file:line` locator without its line, so a RED arm pins the SITE and not a line number. */
  const site = (locator: string): string => locator.replace(/:\d+$/, '');

  it('D-1-TX-a the reach is the whole transactional range AND contains the store read it governs', () => {
    // Not vacuous, part one: the range is DERIVED from the gateway — a prefix of its own array,
    // ending at its own constant — rather than pinned as a literal list here. Pinning it would make
    // this arm red for any reordering of the array, which is another rule's business entirely
    // (`gate8r.json#M14` moves slot 8-R past Gate 9, and `T10` is what should catch that, not this).
    const { order } = pipelineSources();
    const inTx = transactionalSlots(readWidget(GATEWAY));
    expect(inTx).toEqual(order.slice(0, inTx.length));
    expect(inTx[inTx.length - 1]).toBe(LAST_TRANSACTIONAL_SLOT);
    expect(readWidget(GATEWAY)).toContain(
      `const LAST_TRANSACTIONAL_SLOT = '${LAST_TRANSACTIONAL_SLOT}';`,
    );
    // There ARE slots after the commit, so "everything is transactional" cannot pass by accident,
    // and the two slots that actually read a second row are inside the range.
    expect(order.length).toBeGreaterThan(inTx.length);
    expect(inTx).toEqual(expect.arrayContaining(['1', '7', '8']));
    const reach = transactionalReach();
    expect(reach.filter((u) => u.file.includes('#slot-')).length).toBe(
      inTx.length,
    );

    // Not vacuous, part two — THE ARM THAT WAS MISSING. The previous fence scanned 15 slot elements
    // and never once read the code that performs the transactional store read, so it was green on a
    // tree where the read went out on the pool. Assert the read site is IN the scanned set, by name
    // and by content, so a reach that stops resolving is red here instead of silently passing below.
    const producing = reach.find(
      (u) => u.file === `${GATEWAY}#method-findProducingRecord`,
    );
    expect(producing).toBeDefined();
    expect(producing?.source).toContain('widgetIntentRecord.findFirst');
    // And the seam Gate 8 reads through is in the scanned set too.
    expect(reach.map((u) => u.file)).toContain(
      'input-validation/input-validation.gate.ts',
    );
  });

  it('D-1-TX-b nothing in the transactional reach reads on the ambient client', () => {
    expect(ambientReads(transactionalReach())).toEqual([]);
  });

  it('D-1-TX-c the two slots that DO read a second row take the transaction as a parameter', () => {
    // The positive half. Without it, deleting both reads would satisfy the rule above.
    const by = (slot: string): string =>
      transactionalReach().find((u) => u.file === `${GATEWAY}#slot-${slot}`)
        ?.source ?? '';
    expect(by('7')).toMatch(/run:\s*\(ctx,\s*tx\)/);
    expect(by('7')).toMatch(/findProducingRecord\([^)]*tx\)/);
    expect(by('8')).toMatch(/run:\s*\(ctx,\s*tx\)/);
    expect(by('8')).toMatch(/inputValidation\.run\(ctx,\s*tx\)/);
    // And the runner really hands one down, rather than the slots naming a `tx` nothing supplies.
    expect(readWidget(GATEWAY)).toMatch(/await gate\.run\(ctx,\s*tx\)/);
    expect(readWidget(GATEWAY)).toMatch(
      /this\.runSlots\(ctx,\s*inTransactionSlots,\s*0,\s*tx\)/,
    );
  });

  it('D-1-TX-d RED: the real defect, planted back into the gateway, turns the fence red', () => {
    // The mutation is the fix run backwards over the REAL source — not a hand-written string that
    // only proves the matcher matches itself, which is what let the blindness stand. Slot 7's call
    // site is left ALONE, so `D-1-TX-c` still passes and this arm is the only thing standing between
    // the pipeline and a read on a second connection.
    const gateway = readWidget(GATEWAY);
    const reverted = gateway.replace(
      '(tx ?? this.prisma).widgetIntentRecord.findFirst(',
      'this.prisma.widgetIntentRecord.findFirst(',
    );
    expect(reverted).not.toEqual(gateway);
    expect(reverted).toContain(
      'this.findProducingRecord(hash, ctx.tenantId, tx)',
    );
    // Located by SITE, not by line: a comment added above the method must not decide whether the
    // programme's transaction rule is enforced.
    expect(ambientReads(transactionalReach(reverted)).map(site)).toEqual([
      `${GATEWAY}#method-findProducingRecord`,
    ]);
  });

  it('D-1-TX-e RED: a planted read in a slot ELEMENT turns it red, and the guarded forms do not', () => {
    // The element case, also as a mutation of the real source.
    const planted = readWidget(GATEWAY).replace(
      'gate7(ctx, (hash) => this.findProducingRecord(hash, ctx.tenantId, tx))',
      'gate7(ctx, (hash) => this.prisma.widgetIntentRecord.findFirst({ where: { hash } }))',
    );
    expect(planted).not.toEqual(readWidget(GATEWAY));
    expect(ambientReads(transactionalReach(planted)).map(site)).toEqual([
      `${GATEWAY}#slot-7`,
    ]);

    // And the fence is about the CONNECTION a read goes out on, not about the identifier: the two
    // shapes that hand a read its choice of client are admitted. Without this, the rule would forbid
    // its own fix and the next integrator would weaken it back.
    expect(
      ambientReads([
        {
          slot: '7',
          file: 'admitted#guarded',
          source:
            'class C { m(tx: T | null) { return (tx ?? this.prisma).widgetIntentRecord.findFirst({}); } }\n',
        },
        {
          slot: '8',
          file: 'admitted#default-parameter',
          source:
            'class C { read(client: LoweringSourceClient = this.prisma) { return client.widgetIntentRecord.findFirst({}); } }\n',
        },
      ]),
    ).toEqual([]);
  });

  it('D-1-TX-f the reach stops at the commit: a slot after it is outside the rule', () => {
    // `submit()` itself opens the transaction on the ambient client (`this.prisma.$transaction`), and
    // must: it is the runner, not a slot. The rule would be false if the reach swallowed it.
    const reach = transactionalReach().map((u) => u.file);
    expect(reach).not.toContain(`${GATEWAY}#method-submit`);
    expect(reach).not.toContain(`${GATEWAY}#slot-13`);
    expect(readWidget(GATEWAY)).toContain('this.prisma.$transaction(');
  });
});
