// J-1 — facts are write-once, produced only by their declared slot, and read only by their declared
// readers.
//
// Two halves, because a fact has two ends:
//   - PRODUCING is an event, so `mergeFacts` checks it at run time and throws (tested below, directly);
//   - READING is not an event, so T-ARCH-FACTS checks it at the source: every read of `facts.<name>`
//     in slot code must come from a slot in that fact's reader set, and code that runs as no slot
//     reads no fact at all. The producer side is also checked at the source, so a slot that would
//     only throw at run time is red before it runs.
// Which code is "slot N" is derived from the gateway's array (`gate-slots.spec-helper.spec.ts`).
// Each source rule also runs over mutated sources, so a fence that stopped seeing goes red.
//
// Class BUILD / U: structure and a function-level regression aid. Not live proof.

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import type { AdmissionFacts } from '../gate.types';
import {
  parseSource,
  pipelineSources,
  type SourceUnit,
} from '../gate-slots.spec-helper.spec';
import { FACT_SLOTS, mergeFacts, NO_FACTS, type FactName } from './facts';

const LABELS: Partial<AdmissionFacts> = { selectedLabels: ['Стрижка'] };

describe('J-1 mergeFacts — write-once, producer-checked', () => {
  it('merges a fact from its producer into a NEW frozen set, leaving the old one untouched', () => {
    const before = NO_FACTS;
    const after = mergeFacts(before, LABELS, '8');
    expect(after).toEqual({ selectedLabels: ['Стрижка'] });
    expect(after).not.toBe(before);
    expect(before).toEqual({});
    expect(Object.isFrozen(after)).toBe(true);
    expect(Object.isFrozen(NO_FACTS)).toBe(true);
  });

  it('null is a value: a label the codec cannot resolve is carried as null', () => {
    expect(mergeFacts(NO_FACTS, { selectedLabels: null }, '8')).toEqual({
      selectedLabels: null,
    });
  });

  it('merges several facts of one producer at once', () => {
    const facts = mergeFacts(
      NO_FACTS,
      {
        selectedLabels: [],
        loweringSource: {
          utteranceTemplate: null,
          erasedAt: null,
          conversationId: 'c1',
        },
      },
      '8',
    );
    expect(Object.keys(facts).sort()).toEqual([
      'loweringSource',
      'selectedLabels',
    ]);
  });

  it('X-M1: a fact from any slot but its producer throws', () => {
    expect(() => mergeFacts(NO_FACTS, LABELS, '5')).toThrow(
      /slot 5 produced selectedLabels, whose producer is slot 8/,
    );
    expect(() =>
      mergeFacts(
        NO_FACTS,
        { loweredTurn: { turnId: 't', conversationId: 'c' } },
        '10',
      ),
    ).toThrow(/whose producer is slot 9/);
  });

  it('M34: a fact already set cannot be written again, not even by its producer', () => {
    const once = mergeFacts(NO_FACTS, LABELS, '8');
    expect(() => mergeFacts(once, { selectedLabels: ['Борода'] }, '8')).toThrow(
      /already set; a fact is written once/,
    );
    expect(once).toEqual({ selectedLabels: ['Стрижка'] });
  });

  it('the principal has no producer until P-PRINCIPAL fixes its slot, so every slot is refused', () => {
    const principal = {
      kind: 'USER',
      tenantId: 't1',
      userId: 'u1',
      membershipId: 'm1',
      clientId: null,
      channelLinkId: null,
      branchRefs: [],
      staffRef: null,
      proofHash: 'a'.repeat(64),
    } as const;
    for (const slot of ['1', '2', '3', '4', '5', '6'])
      expect(() =>
        mergeFacts(
          NO_FACTS,
          { authority: { ...principal, branchRefs: [] } },
          slot,
        ),
      ).toThrow(/authority, whose producer is not yet fixed/);
  });

  it('a name AdmissionFacts does not declare, or a fact without a value, throws', () => {
    const undeclared = JSON.parse('{"renderedUtterance":"x"}') as Partial<
      Record<FactName, never>
    >;
    expect(() => mergeFacts(NO_FACTS, undeclared, '9')).toThrow(
      /renderedUtterance, which is not an admission fact/,
    );
    expect(() =>
      mergeFacts(NO_FACTS, { selectedLabels: undefined }, '8'),
    ).toThrow(/without a value/);
  });
});

// ── T-ARCH-FACTS ─────────────────────────────────────────────────────────────────────────────────

const typesSource = fs.readFileSync(
  path.join(__dirname, '..', 'gate.types.ts'),
  'utf8',
);

/** The members `interface AdmissionFacts` declares, read from its syntax tree. */
const declaredFacts = (): string[] => {
  const sf = parseSource('gate.types.ts', typesSource);
  const decl = sf.statements.find(
    (s): s is ts.InterfaceDeclaration =>
      ts.isInterfaceDeclaration(s) && s.name.text === 'AdmissionFacts',
  );
  if (!decl) throw new Error('no AdmissionFacts interface');
  return decl.members.map((m) => (m.name ? m.name.getText(sf) : '?')).sort();
};

const isFactName = (k: string): k is FactName =>
  Object.prototype.hasOwnProperty.call(FACT_SLOTS, k);

/** Every way `unit` reads or produces a fact its slot may not. */
const factViolations = (unit: SourceUnit): string[] => {
  const out: string[] = [];
  const sf = parseSource(unit.file, unit.source);
  const at = (n: ts.Node): string =>
    `${unit.file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
  const slotName = unit.slot === null ? 'no slot' : `slot ${unit.slot}`;

  // Names bound to a facts object: `facts` itself, and aliases such as `const f = ctx.facts`.
  const factsAliases = new Set<string>(['facts']);
  const isFactsExpression = (e: ts.Expression): boolean => {
    let x: ts.Expression = e;
    while (ts.isParenthesizedExpression(x) || ts.isNonNullExpression(x))
      x = x.expression;
    return (
      (ts.isPropertyAccessExpression(x) && x.name.text === 'facts') ||
      (ts.isIdentifier(x) && factsAliases.has(x.text))
    );
  };
  const collectAliases = (n: ts.Node): void => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer !== undefined &&
      isFactsExpression(n.initializer)
    )
      factsAliases.add(n.name.text);
    ts.forEachChild(n, collectAliases);
  };
  collectAliases(sf);

  const read = (name: string, n: ts.Node): void => {
    if (!isFactName(name)) out.push(`${at(n)}: reads ${name}, not a fact`);
    else if (
      unit.slot === null ||
      !FACT_SLOTS[name].readers.includes(unit.slot)
    )
      out.push(`${at(n)}: ${slotName} reads ${name}`);
  };
  const readPattern = (p: ts.ObjectBindingPattern): void => {
    for (const el of p.elements) {
      const key = el.propertyName ?? el.name;
      if (ts.isIdentifier(key) || ts.isStringLiteral(key)) read(key.text, el);
      else out.push(`${at(el)}: a fact destructured under a computed name`);
    }
  };

  const visit = (n: ts.Node): void => {
    if (ts.isPropertyAccessExpression(n) && isFactsExpression(n.expression))
      read(n.name.text, n);
    if (ts.isElementAccessExpression(n) && isFactsExpression(n.expression)) {
      if (ts.isStringLiteral(n.argumentExpression))
        read(n.argumentExpression.text, n);
      else out.push(`${at(n)}: a fact read under a computed name`);
    }
    if (ts.isVariableDeclaration(n) && n.initializer !== undefined) {
      // `const { lowering } = ctx.facts`
      if (ts.isObjectBindingPattern(n.name) && isFactsExpression(n.initializer))
        readPattern(n.name);
    }
    // `const { facts: { lowering } } = ctx`, and the same in a parameter
    if (
      ts.isBindingElement(n) &&
      ts.isObjectBindingPattern(n.name) &&
      (n.propertyName ?? null) !== null &&
      (n.propertyName as ts.PropertyName).getText(sf) === 'facts'
    )
      readPattern(n.name);

    // Producing: an object literal member `facts: { … }`.
    if (
      ts.isPropertyAssignment(n) &&
      n.name.getText(sf) === 'facts' &&
      ts.isObjectLiteralExpression(n.parent)
    ) {
      const init = n.initializer;
      const runnerMerge =
        unit.file.endsWith('#outside-the-array') &&
        ts.isCallExpression(init) &&
        init.expression.getText(sf) === 'mergeFacts';
      const baseContext =
        unit.file.endsWith('#outside-the-array') &&
        ts.isIdentifier(init) &&
        init.text === 'NO_FACTS';
      if (runnerMerge || baseContext) {
        // the runner's own two writes: the empty base, and the merge
      } else if (!ts.isObjectLiteralExpression(init))
        out.push(`${at(n)}: ${slotName} produces facts that are not a literal`);
      else
        for (const m of init.properties) {
          if (
            !ts.isPropertyAssignment(m) &&
            !ts.isShorthandPropertyAssignment(m)
          ) {
            out.push(`${at(m)}: a fact produced under a spread or method`);
            continue;
          }
          const name = m.name.getText(sf);
          if (!isFactName(name))
            out.push(`${at(m)}: produces ${name}, not a fact`);
          else if (FACT_SLOTS[name].producer !== unit.slot)
            out.push(`${at(m)}: ${slotName} produces ${name}`);
        }
    }
    if (
      ts.isShorthandPropertyAssignment(n) &&
      n.name.text === 'facts' &&
      ts.isObjectLiteralExpression(n.parent)
    )
      out.push(`${at(n)}: ${slotName} produces facts that are not a literal`);

    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
};

describe('T-ARCH-FACTS — who may produce and who may read each fact', () => {
  const pipeline = pipelineSources();

  it('FACT_SLOTS has exactly one row per member of AdmissionFacts', () => {
    expect(Object.keys(FACT_SLOTS).sort()).toEqual(declaredFacts());
  });

  it('the map is §2.2: every producer precedes each of its readers in §3.9 order', () => {
    const at = (n: string) => pipeline.order.indexOf(n);
    for (const [name, { producer, readers }] of Object.entries(FACT_SLOTS)) {
      expect({ name, readers: readers.every((r) => at(r) >= 0) }).toEqual({
        name,
        readers: true,
      });
      if (producer === null) continue;
      expect({ name, producer: at(producer) >= 0 }).toEqual({
        name,
        producer: true,
      });
      expect({
        name,
        laterReaders: readers.every((r) => at(r) > at(producer)),
      }).toEqual({ name, laterReaders: true });
    }
    // Stated, so that fixing the principal slot is a visible change to this test.
    expect(FACT_SLOTS.authority.producer).toBeNull();
    expect(FACT_SLOTS.lowering).toEqual({ producer: '9', readers: ['10'] });
    expect(FACT_SLOTS.selectedLabels.producer).toBe('8');
  });

  it('no slot reads a fact outside its reader set, and no slot produces a fact it does not own', () => {
    const units = [
      ...pipeline.slotUnits,
      pipeline.gatewayRest,
      ...pipeline.otherUnits,
    ];
    // Not vacuous: fifteen slot elements, the gate files they call, and the rest of the widget layer.
    expect(pipeline.slotUnits.length).toBeGreaterThan(15);
    expect(pipeline.otherUnits.length).toBeGreaterThan(20);
    expect(units.flatMap(factViolations)).toEqual([]);
  });

  describe('the fence goes red on each way around it (mutations)', () => {
    const unit = (slot: string | null, body: string): SourceUnit => ({
      slot,
      file: `mutant-${slot ?? 'none'}.ts`,
      source: `declare const ctx: any;\nexport const g = () => {\n${body}\n};\n`,
    });

    it('CONTROL: a declared reader and a declared producer are clean', () => {
      expect(
        factViolations(
          unit(
            '13',
            'const t = ctx.facts.loweredTurn; const v = ctx.facts.validatedInputs; return [t, v];',
          ),
        ),
      ).toEqual([]);
      expect(
        factViolations(
          unit(
            '8',
            "return { outcome: 'pass', facts: { selectedLabels: null, loweringSource: { utteranceTemplate: null, erasedAt: null, conversationId: 'c' } } };",
          ),
        ),
      ).toEqual([]);
    });

    const mutants: ReadonlyArray<readonly [string, SourceUnit]> = [
      [
        'X-M1: slot 5 produces selectedLabels',
        unit('5', "return { outcome: 'pass', facts: { selectedLabels: [] } };"),
      ],
      [
        'X-M1: slot 8 produces lowering',
        unit(
          '8',
          "return { outcome: 'pass', facts: { lowering: { renderedUtterance: 'x' } } };",
        ),
      ],
      [
        'X-M2: slot 13 reads facts.lowering',
        unit('13', 'return ctx.facts.lowering;'),
      ],
      [
        'slot 13 reads facts["lowering"]',
        unit('13', "return ctx.facts['lowering'];"),
      ],
      [
        'slot 13 destructures lowering from facts',
        unit('13', 'const { lowering } = ctx.facts; return lowering;'),
      ],
      [
        'slot 13 destructures facts: { lowering } from the context',
        unit('13', 'const { facts: { lowering } } = ctx; return lowering;'),
      ],
      [
        'slot 13 reads lowering through an alias',
        unit('13', 'const f = ctx.facts; return f.lowering;'),
      ],
      [
        'slot 9 reads selectedLabels … and resolvedNouns, produced after it',
        unit(
          '9',
          'return [ctx.facts.selectedLabels, ctx.facts.resolvedNouns];',
        ),
      ],
      [
        'code of no slot reads a fact',
        unit(null, 'return ctx.facts.validatedInputs;'),
      ],
      [
        'a fact read under a computed name',
        unit('13', "const k = 'lowering'; return ctx.facts[k];"),
      ],
      [
        'facts produced from a variable',
        unit('8', "const f = {}; return { outcome: 'pass', facts: f };"),
      ],
      [
        'facts produced by shorthand',
        unit('8', "const facts = {}; return { outcome: 'pass', facts };"),
      ],
      [
        'a fact produced through a spread',
        unit(
          '8',
          "const x = { lowering: 1 }; return { outcome: 'pass', facts: { ...x } };",
        ),
      ],
      [
        'the runner merge written outside the runner',
        unit('10', 'return { facts: mergeFacts({}, {}, "10") };'),
      ],
    ];

    it.each(mutants)('RED: %s', (_name, mutant) => {
      expect(factViolations(mutant).length).toBeGreaterThan(0);
    });
  });
});
