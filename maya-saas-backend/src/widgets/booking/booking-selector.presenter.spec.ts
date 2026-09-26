import { presentBookingSelector } from './booking-selector.presenter';
import {
  BOOKING_NOUN_OWNERS,
  encodeBookingSlotOwnerRef,
} from './booking-noun-identity';

const mint = (identity: {
  tenantId: string;
  noun: string;
  ownerKind: string;
  ownerRef: string;
}) =>
  `${identity.tenantId}:${identity.noun}:${identity.ownerKind}:${identity.ownerRef}`;

describe('FBE2E-2 — booking selector presentation', () => {
  it('projects canonical services into opaque server-minted choices', () => {
    const presented = presentBookingSelector({
      tenantId: 'tenant-a',
      kind: 'SERVICE_SELECTOR',
      source: {
        services: [
          {
            id: 'service-1',
            name: 'Haircut',
            price: 1500,
            duration_minutes: 60,
            currency: 'RUB',
            category: 'Hair',
            ignored_phone: '+79990000000',
          },
        ],
      },
      mint,
    });
    expect(presented?.kind).toBe('SERVICE_SELECTOR');
    expect(presented?.body).toMatchObject({
      select: 'single',
      shown_count: 1,
      options: [
        {
          option_id: 'tenant-a:service:catalog_service:service-1',
          service_ref: 'tenant-a:service:catalog_service:service-1',
          label: { value: 'Haircut' },
          intent_ref: 'i1',
        },
      ],
    });
    expect(JSON.stringify(presented)).not.toContain('+79990000000');
  });

  it('requires the inherited service for staff and the inherited staff for slots', () => {
    expect(
      presentBookingSelector({
        tenantId: 'tenant-a',
        kind: 'STAFF_SELECTOR',
        source: { staff: [{ id: 'staff-1', name: 'Alice' }] },
        mint,
      }),
    ).toBeNull();
    const staff = presentBookingSelector({
      tenantId: 'tenant-a',
      kind: 'STAFF_SELECTOR',
      source: {
        staff: [
          { id: 'staff-1', name: 'Alice', title: 'Barber' },
          { id: '', name: 'Invalid' },
        ],
      },
      inherited: { service: 'opaque-service' },
      mint,
    });
    expect(staff?.body).toMatchObject({
      for_service_refs: ['opaque-service'],
      shown_count: 1,
      options: [
        {
          staff_ref: 'tenant-a:staff:catalog_staff:staff-1',
          label: { value: 'Alice' },
        },
      ],
    });

    expect(
      presentBookingSelector({
        tenantId: 'tenant-a',
        kind: 'TIME_SLOT_SELECTOR',
        source: {
          slots: [
            {
              start: '2026-10-01T10:00:00.000Z',
              end: '2026-10-01T11:00:00.000Z',
            },
          ],
        },
        inherited: { service: 'opaque-service' },
        mint,
      }),
    ).toBeNull();
  });

  it('projects valid availability into exact opaque slot refs and refuses malformed facts', () => {
    const presented = presentBookingSelector({
      tenantId: 'tenant-a',
      kind: 'TIME_SLOT_SELECTOR',
      source: {
        slots: [
          {
            start: '2026-10-01T10:00:00.000Z',
            end: '2026-10-01T11:00:00.000Z',
          },
          { start: 'not-a-date', end: 'also-not-a-date' },
        ],
      },
      inherited: {
        service: 'opaque-service',
        staff: 'opaque-staff',
      },
      mint,
    });
    expect(presented?.body).toMatchObject({
      timezone: 'UTC',
      shown_count: 1,
      groups: [
        {
          slots: [
            {
              slot_ref: mint({
                tenantId: 'tenant-a',
                noun: 'slot',
                ownerKind: BOOKING_NOUN_OWNERS.slot,
                ownerRef: encodeBookingSlotOwnerRef(
                  '2026-10-01T10:00:00.000Z',
                ) as string,
              }),
              staff_ref: 'opaque-staff',
              availability: { value: 'FREE' },
            },
          ],
        },
      ],
    });
    expect(
      presentBookingSelector({
        tenantId: 'tenant-a',
        kind: 'SERVICE_SELECTOR',
        source: { services: [{ id: 'service-1', name: 'Missing price' }] },
        mint,
      }),
    ).toBeNull();
  });
});
