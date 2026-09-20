// D-10, held at the source: every refusal a gate file writes is checked against §3.9's closed
// vocabulary by the compiler, and nothing in a gate file switches that check off.
//
// `refuse(code: RefusalCode, detail: string): GateVerdict` makes an invented code a compile error
// (`tsc -p tsconfig.build.json` compiles every non-spec file here). A cast to the bottom type would
// make it compile again, so the cast is forbidden in every file of this directory, specs included,
// and the helper is declared exactly once so a local re-declaration cannot reintroduce the old
// conditional parameter type.
//
// The bottom type is not the only cast that does that. `'x' as RefusalCode`, `'x' as unknown as
// RefusalCode` and `'x' as any` all compile, and lint does not stop `any`. So in every non-spec gate
// file the fence is structural, read from the syntax tree rather than from a pattern:
//   - no cast to `any` or `never`, no double cast through `unknown`, and no cast to a type that names
//     `RefusalCode` or `GateVerdict`;
//   - no `@ts-` directive that switches the compiler's check off;
//   - `refuse` appears only as its import from `./verdict` and as the callee of a direct call whose
//     first argument is a plain string literal that `RefusalCode` itself lists (read from
//     `gate.types.ts`, not copied here), so the code a gate writes is checked even if the compiler
//     is told to look away;
//   - no object literal outside `verdict.ts` carries a `code`: a refusal code is written only
//     through `refuse`.
// `superseded` (GATES-PLAN-V11 I-CTX, for Gate 1's seam) writes a code too, so every rule above that
// names `refuse` holds for it in the same words.
// Each rule is also run against mutated sources below, so a fence that stopped seeing is red.

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { pipelineSources } from '../gate-slots.spec-helper.spec';

const GATES = __dirname;
const read = (f: string): string =>
  fs.readFileSync(path.join(GATES, f), 'utf8');
const files = fs
  .readdirSync(GATES)
  .filter((f) => f.endsWith('.ts'))
  .sort();
const nonSpecFiles = files.filter((f) => !f.endsWith('.spec.ts'));

// Built from parts so this file does not match its own pattern.
const CAST_TO_BOTTOM = new RegExp('\\bas\\s+' + 'never\\b');
const BOTTOM = 'nev' + 'er';

/** §3.9's closed vocabulary, read from the union that states it. */
const refusalVocabulary = (): ReadonlySet<string> => {
  const sf = ts.createSourceFile(
    'gate.types.ts',
    fs.readFileSync(path.join(GATES, '..', 'gate.types.ts'), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const codes = new Set<string>();
  for (const st of sf.statements)
    if (
      ts.isTypeAliasDeclaration(st) &&
      st.name.text === 'RefusalCode' &&
      ts.isUnionTypeNode(st.type)
    )
      for (const t of st.type.types)
        if (ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal))
          codes.add(t.literal.text);
  return codes;
};

const SWITCHED_OFF = /@ts-(?:ignore|expect-error|nocheck)\b/;

/** The helpers that write a code, each declared once in `verdict.ts` and fenced alike. */
const CODE_HELPERS: ReadonlySet<string> = new Set(['refuse', 'superseded']);

type Cast = ts.AsExpression | ts.TypeAssertion;
const isCast = (n: ts.Node): n is Cast =>
  ts.isAsExpression(n) || ts.isTypeAssertionExpression(n);

/**
 * A cast that could carry an unchecked code. A lone `as unknown` cannot (nothing accepts `unknown`
 * as a `RefusalCode`), so `unknown` is forbidden only as the middle of a double cast.
 */
const castForbidden = (n: Cast): boolean => {
  if (
    n.type.kind === ts.SyntaxKind.AnyKeyword ||
    n.type.kind === ts.SyntaxKind.NeverKeyword ||
    /\b(?:RefusalCode|GateVerdict)\b/.test(n.type.getText())
  )
    return true;
  if (n.type.kind !== ts.SyntaxKind.UnknownKeyword) return false;
  let outer: ts.Node = n.parent;
  while (ts.isParenthesizedExpression(outer)) outer = outer.parent;
  return isCast(outer);
};

const memberName = (n: ts.ObjectLiteralElementLike): string | null => {
  const name = n.name;
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name) && ts.isStringLiteral(name.expression))
    return name.expression.text;
  return null;
};

/**
 * Options that differ between the two sets this fence scans (see `D-10-PIPE`).
 *
 * `objectLiteralCode` is the one rule that is about this DIRECTORY's shape rather than about the
 * compiler's check: inside `gates/` a refusal is written only through `refuse`, so an object literal
 * carrying a `code` is always a hand-built verdict. Outside it a `code` member is an ordinary datum
 * (`input-validation`'s own decision type carries one, and hands it to `refuse` as a literal), so the
 * rule would forbid a shape that breaks nothing. The rules that actually defeat the compiler's
 * `refuse(code: RefusalCode, …)` signature — casts, `@ts-` directives, and a first argument that is
 * not a listed string literal — apply to both sets unchanged.
 */
interface FenceOptions {
  readonly objectLiteralCode: boolean;
}
const DIRECTORY_RULES: FenceOptions = { objectLiteralCode: true };
const COMPILER_RULES_ONLY: FenceOptions = { objectLiteralCode: false };

/** `./verdict` from inside `gates/`, `../gates/verdict` from a seam directory: the same module. */
const VERDICT_MODULE = /(?:^|\/)verdict$/;

/** Every way `source` (a non-spec pipeline file named `file`) could write a code the vocabulary lacks. */
const refusalFenceViolations = (
  file: string,
  source: string,
  vocabulary: ReadonlySet<string>,
  options: FenceOptions = DIRECTORY_RULES,
): string[] => {
  const out: string[] = [];
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const at = (n: ts.Node): string =>
    `${file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
  // `verdict.ts` inside `gates/`, `gates/verdict.ts` from the pipeline-wide scan: the same file, which
  // is the one place `refuse` and `superseded` are DECLARED rather than called.
  const isVerdictFile = /(?:^|\/)verdict\.ts$/.test(file);
  if (SWITCHED_OFF.test(source))
    out.push(`${file}: a @ts- directive switches the compiler's check off`);

  const visit = (n: ts.Node): void => {
    if (isCast(n) && castForbidden(n))
      out.push(`${at(n)}: cast to ${n.type.getText()}`);

    if (ts.isIdentifier(n) && CODE_HELPERS.has(n.text)) {
      const helper = n.text;
      const p = n.parent;
      const declaredHere =
        isVerdictFile && ts.isVariableDeclaration(p) && p.name === n;
      const importedFromVerdict =
        ts.isImportSpecifier(p) &&
        p.name === n &&
        p.propertyName === undefined &&
        ts.isStringLiteral(p.parent.parent.parent.moduleSpecifier) &&
        VERDICT_MODULE.test(p.parent.parent.parent.moduleSpecifier.text);
      if (ts.isCallExpression(p) && p.expression === n) {
        const first = p.arguments[0];
        if (!first || !ts.isStringLiteral(first))
          out.push(
            `${at(n)}: ${helper}'s code is not a plain string literal (${first ? first.getText() : 'none'})`,
          );
        else if (!vocabulary.has(first.text))
          out.push(`${at(n)}: '${first.text}' is not a RefusalCode`);
      } else if (!declaredHere && !importedFromVerdict)
        out.push(`${at(n)}: ${helper} is used other than as a direct call`);
    }

    if (
      options.objectLiteralCode &&
      !isVerdictFile &&
      ts.isObjectLiteralExpression(n) &&
      n.properties.some((m) => memberName(m) === 'code')
    )
      out.push(`${at(n)}: an object literal carries a code outside verdict.ts`);

    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
};

describe('D-10 — gate files refuse through the typed helper, with no cast', () => {
  it('reads the gate files it guards', () => {
    expect(files).toEqual(
      expect.arrayContaining([
        'verdict.ts',
        'subject.ts',
        'effect-sets.ts',
        'facts.ts',
        'gate5.ts',
        'gate6.ts',
        'gate7.ts',
        'gate8r.ts',
        'gate11.ts',
        'gate13.ts',
      ]),
    );
  });

  it('no file in the gates directory casts to the bottom type', () => {
    const offenders = files.filter((f) => CAST_TO_BOTTOM.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it('refuse and superseded take a RefusalCode and a detail, and are declared once, in verdict.ts', () => {
    expect(read('verdict.ts')).toMatch(
      /export const refuse = \(code: RefusalCode, detail: string\): GateVerdict =>/,
    );
    expect(read('verdict.ts')).toMatch(
      /export const superseded = \(\s*code: RefusalCode,\s*detail: string,?\s*\): GateVerdict =>/,
    );
    // This file is left out of the scan: its own assertion above spells the declaration it checks.
    const self = path.basename(__filename);
    const declarers = files
      .filter((f) => f !== self)
      .filter((f) =>
        /\b(?:const|let|var|function)\s+(?:refuse|pass|superseded)\b/.test(
          read(f),
        ),
      );
    expect(declarers).toEqual(['verdict.ts']);
  });

  it('the former single gate-logic file is gone, and no gate file refers to it', () => {
    expect(fs.existsSync(path.join(GATES, 'gate-logic.ts'))).toBe(false);
    const importers = files.filter((f) =>
      /from '\.\/gate-logic'/.test(read(f)),
    );
    expect(importers).toEqual([]);
  });

  it('the vocabulary the fence checks against is read from RefusalCode, not copied', () => {
    const vocabulary = refusalVocabulary();
    // The interim fail-closed code and one gate code, so a parse that found nothing cannot pass.
    expect(vocabulary.has('mechanism_absent')).toBe(true);
    expect(vocabulary.has('effect_not_admissible')).toBe(true);
    expect(vocabulary.has('invented')).toBe(false);
  });

  it('no non-spec gate file writes a refusal code the compiler was told not to check', () => {
    const vocabulary = refusalVocabulary();
    const violations = nonSpecFiles.flatMap((f) =>
      refusalFenceViolations(f, read(f), vocabulary),
    );
    expect(violations).toEqual([]);
  });

  describe('the fence goes red on each way around it (mutations)', () => {
    const vocabulary = refusalVocabulary();
    const header = [
      "import type { GateContext, GateVerdict, RefusalCode } from '../gate.types';",
      "import { pass, refuse, superseded } from './verdict';",
      'declare const ctx: GateContext;',
      '',
    ].join('\n');
    const body = (line: string): string =>
      `${header}export const g = (): GateVerdict => {\n  if (!ctx.record) ${line}\n  return pass;\n};\n`;

    it('CONTROL: an unmutated refusal, with a computed detail and allowed casts elsewhere, is clean', () => {
      const clean =
        header +
        'const k = ctx.record?.effect as string;\n' +
        'const raw = ctx.record?.targetJson as unknown;\n' +
        'export const g = (): GateVerdict =>\n' +
        "  k ? refuse('effect_not_admissible', `${k} is not admissible`) : pass;\n" +
        'export const h = (): GateVerdict =>\n' +
        "  raw ? superseded('handle_stale', `${k} moved`) : pass;\n";
      expect(refusalFenceViolations('gateX.ts', clean, vocabulary)).toEqual([]);
    });

    const mutants: ReadonlyArray<readonly [string, string]> = [
      [
        'cast to RefusalCode',
        body("return refuse('invented' as RefusalCode, 'x');"),
      ],
      [
        'double cast through unknown',
        body("return refuse('invented' as unknown as RefusalCode, 'x');"),
      ],
      [
        'double cast through unknown, outside a refusal',
        body('{ const n = ctx.record.effect as unknown as number; void n; }'),
      ],
      ['cast to any', body("return refuse('invented' as any, 'x');")],
      [
        'cast to the bottom type',
        body(`return refuse('invented' as ${BOTTOM}, 'x');`),
      ],
      [
        'angle-bracket assertion',
        body("return refuse(<RefusalCode>'invented', 'x');"),
      ],
      [
        'cast to a literal type inside the call',
        body("return refuse('handoff_required' as 'handoff_required', 'x');"),
      ],
      [
        'code carried in an untyped value',
        body("return refuse(JSON.parse('\"invented\"'), 'x');"),
      ],
      [
        'code spread from an array',
        body("return refuse(...(['invented', 'x'] as [string, string]));"),
      ],
      [
        'compiler told to look away',
        body("// @ts-expect-error\n  return refuse('invented', 'x');"),
      ],
      [
        'literal outside the vocabulary',
        body("return refuse('invented_code', 'x');"),
      ],
      [
        'refuse aliased',
        body("{ const r = refuse; return r('handoff_required', 'x'); }"),
      ],
      [
        'refuse imported under another name',
        "import { refuse as r } from './verdict';\nexport const g = () => r('handoff_required', 'x');\n",
      ],
      [
        'a verdict built by hand with a code',
        body("return { outcome: 'refuse', code: JSON.parse('\"invented\"') };"),
      ],
      [
        'a verdict built by hand and cast',
        body("return { outcome: 'superseded' } as GateVerdict;"),
      ],
      [
        'superseded: literal outside the vocabulary',
        body("return superseded('invented_code', 'x');"),
      ],
      [
        'superseded: code carried in an untyped value',
        body("return superseded(JSON.parse('\"invented\"'), 'x');"),
      ],
      [
        'superseded: cast to RefusalCode',
        body("return superseded('invented' as RefusalCode, 'x');"),
      ],
      [
        'superseded aliased',
        body("{ const s = superseded; return s('handle_stale', 'x'); }"),
      ],
      [
        'superseded imported under another name',
        "import { superseded as s } from './verdict';\nexport const g = () => s('handle_stale', 'x');\n",
      ],
      [
        'a superseded verdict built by hand with a code',
        body("return { outcome: 'superseded', code: 'handle_stale' };"),
      ],
    ];

    it.each(mutants)('RED: %s', (_name, source) => {
      expect(
        refusalFenceViolations('gateX.ts', source, vocabulary).length,
      ).toBeGreaterThan(0);
    });
  });

  it('no gate file imports another gate’s file; a set two gates read lives in a shared file', () => {
    const crossGate = nonSpecFiles.filter((f) =>
      ts
        .createSourceFile(f, read(f), ts.ScriptTarget.Latest, true)
        .statements.some(
          (s) =>
            (ts.isImportDeclaration(s) || ts.isExportDeclaration(s)) &&
            s.moduleSpecifier !== undefined &&
            ts.isStringLiteral(s.moduleSpecifier) &&
            /^\.\/gate\d/.test(s.moduleSpecifier.text),
        ),
    );
    expect(crossGate).toEqual([]);
    // U7a (IR-U7A-2) and U8R (R8R-6): NO gate file imports `./effect-sets` any more. Row 7's C1 runs
    // `KIND_PERMITTED_EFFECTS` over every effect, and row 8-R's antecedent is the RECORD's stored duty
    // and the B-17 recompute — the effect-keyed antecedent was the defect the row names, so
    // `ACTUATING` had to leave both. The file is still read, from outside `gates/`
    // (`noun-resolution/noun-resolution.ts`), which is why it is not deleted here; R7-4 removes the
    // export when its last importer goes. What holds the rule this line used to state is `crossGate`
    // above: no gate file may import another gate's file, whatever a set is named.
    expect(files.filter((f) => /from '\.\/effect-sets'/.test(read(f)))).toEqual(
      [],
    );
  });
});

// ── D-10-PIPE ────────────────────────────────────────────────────────────────────────────────────
//
// CKPT-W1 review fix. Everything above is scoped to `__dirname`, i.e. to `src/widgets/gates/`. D-10's
// rule is not: it is "every refusal A GATE FILE writes is checked against §3.9's closed vocabulary",
// and a gate file is whatever a slot calls. U8a made `input-validation/input-validation.gate.ts` a
// BUILT gate that writes two real refusal codes, and `lowering/lowering.gate.ts` writes one; both sit
// in sibling directories, so neither was scanned. The header of `input-validation.gate.ts` says as
// much in its own words — "the `gates/` fence's rule, KEPT HERE BY HAND" — and a rule kept by hand is
// the thing this file exists to replace, because the only other protection is the compiler's
// `refuse(code: RefusalCode, …)` signature and a cast defeats exactly that.
//
// The set is derived from the pipeline rather than from a directory listing, the same way
// `gate-antecedents.inv30.spec.ts` derives its own: `pipelineSources().slotUnits` already follows
// each slot's imports and its DI members to the files that slot calls, so a gate that moves to a new
// directory tomorrow is scanned the same day and nobody has to remember to add it.
describe('D-10-PIPE — the refusal fence covers every file a SLOT calls, not only the gates directory', () => {
  const vocabulary = refusalVocabulary();
  const WIDGETS = path.resolve(GATES, '..');
  const slotFiles = (): readonly string[] =>
    [
      ...new Set(
        pipelineSources()
          .slotUnits.map((u) => u.file)
          .filter((f) => f.endsWith('.ts') && !f.includes('#')),
      ),
    ].sort();
  const readWidget = (f: string): string =>
    fs.readFileSync(path.join(WIDGETS, f), 'utf8');

  it('D-10-PIPE-a: the scan reaches the two seam gates outside `gates/`, and every other file a slot calls', () => {
    const scanned = slotFiles();
    expect(scanned).toEqual(
      expect.arrayContaining([
        'input-validation/input-validation.gate.ts',
        'lowering/lowering.gate.ts',
      ]),
    );
    // Not a tautology: the gates directory's own files must still be in the same set, so the scan
    // cannot shrink to the seams and call itself pipeline-wide.
    expect(
      scanned.filter((f) => f.startsWith('gates/')).length,
    ).toBeGreaterThan(4);
  });

  it('D-10-PIPE-b: no file a slot calls writes a refusal code the compiler was told not to check', () => {
    const violations = slotFiles().flatMap((f) =>
      refusalFenceViolations(f, readWidget(f), vocabulary, COMPILER_RULES_ONLY),
    );
    expect(violations).toEqual([]);
  });

  it('D-10-PIPE-c: the two seam gates write only codes the union lists, through the imported helper', () => {
    // Read from the files rather than pinned by hand, so this goes red if a code is renamed AND the
    // union is not, which is the drift the vocabulary read protects against.
    for (const f of [
      'input-validation/input-validation.gate.ts',
      'lowering/lowering.gate.ts',
    ]) {
      const written = [
        ...readWidget(f).matchAll(/\b(?:refuse|superseded)\(\s*'([a-z_]+)'/g),
      ].map((m) => m[1]);
      expect({ f, written: written.length > 0 }).toEqual({ f, written: true });
      for (const code of written)
        expect({ f, code, listed: vocabulary.has(code) }).toEqual({
          f,
          code,
          listed: true,
        });
    }
  });

  it.each([
    ['cast to RefusalCode', "refuse('invented' as RefusalCode, 'x');"],
    ['cast to any', "refuse('invented' as any, 'x');"],
    ['cast to the bottom type', `refuse('invented' as ${BOTTOM}, 'x');`],
    [
      'double cast through unknown',
      "refuse('invented' as unknown as RefusalCode, 'x');",
    ],
    [
      'compiler told to look away',
      "// @ts-expect-error\nrefuse('invented','x');",
    ],
    ['a code outside the vocabulary', "refuse('invented_code', 'x');"],
    [
      'a code that is not a literal',
      "refuse(String('x') as RefusalCode, 'y');",
    ],
  ])(
    'D-10-PIPE-d RED: a planted %s in EACH seam gate turns the fence red',
    (_name, planted) => {
      // The point of the RED arm: before this fix the same plant in the same two files was invisible,
      // because the scan never opened them. Each seam file is mutated on its own, so a fence that
      // stopped reading one of them cannot hide behind the other.
      for (const f of [
        'input-validation/input-validation.gate.ts',
        'lowering/lowering.gate.ts',
      ]) {
        const mutated = `${readWidget(f)}\nexport const planted = () => {\n  ${planted}\n};\n`;
        expect({
          f,
          red:
            refusalFenceViolations(f, mutated, vocabulary, COMPILER_RULES_ONLY)
              .length > 0,
        }).toEqual({ f, red: true });
      }
    },
  );
});
