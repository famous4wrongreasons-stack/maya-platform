import {
  BOOKING_NOUN_OWNERS,
  isBookingNounIdentity,
  encodeBookingSlotOwnerRef,
  decodeBookingSlotOwnerRef,
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
});
