// Two runtime bindings, each held to the one table it is derived from.
//
//   D-14  K4's CONTROL arm (`resolves()`, `census()`, `allRefs()`) reads F27's generated
//         `CONTROL_REGISTRY`; it is not a second, hand-written statement of the closed set.
//   F72   the keyed runtime allowlist carries `confirmation_kind`, copied from K7's row, with every
//         row value unchanged.

import fs from 'node:fs';
import path from 'node:path';

import { CONTROL_REGISTRY } from '../../widget-contract/tables';
import { AE_WIDGET_COMMIT_ALLOWLIST as K7_ROWS } from '../booking/booking-allowlist';
import { AE_WIDGET_COMMIT_ALLOWLIST } from './contract-bindings';
import { AE_WIDGET_COMMIT_ALLOWLIST as P23_RUNTIME } from './ae-commit-allowlist.runtime';
import { pairingForAe } from './propose-pairing';
import { CONTROL_KEYS, allRefs, census, resolves } from './registry-binding';

describe('D-14 — the CONTROL arm is F27’s table, read once', () => {
  it('the CONTROL space is exactly the keys of CONTROL_REGISTRY', () => {
    expect([...CONTROL_KEYS].sort()).toEqual(
      Object.keys(CONTROL_REGISTRY).sort(),
    );
    expect(census().CONTROL).toBe(Object.keys(CONTROL_REGISTRY).length);
    expect(
      allRefs()
        .filter((r) => r.space === 'CONTROL')
        .map((r) => r.key)
        .sort(),
    ).toEqual(Object.keys(CONTROL_REGISTRY).sort());
    for (const key of Object.keys(CONTROL_REGISTRY))
      expect(resolves({ space: 'CONTROL', key })).toBe(true);
    expect(resolves({ space: 'CONTROL', key: 'control.not.registered' })).toBe(
      false,
    );
  });

  it('registry-binding.ts derives the set from the table and spells no control key itself', () => {
    const src = fs.readFileSync(
      path.join(__dirname, 'registry-binding.ts'),
      'utf8',
    );
    expect(src).toMatch(
      /export const CONTROL_KEYS: ReadonlySet<string> = new Set\(\s*Object\.keys\(CONTROL_REGISTRY\),?\s*\);/,
    );
    expect(src).not.toMatch(/'control\.[a-z.]+'/);
  });
});

describe('the runtime allowlist binding carries confirmation_kind', () => {
  it('the three booking rows remain exactly K7 and every other row comes from P-23', () => {
    const bookingRows = Object.entries(AE_WIDGET_COMMIT_ALLOWLIST).filter(
      ([, row]) => row.family === 'booking',
    );
    expect(bookingRows.map(([ae]) => ae).sort()).toEqual(
      K7_ROWS.map((r) => r.ae).sort(),
    );
    for (const [ae, row] of bookingRows) {
      expect(row.confirmation_kind).toBe('BOOKING_CONFIRMATION');
      expect(row.propose.key).toBe(pairingForAe(ae)?.propose.key);
    }
    expect(Object.keys(AE_WIDGET_COMMIT_ALLOWLIST)).toHaveLength(10);
  });

  it('the other row values are unchanged', () => {
    for (const k7 of K7_ROWS) {
      const row = AE_WIDGET_COMMIT_ALLOWLIST[k7.ae];
      expect(row.family).toBe('booking');
      expect(row.min_verification).toBe('SESSION_VERIFIED');
      expect(row.propose).toEqual(pairingForAe(k7.ae)?.propose);
      expect(typeof row.requires_ae_approval).toBe('boolean');
      expect(Object.keys(row).sort()).toEqual([
        'confirmation_kind',
        'family',
        'min_verification',
        'propose',
        'requires_ae_approval',
      ]);
    }
  });

  it('re-exports the single P-23 runtime table rather than a booking-only shadow', () => {
    expect(AE_WIDGET_COMMIT_ALLOWLIST).toBe(P23_RUNTIME);
    expect(
      Object.values(AE_WIDGET_COMMIT_ALLOWLIST).filter(
        (row) => row.family === 'marketing_fanout',
      ),
    ).toHaveLength(1);
  });
});
