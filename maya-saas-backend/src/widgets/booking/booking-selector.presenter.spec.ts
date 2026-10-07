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
      total_count: null,
      options: [
        {
          option_id: 'tenant-a:service:catalog_service:service-1',
          service_ref: 'tenant-a:service:catalog_service:service-1',
          label: { value: 'Haircut' },
          intent_ref: 'i1',
          enabled: {
            state: 'NOT_MEASURED',
            value: null,
            reason_code: 'NOT_COLLECTED',
            fact_ref: null,
          },
          requires_consultation: {
            state: 'NOT_MEASURED',
            value: null,
            reason_code: 'NOT_COLLECTED',
            fact_ref: null,
          },
        },
      ],
    });
    expect(JSON.stringify(presented)).not.toContain('+79990000000');
  });

  it('retains observed service identities with unavailable measures and does not invent currency', () => {
    const shown = presentBookingSelector({
      tenantId: 'tenant',
      kind: 'SERVICE_SELECTOR',
      mint,
      source: {
        services: [
          {
            id: 'missing',
            name: 'Unknown',
            price: null,
            duration_minutes: null,
            currency: null,
          },
          {
            id: 'range',
            name: 'Range',
            price: null,
            price_min: 1000,
            price_max: 2000,
            duration_minutes: 30.5,
            currency: 'RUB',
          },
          {
            id: 'free',
            name: 'Observed zero',
            price: 0,
            duration_minutes: 15,
            currency: 'RUB',
          },
          {
            id: 'currency',
            name: 'Unknown currency',
            price: 100,
            duration_minutes: 20,
            currency: null,
          },
        ],
      },
    });
    expect(shown?.body).toMatchObject({
      shown_count: 4,
      options: [
        {
          label: { value: 'Unknown' },
          duration: { state: 'NOT_MEASURED', value: null },
          price: { state: 'NOT_MEASURED', value: null, currency: null },
        },
        {
          label: { value: 'Range' },
          duration: { state: 'KNOWN', value: 30.5 },
          price: { state: 'NOT_MEASURED', value: null },
        },
        {
          price: { state: 'KNOWN', value: 0, currency: 'RUB' },
          duration: { state: 'KNOWN', value: 15 },
        },
        { price: { state: 'NOT_MEASURED', value: null, currency: null } },
      ],
    });
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
      total_count: null,
      options: [
        {
          staff_ref: 'tenant-a:staff:catalog_staff:staff-1',
          label: { value: 'Alice' },
          enabled: {
            state: 'NOT_MEASURED',
            value: null,
            reason_code: 'NOT_COLLECTED',
            fact_ref: null,
          },
          nearest_availability: {
            state: 'NOT_MEASURED',
            value: null,
            reason_code: 'NOT_COLLECTED',
            fact_ref: null,
            unit: 'datetime',
          },
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
        timezone: 'UTC',
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
      total_count: null,
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
              availability: {
                state: 'NOT_MEASURED',
                value: null,
                reason_code: 'NOT_COLLECTED',
                fact_ref: null,
              },
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

it('refuses bound slot facts without the original source witness', () => {
  const mint = jest.fn();
  expect(
    presentBookingSelector({
      tenantId: 'tenant-a',
      kind: 'TIME_SLOT_SELECTOR',
      inherited: { staff: 'opaque-staff', service: 'opaque-service' },
      source: {
        timezone: 'Europe/Moscow',
        slots: [
          {
            branch_id: 'branch-a',
            start: '2035-01-01T07:00:00Z',
            end: '2035-01-01T08:00:00Z',
          },
        ],
      },
      mint,
    }),
  ).toBeNull();
  expect(mint).not.toHaveBeenCalled();
});

it('mints a scoped external slot only when every returned branch matches its qualified selection', () => {
  const minted: Array<{ ownerRef: string }> = [];
  const mint = jest.fn((identity: { ownerRef: string }) => {
    minted.push(identity);
    return 'opaque-slot';
  });
  const source = {
    timezone: 'Europe/Moscow',
    booking_selection: {
      branchId: 'branch-a',
      branchSourceRevision: 'a'.repeat(64),
    },
    slots: [
      {
        branch_id: 'branch-a',
        start: '2035-01-01T07:00:00Z',
        end: '2035-01-01T08:00:00Z',
      },
    ],
  };
  const present = () =>
    presentBookingSelector({
      tenantId: 'tenant-a',
      kind: 'TIME_SLOT_SELECTOR',
      inherited: { staff: 'opaque-staff', service: 'opaque-service' },
      source,
      mint,
    });
  expect(present()?.kind).toBe('TIME_SLOT_SELECTOR');
  expect(minted[0].ownerRef).toMatch(/^slot_v2:/);
  source.slots.push({ ...source.slots[0], branch_id: 'foreign-branch' });
  expect(present()).toBeNull();
  expect(mint).toHaveBeenCalledTimes(1);
});

it('preserves INTERNAL provider-owned selection when the emitter confirms the source', () => {
  const mint = jest.fn(() => 'opaque-slot');
  expect(
    presentBookingSelector({
      tenantId: 'tenant-a',
      kind: 'TIME_SLOT_SELECTOR',
      internalCalendar: true,
      inherited: { staff: 'opaque-staff', service: 'opaque-service' },
      source: {
        timezone: 'Europe/Moscow',
        slots: [
          {
            branch_id: 'branch-a',
            start: '2035-01-01T07:00:00Z',
            end: '2035-01-01T08:00:00Z',
          },
        ],
      },
      mint,
    })?.kind,
  ).toBe('TIME_SLOT_SELECTOR');
});
