// Gate 8-R, as a function (G8R §4.5; GATES-PLAN-V11 U8R).
//
// Function-level. It is NEVER proof that the gate runs on the live path — GATE MODULE EXISTS ≠ GATE
// ENFORCED — and nothing here may flip a clause (§0.5: a unit test is not live proof). What it is
// for: every branch of row 8-R exercised on a live-SHAPED record, including the branches the live
// path cannot reach this cycle because no conformant minter produces a SPOKEN COMMIT (PKT:471).
//
// The stub owner below is a TEST DOUBLE, not a vocabulary. A test that uses it proves the gate's
// comparisons, its hand-off and its pass branch. It never proves membership, and the production
// binding it stands in for is `null` (`gate-8r.owners.ts`).

import type { ChannelId } from '../../widget-contract/lifecycle';
import { CHANNEL_TIER } from '../../widget-contract/tables';
import type { GateContext, GateVerdict, IntentRecordRow } from '../gate.types';
import { GATE_8R_OWNERS_UNRULED, type Gate8ROwners } from './gate-8r.owners';
import { gate8R, recomputeRequiresReadback } from './gate8r';
import {
  code,
  ctx,
  guardRegistries,
  rec,
} from './gate-fixtures.spec-helper.spec';

beforeAll(guardRegistries);

const REF = 'R-8r-1';
const OTHER_REF = 'R-8r-2';

/** A record that requires a readback and is CONSISTENT under B-17's recompute: COMMIT on SPOKEN. */
const required = (over: Partial<IntentRecordRow> = {}): IntentRecordRow =>
  rec({
    effect: 'COMMIT',
    widgetKind: 'BOOKING_CONFIRMATION',
    deliveryChannel: 'realtime-voice',
    confirmation: { requires_readback: true, readback_ref: REF },
    ...over,
  });

/** A record that requires none and is consistent: a REFINE with no confirmation at all. */
const unrequired = (over: Partial<IntentRecordRow> = {}): IntentRecordRow =>
  rec({ confirmation: null, ...over });

const submit = (
  r: IntentRecordRow,
  submission: Record<string, unknown>,
  over: Partial<GateContext> = {},
): GateContext =>
  ctx(r, { submission: { intent_token: 'tok', ...submission }, ...over });

const ack = (over: Record<string, unknown> = {}) => ({
  readback_ref: REF,
  body_hash: rec().bodyHash,
  affirmation: 'да',
  ...over,
});

/** The double. It records what it was handed, byte for byte, and admits exactly one string. */
const stubOwners = (): Gate8ROwners & {
  calls: { affirmation: string; intentTokenHash: string }[];
} => {
  const calls: { affirmation: string; intentTokenHash: string }[] = [];
  return {
    calls,
    isReadbackAffirmation: (input) => {
      calls.push({
        affirmation: input.affirmation,
        intentTokenHash: input.record.intentTokenHash,
      });
      return input.affirmation === 'stub-affirm';
    },
  };
};

const detail = (v: GateVerdict): string =>
  'detail' in v && typeof v.detail === 'string' ? v.detail : '';

describe('Gate 8-R — the duty is the record’s, and the record’s alone (C11:4728)', () => {
  describe('R-1 / R-1a — the antecedent', () => {
    it('T3: a REFINE whose confirmation is null, with no ack, passes', () => {
      expect(gate8R(submit(unrequired(), {})).outcome).toBe('pass');
    });

    it('T3d: `requires_readback` must be the boolean true — a stored "true", a 1 and an absent member are all "not required"', () => {
      for (const value of ['true', 1, 'TRUE', {}, [], null, undefined])
        expect(
          gate8R(
            submit(
              rec({
                confirmation: { requires_readback: value, readback_ref: REF },
              }),
              {},
            ),
          ).outcome,
        ).toBe('pass');
    });

    it('T-DIV-1: a REFINE carrying a stored duty diverges from the recompute and refuses `readback_mismatch` — a duty is not honoured just because a row claims it', () => {
      const v = gate8R(
        submit(
          rec({ confirmation: { requires_readback: true, readback_ref: REF } }),
          {},
        ),
      );
      expect([v.outcome, code(v)]).toEqual(['refuse', 'readback_mismatch']);
    });

    it('T-DIV-2: a COMMIT fitted for a SPOKEN tier with the duty ERASED from the row also refuses — divergence is symmetric', () => {
      const v = gate8R(
        submit(
          rec({
            effect: 'COMMIT',
            deliveryChannel: 'realtime-voice',
            confirmation: { requires_readback: false, readback_ref: null },
          }),
          {},
        ),
      );
      expect([v.outcome, code(v)]).toEqual(['refuse', 'readback_mismatch']);
    });

    it('a COMMIT on a non-SPOKEN tier with no duty stored is consistent and passes (F-PWA-COMMIT)', () => {
      expect(
        gate8R(
          submit(
            rec({
              effect: 'COMMIT',
              confirmation: { requires_readback: false, readback_ref: null },
            }),
            {},
          ),
        ).outcome,
      ).toBe('pass');
    });

    it('B-17: the recompute is true exactly for a COMMIT on a SPOKEN tier, over every declared channel and every effect class', () => {
      const channels = Object.keys(CHANNEL_TIER) as ChannelId[];
      const effects = [
        'NONE',
        'NAVIGATE',
        'REFINE',
        'CONTROL',
        'DRAFT',
        'REQUEST_APPROVAL',
        'COMMIT',
        'HANDOFF',
      ];
      const trueFor: string[] = [];
      for (const deliveryChannel of channels)
        for (const effect of effects)
          if (recomputeRequiresReadback(rec({ effect, deliveryChannel })))
            trueFor.push(`${effect}@${deliveryChannel}`);
      expect(trueFor).toEqual(['COMMIT@realtime-voice']);
    });

    it('a delivery channel outside the eleven is not a SPOKEN tier, so it cannot manufacture a duty, and a duty stored on such a row diverges', () => {
      const undeclared = 'shouted-across-the-room' as ChannelId;
      expect(
        recomputeRequiresReadback(
          rec({ effect: 'COMMIT', deliveryChannel: undeclared }),
        ),
      ).toBe(false);
      expect(
        code(
          gate8R(
            submit(
              rec({
                effect: 'COMMIT',
                deliveryChannel: undeclared,
                confirmation: { requires_readback: true, readback_ref: REF },
              }),
              {},
            ),
          ),
        ),
      ).toBe('readback_mismatch');
    });
  });

  describe('R-6 — an ack on a record that requires none', () => {
    it('T10: an ack on a REFINE whose confirmation is null is refused', () => {
      expect(code(gate8R(submit(unrequired(), { readback_ack: ack() })))).toBe(
        'readback_mismatch',
      );
    });

    it('T11-today: an ack on a confirmation whose `requires_readback` is false is refused', () => {
      expect(
        code(
          gate8R(
            submit(
              rec({
                confirmation: { requires_readback: false, readback_ref: null },
              }),
              { readback_ack: ack() },
            ),
          ),
        ),
      ).toBe('readback_mismatch');
    });

    it('T12: a NULL ack on an unrequired record is refused, not ignored (AMB-02c; at HTTP P-F88 answers it 400 at the shape stage, so this branch is reachable only below the route)', () => {
      expect(code(gate8R(submit(unrequired(), { readback_ack: null })))).toBe(
        'readback_mismatch',
      );
    });

    it('the owner is never asked on the unrequired branch — membership is not a question about a record that read nothing out', () => {
      const owners = stubOwners();
      gate8R(submit(unrequired(), { readback_ack: ack() }), owners);
      gate8R(submit(unrequired(), {}), owners);
      expect(owners.calls).toEqual([]);
    });
  });

  describe('the required branch — production binding (the vocabulary is unruled)', () => {
    it('T5: required and absent refuses `readback_missing`', () => {
      expect(code(gate8R(submit(required(), {})))).toBe('readback_missing');
    });

    it('T-DEF3: a correct ref and a correct body hash still refuse while the vocabulary owner is null — an unruled vocabulary admits nothing (fail closed)', () => {
      const v = gate8R(submit(required(), { readback_ack: ack() }));
      expect([v.outcome, code(v)]).toEqual(['refuse', 'readback_mismatch']);
    });

    it('the default owner set IS the production value, and it is frozen', () => {
      expect(GATE_8R_OWNERS_UNRULED.isReadbackAffirmation).toBeNull();
      expect(Object.isFrozen(GATE_8R_OWNERS_UNRULED)).toBe(true);
      // The default parameter and the value R8R-1 binds are the same object, so wiring the port
      // changes no behaviour — only where the value comes from.
      expect(
        gate8R(
          submit(required(), { readback_ack: ack() }),
          GATE_8R_OWNERS_UNRULED,
        ),
      ).toEqual(gate8R(submit(required(), { readback_ack: ack() })));
    });
  });

  describe('the required branch — stub owner (comparisons, hand-off, pass)', () => {
    it('T1-stub: a correct ref, a correct body hash and an owner-accepted affirmation pass, and the owner is asked exactly once, about this record', () => {
      const owners = stubOwners();
      const r = required();
      const v = gate8R(
        submit(r, { readback_ack: ack({ affirmation: 'stub-affirm' }) }),
        owners,
      );
      expect(v.outcome).toBe('pass');
      expect(owners.calls).toEqual([
        { affirmation: 'stub-affirm', intentTokenHash: r.intentTokenHash },
      ]);
    });

    it('T6-stub: a foreign `readback_ref` refuses', () => {
      const owners = stubOwners();
      expect(
        code(
          gate8R(
            submit(required(), {
              readback_ack: ack({
                readback_ref: OTHER_REF,
                affirmation: 'stub-affirm',
              }),
            }),
            owners,
          ),
        ),
      ).toBe('readback_mismatch');
    });

    it('T7-stub: a `body_hash` from another emission refuses — affirming a body other than the one read out does not pass', () => {
      const owners = stubOwners();
      expect(
        code(
          gate8R(
            submit(required(), {
              readback_ack: ack({
                body_hash: 'd'.repeat(64),
                affirmation: 'stub-affirm',
              }),
            }),
            owners,
          ),
        ),
      ).toBe('readback_mismatch');
    });

    it('T9-stub: the affirmation reaches the owner VERBATIM — no trim, no case fold, no normalisation', () => {
      const owners = stubOwners();
      const raw = ' Stub-Affirm.';
      expect(
        code(
          gate8R(
            submit(required(), { readback_ack: ack({ affirmation: raw }) }),
            owners,
          ),
        ),
      ).toBe('readback_mismatch');
      expect(owners.calls.map((c) => c.affirmation)).toEqual([raw]);
    });

    it('T13c-stub: a null `readback_ref` on BOTH sides is not a match — two absences are not an echo', () => {
      const owners = stubOwners();
      expect(
        code(
          gate8R(
            submit(
              required({
                confirmation: { requires_readback: true, readback_ref: null },
              }),
              {
                readback_ack: ack({
                  readback_ref: null,
                  affirmation: 'stub-affirm',
                }),
              },
            ),
            owners,
          ),
        ),
      ).toBe('readback_mismatch');
      expect(owners.calls).toEqual([]);
    });
  });

  describe('R-7 — refuses, never repairs, and never throws', () => {
    it.each([
      ['a null ack (T13d)', null],
      ['a string ack (T13b-direct)', 'да'],
      ['an array ack', ['да']],
      ['a number ack', 7],
      [
        'wrongly typed members (T13a)',
        { readback_ref: 1, body_hash: [], affirmation: {} },
      ],
      ['an empty object', {}],
    ] as ReadonlyArray<readonly [string, unknown]>)(
      'a required record with %s refuses `readback_mismatch` rather than throwing',
      (_name, value) => {
        const run = () =>
          gate8R(submit(required(), { readback_ack: value }), stubOwners());
        expect(run).not.toThrow();
        expect(code(run())).toBe('readback_mismatch');
      },
    );

    it('no record at all refuses `readback_missing`', () => {
      expect(code(gate8R(ctx(rec(), { record: null })))).toBe(
        'readback_missing',
      );
    });

    it('T15 (unit half): no refusal detail carries the affirmation, the ref or the body hash', () => {
      const marker = 'MARKER-7f3a-affirmation';
      const verdicts = [
        gate8R(
          submit(required(), { readback_ack: ack({ affirmation: marker }) }),
        ),
        gate8R(
          submit(unrequired(), { readback_ack: ack({ affirmation: marker }) }),
        ),
        gate8R(submit(required(), {})),
      ];
      for (const v of verdicts) {
        expect(detail(v)).not.toContain(marker);
        expect(detail(v)).not.toContain(REF);
        expect(detail(v)).not.toContain(rec().bodyHash);
      }
    });
  });

  describe('E15 / INV-30 — nothing about the SUBMISSION’s carrier changes the answer', () => {
    it('the verdict is the same over all eleven carriers, for a required record and for an unrequired one', () => {
      const channels = Object.keys(CHANNEL_TIER) as ChannelId[];
      for (const [label, r, body] of [
        ['required, no ack', required(), {}],
        ['required, ack', required(), { readback_ack: ack() }],
        ['unrequired, ack', unrequired(), { readback_ack: ack() }],
        ['unrequired, no ack', unrequired(), {}],
      ] as ReadonlyArray<
        readonly [string, IntentRecordRow, Record<string, unknown>]
      >) {
        const answers = new Set(
          channels.map((carrier) =>
            JSON.stringify(gate8R(submit(r, body, { carrier }))),
          ),
        );
        expect({ label, distinct: answers.size }).toEqual({
          label,
          distinct: 1,
        });
      }
    });
  });
});
