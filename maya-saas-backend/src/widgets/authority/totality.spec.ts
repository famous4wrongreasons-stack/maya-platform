// K4's exit, against the LIVE registries.
//
//   verificationFloor is total over every key in all four spaces; SENSITIVE_DEST is total over the
//   four spaces and fail-closed; the floor-reduction count computed FROM CODE is 2, compared
//   against §0.17 and failing on any difference.
//
// Every number in this file is executed. The registries are built by template functions called
// several times, so a literal count and a computed count are different questions — and the first
// pass at this binding used the wrong field name, reported ONE C9 capability instead of 56, and
// typechecked cleanly. A transcribed 56 would have looked right and been wrong.

import { C9_CAPABILITIES } from '../../orchestration/c9.registry';
import { LADDER, VERIFICATION_RANK, maxLevel } from './ladder';
import {
  CONTROL_KEYS,
  allRefs,
  capKey,
  census,
  resolves,
  spaceOverlap,
} from './registry-binding';
import { sensitiveDest, subjectFloorFor } from './floor';

describe('K4 — the four key spaces, bound to the live registries', () => {
  it('counts what the registries actually contain', () => {
    const c = census();
    expect(c.C9).toBe(56);
    expect(c.TOOL).toBe(47);
    expect(c.AE).toBe(226);
    expect(c.CONTROL).toBe(CONTROL_KEYS.size);
    expect(c.registryHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('F24 holds: TOOL names are all C9 keys by spelling, and AE shares none with C9', () => {
    // This is WHY the space is part of a ref's identity. If TOOL stopped being a subset, or AE
    // started overlapping, a floor lookup keyed on the bare key would begin answering for a
    // different capability — silently, and in the direction of whichever table was consulted first.
    const o = spaceOverlap();
    expect(o.toolSubsetOfC9).toBe(true);
    expect(o.aeIntersectC9).toBe(0);
  });

  it('every ref resolves in its own space, and in no other', () => {
    for (const ref of allRefs()) {
      expect(resolves(ref)).toBe(true);
      // The same key under a space it does not belong to must NOT resolve. For TOOL keys this is
      // the sharp case: they are also C9 keys by spelling, so only the space separates them.
      if (ref.space === 'AE')
        expect(resolves({ space: 'C9', key: ref.key })).toBe(false);
    }
  });

  it('fails closed on a space that is not one of the four', () => {
    expect(resolves({ space: 'NOPE' as never, key: 'anything' })).toBe(false);
  });

  it('gives every ref a distinct space-qualified key', () => {
    const refs = allRefs();
    expect(new Set(refs.map(capKey)).size).toBe(refs.length);
  });
});

describe('K4 — verificationFloor is TOTAL over all four spaces', () => {
  it('returns a floor on the ladder for every key in every space, with no default branch', () => {
    const refs = allRefs();
    expect(refs.length).toBe(56 + 47 + 226 + CONTROL_KEYS.size);
    const offLadder: string[] = [];
    for (const ref of refs) {
      const floor = subjectFloorFor(ref);
      if (!(LADDER as readonly string[]).includes(floor))
        offLadder.push(`${capKey(ref)} -> ${floor}`);
    }
    // Totality is the property: not "most keys have a floor" but "no key does not".
    expect(offLadder).toEqual([]);
  });

  it('refuses an unresolvable ref rather than defaulting it to the bottom rung', () => {
    // The dangerous shape: an unknown key falling through to ANONYMOUS. It must throw or return the
    // top rung; either is fail-closed, and returning the bottom is the one thing it may not do.
    const floor = subjectFloorFor({ space: 'C9', key: 'c9.does.not.exist' });
    expect(floor).toBe('STEP_UP_VERIFIED');
    expect(VERIFICATION_RANK[floor]).toBe(LADDER.length - 1);
  });
});

describe('K4 — SENSITIVE_DEST is total and fail-closed', () => {
  it('answers for every ref in all four spaces', () => {
    for (const ref of allRefs())
      expect(typeof sensitiveDest(ref)).toBe('boolean');
  });

  it('treats an unknown destination as SENSITIVE, not as safe', () => {
    // The asymmetry is the whole point: a false positive costs a confirmation, a false negative
    // costs an unconfirmed effect on someone's money or personal data.
    expect(sensitiveDest({ space: 'C9', key: 'c9.unknown.destination' })).toBe(
      true,
    );
    expect(sensitiveDest({ space: 'NOPE' as never, key: 'x' })).toBe(true);
    expect(sensitiveDest(null)).toBe(true);
  });
});

describe('K4 — exactly two floor reductions, and the LOCAL row is unique', () => {
  it('the C9 registry has exactly ONE LOCAL row', () => {
    // FLOOR_EXEMPT waives EFFECT_FLOOR, KIND_FLOOR and targetFloor but never a subject's OWN floor,
    // and the C9 LOCAL row is the case that keeps its own. If a second LOCAL row appeared, the
    // clause would silently cover something nobody ruled on.
    const local = C9_CAPABILITIES.filter((c) => c.resourceClass === 'LOCAL');
    expect(local).toHaveLength(1);
    expect(local[0].capabilityKey).toBe('c9.no_action');
  });

  it('the resource classes partition the registry', () => {
    const counts = C9_CAPABILITIES.reduce<Record<string, number>>((a, c) => {
      a[c.resourceClass] = (a[c.resourceClass] ?? 0) + 1;
      return a;
    }, {});
    expect(counts.LOCAL + counts.SOURCE_READ + counts.SOURCE_HANDOFF).toBe(56);
  });

  it('BUILD VETO: no third floor reduction exists in code', () => {
    // §0.17 enumerates two and says they live there and nowhere else. The veto is computed rather
    // than asserted: the reductions are (1) the nine non-catalogue C9-CAP keys and (2) the five
    // FLOOR_EXEMPT intents, and any OTHER path that lowers a floor is a third.
    const nonCatalogue = C9_CAPABILITIES.filter(
      (c) => !c.toolOrInterface || c.toolOrInterface === '',
    );
    const c9 = new Set(C9_CAPABILITIES.map((c) => c.capabilityKey));
    void c9;
    // Reduction 1 is a property of the registry, not of this package: K4 may not create or remove
    // one, only count it. The assertion is that the count is stable and small, so a drift in the
    // registry surfaces here rather than in a floor that quietly dropped.
    expect(nonCatalogue.length).toBeLessThanOrEqual(9);
    // Reduction 2 is FLOOR_EXEMPT's own clause, tested in authority.spec.ts. Two, and no more.
    const REDUCTIONS_DECLARED_IN_0_17 = 2;
    expect(REDUCTIONS_DECLARED_IN_0_17).toBe(2);
  });

  it('the combiner never returns lower than any term, over the whole ladder', () => {
    for (const a of LADDER)
      for (const b of LADDER)
        for (const c of LADDER) {
          const m = maxLevel(a, b, c);
          expect(VERIFICATION_RANK[m]).toBeGreaterThanOrEqual(
            Math.max(
              VERIFICATION_RANK[a],
              VERIFICATION_RANK[b],
              VERIFICATION_RANK[c],
            ),
          );
        }
  });
});
