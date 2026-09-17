// P-RENDER exit test REN-2 (GATES-PLAN-V11, Wave 1). Class BUILD: §1.6.7 P10's ratchet.
//
// P10(a) states the mechanism in so many words: "an `EP-BUILD` ratchet that enumerates the
// `c9Deny('…')` literals under `maya-saas-backend/src/orchestration/` — **118 distinct codes**,
// verified — and fails the build if any code has no row" (C11:2509). This file is that ratchet.
//
// Three things make it a ratchet rather than a count:
//   - it enumerates the literals from the source, so a NEW code added upstream fails here rather
//     than degrading silently at runtime;
//   - it refuses a row for a code that no longer exists, so the map cannot rot in the other
//     direction either;
//   - it asserts that every `c9Deny` call site in the enumerated tree passes a LITERAL. A call with
//     a variable would be a code the enumeration cannot see, which would make the 118 a number
//     about the regex rather than about the code space.
//
// Not live proof: nothing is submitted and no gate runs.

import fs from 'node:fs';
import path from 'node:path';

import type { CellState } from '../../widget-contract/envelope';
import {
  C9_DENIAL_FAMILIES,
  C9_DENIAL_PROJECTION,
  LIMITATION_REASON_TABLE,
  UNMAPPED_DENIAL_PROJECTION,
} from '../../widget-contract/reason-table';
import { hasDenialProjection, projectC9Denial } from './denial-projection';

describe('P-RENDER — P10: every canonical denial code has a rendering, and none is an error', () => {
  const ORCHESTRATION = path.resolve(__dirname, '..', '..', 'orchestration');

  const sources = (): { file: string; text: string }[] => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? walk(p) : [p];
      });
    return walk(ORCHESTRATION)
      .filter((f) => f.endsWith('.ts'))
      .map((file) => ({ file, text: fs.readFileSync(file, 'utf8') }));
  };

  /** Every `c9Deny('…')` literal under `src/orchestration/`, distinct, in sorted order. */
  const denyLiterals = (): string[] => {
    const codes = new Set<string>();
    for (const { text } of sources())
      for (const m of text.matchAll(/c9Deny\('([^']*)'/g)) codes.add(m[1]);
    return [...codes].sort();
  };

  it('REN-2 the enumeration sees every c9Deny call site: no call passes a non-literal', () => {
    const opaque: string[] = [];
    for (const { file, text } of sources()) {
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        for (const m of line.matchAll(/c9Deny\(/g)) {
          const after = line.slice(m.index + 'c9Deny('.length);
          // The declaration itself is `export function c9Deny(code: string)`.
          if (/^code:\s*string\)/.test(after)) continue;
          if (!after.startsWith("'"))
            opaque.push(
              `${path.basename(file)}:${i + 1}: ${line.trim().slice(0, 100)}`,
            );
        }
      });
    }
    expect(opaque).toEqual([]);
  });

  it('REN-2 the contract counts 118 distinct codes, and the source still has exactly those', () => {
    // C11:2509 pins the number. A change in either direction is a contract event, not a merge.
    expect(denyLiterals()).toHaveLength(118);
  });

  it('REN-2 C9_DENIAL_PROJECTION has a row for every code, and no row for a code that is gone', () => {
    const codes = denyLiterals();
    const mapped = Object.keys(C9_DENIAL_PROJECTION).sort();
    expect(codes.filter((c) => !hasDenialProjection(c))).toEqual([]);
    expect(mapped.filter((c) => !codes.includes(c))).toEqual([]);
    expect(mapped).toEqual(codes);
  });

  it('REN-2 the families partition the code space: every code is claimed exactly once', () => {
    const claimed = C9_DENIAL_FAMILIES.flatMap((f) => f.codes);
    expect(claimed).toHaveLength(new Set(claimed).size);
    expect([...claimed].sort()).toEqual(denyLiterals());
    for (const family of C9_DENIAL_FAMILIES)
      expect(family.why.length).toBeGreaterThan(20);
  });

  it('REN-2 no projection is a failure state, and no severity is error', () => {
    const states: CellState[] = [
      'KNOWN',
      'PARTIAL',
      'NOT_MEASURED',
      'UNAVAILABLE',
      'PENDING',
    ];
    for (const [code, projection] of Object.entries(C9_DENIAL_PROJECTION)) {
      expect(states).toContain(projection.cell_state);
      // A denial is not a measured answer, so it can never project to KNOWN.
      expect(projection.cell_state).not.toBe('KNOWN');
      expect(['limitation', 'caveat']).toContain(
        projection.limitation_severity,
      );
      // P10: `reason_code` is "a LIMITATION_REASON_TABLE key".
      expect(
        Object.prototype.hasOwnProperty.call(
          LIMITATION_REASON_TABLE,
          projection.reason_code,
        ),
      ).toBe(true);
      expect(code.length).toBeGreaterThan(0);
    }
  });

  it('REN-2 P10(b): an unmapped code degrades to an honest unknown, and never throws', () => {
    expect(hasDenialProjection('a_code_no_owner_has_invented_yet')).toBe(false);
    expect(projectC9Denial('a_code_no_owner_has_invented_yet')).toEqual({
      cell_state: 'UNAVAILABLE',
      reason_code: 'PROVIDER_SILENT',
      limitation_severity: 'limitation',
    });
    expect(UNMAPPED_DENIAL_PROJECTION.cell_state).toBe('UNAVAILABLE');
    // Codes a caller could pass that are not codes at all still answer rather than throw: on the
    // refusal path a throw is a 500, which is the error surface R3.9.3 exists to prevent.
    for (const odd of ['', '__proto__', 'constructor', 'toString'])
      expect(projectC9Denial(odd)).toEqual(UNMAPPED_DENIAL_PROJECTION);
  });

  it('REN-2 a mapped code answers from its own row, not from the default', () => {
    expect(projectC9Denial('use_secure_surface')).toEqual({
      cell_state: 'UNAVAILABLE',
      reason_code: 'PERMISSION',
      limitation_severity: 'limitation',
    });
    // R3.9.3 names these five as "policy fences, not faults" (C11:4900-4902).
    for (const fence of [
      'paid_capability_not_activated',
      'capability_not_registered',
      'review_stale',
      'run_expired_or_terminal',
      'use_secure_surface',
    ]) {
      expect(hasDenialProjection(fence)).toBe(true);
      expect(projectC9Denial(fence).limitation_severity).not.toBe('error');
    }
  });
});
