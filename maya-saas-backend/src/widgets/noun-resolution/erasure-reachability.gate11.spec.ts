// G11-N15 — §0.4 F15's build-time reachability test, for Gate 11 (GATES-PLAN-V11 U11a).
//
// F15 (C11:220-235) states a MECHANISM, not a wish:
//
// > *Mechanism:* a build-time reachability test — for every field read whose value flows into the
// > approval gate (Gate 11), the effect-routing gate, canonical ingress, or an owner's approve/reject
// > route, the field's erasure class must be `AUDIT_RETAINED`; such a read of any other class fails
// > the build. *Evaluation point:* `EP-BUILD`.
//
// and it fixes the resolver's input exactly:
//
// > The noun resolver's input is exactly `{ capability, frozen_nouns, requested_scope_hash,
// > principal_proof_hash, tenant_id, confirmation_of_ref, produced_by_intent_token_hash }`.
//
// AMB-46/B-26 settles that "reaches" means VALUE FLOW and that the approval gate is Gate 11; AMB-37
// settles that "exactly seven" limits the RECORD-FIELD inputs, so `actor`, `effect` and witness
// presence are lawful beside them (B-19).
//
// Nothing here is copied by hand. The classification is read from `prisma/schema.prisma`'s own
// `// A|C|D|X` markers (the same source `gate-context.source.spec.ts` reads for S-ROW), and the seven
// names are read from the certified contract itself, so a contract edit or a schema re-marking turns
// this red rather than leaving a stale list agreeing with itself.
//
// Class BUILD. Structure only; never live proof.

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import {
  APPLICABILITY_COLUMNS,
  F15_SEVEN,
  NOUN_RESOLVER_INPUT_COLUMNS,
} from './noun-resolution';

const HERE = __dirname;
const BE = path.resolve(HERE, '..', '..', '..');
const REPO = path.resolve(BE, '..');
const CONTRACT = path.join(
  REPO,
  'docs',
  'rebuild',
  'MAYA-WIDGET-CONTRACT-V1.md',
);

const read = (file: string): string => fs.readFileSync(file, 'utf8');
const parse = (file: string, source: string): ts.SourceFile =>
  ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

/** Every non-spec file of this unit, plus the gate itself: the whole of slot 11's own code. */
const UNIT_FILES: readonly string[] = Object.freeze([
  path.join(HERE, 'noun-resolution.ts'),
  path.join(HERE, 'noun-handles.ts'),
  path.join(HERE, 'noun-resolution.ports.ts'),
  path.join(HERE, 'noun-resolution.type-assertions.ts'),
  path.join(HERE, '..', 'gates', 'gate11.ts'),
]);

/** A model's scalar columns and the erasure class its `// A|C|D|X` marker gives each. */
const columnClasses = (model: string): Map<string, string> => {
  const schema = read(path.join(BE, 'prisma', 'schema.prisma'));
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

/** F15's own sentence, read from the certified contract rather than retyped. */
const contractSeven = (): string[] => {
  const flat = read(CONTRACT).replace(/\s+/g, ' ');
  const m = /The noun resolver's input is exactly `\{([^}]*)\}`/.exec(flat);
  if (m === null)
    throw new Error("F15's «exactly» sentence was not found in the contract");
  return m[1]
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
};

/** Every property name declared by any interface or type alias in a source file. */
const declaredMembers = (source: string, file: string): string[] => {
  const sf = parse(file, source);
  const out: string[] = [];
  const visit = (n: ts.Node): void => {
    if (
      (ts.isPropertySignature(n) || ts.isPropertyDeclaration(n)) &&
      n.name !== undefined &&
      (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name))
    )
      out.push(n.name.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
};

/** Every `<something>.<member>` read in a file, by member name. */
const propertyReads = (source: string, file: string): Set<string> => {
  const sf = parse(file, source);
  const out = new Set<string>();
  const visit = (n: ts.Node): void => {
    if (ts.isPropertyAccessExpression(n)) out.add(n.name.text);
    if (
      ts.isElementAccessExpression(n) &&
      ts.isStringLiteral(n.argumentExpression)
    )
      out.add(n.argumentExpression.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
};

/** The class-C and class-X columns of the two widget models Gate 11 could reach. */
const erasableColumns = (): ReadonlySet<string> => {
  const out = new Set<string>();
  for (const model of ['WidgetIntentRecord', 'WidgetEmission'])
    for (const [column, cls] of columnClasses(model))
      if (cls !== 'A' && cls !== 'D') out.add(column);
  return out;
};

/** Every violation of F15's value-flow rule in one (file, source) set. */
const f15Violations = (
  files: ReadonlyArray<{ file: string; source: string }>,
): string[] => {
  const erasable = erasableColumns();
  const out: string[] = [];
  for (const { file, source } of files) {
    const name = path.basename(file);
    for (const member of declaredMembers(source, file))
      if (erasable.has(member))
        out.push(`${name}: declares \`${member}\`, a class C/X column`);
    for (const reference of propertyReads(source, file))
      if (erasable.has(reference))
        out.push(`${name}: reads \`${reference}\`, a class C/X column`);
  }
  return out;
};

const unitSources = (): Array<{ file: string; source: string }> =>
  UNIT_FILES.map((file) => ({ file, source: read(file) }));

describe('G11-N15 [BUILD] — F15: the noun resolver reads AUDIT_RETAINED fields, and exactly seven', () => {
  it('G11-N15-a: `NounResolverInput` is F15’s seven, read from the certified contract', () => {
    const seven = contractSeven();
    expect(seven).toHaveLength(7);
    // The names this unit records for the audit row equal the contract's own, in the contract's order.
    expect([...F15_SEVEN]).toEqual(seven);
    // And the type has exactly one member per contract field — no eighth input, no missing one.
    expect(Object.keys(NOUN_RESOLVER_INPUT_COLUMNS)).toHaveLength(seven.length);
  });

  it('G11-N15-b: every column the seven are projected from is class A in `schema.prisma`', () => {
    const record = columnClasses('WidgetIntentRecord');
    const offenders: string[] = [];
    for (const [member, columns] of Object.entries(NOUN_RESOLVER_INPUT_COLUMNS))
      for (const column of columns) {
        const cls = record.get(column);
        if (cls === undefined)
          offenders.push(
            `${member} ← ${column}: not a WidgetIntentRecord column`,
          );
        else if (cls !== 'A')
          offenders.push(`${member} ← ${column}: class ${cls}`);
      }
    expect(offenders).toEqual([]);
    // Not vacuous: the classification was actually read.
    expect(record.get('renderedUtterance')).toBe('C');
    expect(record.get('frozenNounsJson')).toBe('A');
  });

  it('G11-N15-c: B-19’s two legal extras are class A too — `effect`, `runId`, `revisionId`', () => {
    const record = columnClasses('WidgetIntentRecord');
    for (const columns of Object.values(APPLICABILITY_COLUMNS))
      for (const column of columns)
        expect([column, record.get(column)]).toEqual([column, 'A']);
  });

  it('G11-N15-d: no class C or X column is DECLARED or READ anywhere in slot 11’s own code', () => {
    expect(f15Violations(unitSources())).toEqual([]);
    // Not vacuous: the scan knows what it is looking for.
    expect([...erasableColumns()]).toEqual(
      expect.arrayContaining([
        'utteranceTemplate',
        'renderedUtterance',
        'selectedLabels',
        'spokenTranscript',
      ]),
    );
  });

  it('G11-N15-e: the projection reads only class-A members of the record, and nothing else does', () => {
    const record = columnClasses('WidgetIntentRecord');
    const source = read(path.join(HERE, 'noun-resolution.ts'));
    const reads = propertyReads(source, 'noun-resolution.ts');
    const fromRecord = [...reads].filter((r) => record.has(r));
    // The projection is the ONE place a record column is named, and every one it names is class A.
    expect(fromRecord.filter((r) => record.get(r) !== 'A')).toEqual([]);
    expect(fromRecord.sort()).toEqual(
      [
        'capabilityKey',
        'capabilitySpace',
        'confirmationOfKind',
        'confirmationOfRef',
        'effect',
        'frozenNounsJson',
        'principalProofHash',
        'producedByIntentTokenHash',
        'requestedScopeHash',
        'revisionId',
        'runId',
        'tenantId',
      ].sort(),
    );
    // The gate itself names no record column at all: it never sees a record.
    const gate = read(path.join(HERE, '..', 'gates', 'gate11.ts'));
    const inGate = [...propertyReads(gate, 'gate11.ts')].filter((r) =>
      record.has(r),
    );
    expect(inGate.filter((r) => r !== 'effect')).toEqual([]);
  });

  describe('the fence goes red on each way around it that it names (mutations)', () => {
    const planted = (file: string, source: string) => [{ file, source }];

    it('CONTROL: the unit as it stands violates nothing', () => {
      expect(f15Violations(unitSources())).toEqual([]);
    });

    it('a class-C column DECLARED as a member of a view is a violation', () => {
      expect(
        f15Violations(
          planted(
            'mutant.ts',
            'export interface NounResolverInput { readonly renderedUtterance: string }\n',
          ),
        ),
      ).toEqual([
        'mutant.ts: declares `renderedUtterance`, a class C/X column',
      ]);
    });

    it('a class-C column READ in the projection is a violation', () => {
      expect(
        f15Violations(
          planted(
            'mutant.ts',
            'declare const r: Record<string, string>;\nexport const x = () => r.utteranceTemplate;\n',
          ),
        ),
      ).toEqual(['mutant.ts: reads `utteranceTemplate`, a class C/X column']);
    });

    it('a class-C column read under a string index is a violation too', () => {
      expect(
        f15Violations(
          planted(
            'mutant.ts',
            "declare const r: Record<string, unknown>;\nexport const x = () => r['spokenTranscript'];\n",
          ),
        ),
      ).toEqual(['mutant.ts: reads `spokenTranscript`, a class C/X column']);
    });

    it('a class-A column is not a violation, so the rule is about the class and not about the name', () => {
      expect(
        f15Violations(
          planted(
            'mutant.ts',
            'declare const r: Record<string, string>;\nexport const x = () => r.requestedScopeHash;\n',
          ),
        ),
      ).toEqual([]);
    });
  });
});
