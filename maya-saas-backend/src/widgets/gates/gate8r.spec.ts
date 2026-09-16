// Gate 8-R, as a function.

import { gate8R } from './gate8r';
import {
  code,
  ctx,
  guardRegistries,
  rec,
} from './gate-fixtures.spec-helper.spec';

beforeAll(guardRegistries);

describe('Gate 8-R — a spoken actuation needs the server sentence affirmed', () => {
  const spoken = { carrier: 'realtime-voice' } as const;
  const r = rec({ effect: 'COMMIT' });

  it('POSITIVE: an affirmation naming the right body passes', () => {
    const v = gate8R(
      ctx(r, {
        ...spoken,
        submission: {
          intent_token: 't',
          readback_ack: {
            readback_ref: 'rb',
            body_hash: r.bodyHash,
            affirmation: 'да',
          },
        },
      }),
    );
    expect(v.outcome).toBe('pass');
  });

  it('REFUSAL: no readback at all', () => {
    expect(code(gate8R(ctx(r, spoken)))).toBe('readback_missing');
  });

  it('REFUSAL: an affirmation naming a DIFFERENT body', () => {
    const v = gate8R(
      ctx(r, {
        ...spoken,
        submission: {
          intent_token: 't',
          readback_ack: {
            readback_ref: 'rb',
            body_hash: 'd'.repeat(64),
            affirmation: 'да',
          },
        },
      }),
    );
    expect(code(v)).toBe('readback_mismatch');
  });

  it('a non-spoken carrier does not require one', () => {
    expect(gate8R(ctx(r)).outcome).toBe('pass');
  });
});
