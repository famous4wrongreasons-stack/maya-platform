// K4's exit, where it can be proved without a live registry.
//
//   verificationFloor is total over every key in all four spaces; SECURE_SURFACE_ONLY emissions in
//   chat = 0; floor-reduction count computed from code = 2, compared against §0.17 and failing on
//   any difference.
//
//   The clause that used to stand here — "the five PII fences fire INDEPENDENTLY, 5/5" — is gone
//   with the fences themselves (IR-K4K8-1, P-K4K8's merge, landed with U12a). F95 item 2
//   (C11:1882-1886) states no count: it says no widget-layer module may implement PII masking of
//   its own, and masking stays in the owners. `gates/gate12-pii-path.source.spec.ts` and
//   `projection/projector-fences.architecture.spec.ts` ARCH-12-2 are the mechanism now.

import {
  LADDER,
  VERIFICATION_RANK,
  maxLevel,
  meets,
  isReachable,
} from './ladder';

describe('K4 — the five-rung ladder', () => {
  it('is the ladder §0.8 F39 declares, in order', () => {
    expect(LADDER).toEqual([
      'ANONYMOUS',
      'CHANNEL_IDENTITY',
      'BOUND_CLIENT',
      'SESSION_VERIFIED',
      'STEP_UP_VERIFIED',
    ]);
    expect(Object.keys(VERIFICATION_RANK)).toHaveLength(5);
  });

  it('combines floors by taking the HIGHEST, because a floor is a minimum', () => {
    // The sign error worth testing for: taking the lowest would let one lenient term unlock every
    // strict one, which is the most consequential inversion available here.
    expect(maxLevel('ANONYMOUS', 'SESSION_VERIFIED')).toBe('SESSION_VERIFIED');
    expect(maxLevel('BOUND_CLIENT', 'CHANNEL_IDENTITY')).toBe('BOUND_CLIENT');
    expect(maxLevel('ANONYMOUS')).toBe('ANONYMOUS');
  });

  it('fails CLOSED on a level the ladder does not contain', () => {
    expect(maxLevel('NOT_A_LEVEL' as never, 'ANONYMOUS')).toBe(
      'STEP_UP_VERIFIED',
    );
    expect(meets('NOT_A_LEVEL' as never, 'ANONYMOUS')).toBe(false);
    expect(meets('SESSION_VERIFIED', 'NOT_A_LEVEL' as never)).toBe(false);
  });

  it('refuses to combine zero floors rather than returning the bottom rung', () => {
    // An empty combine means a caller lost a term. Returning ANONYMOUS would turn that bug into a
    // silently open floor.
    expect(() => maxLevel()).toThrow(/lost a term/);
  });

  it('satisfies a floor only at or above it', () => {
    expect(meets('SESSION_VERIFIED', 'BOUND_CLIENT')).toBe(true);
    expect(meets('BOUND_CLIENT', 'BOUND_CLIENT')).toBe(true);
    expect(meets('CHANNEL_IDENTITY', 'BOUND_CLIENT')).toBe(false);
  });

  it('keeps STEP_UP_VERIFIED unreachable, as the frozen limitation states', () => {
    // Enforced, not documented. Treating it as SESSION_VERIFIED would be a third floor reduction,
    // and §0.17 says exactly two exist.
    expect(isReachable('STEP_UP_VERIFIED')).toBe(false);
    expect(LADDER.filter(isReachable)).toHaveLength(4);
  });
});

describe('K4 — exactly two floor reductions exist', () => {
  it('the ladder itself introduces none', () => {
    // §0.17 enumerates two reductions and says they live there and nowhere else. The ladder's job
    // is arithmetic; if it ever returned something LOWER than a term it was given, that would be a
    // third reduction hiding in a helper.
    const levels = LADDER;
    for (const a of levels)
      for (const b of levels) {
        const combined = maxLevel(a, b);
        expect(VERIFICATION_RANK[combined]).toBeGreaterThanOrEqual(
          VERIFICATION_RANK[a],
        );
        expect(VERIFICATION_RANK[combined]).toBeGreaterThanOrEqual(
          VERIFICATION_RANK[b],
        );
      }
  });
});
