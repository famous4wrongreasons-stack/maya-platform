// Gate 11, as a function.

import { gate11 } from './gate11';
import {
  code,
  ctx,
  guardRegistries,
  rec,
} from './gate-fixtures.spec-helper.spec';

beforeAll(guardRegistries);

describe('Gate 11 — the only anti-drift fence between mint and execution', () => {
  it('POSITIVE: an unchanged record passes', async () => {
    const r = rec();
    const v = await gate11(ctx(r), () =>
      Promise.resolve({ bodyHash: r.bodyHash }),
    );
    expect(v.outcome).toBe('pass');
  });

  it('REFUSAL: the record changed after the widget was shown', async () => {
    const v = await gate11(ctx(rec()), () =>
      Promise.resolve({ bodyHash: 'e'.repeat(64) }),
    );
    expect(code(v)).toBe('handle_stale');
  });

  it('REFUSAL: the referenced record no longer resolves', async () => {
    expect(code(await gate11(ctx(rec()), () => Promise.resolve(null)))).toBe(
      'handle_stale',
    );
  });
});
