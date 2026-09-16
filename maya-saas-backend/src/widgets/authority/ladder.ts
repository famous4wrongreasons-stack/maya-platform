// K4 — the five-rung ladder, and the arithmetic over it.
//
// Every floor in the contract is a `VerificationLevel`, and every combination of floors is a
// maximum. That makes two primitives load-bearing: the RANK, which says which rung is higher, and
// `maxLevel`, which is how floors combine. Both are declared by the contract and implemented here.
//
// The direction matters and is easy to get backwards: combining floors takes the HIGHEST, because a
// floor is a minimum requirement. Taking the lowest would let any one lenient term unlock every
// strict one — which is the single most consequential sign error available in this codebase.

import type { VerificationLevel } from '../../widget-contract/envelope';

/**
 * §0.8 F39's ladder, in order. The index IS the rank; nothing else defines the ordering, so the
 * ladder cannot be reordered in one place and compared in another.
 */
export const LADDER = [
  'ANONYMOUS',
  'CHANNEL_IDENTITY',
  'BOUND_CLIENT',
  'SESSION_VERIFIED',
  'STEP_UP_VERIFIED',
] as const satisfies readonly VerificationLevel[];

export const VERIFICATION_RANK: Readonly<Record<VerificationLevel, number>> =
  Object.freeze(
    Object.fromEntries(LADDER.map((l, i) => [l, i])) as Record<
      VerificationLevel,
      number
    >,
  );

/**
 * Combine floors. Fail-closed on an unknown value: a level this ladder does not contain is treated
 * as the TOP rung, not the bottom, so a typo or a future member cannot silently lower a floor.
 */
export const maxLevel = (
  ...levels: readonly VerificationLevel[]
): VerificationLevel => {
  if (levels.length === 0)
    throw new Error(
      'maxLevel: refusing to combine zero floors — the caller has lost a term',
    );
  let best: VerificationLevel = 'ANONYMOUS';
  for (const l of levels) {
    const rank = VERIFICATION_RANK[l];
    if (rank === undefined) return 'STEP_UP_VERIFIED';
    if (rank > VERIFICATION_RANK[best]) best = l;
  }
  return best;
};

/** Does the principal's level satisfy a floor? */
export const meets = (
  have: VerificationLevel,
  floor: VerificationLevel,
): boolean => {
  const h = VERIFICATION_RANK[have];
  const f = VERIFICATION_RANK[floor];
  // Unknown on either side fails closed, for the same reason maxLevel returns the top rung.
  if (h === undefined || f === undefined) return false;
  return h >= f;
};

/**
 * STEP_UP_VERIFIED is UNREACHABLE today, and this is where that frozen limitation is enforced
 * rather than merely documented. A floor that resolves here cannot be satisfied by anyone, which is
 * the honest behaviour: the alternative — quietly treating it as SESSION_VERIFIED — would be a
 * floor reduction, and §0.17 says exactly two exist.
 */
export const isReachable = (level: VerificationLevel): boolean =>
  level !== 'STEP_UP_VERIFIED';
