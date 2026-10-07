import {
  BOOKING_NOUN_OWNERS,
  isBookingNounIdentity,
  encodeBookingSlotOwnerRef,
  decodeBookingSlotOwnerRef,
  decodeBookingSlotSelectionRef,
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
});
