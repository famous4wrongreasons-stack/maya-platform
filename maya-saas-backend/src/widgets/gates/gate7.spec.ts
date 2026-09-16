// Gate 7, as a function.

import type { IntentRecordRow } from '../gate.types';
import { gate7 } from './gate7';
import {
  code,
  ctx,
  guardRegistries,
  rec,
} from './gate-fixtures.spec-helper.spec';

beforeAll(guardRegistries);

describe('Gate 7 — effect admissibility', () => {
  const commit = (over: Partial<IntentRecordRow> = {}) =>
    rec({
      effect: 'COMMIT',
      capabilitySpace: 'AE',
      capabilityKey: 'crm.appointment.create.v1',
      confirmationOfKind: 'draft',
      confirmationOfRef: 'draft-1',
      ...over,
    });

  it('POSITIVE: an allowlisted COMMIT behind its confirmation passes', () => {
    expect(gate7(ctx(commit())).outcome).toBe('pass');
  });

  it('REFUSAL: a COMMIT naming a capability that is not allowlisted', () => {
    const v = gate7(ctx(commit({ capabilityKey: 'crm.visit.payment.v1' })));
    expect('detail' in v && v.detail).toBe('capability_not_allowlisted');
  });

  it('REFUSAL: a COMMIT with no confirmation — the thing booking exists to prevent', () => {
    expect(code(gate7(ctx(commit({ confirmationOfRef: null }))))).toBe(
      'booking_confirmation_required',
    );
  });

  it('REFUSAL: a COMMIT whose confirmation is of the wrong kind', () => {
    // F74: `create` pairs with a draft; reschedule and cancel name an existing record.
    expect(code(gate7(ctx(commit({ confirmationOfKind: 'record' }))))).toBe(
      'booking_confirmation_required',
    );
  });

  it('REFUSAL: an actuating effect with no subject capability at all', () => {
    expect(
      code(
        gate7(
          ctx(
            rec({
              effect: 'COMMIT',
              capabilitySpace: null,
              capabilityKey: null,
            }),
          ),
        ),
      ),
    ).toBe('effect_not_admissible');
  });

  it('a NONE effect is not actuating and passes', () => {
    expect(gate7(ctx(rec({ effect: 'NONE' }))).outcome).toBe('pass');
  });
});
