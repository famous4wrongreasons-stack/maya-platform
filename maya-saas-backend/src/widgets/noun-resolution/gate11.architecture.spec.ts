// G11-ARCH — Gate 11's structure, held at the source (GATES-PLAN-V11 U11a; AREA-C §2.1.4).
//
// Four claims, and none of them is checkable at run time, which is why they are here:
//
//  1. THE GATE SEES NO RECORD. Row 11's decision is made from F15's seven fields and B-19's two legal
//     extras. A parameter of type `GateContext`, `IntentRecordRow` or `SubmissionShape` would put the
//     whole row — conversation content included — one dot away from the decision, and F15's
//     reachability test would then be guarding a surface that keeps growing.
//  2. NO RE-READ PATH FOR A WITNESS (R3.7.4, C11:4593-4598). No method of any port declared by this
//     unit takes a `Witness`. `noun-resolution.type-assertions.ts` makes the compiler say it for the
//     ports that exist; this says it for any port anyone adds.
//  3. THE HANDLE STAYS INSIDE. `unwrapHandle`/`unwrapWitness` are imported only under `owner-ports/`.
//     A gate that could unwrap a handle could log it or put it in a `detail`, and R3.7.3 says frozen
//     nouns never travel to the client.
//  4. THE OWNER IS REACHED THROUGH A PORT, AND ONLY AT SLOT 11. `gates/gate11.ts` imports port
//     INTERFACES and the views, nothing else; it names no Prisma delegate and no owner service.
//
// Plus two regression pins on the body this unit replaced — `FreshRead` and the `bodyHash` comparison
// — and `G11-WIRED`, the merge-step exit that goes green when IR-11a-1 wires the views into slot 11.
//
// Each rule is also run over a planted violation, so a fence that stopped seeing is red.
//
// Class BUILD. Structure only; never live proof.

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { pipelineSources } from '../gate-slots.spec-helper.spec';

const HERE = __dirname;
const WIDGETS = path.resolve(HERE, '..');
const GATE = path.join(WIDGETS, 'gates', 'gate11.ts');

const read = (file: string): string => fs.readFileSync(file, 'utf8');
const parse = (file: string, source: string): ts.SourceFile =>
  ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

const walk = (dir: string): string[] =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
    );

/** Every `.ts` file of the widget layer, spec or not, as a path relative to `src/widgets`. */
const widgetFiles = (): string[] =>
  walk(WIDGETS)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => path.relative(WIDGETS, f).split(path.sep).join('/'))
    .sort();

// ── rule 1: the gate's body takes views, never a record ──────────────────────────────────────────

const RECORD_TYPES = ['GateContext', 'IntentRecordRow', 'SubmissionShape'];

/** The parameter type names of every arrow/function declaration in a source, by function name. */
const parameterTypes = (
  source: string,
  file: string,
): Map<string, string[]> => {
  const sf = parse(file, source);
  const out = new Map<string, string[]>();
  const record = (
    name: string,
    params: ts.NodeArray<ts.ParameterDeclaration>,
  ) =>
    out.set(
      name,
      params.map((p) => (p.type ? p.type.getText(sf) : 'implicit')),
    );
  const visit = (n: ts.Node): void => {
    if (ts.isFunctionDeclaration(n) && n.name !== undefined)
      record(n.name.text, n.parameters);
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer !== undefined &&
      (ts.isArrowFunction(n.initializer) ||
        ts.isFunctionExpression(n.initializer))
    )
      record(n.name.text, n.initializer.parameters);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
};

// ── rule 2: no port method takes a `Witness` ─────────────────────────────────────────────────────

/** `<interface>.<method>(<param>: <type>)` for every method signature declared in a source. */
const methodParameters = (
  source: string,
  file: string,
): Array<{ where: string; type: string }> => {
  const sf = parse(file, source);
  const out: Array<{ where: string; type: string }> = [];
  const visit = (n: ts.Node): void => {
    if (ts.isMethodSignature(n) && n.name !== undefined) {
      const owner = ts.isInterfaceDeclaration(n.parent)
        ? n.parent.name.text
        : '(anonymous)';
      for (const p of n.parameters)
        out.push({
          where: `${owner}.${n.name.getText(sf)}`,
          type: p.type ? p.type.getText(sf) : 'implicit',
        });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
};

const witnessInPortSignature = (source: string, file: string): string[] =>
  methodParameters(source, file)
    .filter((p) => /\bWitness\b/.test(p.type))
    .map((p) => `${path.basename(file)}: ${p.where} takes ${p.type}`);

// ── rule 3: the unwrappers are fenced to `owner-ports/` ──────────────────────────────────────────

const FENCED = ['unwrapHandle', 'unwrapWitness'];
const BRANDERS = ['asHandle', 'asWitness'];

/**
 * NO EXCEPTIONS on the unwrappers. `widget-import-graph.architecture.spec.ts` already carries the same
 * rule (`G11-UNWRAP`, one of the four G11-ARCH items D-6 folded into it) with no carve-out, and the
 * two must agree or the weaker one is the real fence. The unit's own build-time assertion file asked
 * for an exception while it was being written; it was rewritten to need none instead.
 *
 * The scope is the code a REQUEST runs. `tsconfig.build.json` excludes every `.spec.ts`, so a spec is
 * on no path a submission takes and may brand a handle to test with; the rule scans non-spec files
 * only, and says so rather than leaving the scope implicit.
 */

/** The names a file imports from `noun-handles`, whatever the relative path used. */
const handleImports = (source: string, file: string): string[] => {
  const sf = parse(file, source);
  const out: string[] = [];
  for (const st of sf.statements) {
    if (
      !ts.isImportDeclaration(st) ||
      !ts.isStringLiteral(st.moduleSpecifier) ||
      !st.moduleSpecifier.text.endsWith('noun-handles')
    )
      continue;
    const bindings = st.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings))
      for (const el of bindings.elements)
        out.push((el.propertyName ?? el.name).text);
  }
  return out;
};

const fenceViolations = (
  files: ReadonlyArray<{ file: string; source: string }>,
): string[] => {
  const out: string[] = [];
  for (const { file, source } of files) {
    if (file.endsWith('.spec.ts')) continue;
    const imported = handleImports(source, file);
    const inOwnerPorts = file.startsWith('owner-ports/');
    const inUnit = file.startsWith('noun-resolution/');
    for (const name of imported) {
      if (FENCED.includes(name) && !inOwnerPorts)
        out.push(`${file}: imports \`${name}\` outside owner-ports/`);
      if (BRANDERS.includes(name) && !inOwnerPorts && !inUnit)
        out.push(
          `${file}: imports \`${name}\` outside the noun-resolution unit`,
        );
    }
  }
  return out;
};

/** Every identifier and string literal a source names, so a COMMENT is never mistaken for code. */
const namesIn = (source: string, file: string): Set<string> => {
  const sf = parse(file, source);
  const out = new Set<string>();
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n)) out.add(n.text);
    if (ts.isStringLiteral(n)) out.add(n.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
};

/** How many times an identifier is NAMED in the code of a source (comments excluded). */
const identifierCount = (
  source: string,
  file: string,
  name: string,
): number => {
  const sf = parse(file, source);
  let n = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === name) n += 1;
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return n;
};

// ── the suite ────────────────────────────────────────────────────────────────────────────────────

describe('G11-ARCH [BUILD] — Gate 11 takes views, fences the handle, and re-reads no witness', () => {
  const gateSource = read(GATE);

  it('G11-ARCH-1: the gate’s resolution body takes the two views, the actor and the ports — no record', () => {
    const params = parameterTypes(gateSource, 'gate11.ts');
    expect(params.get('resolve')).toEqual([
      'NounResolverInput',
      'Gate11Applicability',
      'NounActor',
      'NounResolutionPorts | null',
    ]);
    // …and no other function in the file takes a record-shaped parameter except the INTERIM overload,
    // which is `gate11` itself and which IR-11a-2 deletes.
    for (const [name, types] of params)
      if (name !== 'gate11')
        expect({
          name,
          record: types.filter((t) =>
            RECORD_TYPES.some((r) => new RegExp(`\\b${r}\\b`).test(t)),
          ),
        }).toEqual({ name, record: [] });
  });

  it('G11-ARCH-1b: the INTERIM context overload is the only mention of a record type, and it binds no port', () => {
    // Counted over the SYNTAX TREE, so the header comment's prose about the record types this gate no
    // longer takes is not mistaken for code. `GateContext` is named three times — the type import, the
    // overload signature and the implementation signature — and the other two are named nowhere.
    expect({
      GateContext: identifierCount(gateSource, 'gate11.ts', 'GateContext'),
      IntentRecordRow: identifierCount(
        gateSource,
        'gate11.ts',
        'IntentRecordRow',
      ),
      SubmissionShape: identifierCount(
        gateSource,
        'gate11.ts',
        'SubmissionShape',
      ),
    }).toEqual({ GateContext: 3, IntentRecordRow: 0, SubmissionShape: 0 });
    // The interim branch reaches no owner: it passes `null` where the ports go.
    expect(gateSource).toMatch(/nounActor\(first\.actor\),\s*null,\s*\);/);
  });

  it('G11-ARCH-2: no port method anywhere in this unit takes a `Witness` (R3.7.4, no re-read path)', () => {
    const ports = path.join(HERE, 'noun-resolution.ports.ts');
    expect(witnessInPortSignature(read(ports), ports)).toEqual([]);
    // Not vacuous: the scan does see the port methods it is checking.
    expect(methodParameters(read(ports), ports).map((p) => p.where)).toEqual(
      expect.arrayContaining([
        'NounReadPort.read',
        'WitnessPort.currentRevision',
      ]),
    );
    // A planted re-read path is caught.
    expect(
      witnessInPortSignature(
        'export interface P { resolve(w: Witness): Promise<string> }\n',
        'mutant.ts',
      ),
    ).toEqual(['mutant.ts: P.resolve takes Witness']);
  });

  it('G11-ARCH-3: `unwrapHandle`/`unwrapWitness` are imported only under `owner-ports/`', () => {
    const files = widgetFiles().map((file) => ({
      file,
      source: read(path.join(WIDGETS, file)),
    }));
    expect(fenceViolations(files)).toEqual([]);
    // Not vacuous: the scan resolves the module, and the unit does import from it.
    expect(
      files
        .filter((f) => handleImports(f.source, f.file).length > 0)
        .map((f) => f.file),
    ).toEqual(
      expect.arrayContaining([
        'gates/gate11.ts',
        'noun-resolution/noun-resolution.ts',
      ]),
    );
  });

  it('G11-ARCH-3b: the fence goes red on each way around it (mutations)', () => {
    const plant = (file: string, names: string) => [
      {
        file,
        source: `import { ${names} } from '../noun-resolution/noun-handles';\n`,
      },
    ];
    expect(fenceViolations(plant('gates/gate13.ts', 'unwrapHandle'))).toEqual([
      'gates/gate13.ts: imports `unwrapHandle` outside owner-ports/',
    ]);
    expect(fenceViolations(plant('client/leak.ts', 'unwrapWitness'))).toEqual([
      'client/leak.ts: imports `unwrapWitness` outside owner-ports/',
    ]);
    expect(fenceViolations(plant('routing/brander.ts', 'asHandle'))).toEqual([
      'routing/brander.ts: imports `asHandle` outside the noun-resolution unit',
    ]);
    // The lawful importer is admitted.
    expect(
      fenceViolations(
        plant(
          'owner-ports/noun-booking-cancel.adapter.ts',
          'unwrapHandle, asWitness',
        ),
      ),
    ).toEqual([]);
  });

  it('G11-ARCH-4: `gates/gate11.ts` imports only the verdict helpers, the gate types and this unit', () => {
    const sf = parse('gate11.ts', gateSource);
    const specifiers = sf.statements
      .filter(
        (st): st is ts.ImportDeclaration =>
          ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier),
      )
      .map((st) => (st.moduleSpecifier as ts.StringLiteral).text)
      .sort();
    expect(specifiers).toEqual([
      '../gate.types',
      '../noun-resolution/noun-handles',
      '../noun-resolution/noun-resolution',
      '../noun-resolution/noun-resolution.ports',
      './verdict',
    ]);
    // No Prisma delegate, no store client, no owner service — the owner is reached through a port.
    expect(gateSource).not.toMatch(/prisma/i);
    expect(gateSource).not.toMatch(/\bPrismaService\b/);
  });

  it('G11-ARCH-5: the replaced body is gone — no `FreshRead`, no `bodyHash`, and no `refuse`', () => {
    // AREA-C §2.1.2's three findings, pinned so they cannot come back by a later edit. Read from the
    // syntax tree: the header comment describes what was removed, and prose is not code.
    const names = namesIn(gateSource, 'gate11.ts');
    for (const gone of ['FreshRead', 'bodyHash', 'refuse'])
      expect({ gone, present: names.has(gone) }).toEqual({
        gone,
        present: false,
      });
    // The only verdict helper this gate writes with is `superseded` — row 11's outcome.
    expect(names.has('superseded')).toBe(true);
    // Not vacuous: the scan does see the identifiers of the file it read.
    expect(names.has('handle_stale')).toBe(true);
  });

  it('G11-ARCH-6: slot 11 is the only place this unit’s code runs, and it is one slot of the array', () => {
    const pipeline = pipelineSources();
    expect(pipeline.order).toContain('11');
    const slot11 = pipeline.slotUnits
      .filter((u) => u.slot === '11')
      .map((u) => u.file);
    // The slot element and the gate file, always. `arrayContaining` rather than equality because
    // IR-11a-1 adds this unit's projection to the slot's own call set, and that is the intended end
    // state; the next assertion is what keeps the set from growing anywhere else.
    expect(slot11).toEqual(
      expect.arrayContaining([
        'intent-gateway.service.ts#slot-11',
        'gates/gate11.ts',
      ]),
    );
    // Slot 11 calls into this unit and nothing else: no owner service, no store, no other gate.
    expect(
      slot11.filter(
        (f) =>
          f !== 'intent-gateway.service.ts#slot-11' &&
          f !== 'gates/gate11.ts' &&
          !f.startsWith('noun-resolution/'),
      ),
    ).toEqual([]);
    // And no OTHER slot calls into Gate 11's gate file.
    expect(
      pipeline.slotUnits
        .filter((u) => u.file === 'gates/gate11.ts')
        .map((u) => u.slot),
    ).toEqual(['11']);
  });

  // ── the merge-step exit ────────────────────────────────────────────────────────────────────────
  // `intent-gateway.service.ts` is integrator-only (§2.1), so slot 11 still calls `gate11(ctx)` and
  // IR-11a-1 is applied and IR-11a-4 flipped this in U11a's merge commit. Its control below proves the
  // rule flips exactly with the projected call, so a red here is about the wiring and nothing else.
  it('G11-WIRED [BUILD]: slot 11 projects the two views, the actor and the ports — it does not hand the gate a context', () => {
    const slot = pipelineSources().slotUnits.find(
      (u) => u.slot === '11' && u.file.endsWith('#slot-11'),
    );
    expect(slot).toBeDefined();
    const source = slot?.source ?? '';
    expect(source).toMatch(/nounResolverInput\(ctx\.record\)/);
    expect(source).toMatch(/gate11ApplicabilityOf\(ctx\.record\)/);
    expect(source).toMatch(/nounActor\(ctx\.actor\)/);
    expect(source).not.toMatch(/gate11\(ctx\)/);
  });

  it('G11-WIRED control: the rule flips exactly with the projected call, so its red is IR-11a-1’s', () => {
    const wired = `({
      n: '11',
      run: (ctx) => gate11(
        nounResolverInput(ctx.record),
        gate11ApplicabilityOf(ctx.record),
        nounActor(ctx.actor),
        this.nounPorts,
      ),
    });`;
    const today = "({ n: '11', run: (ctx) => gate11(ctx) });";
    const holds = (source: string) =>
      /nounResolverInput\(ctx\.record\)/.test(source) &&
      /gate11ApplicabilityOf\(ctx\.record\)/.test(source) &&
      /nounActor\(ctx\.actor\)/.test(source) &&
      !/gate11\(ctx\)/.test(source);
    expect({ wired: holds(wired), today: holds(today) }).toEqual({
      wired: true,
      today: false,
    });
  });
});
