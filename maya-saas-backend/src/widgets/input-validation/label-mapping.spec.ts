import fs from 'node:fs';
import path from 'node:path';

import {
  NO_SELECTION,
  selectedLabelsFor,
  type ValidatedInputs,
} from './label-mapping';

const SOURCE = path.join(__dirname, 'label-mapping.ts');
const validated = (
  entries: readonly (readonly [string, readonly string[]])[],
): ValidatedInputs => ({ closed: new Map(entries) });

describe('U8b — selected labels', () => {
  it('null schema selects nothing and returns the frozen empty selection', () => {
    expect(selectedLabelsFor(null)).toBe(NO_SELECTION);
    expect(Object.isFrozen(NO_SELECTION)).toBe(true);
  });

  it('maps validated ids through their field-keyed server labels in field/value order', () => {
    expect(
      selectedLabelsFor(
        validated([
          ['slot', ['b', 'a']],
          ['staff', ['s1']],
        ]),
        {
          slot: { a: '10:00', b: '10:30' },
          staff: { s1: 'Илья' },
        },
      ),
    ).toEqual(['10:30', '10:00', 'Илья']);
  });

  it.each([
    ['absent labels', undefined],
    ['flat labels', { a: '10:00' }],
    ['missing field', { staff: { a: '10:00' } }],
    ['missing id', { slot: { b: '10:30' } }],
  ])('unresolvable %s returns null, never client bytes', (_name, labels) => {
    expect(selectedLabelsFor(validated([['slot', ['a']]]), labels)).toBeNull();
  });

  it('BUILD imports no SubmissionShape and accepts no submission parameter', () => {
    const source = fs.readFileSync(SOURCE, 'utf8');
    expect(source).not.toMatch(/SubmissionShape|submission/);
    expect(source).toMatch(/validatedInputs/);
  });
});
