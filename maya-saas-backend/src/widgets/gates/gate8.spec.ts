// Legacy Gate 8, as a function. Deleted with `gate8.ts`.

import { gate8 } from './gate8';
import {
  code,
  ctx,
  guardRegistries,
  rec,
} from './gate-fixtures.spec-helper.spec';

beforeAll(guardRegistries);

describe('Gate 8 — only values the server offered', () => {
  const withDomain = rec({ selectionDomain: 'opt-a,opt-b,opt-c' });

  it('POSITIVE: a value from the declared domain passes', () => {
    expect(
      gate8(
        ctx(withDomain, {
          submission: { intent_token: 't', inputs: { choice: 'opt-b' } },
        }),
      ).outcome,
    ).toBe('pass');
  });

  it('REFUSAL: a value the server never offered', () => {
    const v = gate8(
      ctx(withDomain, {
        submission: { intent_token: 't', inputs: { choice: 'opt-z' } },
      }),
    );
    expect(code(v)).toBe('selection_out_of_domain');
  });

  it('REFUSAL: an oversize submission', () => {
    const big = 'x'.repeat(20 * 1024);
    expect(
      code(
        gate8(
          ctx(withDomain, {
            submission: { intent_token: 't', inputs: { blob: big } },
          }),
        ),
      ),
    ).toBe('oversize_submission');
  });
});
