// U8b-c — `inputsByteLength` (AMB-19). Class [U] (§0.5).

import { inputsByteLength } from './inputs-bytes';

describe('U8b-c — inputsByteLength', () => {
  it('IB-1 [U] measures the UTF-8 bytes of the canonical serialisation, not its characters', () => {
    // `{"note":"да"}` is 13 characters and 15 bytes: each Cyrillic letter is two bytes in UTF-8. A cap
    // measured in `String.length` would be a different cap for a Russian tenant than for an English one.
    expect(inputsByteLength({ note: 'да' })).toBe(15);
    expect(inputsByteLength({ note: 'da' })).toBe(13);
  });

  it('IB-2 [U] is stable under key order, because the canonicaliser sorts (H6)', () => {
    expect(inputsByteLength({ b: 1, a: 2 })).toBe(
      inputsByteLength({ a: 2, b: 1 }),
    );
  });

  it('IB-3 [U] counts every value shape §3.8 admits', () => {
    expect(inputsByteLength({})).toBe(2);
    expect(inputsByteLength(null)).toBe(4);
    expect(inputsByteLength({ ok: true })).toBe(11);
    expect(inputsByteLength({ n: 10 })).toBe(8);
    expect(inputsByteLength({ slot: ['b1', 'b2'] })).toBe(20);
  });

  it('IB-4 [U] grows with the payload, which is what makes the cap a cap (C11:4423)', () => {
    const small = inputsByteLength({ note: 'x' });
    const large = inputsByteLength({ note: 'x'.repeat(1000) });
    expect(large - small).toBe(999);
  });

  it('IB-5 [U] raises on a value the one canonicaliser cannot canonicalise', () => {
    // P-F88’s §3.8 DTO refuses these at the shape stage (400), so reaching Gate 8 with one is a
    // pipeline construction defect (D-11) — the one case that may throw.
    expect(() => inputsByteLength(undefined)).toThrow();
    expect(() => inputsByteLength({ n: Number.NaN })).toThrow();
    expect(() => inputsByteLength({ n: BigInt(1) })).toThrow();
  });
});
