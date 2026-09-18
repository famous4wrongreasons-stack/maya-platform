// U8a — the null-schema lane's decision, at function level.
//
// [U] never counts as evidence (§0.5). What it holds is the decision table itself: which lane a record
// puts a submission in, and what that lane answers. The live half is `test/widgets-live/gate8-input.
// live-spec.ts`.

import { rec } from '../gates/gate-fixtures.spec-helper.spec';
import type { SubmissionShape } from '../gate.types';
import {
  decideInputValidation,
  INPUT_VALIDATION_HELD_ON,
  inputsPresence,
} from './input-validation';

const sub = (over: Partial<SubmissionShape> = {}): SubmissionShape => ({
  intent_token: 'tok',
  ...over,
});

describe('U8a — Gate 8, the null-schema lane [U]', () => {
  describe('G8a-U1 — `inputs` has three cases, not two', () => {
    it('G8a-U1a: an absent member is `absent`, and a null one is `null`', () => {
      expect(inputsPresence(sub())).toBe('absent');
      expect(inputsPresence(sub({ inputs: null }))).toBe('null');
    });

    it('G8a-U1b: every other value is `values` — `{}` included, and a non-object too', () => {
      expect(inputsPresence(sub({ inputs: {} }))).toBe('values');
      expect(inputsPresence(sub({ inputs: { a: 1 } }))).toBe('values');
      expect(
        inputsPresence({
          intent_token: 'tok',
          inputs: 'a string' as unknown as Record<string, unknown>,
        }),
      ).toBe('values');
      expect(
        inputsPresence({
          intent_token: 'tok',
          inputs: [] as unknown as Record<string, unknown>,
        }),
      ).toBe('values');
    });
  });

  describe('G8a-U2 — a null schema with nothing submitted passes', () => {
    it.each([
      ['absent', sub()],
      ['null', sub({ inputs: null })],
    ])('G8a-U2 (%s): passes, and says which case it was', (presence, s) => {
      expect(decideInputValidation(rec({ inputSchemaHash: null }), s)).toEqual({
        lane: 'null-schema',
        verdict: 'pass',
        presence,
      });
    });
  });

  describe('G8a-U3 — a null schema carrying `inputs` is refused (K12, C11:2902)', () => {
    it.each([
      ['{a:1}', { a: 1 }],
      ['{}', {}],
      ['a nested object', { a: { b: 1 } }],
    ])(
      'G8a-U3 (%s): selection_out_of_domain, never a repair',
      (_label, inputs) => {
        const decision = decideInputValidation(
          rec({ inputSchemaHash: null }),
          sub({ inputs }),
        );
        expect(decision).toEqual({
          lane: 'null-schema',
          verdict: 'refuse',
          code: 'selection_out_of_domain',
          detail: expect.stringContaining('K12') as unknown,
          presence: 'values',
        });
      },
    );

    it('G8a-U3-EMPTY: `{}` is refused for the same reason `{a:1}` is — the member was carried', () => {
      const empty = decideInputValidation(
        rec({ inputSchemaHash: null }),
        sub({ inputs: {} }),
      );
      const valued = decideInputValidation(
        rec({ inputSchemaHash: null }),
        sub({ inputs: { a: 1 } }),
      );
      expect(empty).toEqual(valued);
    });
  });

  describe('G8a-U4 — the schema lane is held, fail closed (B-01, C11:7188)', () => {
    it('G8a-U4a: a record with an `inputSchemaHash` refuses `mechanism_absent`, whatever it carries', () => {
      for (const s of [sub(), sub({ inputs: null }), sub({ inputs: { a: 1 } })])
        expect(
          decideInputValidation(rec({ inputSchemaHash: 'f'.repeat(64) }), s),
        ).toMatchObject({
          lane: 'schema',
          verdict: 'refuse',
          code: 'mechanism_absent',
          detail: `gate 8 (Input validation) is NORMATIVE-PENDING on ${INPUT_VALIDATION_HELD_ON}`,
        });
    });

    it('G8a-U4b: the held lane names the mechanism it waits on, not a ruling', () => {
      expect(INPUT_VALIDATION_HELD_ON).toContain('codec');
      expect(INPUT_VALIDATION_HELD_ON).toContain('bounds');
      expect(INPUT_VALIDATION_HELD_ON).toContain('normalizer');
      expect(INPUT_VALIDATION_HELD_ON).toContain('U8b');
    });
  });

  it('G8a-U5: no record — the lane cannot be determined, so the gate fails closed on the held lane', () => {
    expect(
      decideInputValidation(null, sub({ inputs: { a: 1 } })),
    ).toMatchObject({
      lane: 'schema',
      verdict: 'refuse',
      code: 'mechanism_absent',
      detail: expect.stringContaining('no record') as unknown,
    });
  });

  it('G8a-U6: the decision reads the record and the submission, and nothing else', () => {
    // A record that differs only in the columns other gates read decides identically: slot 8 has no
    // opinion about the effect, the kind, the floor, the channel or the clock.
    const base = rec({ inputSchemaHash: null });
    const other = rec({
      inputSchemaHash: null,
      effect: 'COMMIT',
      widgetKind: 'BOOKING_CONFIRMATION',
      verificationFloor: 'ANONYMOUS',
      deliveryChannel: 'sms',
      expiresAt: new Date('2000-01-01T00:00:00.000Z'),
    });
    for (const s of [sub(), sub({ inputs: {} })])
      expect(decideInputValidation(base, s)).toEqual(
        decideInputValidation(other, s),
      );
  });
});
