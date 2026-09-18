// U8a — the labels Gate 9 may interpolate: the null half of R3.9.2 (C11:4889-4895).
//
// The second half of this file is a SOURCE test, and it is the load-bearing one: R3.9.2's mechanism is
// stated as a signature ("the lowering function's signature accepts `selected_labels: string[]` and has
// no parameter of the submission's `inputs` type"). The same reasoning governs where those labels are
// produced — a mapper that could see the client's bytes could interpolate them.

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import {
  LabelMappingNotBuilt,
  NO_SELECTION,
  selectedLabelsFor,
  type ValidatedInputs,
} from './label-mapping';

const SOURCE = path.join(__dirname, 'label-mapping.ts');

describe('U8a — selected labels [U]', () => {
  it('G8a-L1: a null schema selected nothing, so the labels are `[]` — not `null`', () => {
    expect(selectedLabelsFor(null)).toEqual([]);
    // `null` is reserved: "a validated member's label is unresolvable" (gate.types.ts), which Gate 9
    // answers with `superseded/handle_stale` (DS-03 A). Collapsing the two would make an empty
    // selection look like a render impossibility, and a render impossibility look like an empty one.
    expect(selectedLabelsFor(null)).not.toBeNull();
  });

  it('G8a-L2: the empty selection is frozen, so a later slot cannot grow it', () => {
    expect(Object.isFrozen(NO_SELECTION)).toBe(true);
    expect(() => (NO_SELECTION as string[]).push('injected')).toThrow(
      TypeError,
    );
    expect(selectedLabelsFor(null)).toHaveLength(0);
  });

  it('G8a-L3: the schema lane raises rather than answering `[]` — an empty list is a value Gate 9 would interpolate', () => {
    const validated: ValidatedInputs = {
      closed: new Map([['slot', ['opt-1']]]),
    };
    expect(() => selectedLabelsFor(validated)).toThrow(LabelMappingNotBuilt);
    expect(() => selectedLabelsFor(validated)).toThrow(/U8b/);
    expect(() => selectedLabelsFor(validated)).toThrow(/slot/);
  });

  it('G8a-L4 [BUILD]: no parameter of this file names the submission or its `inputs` (R3.9.2)', () => {
    const source = fs.readFileSync(SOURCE, 'utf8');
    const sf = ts.createSourceFile(
      'label-mapping.ts',
      source,
      ts.ScriptTarget.Latest,
      true,
    );
    const parameters: { name: string; type: string }[] = [];
    const visit = (n: ts.Node): void => {
      if (ts.isParameter(n))
        parameters.push({
          name: n.name.getText(sf),
          type: n.type ? n.type.getText(sf) : '(inferred)',
        });
      ts.forEachChild(n, visit);
    };
    visit(sf);
    expect(parameters.length).toBeGreaterThan(0);
    // No parameter is OF the submission's shape, and none is named for it. `validatedInputs` is Gate 8's
    // own product and is exactly what R3.9.2 says a label is mapped from.
    expect(
      parameters.filter(
        (p) => /submission/i.test(p.type) || /^submission/i.test(p.name),
      ),
    ).toEqual([]);
    // And the file imports no submission type at all, so no parameter could acquire one.
    expect(source).not.toMatch(/SubmissionShape/);
  });
});
