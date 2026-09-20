// Gate 13, as a function.

import { gate13 } from './gate13';
import { ctx, guardRegistries, rec } from './gate-fixtures.spec-helper.spec';

beforeAll(guardRegistries);

describe('Gate 13 — no default admission', () => {
  it('delegates exactly once to the closed effect router', async () => {
    const input = ctx(rec());
    const route = jest
      .fn()
      .mockResolvedValue({ outcome: 'refuse', code: 'effect_not_admissible' });
    await expect(gate13(input, { route })).resolves.toEqual({
      outcome: 'refuse',
      code: 'effect_not_admissible',
    });
    expect(route).toHaveBeenCalledTimes(1);
    expect(route).toHaveBeenCalledWith(input);
  });
});
