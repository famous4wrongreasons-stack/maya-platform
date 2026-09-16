// Gate 13, as a function.

import { gate13 } from './gate13';
import { ctx, guardRegistries, rec } from './gate-fixtures.spec-helper.spec';

beforeAll(guardRegistries);

describe('Gate 13 — no default admission', () => {
  it('NONE has no route by design', () => {
    expect(gate13(ctx(rec({ effect: 'NONE' }))).outcome).toBe('terminate');
  });

  it('each space routes to its own destination', () => {
    expect(gate13(ctx(rec())).outcome).toBe('terminate');
    expect(
      gate13(
        ctx(
          rec({
            capabilitySpace: 'AE',
            capabilityKey: 'crm.appointment.create.v1',
          }),
        ),
      ).outcome,
    ).toBe('terminate');
    expect(
      gate13(
        ctx(
          rec({
            capabilitySpace: 'CONTROL',
            capabilityKey: 'control.widget.dismiss',
          }),
        ),
      ).outcome,
    ).toBe('terminate');
  });

  it('REFUSAL: a space the router does not know is refused, not passed', () => {
    const v = gate13(ctx(rec({ capabilitySpace: 'INVENTED' })));
    expect(v.outcome).toBe('refuse');
  });
});
