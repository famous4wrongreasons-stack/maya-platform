// J-1 — facts are write-once, produced only by their declared slot, and read only by their declared
// readers.
//
// Two halves, because a fact has two ends:
//   - PRODUCING is an event, so `mergeFacts` checks it at run time and throws (tested below, directly);
//   - READING is not an event, so T-ARCH-FACTS checks it at the source: every read of `facts.<name>`
//     in slot code must come from a slot in that fact's reader set, and code that runs as no slot
//     reads no fact at all. The rule is closed, not enumerated: a facts object may be used only by
//     reading or destructuring literal names, and any other use (a helper, a spread, `Object.*`, a
//     return, `in`) is red itself, because it hands the object to code where a read cannot be seen.
//     The producer side is also checked at the source, so a slot that would only throw at run time
//     is red before it runs.
// Both halves trust FACT_SLOTS, so FACT_SLOTS is pinned to the plan's §2.2 table, row for row.
// Which code is "slot N" is derived from the gateway's array (`gate-slots.spec-helper.spec.ts`), and
// so are the spellings that reach a facts object (`memberUses`, shared with D-9's role fence). Not
// seen: facts reached by a computed key on the context itself, or the whole context handed to a
// module outside the slot's units.
// Each source rule also runs over mutated sources, each asserted red for its own reason.
//
// Class BUILD / U: structure and a function-level regression aid. Not live proof.

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import type { AdmissionFacts } from '../gate.types';
import {
  memberUses,
  parseSource,
  patternMembers,
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

  it('D-2: the principal is not an admission fact, so no slot can produce it; it is the base member ctx.principal', () => {
    const principal = JSON.parse(
      '{"authority":{"kind":"USER","tenantId":"t1","userId":"u1","membershipId":"m1","clientId":null,"channelLinkId":null,"branchRefs":[],"staffRef":null,"proofHash":"a"}}',
    ) as Partial<Record<FactName, never>>;
    const order = pipelineSources().order;
    expect(order).toHaveLength(15);
    for (const slot of order)
      expect(() => mergeFacts(NO_FACTS, principal, slot)).toThrow(
        /produced authority, which is not an admission fact/,
      );
    expect(Object.keys(FACT_SLOTS)).not.toContain('authority');
    const sf = parseSource('gate.types.ts', typesSource);
    const context = sf.statements.find(
      (s): s is ts.InterfaceDeclaration =>
        ts.isInterfaceDeclaration(s) && s.name.text === 'GateContext',
    );
    const member = context?.members.find(
      (m): m is ts.PropertySignature =>
        ts.isPropertySignature(m) && m.name.getText(sf) === 'principal',
    );
    expect(member?.type?.getText(sf)).toBe('PrincipalView | null');
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

/**
 * Closed non-gate containers whose member is also named `facts` by its own certified contract.
 * They are presentation inputs, never AdmissionFacts. The exemption applies only while the file is
 * outside every gate slot; if a future gateway slot reaches one, the same source is scanned again.
 */
const OTHER_TYPED_FACT_CONTAINERS: Readonly<Record<string, string>> =
  Object.freeze({
    'composition/c9-compose.trigger.ts':
      'WidgetComposerInput facts copied from an authorized C9 run result',
    'composition/moment.trigger.ts':
      'WidgetComposerInput facts copied from the typed K13 composition input',
    'emission/booking-confirmation-minter.service.ts':
      'WidgetComposerInput fact copied from the canonical booking owner preview',
    'emission/envelope.factory.ts':
      'WidgetEnvelope facts and facts_origin written after projection',
  });

/** Every way `unit` reads or produces a fact its slot may not. */
const factViolations = (unit: SourceUnit): string[] => {
  if (unit.slot === null && unit.file in OTHER_TYPED_FACT_CONTAINERS) return [];
  const out: string[] = [];
  const sf = parseSource(unit.file, unit.source);
  const at = (n: ts.Node): string =>
    `${unit.file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
  const slotName = unit.slot === null ? 'no slot' : `slot ${unit.slot}`;

  const read = (name: string, n: ts.Node): void => {
    if (!isFactName(name)) out.push(`${at(n)}: reads ${name}, not a fact`);
    else if (
      unit.slot === null ||
      !FACT_SLOTS[name].readers.includes(unit.slot)
    )
      out.push(`${at(n)}: ${slotName} reads ${name}`);
  };

  // The runner's own two uses of a whole facts object: the presence test on a verdict, and the
  // arguments of the one merge. Only the gateway outside the array may make them.
  const runnerUse = (n: ts.Node): boolean => {
    if (!unit.file.endsWith('#outside-the-array')) return false;
    return (
      (ts.isIfStatement(n) && n.expression.getText(sf) === 'verdict.facts') ||
      (ts.isCallExpression(n) && n.expression.getText(sf) === 'mergeFacts')
    );
  };

  // READING. A facts object — `ctx.facts`, `ctx['facts']`, `{ facts }`, `{ facts: f }`, and any alias
  // of one — may be used in exactly two ways: a read of a literal name (`.x`, `['x']`), or a
  // destructure of literal names. Every other use hands the whole object to code that this rule
  // cannot see read it (a helper, a spread, `Object.*`, a return, `in`), so it is a violation itself.
  for (const use of memberUses(sf, 'facts')) {
    switch (use.kind) {
      case 'member':
        read(use.name, use.node);
        break;
      case 'computed':
        out.push(`${at(use.node)}: a fact read under a computed name`);
        break;
      case 'destructure':
        for (const el of patternMembers(use.pattern))
          if (el.rest)
            out.push(
              `${at(el.node)}: the facts object copied by a rest element`,
            );
          else if (el.name === null)
            out.push(
              `${at(el.node)}: a fact destructured under a computed name`,
            );
          else read(el.name, el.node);
        break;
      case 'escape':
        if (!runnerUse(use.node))
          out.push(
            `${at(use.node)}: ${slotName} uses the facts object other than by a named read (${use.how})`,
          );
        break;
    }
  }

  const visit = (n: ts.Node): void => {
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

  it('each exact non-gate typed-facts exception exists and remains outside every slot', () => {
    const slotFiles = new Set(pipeline.slotUnits.map((unit) => unit.file));
    for (const [file, why] of Object.entries(OTHER_TYPED_FACT_CONTAINERS)) {
      expect(fs.existsSync(path.join(__dirname, '..', file))).toBe(true);
      expect(slotFiles.has(file)).toBe(false);
      expect(fs.readFileSync(path.join(__dirname, '..', file), 'utf8')).toMatch(
        /\bfacts\b/,
      );
      expect(why.length).toBeGreaterThan(40);
    }
  });

  it('the map is §2.2, row for row', () => {
    // The integration plan's §2.2 table, copied here on purpose. `mergeFacts`' producer check and
    // T-ARCH-FACTS below both read FACT_SLOTS, so a drift in it (a class-C fact given a reader
    // reachable by Gate 13, a producer moved) would pass both. Changing a row needs a plan amendment,
    // and this literal changes in the same commit. The principal has no row: it is not a fact
    // (GATES-PLAN-V11 D-2).
    expect(FACT_SLOTS).toEqual({
      validatedInputs: { producer: '8', readers: ['12', '13'] },
      selectedLabels: { producer: '8', readers: ['9'] },
      loweringSource: { producer: '8', readers: ['9'] },
      lowering: { producer: '9', readers: ['10'] },
      loweredTurn: { producer: '9', readers: ['13'] },
      resolvedNouns: { producer: '11', readers: ['12', '13'] },
    });
    expect(Object.isFrozen(FACT_SLOTS)).toBe(true);
    for (const row of Object.values(FACT_SLOTS)) {
      expect(Object.isFrozen(row)).toBe(true);
      expect(Object.isFrozen(row.readers)).toBe(true);
    }
  });

  it('every producer precedes each of its readers in §3.9 order', () => {
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

  describe('the fence goes red on each way around it that it names (mutations)', () => {
    const unit = (slot: string | null, body: string): SourceUnit => ({
      slot,
      file: `mutant-${slot ?? 'none'}.ts`,
      source: `declare const ctx: any;\nexport const g = () => {\n${body}\n};\n`,
    });

    it('CONTROL: a declared reader, by every spelling, and a declared producer are clean', () => {
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
            '13',
            "const { facts: f } = ctx; const t = f.loweredTurn; const v = ctx['facts'].validatedInputs; const { validatedInputs: w } = ctx.facts as any; const u = (ctx.facts as any)!.loweredTurn; return [t, v, w, u];",
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

    it("CONTROL: the runner's presence test and merge are clean in the runner, and only there", () => {
      const runner =
        'declare let ctx: any; declare const verdict: any; declare const gate: any;\n' +
        'if (verdict.facts) ctx = { ...ctx, facts: mergeFacts(ctx.facts, verdict.facts, gate.n) };\n';
      expect(
        factViolations({
          slot: null,
          file: 'intent-gateway.service.ts#outside-the-array',
          source: runner,
        }),
      ).toEqual([]);
      expect(
        factViolations({ slot: '13', file: 'gates/gate13.ts', source: runner })
          .length,
      ).toBeGreaterThan(0);
    });

    // [name, mutant, the violation it must be red for]
    const mutants: ReadonlyArray<readonly [string, SourceUnit, RegExp]> = [
      [
        'X-M1: slot 5 produces selectedLabels',
        unit('5', "return { outcome: 'pass', facts: { selectedLabels: [] } };"),
        /slot 5 produces selectedLabels/,
      ],
      [
        'X-M1: slot 8 produces lowering',
        unit(
          '8',
          "return { outcome: 'pass', facts: { lowering: { renderedUtterance: 'x' } } };",
        ),
        /slot 8 produces lowering/,
      ],
      [
        'X-M2: slot 13 reads facts.lowering',
        unit('13', 'return ctx.facts.lowering;'),
        /slot 13 reads lowering/,
      ],
      [
        'slot 13 reads facts["lowering"]',
        unit('13', "return ctx.facts['lowering'];"),
        /slot 13 reads lowering/,
      ],
      [
        'slot 13 destructures lowering from facts',
        unit('13', 'const { lowering } = ctx.facts; return lowering;'),
        /slot 13 reads lowering/,
      ],
      [
        'slot 13 destructures facts: { lowering } from the context',
        unit('13', 'const { facts: { lowering } } = ctx; return lowering;'),
        /slot 13 reads lowering/,
      ],
      [
        'slot 13 reads lowering through an alias',
        unit('13', 'const f = ctx.facts; return f.lowering;'),
        /slot 13 reads lowering/,
      ],
      [
        'R7: slot 13 reads lowering through a renamed destructure { facts: f }',
        unit('13', 'const { facts: f } = ctx; return f.lowering;'),
        /slot 13 reads lowering/,
      ],
      [
        "R8: slot 13 reads ctx['facts'].lowering",
        unit('13', "return ctx['facts'].lowering;"),
        /slot 13 reads lowering/,
      ],
      [
        'slot 13 reads lowering through a cast',
        unit('13', 'return (ctx.facts as any)!.lowering;'),
        /slot 13 reads lowering/,
      ],
      [
        'slot 13 reads lowering through an alias of an alias',
        unit('13', 'const f = ctx.facts; const g = f; return g.lowering;'),
        /slot 13 reads lowering/,
      ],
      [
        'slot 13 reads lowering through a parameter bound { facts: f }',
        unit(
          '13',
          'const h = ({ facts: f }: any) => f.lowering; return h(ctx);',
        ),
        /slot 13 reads lowering/,
      ],
      [
        'slot 9 reads selectedLabels … and resolvedNouns, produced after it',
        unit(
          '9',
          'return [ctx.facts.selectedLabels, ctx.facts.resolvedNouns];',
        ),
        /slot 9 reads resolvedNouns/,
      ],
      [
        'code of no slot reads a fact',
        unit(null, 'return ctx.facts.validatedInputs;'),
        /no slot reads validatedInputs/,
      ],
      [
        'a fact read under a computed name',
        unit('13', "const k = 'lowering'; return ctx.facts[k];"),
        /a fact read under a computed name/,
      ],
      [
        'the facts object handed to a helper that reads lowering',
        unit('13', 'const h = (x: any) => x.lowering; return h(ctx.facts);'),
        /slot 13 uses the facts object other than by a named read \(CallExpression\)/,
      ],
      [
        'the facts object spread into a local',
        unit('13', 'const all = { ...ctx.facts }; return all.lowering;'),
        /uses the facts object other than by a named read \(SpreadAssignment\)/,
      ],
      [
        'Object.entries over the facts object',
        unit('13', 'return Object.entries(ctx.facts);'),
        /uses the facts object other than by a named read \(CallExpression\)/,
      ],
      [
        'the facts object returned whole',
        unit('13', 'return ctx.facts;'),
        /uses the facts object other than by a named read \(ReturnStatement\)/,
      ],
      [
        "a fact's presence tested with `in`",
        unit('13', "return 'lowering' in ctx.facts;"),
        /uses the facts object other than by a named read \(BinaryExpression\)/,
      ],
      [
        'the facts object assigned to a variable declared earlier',
        unit('13', 'let f: any; f = ctx.facts; return f;'),
        /uses the facts object other than by a named read \(BinaryExpression\)/,
      ],
      [
        'the facts object bound by a destructuring assignment of the context',
        unit('13', 'let f: any; ({ facts: f } = ctx); return f.lowering;'),
        /slot 13 uses the facts object other than by a named read \(destructuring assignment\)/,
      ],
      [
        'the facts object copied by a rest element',
        unit(
          '13',
          'const { loweredTurn, ...rest } = ctx.facts; return [loweredTurn, rest];',
        ),
        /the facts object copied by a rest element/,
      ],
      [
        "the runner's presence test written in a slot",
        unit('13', 'if (ctx.facts) return 1; return 0;'),
        /slot 13 uses the facts object other than by a named read \(IfStatement\)/,
      ],
      [
        'code of no slot hands the facts object on',
        unit(null, 'return JSON.stringify(ctx.facts);'),
        /no slot uses the facts object other than by a named read/,
      ],
      [
        'facts produced from a variable',
        unit('8', "const f = {}; return { outcome: 'pass', facts: f };"),
        /slot 8 produces facts that are not a literal/,
      ],
      [
        'facts produced by shorthand',
        unit('8', "const facts = {}; return { outcome: 'pass', facts };"),
        /slot 8 produces facts that are not a literal/,
      ],
      [
        'a fact produced through a spread',
        unit(
          '8',
          "const x = { lowering: 1 }; return { outcome: 'pass', facts: { ...x } };",
        ),
        /a fact produced under a spread or method/,
      ],
      [
        'the runner merge written outside the runner',
        unit('10', 'return { facts: mergeFacts({}, {}, "10") };'),
        /slot 10 produces facts that are not a literal/,
      ],
    ];

    it.each(mutants)('RED: %s', (_name, mutant, reason) => {
      const violations = factViolations(mutant);
      expect({
        violations,
        red: violations.some((v) => reason.test(v)),
      }).toEqual({ violations, red: true });
    });
  });
});
