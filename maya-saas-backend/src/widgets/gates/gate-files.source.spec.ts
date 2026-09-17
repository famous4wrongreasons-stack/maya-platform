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

/** Every way `source` (a non-spec gate file named `file`) could write a code the vocabulary lacks. */
const refusalFenceViolations = (
  file: string,
  source: string,
  vocabulary: ReadonlySet<string>,
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
  const isVerdictFile = file === 'verdict.ts';
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
        p.parent.parent.parent.moduleSpecifier.text === './verdict';
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
    expect(read('gate7.ts')).toMatch(/from '\.\/effect-sets'/);
    expect(read('gate8r.ts')).toMatch(/from '\.\/effect-sets'/);
  });
});
