import {
  BOOKING_NOUN_OWNERS,
  isBookingNounIdentity,
  encodeBookingSlotOwnerRef,
  decodeBookingSlotOwnerRef,
  decodeBookingSlotSelectionRef,
  encodeBookingCatalogOwnerRef,
  decodeBookingCatalogOwnerRef,
  sameBookingScope,
} from './booking-noun-identity';

describe('Canonical booking noun identity [BUILD]', () => {
  it('WR-L12 requires both the exact noun and its canonical owner', () => {
    for (const noun of ['service', 'staff', 'slot'] as const) {
      const identity = {
        tenantId: 'tenant',
        noun,
        ownerKind: BOOKING_NOUN_OWNERS[noun],
        ownerRef: 'owner-ref',
      };
      expect(isBookingNounIdentity(identity, noun)).toBe(true);
      expect(
        isBookingNounIdentity(
          { ...identity, ownerKind: 'unrelated_owner' },
          noun,
        ),
      ).toBe(false);
      expect(isBookingNounIdentity({ ...identity, noun: 'other' }, noun)).toBe(
        false,
      );
    }
  });
  it('WR-L12 accepts only canonical slot encodings', () => {
    const iso = '2026-10-02T10:00:00.000Z';
    const handle = encodeBookingSlotOwnerRef(iso)!;
    expect(decodeBookingSlotOwnerRef(handle)).toBe(iso);
    expect(decodeBookingSlotOwnerRef(handle + '=')).toBeNull();
    expect(decodeBookingSlotOwnerRef(iso)).toBeNull();
    expect(encodeBookingSlotOwnerRef('invalid')).toBeNull();
  });
  it('retains exact branch and original revision inside the bounded opaque slot identity', () => {
    const start = '2035-10-01T12:30:00.000Z';
    const scope = { branchId: 'branch-a', sourceRevision: 'a'.repeat(64) };
    const ref = encodeBookingSlotOwnerRef(start, scope)!;
    expect(ref.length).toBeLessThanOrEqual(256);
    expect(decodeBookingSlotSelectionRef(ref)).toEqual({ start, scope });
    expect(
      decodeBookingSlotSelectionRef(encodeBookingSlotOwnerRef(start)!),
    ).toEqual({ start, scope: null });
    for (const malformed of [
      ref + ':extra',
      ref.replace('slot_v2:', 'slot_v3:'),
      ref.replace(':YnJhbmNoLWE:', ':YnJhbmNoLWE=:'),
      ref.slice(0, -1),
    ])
      expect(decodeBookingSlotSelectionRef(malformed)).toBeNull();
    expect(
      encodeBookingSlotOwnerRef(start, { ...scope, branchId: 'bad/branch' }),
    ).toBeNull();
    expect(
      encodeBookingSlotOwnerRef(start, { ...scope, sourceRevision: 'missing' }),
    ).toBeNull();
  });

  it('keeps catalog and slot identities on the same original source scope', () => {
    const scope = { branchId: 'branch-a', sourceRevision: 'a'.repeat(64) };
    const service = encodeBookingCatalogOwnerRef('service:81', scope)!;
    const staff = encodeBookingCatalogOwnerRef('staff:71', scope)!;
    const slot = encodeBookingSlotOwnerRef('2035-10-01T12:30:00.000Z', scope)!;
    expect(service.length).toBeLessThanOrEqual(256);
    expect(decodeBookingCatalogOwnerRef(service)).toEqual({
      id: 'service:81',
      scope,
    });
    expect(decodeBookingCatalogOwnerRef(staff)).toEqual({
      id: 'staff:71',
      scope,
    });
    expect(
      sameBookingScope(
        decodeBookingCatalogOwnerRef(service)!.scope,
        decodeBookingSlotSelectionRef(slot)!.scope,
      ),
    ).toBe(true);
    expect(sameBookingScope(scope, { ...scope, branchId: 'branch-b' })).toBe(
      false,
    );
    expect(
      sameBookingScope(scope, { ...scope, sourceRevision: 'b'.repeat(64) }),
    ).toBe(false);
    expect(sameBookingScope(scope, null)).toBe(false);
    expect(sameBookingScope(null, scope)).toBe(false);
    expect(sameBookingScope(null, null)).toBe(true);
  });

  it('preserves long legacy references as unscoped and never silently upgrades them', () => {
    for (const size of [129, 256]) {
      const ref = 'a'.repeat(size);
      expect(encodeBookingCatalogOwnerRef(ref)).toBe(ref);
      expect(decodeBookingCatalogOwnerRef(ref)).toEqual({
        id: ref,
        scope: null,
      });
      expect(
        encodeBookingCatalogOwnerRef(ref, {
          branchId: 'b'.repeat(128),
          sourceRevision: 'a'.repeat(64),
        }),
      ).toBeNull();
    }
    expect(encodeBookingCatalogOwnerRef('a'.repeat(257))).toBeNull();
  });

  it('refuses noncanonical catalog encodings and incomplete scope instead of minting malformed handles', () => {
    const scope = { branchId: 'branch-a', sourceRevision: 'a'.repeat(64) };
    const ref = encodeBookingCatalogOwnerRef('service:81', scope)!;
    for (const malformed of [
      ref + ':extra',
      ref.replace('catalog_v2:', 'catalog_v2:='),
      ref.replace(':YnJhbmNoLWE:', ':YnJhbmNoLWE=:'),
      ref.slice(0, -1),
      'catalog_v2:raw:branch-a:' + scope.sourceRevision,
    ])
      expect(decodeBookingCatalogOwnerRef(malformed)).toBeNull();
    expect(
      encodeBookingCatalogOwnerRef('81', { ...scope, branchId: 'bad/branch' }),
    ).toBeNull();
    expect(
      encodeBookingCatalogOwnerRef('81', {
        ...scope,
        sourceRevision: 'missing',
      }),
    ).toBeNull();
    expect(encodeBookingCatalogOwnerRef(ref, scope)).toBeNull();
  });
});
