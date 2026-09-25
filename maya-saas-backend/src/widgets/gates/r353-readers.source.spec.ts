// R353-READERS — R3.5.3's reader set, held at the source (GATES-PLAN-V11 I-CTX; AREA-A R7-3; AMB-09).
//
// R3.5.3 (C11:4219-4224): `handoff_capability_ref` is referenced, never invoked, and "the field has
// exactly four readers and no fifth". AMB-09 (Block B B-06, C11:7195) rules what a reader is: "direct
// member access; `subjectCapability` is that reader". So a gate that needs a HANDOFF destination asks
// `subjectCapability` (or `subjectOf`, its record-row form) and never reads the member itself.
//
// The field is read under three names: `handoff_capability_ref` on an intent, and `handoffSpace` and
// `handoffKey`, the two columns that store it on `WidgetIntentRecord` and on `IntentRecordRow`. Every
// direct member access to one of them, in any non-spec file under `src/`, must stand inside a declaration
// the allowlist below names. A direct member access is:
//   - `x.name`, `x?.name` and `x['name']`;
//   - a binding element `{ name }` or `{ name: alias }`, in a declaration or a parameter;
//   - a destructuring assignment `({ name: alias } = x)`.
// Not a read: a type member, an object literal member that builds a value (`{ handoff_capability_ref: … }`),
// a Prisma `select`, a comment. Not seen: a member reached by a computed key held in a variable.
//
// The allowlist is closed, and each entry must still read the field, so an entry cannot outlive its reader.
// The help generator R3.5.3 names has no entry because it is not built; the unit that builds it adds one,
// and so does P-MINT-CORE for its envelope validator.
//
// Class BUILD: structure only. Each rule also runs over mutated sources, each red for its own reason.

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const SRC = path.resolve(__dirname, '..', '..');

/** The field and its two stored columns. */
const FIELD_NAMES: ReadonlySet<string> = new Set([
  'handoff_capability_ref',
  'handoffSpace',
  'handoffKey',
]);

interface Reader {
  /** What the allowlist admits, in the words of the card that lists it. */
  readonly reader: string;
  /** The file, relative to `src/`. */
  readonly file: string;
  /** The top-level declaration the read stands in. */
  readonly declaration: string;
}

/** I-CTX's allowlist: `subjectCapability`, `subjectOf`, F43 `recomputeFloor`, the mint validator. */
const READERS: readonly Reader[] = [
  {
    reader: 'subjectCapability (§3.5, the runtime body)',
    file: 'widgets/authority/contract-bindings.ts',
    declaration: 'subjectCapability',
  },
  {
    reader: 'subjectCapability (§3.5, the contract transcription)',
    file: 'widget-contract/intent.ts',
    declaration: 'subjectCapability',
  },
  {
    reader: 'subjectOf (subjectCapability over a record row)',
    file: 'widgets/gates/subject.ts',
    declaration: 'subjectOf',
  },
  {
    reader: 'F43 recomputeFloor (Gate 5)',
    file: 'widgets/gates/gate5.ts',
    declaration: 'recomputeFloor',
  },
  {
    reader: 'F43 floor derivation, which recomputeFloor calls (runtime)',
    file: 'widgets/authority/verification-floor.runtime.ts',
    declaration: 'FLOOR_EXEMPT',
  },
  {
    reader: 'F43 floor derivation (the contract transcription)',
    file: 'widget-contract/verification-floor.ts',
    declaration: 'FLOOR_EXEMPT',
  },
  {
    reader: 'the legacy data-subject mint validator (R3.5.1 at EP-MINT)',
    file: 'widgets/consent/data-subject-acts.ts',
    declaration: 'assertSensitiveSubjectAdmissible',
  },
  {
    reader: 'the closed intent-template mint validator (R3.5.1 at EP-MINT)',
    file: 'widgets/emission/intent-template.registry.ts',
    declaration: 'resolveIntentTemplate',
  },
  {
    reader:
      'the closed booking-template mint validator refuses a HANDOFF-only member (R3.5.1 at EP-MINT)',
    file: 'widgets/booking/booking-intent-template.registry.ts',
    declaration: 'resolveBookingTemplateForSynthesis',
  },
];

/** One direct member access to the field. */
interface Read {
  readonly file: string;
  readonly line: number;
  readonly name: string;
  readonly declaration: string;
}

/** The top-level declaration `node` stands in: a const, a function, or a class member. */
const declarationOf = (node: ts.Node, sf: ts.SourceFile): string => {
  let top: ts.Node = node;
  while (top.parent && top.parent !== sf) top = top.parent;
  if (ts.isVariableStatement(top)) {
    const d = top.declarationList.declarations.find(
      (v) => node.pos >= v.pos && node.end <= v.end,
    );
    return d && ts.isIdentifier(d.name) ? d.name.text : '<top level>';
  }
  if (ts.isFunctionDeclaration(top) && top.name) return top.name.text;
  if (ts.isClassDeclaration(top) && top.name) {
    const member = top.members.find(
      (m) => node.pos >= m.pos && node.end <= m.end,
    );
    const name = member?.name;
    return `${top.name.text}.${name && ts.isIdentifier(name) ? name.text : '<member>'}`;
  }
  return '<top level>';
};

/** A key a destructure or an access names literally: an identifier or a string literal. */
const literalKey = (n: ts.Node | undefined): string | null =>
  n && (ts.isIdentifier(n) || ts.isStringLiteralLike(n)) ? n.text : null;

/** An object literal that is the target of an assignment, directly or nested in one. */
const isAssignmentPattern = (n: ts.ObjectLiteralExpression): boolean => {
  let x: ts.Node = n;
  for (;;) {
    const p = x.parent;
    if (ts.isParenthesizedExpression(p)) x = p;
    else if (ts.isPropertyAssignment(p) && p.initializer === x) x = p.parent;
    else if (ts.isArrayLiteralExpression(p)) x = p;
    else break;
  }
  const p = x.parent;
  return (
    (ts.isBinaryExpression(p) &&
      p.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      p.left === x) ||
    ((ts.isForOfStatement(p) || ts.isForInStatement(p)) && p.initializer === x)
  );
};

/** Every direct member access to the field in one source file. */
const readsIn = (file: string, source: string): Read[] => {
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const out: Read[] = [];
  const push = (n: ts.Node, name: string): void => {
    out.push({
      file,
      line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1,
      name,
      declaration: declarationOf(n, sf),
    });
  };
  const visit = (n: ts.Node): void => {
    if (ts.isPropertyAccessExpression(n) && FIELD_NAMES.has(n.name.text))
      push(n, n.name.text);
    if (ts.isElementAccessExpression(n)) {
      const key = literalKey(n.argumentExpression);
      if (key !== null && FIELD_NAMES.has(key)) push(n, key);
    }
    if (ts.isBindingElement(n) && ts.isObjectBindingPattern(n.parent)) {
      const key = literalKey(n.propertyName ?? n.name);
      if (key !== null && FIELD_NAMES.has(key)) push(n, key);
    }
    if (ts.isObjectLiteralExpression(n) && isAssignmentPattern(n))
      for (const m of n.properties) {
        const key =
          ts.isPropertyAssignment(m) || ts.isShorthandPropertyAssignment(m)
            ? literalKey(m.name)
            : null;
        if (key !== null && FIELD_NAMES.has(key)) push(m, key);
      }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
};

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });

/** Every read in `src/`, spec files excluded. Files that never spell a name are not parsed. */
const scan = (): Read[] =>
  walk(SRC)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    .flatMap((f) => {
      const source = fs.readFileSync(f, 'utf8');
      if (![...FIELD_NAMES].some((name) => source.includes(name))) return [];
      return readsIn(path.relative(SRC, f).split(path.sep).join('/'), source);
    });

const admitted = (r: Read): boolean =>
  READERS.some((a) => a.file === r.file && a.declaration === r.declaration);

const outside = (reads: readonly Read[]): string[] =>
  reads
    .filter((r) => !admitted(r))
    .map((r) => `${r.file}:${r.line}: ${r.declaration} reads ${r.name}`);

describe('R353-READERS [BUILD] — handoff_capability_ref has a closed reader set (R3.5.3, AMB-09)', () => {
  const reads = scan();

  it('R353-READERS: every direct member access to the field stands in an allowlisted reader', () => {
    expect(outside(reads)).toEqual([]);
  });

  it('R353-READERS: each allowlisted reader still reads the field, so the list cannot outlive a reader', () => {
    const idle = READERS.filter(
      (a) =>
        !reads.some(
          (r) => r.file === a.file && r.declaration === a.declaration,
        ),
    ).map((a) => `${a.file}#${a.declaration} (${a.reader})`);
    expect(idle).toEqual([]);
    // Not vacuous: the scan sees the record-row reads and the intent reads alike.
    expect(new Set(reads.map((r) => r.name))).toEqual(FIELD_NAMES);
  });

  describe('the fence goes red on each way around it (mutations)', () => {
    const gate = (body: string): string =>
      [
        "import type { GateContext, GateVerdict } from '../gate.types';",
        "import { subjectOf } from './subject';",
        "import { pass, refuse } from './verdict';",
        `export const gateX = (ctx: GateContext): GateVerdict => {`,
        '  const r = ctx.record;',
        "  if (!r) return refuse('effect_not_admissible', 'no record');",
        `  ${body}`,
        '  return pass;',
        '};',
        '',
      ].join('\n');
    const violations = (file: string, source: string): string[] =>
      outside(readsIn(file, source));

    it('CONTROL: asking subjectOf, building an intent, a type member and a Prisma select are clean', () => {
      expect(
        violations(
          'widgets/gates/gateX.ts',
          gate(
            [
              'const dest = subjectOf(r);',
              "const intent = { handoff_capability_ref: dest, handoffSpace: 'C9' };",
              'type Row = { handoffSpace: string | null; handoffKey: string | null };',
              'const select = { handoffSpace: true, handoffKey: true };',
              '// r.handoffSpace in a comment is not a read',
              'void intent; void select; const row: Row | null = null; void row;',
            ].join('\n  '),
          ),
        ),
      ).toEqual([]);
      // The allowlisted declaration itself is clean.
      expect(
        violations(
          'widgets/gates/subject.ts',
          'export const subjectOf = (r: any) => r.handoffSpace && r.handoffKey;\n',
        ),
      ).toEqual([]);
    });

    // [name, file, source, the read it must be red for]
    const mutants: ReadonlyArray<readonly [string, string, string, RegExp]> = [
      [
        'M36: Gate 7 reads handoffSpace directly',
        'widgets/gates/gate7.ts',
        gate("if (r.handoffSpace === 'AE') return pass;"),
        /gates\/gate7\.ts:\d+: gateX reads handoffSpace/,
      ],
      [
        'optional chaining',
        'widgets/gates/gateX.ts',
        gate('if (ctx.record?.handoffKey) return pass;'),
        /gateX reads handoffKey/,
      ],
      [
        'an element access under a literal key',
        'widgets/gates/gateX.ts',
        gate("if (r['handoffKey'] !== null) return pass;"),
        /gateX reads handoffKey/,
      ],
      [
        'a destructure',
        'widgets/gates/gateX.ts',
        gate('const { handoffSpace } = r; void handoffSpace;'),
        /gateX reads handoffSpace/,
      ],
      [
        'a renamed parameter binding',
        'widgets/gates/gateX.ts',
        gate('const f = ({ handoff_capability_ref: h }: any) => h; void f(r);'),
        /gateX reads handoff_capability_ref/,
      ],
      [
        'a destructuring assignment',
        'widgets/gates/gateX.ts',
        gate('let k: unknown; ({ handoffKey: k } = r); void k;'),
        /gateX reads handoffKey/,
      ],
      [
        'the intent member, read by Gate 13',
        'widgets/gates/gate13.ts',
        'export const gate13 = (i: any) => i.handoff_capability_ref;\n',
        /gate13 reads handoff_capability_ref/,
      ],
      [
        'a fifth reader beside an allowlisted one, in the same file',
        'widgets/gates/gate5.ts',
        'export const recomputeFloor = (r: any) => r.handoffKey;\nexport const gate5 = (r: any) => r.handoffKey;\n',
        /gates\/gate5\.ts:2: gate5 reads handoffKey/,
      ],
      [
        'an allowlisted name in a file the allowlist does not name',
        'widgets/gates/gate6.ts',
        'export const subjectOf = (r: any) => r.handoffSpace;\n',
        /gates\/gate6\.ts:1: subjectOf reads handoffSpace/,
      ],
      [
        'a class member',
        'widgets/routing/effect-router.service.ts',
        'export class Router { route(r: any) { return r.handoffSpace; } }\n',
        /Router\.route reads handoffSpace/,
      ],
    ];

    it.each(mutants)('RED: %s', (_name, file, source, reason) => {
      const found = violations(file, source);
      expect({ found, red: found.some((v) => reason.test(v)) }).toEqual({
        found,
        red: true,
      });
    });
  });
});
