// K10 and K11 exits.

import fs from 'node:fs';
import path from 'node:path';

import { C9_CAPABILITIES } from '../../orchestration/c9.registry';
import {
  ProjectionRefusal,
  assertFetchable,
  chart,
  measure,
  rowsDigest,
  seriesDigest,
  type Measure,
} from './projection';
import {
  NO_ACTION_KEY,
  THE_THREE_WIDGETS,
  approval,
  progress,
  strategyOptions,
  type C9StrategyOption,
} from '../orchestration/c9-widgets';

const m = (over: Partial<Measure> = {}): Measure =>
  measure({
    value: 42,
    unit: 'RUB',
    factRef: 'fact:revenue:2026-09',
    facade: 'c7.measurement.read',
    asOf: '2026-09-16T00:00:00.000Z',
    ...over,
  });

const opt = (
  ref: string,
  over: Partial<C9StrategyOption> = {},
): C9StrategyOption => ({
  optionRef: ref,
  label: ref,
  risk_tier: 'medium',
  reversible: true,
  audience_size: 120,
  ...over,
});

describe('K10 — every number traces to a fact', () => {
  it('constructs a Measure only with a FactUsed', () => {
    expect(() => m()).not.toThrow();
    expect(() => m({ factRef: '' })).toThrow(ProjectionRefusal);
    expect(() => m({ factRef: '   ' })).toThrow(/no FactUsed/);
  });

  it('cells that are not C7/C8 projections = 0', () => {
    expect(() => m({ facade: 'llm.guess' as never })).toThrow(
      /not a C7\/C8 read facade/,
    );
    expect(() => m({ facade: 'c8.result.read' })).not.toThrow();
  });

  it('numerals originating from an LLM = 0, by construction', () => {
    // There is no member on a Measure that holds a bare number without a factRef and a facade, so
    // a model cannot contribute one. The check is over the TYPE, not over a sanitiser.
    expect(() => m({ value: Number.NaN })).toThrow(/not finite/);
    expect(() => m({ value: Number.POSITIVE_INFINITY })).toThrow(/not finite/);
  });

  it('refuses a chart point that traces to nothing', () => {
    const rows = [m()];
    const bad = {
      value: 1,
      unit: 'RUB',
      factRef: '',
      facade: 'c7.measurement.read',
      asOf: 'x',
    } as Measure;
    expect(() => chart(rows, [{ label: 's', points: [bad] }])).toThrow(
      /trace to no fact/,
    );
  });
});

describe('K10 — the digests are computed on the read path', () => {
  it('rows_digest and series_digest are different questions, so different answers', () => {
    const rows = [m({ value: 1 }), m({ value: 2 })];
    const series = [{ label: 'revenue', points: rows }];
    const c = chart(rows, series);
    expect(c.rows_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(c.series_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(c.rows_digest).not.toBe(c.series_digest);
  });

  it('recomputing on the read path matches the emitted digest, for every fixture', () => {
    // The exit's own wording. A digest the projector computed over its own output would certify
    // itself; recomputed here, over the rows as read, it is something a third party can recheck.
    for (const n of [1, 2, 5, 20]) {
      const rows = Array.from({ length: n }, (_, i) => m({ value: i }));
      const series = [{ label: 's', points: rows }];
      const c = chart(rows, series);
      expect(rowsDigest(rows)).toBe(c.rows_digest);
      expect(seriesDigest(series)).toBe(c.series_digest);
    }
  });

  it('a changed row changes the digest', () => {
    const a = chart(
      [m({ value: 1 })],
      [{ label: 's', points: [m({ value: 1 })] }],
    );
    const b = chart(
      [m({ value: 2 })],
      [{ label: 's', points: [m({ value: 2 })] }],
    );
    expect(a.rows_digest).not.toBe(b.rows_digest);
  });

  it('a series is a SEQUENCE: reordering points changes the digest', () => {
    const p1 = m({ value: 1 });
    const p2 = m({ value: 2 });
    expect(seriesDigest([{ label: 's', points: [p1, p2] }])).not.toBe(
      seriesDigest([{ label: 's', points: [p2, p1] }]),
    );
  });
});

describe('K10 — an ARTIFACT is minted for one principal', () => {
  const art = {
    artifactRef: 'a1',
    boundPrincipalProofHash: 'p'.repeat(64),
    contains_pii: true,
  };

  it('fetches for the principal it was minted for', () => {
    expect(() => assertFetchable(art, 'p'.repeat(64))).not.toThrow();
  });

  it('refuses the same artefact for anyone else', () => {
    // An owner report is the most concentrated personal data this product makes; a link that works
    // for whoever holds it is how that data leaves.
    expect(() => assertFetchable(art, 'q'.repeat(64))).toThrow(
      /different principal/,
    );
  });

  it('refuses when contains_pii is undeclared', () => {
    expect(() =>
      assertFetchable(
        { ...art, contains_pii: undefined as never },
        'p'.repeat(64),
      ),
    ).toThrow(/undeclared/);
  });
});

describe('K11 — 3/3 widgets, and risk is copied not recomputed', () => {
  it('all three C9 widgets exist', () => {
    expect(THE_THREE_WIDGETS).toEqual([
      'STRATEGY_OPTIONS',
      'APPROVAL',
      'PROGRESS',
    ]);
  });

  it('recomputed risk_tier / reversible / audience_size = 0', () => {
    // Read the source: no arithmetic, comparison or reassignment touches the three carried fields.
    // "A widget that recomputes a risk tier is a widget that can lower one."
    const src = fs.readFileSync(
      path.join(__dirname, '../orchestration/c9-widgets.ts'),
      'utf8',
    );
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
    for (const field of ['risk_tier', 'reversible', 'audience_size']) {
      // The field may be DECLARED and COPIED, never assigned from an expression.
      const assignments = [
        ...code.matchAll(new RegExp(`${field}\\s*[:=]\\s*([^,;\\n]+)`, 'g')),
      ].map((x) => x[1].trim());
      for (const rhs of assignments) {
        // Permitted: a type annotation, or `from.field` style carry-through. Refused: any operator.
        expect(rhs).not.toMatch(/[+\-*/><?]|Math\.|\bif\b/);
      }
    }
  });

  it('carries C9 values through unchanged', () => {
    const given = [
      opt(NO_ACTION_KEY),
      opt('a', {
        risk_tier: 'critical',
        reversible: false,
        audience_size: 9000,
      }),
    ];
    const body = strategyOptions(given);
    const carried = body.options.find((o) => o.optionRef === 'a')!;
    expect(carried.risk_tier).toBe('critical');
    expect(carried.reversible).toBe(false);
    expect(carried.audience_size).toBe(9000);
  });

  it('STRATEGY_OPTIONS bodies without a selectable NO_ACTION = 0', () => {
    expect(() => strategyOptions([opt('a'), opt('b')])).toThrow(
      /without a selectable NO_ACTION/,
    );
    expect(() => strategyOptions([opt(NO_ACTION_KEY), opt('a')])).not.toThrow();
  });

  it('NO_ACTION is EQUALLY selectable, not merely present', () => {
    // A chooser where doing nothing is harder to pick than doing something manufactures consent.
    const body = strategyOptions([opt(NO_ACTION_KEY), opt('a')]);
    const shapes = body.options.map((o) => Object.keys(o).sort().join(','));
    expect(new Set(shapes).size).toBe(1);
    expect(body.noActionRef).toBe(NO_ACTION_KEY);
  });

  it('NO_ACTION is the unique LOCAL row, verified by enumeration', () => {
    const local = C9_CAPABILITIES.filter((c) => c.resourceClass === 'LOCAL');
    expect(local).toHaveLength(1);
    expect(local[0].capabilityKey).toBe(NO_ACTION_KEY);
  });

  it('a PROGRESS widget always carries the run-cancel control', () => {
    // A person watching something run must be able to stop it, in every state.
    for (const s of ['queued', 'running', 'done', 'cancelled'] as const)
      expect(progress('r1', s).cancelControl).toBe('control.run.cancel');
  });

  it('envelopes that initiate a strategy = 0', () => {
    // A widget PRESENTS; it does not start. There is no function here that begins a run, and no
    // orchestrator is imported — selecting an option mints a typed intent C9 adjudicates.
    const src = fs.readFileSync(
      path.join(__dirname, '../orchestration/c9-widgets.ts'),
      'utf8',
    );
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
    for (const forbidden of [
      'import ',
      'execute',
      'initiate',
      'startRun',
      'dispatch',
    ])
      expect(code).not.toContain(forbidden);
    expect(
      approval({
        approvalRef: 'x',
        summary: 's',
        risk_tier: 'low',
        reversible: true,
        expiresAt: 'z',
      }).kind,
    ).toBe('APPROVAL');
  });
});
