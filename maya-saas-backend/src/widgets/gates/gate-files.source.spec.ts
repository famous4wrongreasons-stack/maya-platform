// D-10, held at the source: every refusal a gate file writes is checked against §3.9's closed
// vocabulary by the compiler, and nothing in a gate file switches that check off.
//
// `refuse(code: RefusalCode, detail: string): GateVerdict` makes an invented code a compile error
// (`tsc -p tsconfig.build.json` compiles every non-spec file here). A cast to the bottom type would
// make it compile again, so the cast is forbidden in every file of this directory, specs included,
// and the helper is declared exactly once so a local re-declaration cannot reintroduce the old
// conditional parameter type.

import fs from 'node:fs';
import path from 'node:path';

const GATES = __dirname;
const read = (f: string): string =>
  fs.readFileSync(path.join(GATES, f), 'utf8');
const files = fs
  .readdirSync(GATES)
  .filter((f) => f.endsWith('.ts'))
  .sort();

// Built from parts so this file does not match its own pattern.
const CAST_TO_BOTTOM = new RegExp('\\bas\\s+' + 'never\\b');

describe('D-10 — gate files refuse through the typed helper, with no cast', () => {
  it('reads the gate files it guards', () => {
    expect(files).toEqual(
      expect.arrayContaining([
        'verdict.ts',
        'subject.ts',
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

  it('refuse takes a RefusalCode and a detail, and is declared once, in verdict.ts', () => {
    expect(read('verdict.ts')).toMatch(
      /export const refuse = \(code: RefusalCode, detail: string\): GateVerdict =>/,
    );
    // This file is left out of the scan: its own assertion above spells the declaration it checks.
    const self = path.basename(__filename);
    const declarers = files
      .filter((f) => f !== self)
      .filter((f) =>
        /\b(?:const|let|var|function)\s+(?:refuse|pass)\b/.test(read(f)),
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
});
