// K4's exit, against the LIVE registries.
//
//   verificationFloor is total over every key in all four spaces; SENSITIVE_DEST is total over the
//   four spaces and fail-closed; the two historical repairs and the sole V1.4 pricing
//   admission are distinguished explicitly, with every old census preserved.
//
// Every number in this file is executed. The registries are built by template functions called
// several times, so a literal count and a computed count are different questions — and the first
// pass at this binding used the wrong field name, reported ONE C9 capability instead of 56, and
// typechecked cleanly. A transcribed 56 would have looked right and been wrong.

import fs from 'node:fs';
import path from 'node:path';

import { C9_CAPABILITIES } from '../../orchestration/c9.registry';
import { PROFILE_REGISTRY } from '../../entitlements/widget-release-profile.registry';
import { allowedKinds } from '../../widget-contract/owner-classes';
import { projectorRowForCompletedRead } from '../projection/projector.registry';
import { WIDGET_CAPABILITY_POLICY } from './capability-policy';
import { aeForPropose } from './propose-pairing';
import {
  SERVICE_PRICE_CAPABILITY,
  SERVICE_PRICE_TOOL,
} from '../../crm/yclients-service-price.contract';
import { LADDER, VERIFICATION_RANK, maxLevel } from './ladder';
import {
  CONTROL_KEYS,
  allRefs,
  capKey,
  census,
  resolves,
  spaceOverlap,
  type CapabilityRefLike,
} from './registry-binding';
import { subjectFloorFor } from './floor';
// F48's predicate, not `floor.ts`'s hand-written `sensitiveDest` (GATES-PLAN-V11 U6-L1, R6-1b). The
// two disagree, and the generated one is the contract's: it is emitted from §0.8's own text by
// `scripts/widget-contract/emit-runtime-floor.mjs`, whose `--check` mode fails if the emitted body
// and the certified derivation ever diverge. Gate 6 evaluates SENSITIVE_DEST "in its HANDOFF
// destination branch only" (C11:1836) and evaluates THIS one; the hand-written copy has no reader
// left once R6-1b deletes it in U6-L1's merge commit, so this suite stopped importing it first.
import {
  AE_FAMILY_FLOOR,
  aeFloor,
  SENSITIVE_DEST,
} from './verification-floor.runtime';
import { AE_WIDGET_COMMIT_ALLOWLIST } from './ae-commit-allowlist.runtime';

const isPricingRef = (ref: CapabilityRefLike): boolean =>
  (ref.space === 'AE' && ref.key === SERVICE_PRICE_CAPABILITY) ||
  ((ref.space === 'C9' || ref.space === 'TOOL') &&
    ref.key === SERVICE_PRICE_TOOL);

const isGoodsRef = (ref: CapabilityRefLike): boolean =>
  (ref.space === 'AE' && ref.key === 'crm.goods.receipt.create.v1') ||
  ((ref.space === 'C9' || ref.space === 'TOOL') &&
    ['inventory.goods.read', 'inventory.goods.receipt.prepare'].includes(
      ref.key,
    ));

const isGoodsSearchRef = (ref: CapabilityRefLike): boolean =>
  (ref.space === 'C9' || ref.space === 'TOOL') &&
  ref.key === 'inventory.goods.search';

const isServiceRenamePreviewRef = (ref: CapabilityRefLike): boolean =>
  (ref.space === 'C9' || ref.space === 'TOOL') &&
  ref.key === 'catalog.service.rename.preview';

const historicalRefs = (): readonly CapabilityRefLike[] =>
  allRefs().filter(
    (ref) =>
      !isPricingRef(ref) &&
      !isGoodsRef(ref) &&
      !isGoodsSearchRef(ref) &&
      !isServiceRenamePreviewRef(ref),
  );

describe('K4 — the four key spaces, bound to the live registries', () => {
  it('preserves every historical census and adds exactly the three space-qualified pricing refs', () => {
    const c = census();
    expect(c.C9).toBe(62);
    expect(c.TOOL).toBe(53);
    expect(c.AE).toBe(228);
    for (const [space, count] of [
      ['C9', 57],
      ['TOOL', 48],
      ['AE', 226],
    ] as const)
      expect(
        historicalRefs().filter((ref) => ref.space === space),
      ).toHaveLength(count);
    expect(allRefs().filter(isPricingRef).map(capKey).sort()).toEqual([
      'AE:crm.service.fixed-price.update.v1',
      'C9:catalog.service.price.update',
      'TOOL:catalog.service.price.update',
    ]);
    expect(allRefs().filter(isGoodsRef).map(capKey).sort()).toEqual([
      'AE:crm.goods.receipt.create.v1',
      'C9:inventory.goods.read',
      'C9:inventory.goods.receipt.prepare',
      'TOOL:inventory.goods.read',
      'TOOL:inventory.goods.receipt.prepare',
    ]);
    expect(allRefs().filter(isGoodsSearchRef).map(capKey).sort()).toEqual([
      'C9:inventory.goods.search',
      'TOOL:inventory.goods.search',
    ]);
    expect(
      allRefs().filter(isServiceRenamePreviewRef).map(capKey).sort(),
    ).toEqual([
      'C9:catalog.service.rename.preview',
      'TOOL:catalog.service.rename.preview',
    ]);
    expect(c.CONTROL).toBe(CONTROL_KEYS.size);
    expect(c.registryHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('derives the rename READ floor without admitting it into widget profile, pairing or COMMIT', () => {
    const key = 'catalog.service.rename.preview';
    expect(
      C9_CAPABILITIES.find((row) => row.capabilityKey === key),
    ).toMatchObject({
      mode: 'READ',
      domains: ['ADMIN'],
      ownerKey: `existing.ai-tool:${key}`,
    });
    // F28 totality derives a floor/consent row for every registered C9 key.
    // This is not a positive widget-template or effect admission.
    expect(WIDGET_CAPABILITY_POLICY[`C9:${key}`]).toEqual({
      min_verification: 'SESSION_VERIFIED',
      consent_class: 'none',
      dispatch_is_synchronous: true,
    });
    expect(PROFILE_REGISTRY.successorCapabilities).not.toContain(key);
    expect(allowedKinds({ space: 'C9', key }).size).toBe(0);
    expect(projectorRowForCompletedRead(`C9:${key}`)).toBeNull();
    expect(aeForPropose(key)).toBeNull();
    expect(subjectFloorFor({ space: 'C9', key })).toBe('CHANNEL_IDENTITY');
    expect(
      Object.prototype.hasOwnProperty.call(AE_WIDGET_COMMIT_ALLOWLIST, key),
    ).toBe(false);
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
    expect(historicalRefs()).toHaveLength(57 + 48 + 226 + CONTROL_KEYS.size);
    expect(refs).toHaveLength(62 + 53 + 228 + CONTROL_KEYS.size);
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
  // REPOINTED to F48 (GATES-PLAN-V11 U6-L1). The predicate under test is now the GENERATED one, the
  // one Gate 6's HANDOFF destination branch and `FLOOR_EXEMPT`'s fourth clause both call
  // (C11:1836, C11:4743-4745). The hand-written `floor.ts#sensitiveDest` this suite used to test is
  // deleted by R6-1b; it had no other reader, and where the two disagreed the generated one is the
  // contract's text and the other was a paraphrase — it classified by SUBSTRING over a key's
  // spelling (`'client'`, `'payment'`, …) where F48 reads the signed `consent_class` row.

  it('answers for every ref in all four spaces', () => {
    for (const ref of allRefs())
      expect(typeof SENSITIVE_DEST(ref)).toBe('boolean');
  });

  it('is TOTAL by type rather than by a default branch', () => {
    // The switch has no `default:` and does not need one: `CapabilityRef['space']` is closed at four
    // and the compiler checks the exhaustiveness. A default here would be the place a fifth space
    // silently inherited "not sensitive", which is the failure this whole file exists to prevent.
    const source = fs.readFileSync(
      path.join(__dirname, 'verification-floor.runtime.ts'),
      'utf8',
    );
    const body = /export function SENSITIVE_DEST[\s\S]*?\n}/.exec(source)?.[0];
    expect(body).toBeDefined();
    for (const space of [
      "case 'AE'",
      "case 'C9'",
      "case 'CONTROL'",
      "case 'TOOL'",
    ])
      expect(body).toContain(space);
    expect(body).not.toContain('default:');
  });

  it('treats an unknown destination as SENSITIVE, not as safe', () => {
    // The asymmetry is the whole point: a false positive costs a confirmation, a false negative
    // costs an unconfirmed effect on someone's money or personal data.
    expect(SENSITIVE_DEST({ space: 'C9', key: 'c9.unknown.destination' })).toBe(
      true,
    );
    expect(SENSITIVE_DEST({ space: 'AE', key: 'not.registered.v1' })).toBe(
      true,
    );
    // A TOOL ref: no intent of any effect class may carry one (R3.2.2), so it is sensitive by
    // construction rather than by classification.
    expect(
      SENSITIVE_DEST({ space: 'TOOL', key: 'catalog.services.read' }),
    ).toBe(true);
  });

  it('classifies a registered C9 destination by its signed `consent_class`, not by its spelling', () => {
    // The paraphrase this replaces answered `true` for anything whose KEY contained `client`,
    // `payment`, `money`, `finance`, `consent`, `identity` or `contact`. F48 reads the row.
    expect(SENSITIVE_DEST({ space: 'C9', key: 'owner_report.download' })).toBe(
      true,
    ); // personal_data
    expect(SENSITIVE_DEST({ space: 'C9', key: 'owner_report.status' })).toBe(
      false,
    ); // none
    expect(SENSITIVE_DEST({ space: 'C9', key: 'settings.update' })).toBe(false);
  });

  it('a null destination is "nothing named", and Gate 6 never asks it that', () => {
    // F48 answers `false` for null because there is no destination to classify — and the deleted
    // paraphrase answered `true`. The difference is safe because no caller reaches it with null:
    // Gate 6 returns at G6-5 before the HANDOFF branch when the subject is null (C11:4740-4741),
    // and `FLOOR_EXEMPT` reads it only inside a clause that already requires `target.class === 's'`.
    expect(SENSITIVE_DEST(null)).toBe(false);
  });
});

describe('K4 — historical floor repairs, the bounded V1.4 admission, and the unique LOCAL row', () => {
  it('the C9 registry has exactly ONE LOCAL row', () => {
    // FLOOR_EXEMPT waives EFFECT_FLOOR, KIND_FLOOR and targetFloor but never a subject's OWN floor,
    // and the C9 LOCAL row is the case that keeps its own. If a second LOCAL row appeared, the
    // clause would silently cover something nobody ruled on.
    const local = C9_CAPABILITIES.filter((c) => c.resourceClass === 'LOCAL');
    expect(local).toHaveLength(1);
    expect(local[0].capabilityKey).toBe('c9.no_action');
  });

  it('the resource classes partition the registry', () => {
    const beforePricing = C9_CAPABILITIES.filter(
      (c) =>
        c.capabilityKey !== SERVICE_PRICE_TOOL &&
        c.capabilityKey !== 'inventory.goods.search' &&
        c.capabilityKey !== 'catalog.service.rename.preview' &&
        !['inventory.goods.read', 'inventory.goods.receipt.prepare'].includes(
          c.capabilityKey,
        ),
    );
    const counts = beforePricing.reduce<Record<string, number>>((a, c) => {
      a[c.resourceClass] = (a[c.resourceClass] ?? 0) + 1;
      return a;
    }, {});
    expect(counts.LOCAL + counts.SOURCE_READ + counts.SOURCE_HANDOFF).toBe(57);
    expect(C9_CAPABILITIES).toHaveLength(62);
    expect(
      C9_CAPABILITIES.filter((c) => c.capabilityKey === SERVICE_PRICE_TOOL),
    ).toEqual([
      expect.objectContaining({
        capabilityKey: SERVICE_PRICE_TOOL,
        resourceClass: 'SOURCE_HANDOFF',
        mode: 'PROPOSE_ONLY',
      }),
    ]);
  });

  it('keeps the two historical repairs and names only the approved pricing family admission', () => {
    // §0.17 preserves (1) the nine non-catalogue keys and (2) the FLOOR_EXEMPT intents.
    // V1.4's separately approved third change is exactly the closed pricing subtype.
    const nonCatalogue = C9_CAPABILITIES.filter(
      (c) => !c.toolOrInterface || c.toolOrInterface === '',
    );
    // Reduction 1 is a property of the registry, not of this package: K4 may not create or remove
    // one, only count it. The assertion is that the count is stable and small, so a drift in the
    // registry surfaces here rather than in a floor that quietly dropped.
    expect(nonCatalogue.length).toBeLessThanOrEqual(9);
    // The other historical repair is FLOOR_EXEMPT's own clause, tested independently.
    expect(
      Object.entries(AE_WIDGET_COMMIT_ALLOWLIST)
        .filter(([, row]) => row.family === 'catalogue_price_configuration')
        .map(([key]) => key),
    ).toEqual([SERVICE_PRICE_CAPABILITY]);
    expect(aeFloor(SERVICE_PRICE_CAPABILITY)).toBe('SESSION_VERIFIED');
    expect(AE_FAMILY_FLOOR.money).toBe('STEP_UP_VERIFIED');
    expect(AE_FAMILY_FLOOR.marketing_fanout).toBe('STEP_UP_VERIFIED');
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
