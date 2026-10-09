import {
  bindBookingCatalog,
  bindBookingStaff,
  bookingPreferenceDate,
} from './booking-catalog-binding';
const reference = '[name removed]@request1_1';
const input = () => ({
  staffSource: {
    staff: [
      { id: 's', name: 'Стас' },
      { id: 'a', name: 'Александр' },
    ],
  },
  serviceSource: {
    services: [
      { id: 'hair', name: 'Стрижка' },
      { id: 'beard', name: 'Борода' },
    ],
  },
  employee: reference,
  services: ['Стрижка'],
  nameReferences: new Map([[reference, 'Стаса']]),
});
describe('explicit staff preference before missing-service clarification', () => {
  it('addresses an unknown employee even when no service was supplied', () => {
    const pending = {
      ...input(),
      employee: 'foreign-staff',
      services: undefined,
    };
    const expected = {
      kind: 'unresolved',
      reason: 'staff_ambiguous_or_missing',
    };
    expect(bindBookingStaff(pending)).toEqual(expected);
    expect(bindBookingCatalog(pending)).toEqual(expected);
  });

  it('resolves a current name reference without requiring or reading a service source', () => {
    const current = input();
    expect(
      bindBookingStaff({
        staffSource: current.staffSource,
        employee: current.employee,
        nameReferences: current.nameReferences,
      }),
    ).toEqual({ kind: 'resolved', staff: { id: 's', name: 'Стас' } });
    expect(bindBookingCatalog({ ...current, services: undefined })).toEqual({
      kind: 'unresolved',
      reason: 'service_ambiguous_or_missing',
      staff: { id: 's', name: 'Стас' },
    });
  });

  it('does not silently choose among current staff with colliding names', () => {
    expect(
      bindBookingStaff({
        ...input(),
        staffSource: {
          staff: [
            { id: 's', name: 'Стас' },
            { id: 'other', name: 'Стас' },
          ],
        },
      }),
    ).toEqual({ kind: 'unresolved', reason: 'staff_ambiguous_or_missing' });
  });

  it.each([null, {}, { staff: null }, { staff: [{ id: 's' }] }])(
    'keeps an unavailable, rejected-stale or malformed source distinct from an unknown employee: %j',
    (staffSource) => {
      // The current-source owner maps stale/failed execution to null. This pure
      // preference binder must not reinterpret that refusal as a missing person.
      expect(
        bindBookingStaff({
          ...input(),
          employee: 'foreign-staff',
          staffSource,
        }),
      ).toEqual({ kind: 'unresolved', reason: 'source_unavailable' });
    },
  );

  it('uses only the current catalog and request-local alias, never an earlier resolved employee', () => {
    const current = input();
    expect(bindBookingStaff(current).kind).toBe('resolved');
    expect(
      bindBookingStaff({
        ...current,
        staffSource: { staff: [{ id: 'a', name: 'Александр' }] },
      }),
    ).toEqual({ kind: 'unresolved', reason: 'staff_ambiguous_or_missing' });
    expect(bindBookingStaff({ ...current, nameReferences: new Map() })).toEqual(
      { kind: 'unresolved', reason: 'staff_ambiguous_or_missing' },
    );
    expect(
      bindBookingCatalog({
        ...current,
        employee: 'foreign-staff',
        serviceSource: null,
      }),
    ).toEqual({ kind: 'unresolved', reason: 'source_unavailable' });
  });
});
describe('semantic-selected references against current public catalog', () => {
  it('uses existing name forms against the catalog after opaque mention selection', () => {
    expect(bindBookingCatalog(input())).toMatchObject({
      kind: 'resolved',
      staff: { id: 's' },
    });
    expect(
      bindBookingCatalog({
        ...input(),
        nameReferences: new Map([[reference, 'Александра']]),
      }),
    ).toMatchObject({ kind: 'resolved', staff: { id: 'a' } });
  });
  it('does not let self-identification overwrite the semantic employee', () => {
    expect(
      bindBookingCatalog({
        ...input(),
        employee: 'Александр',
        nameReferences: new Map([[reference, 'Стаса']]),
      }),
    ).toMatchObject({ kind: 'resolved', staff: { id: 'a' } });
  });
  it('uses the selected occurrence when another name is excluded', () => {
    const chosen = '[name removed]@request1_2';
    expect(
      bindBookingCatalog({
        ...input(),
        employee: chosen,
        nameReferences: new Map([
          [reference, 'Стаса'],
          [chosen, 'Александра'],
        ]),
      }),
    ).toMatchObject({ kind: 'resolved', staff: { id: 'a' } });
    expect(bindBookingCatalog({ ...input(), employee: null }).kind).toBe(
      'unresolved',
    );
  });
  it.each([
    '[name removed]',
    '[name removed]@old_request_1',
    '[name removed]@invented_1',
    'foreign-staff',
    'Антонина',
  ])(
    'does not guess unknown, historical, collapsed or foreign references: %s',
    (employee) => {
      expect(bindBookingCatalog({ ...input(), employee }).kind).toBe(
        'unresolved',
      );
    },
  );
  it('does not choose an exact female name over a colliding male genitive', () => {
    expect(
      bindBookingCatalog({
        ...input(),
        employee: 'Александра',
        staffSource: {
          staff: [
            { id: 'm', name: 'Александр' },
            { id: 'f', name: 'Александра' },
          ],
        },
      }).kind,
    ).toBe('unresolved');
  });
  it('refuses duplicate names and foreign service IDs, retaining only a resolved staff preference', () => {
    expect(
      bindBookingCatalog({
        ...input(),
        staffSource: {
          staff: [
            { id: 's', name: 'Стас' },
            { id: 's2', name: 'Стас' },
          ],
        },
      }).kind,
    ).toBe('unresolved');
    expect(
      bindBookingCatalog({ ...input(), services: ['foreign-service'] }),
    ).toMatchObject({
      kind: 'unresolved',
      staff: { id: 's' },
      reason: 'service_ambiguous_or_missing',
    });
    expect(bindBookingCatalog({ ...input(), staffSource: null })).toEqual({
      kind: 'unresolved',
      reason: 'source_unavailable',
    });
  });
  it('validates every service and corrections without silently dropping the second service', () => {
    expect(
      bindBookingCatalog({ ...input(), services: ['Стрижка', 'Борода'] }),
    ).toMatchObject({
      kind: 'resolved',
      services: [{ id: 'hair' }, { id: 'beard' }],
    });
    expect(
      bindBookingCatalog({ ...input(), services: ['Борода'] }),
    ).toMatchObject({ kind: 'resolved', services: [{ id: 'beard' }] });
  });
});

describe('semantic booking day projection', () => {
  it('uses current business calendar and refuses ranges instead of narrowing them', () => {
    const now = new Date('2026-10-05T22:30:00Z');
    expect(bookingPreferenceDate('today', 'Europe/Moscow', now)).toBe(
      '2026-10-06',
    );
    expect(bookingPreferenceDate('tomorrow', 'Europe/Moscow', now)).toBe(
      '2026-10-07',
    );
    expect(bookingPreferenceDate('tomorrow', 'America/New_York', now)).toBe(
      '2026-10-06',
    );
    expect(bookingPreferenceDate('2026-10-09', 'Europe/Moscow', now)).toBe(
      '2026-10-09',
    );
    expect(bookingPreferenceDate('next_week', 'Europe/Moscow', now)).toBeNull();
    expect(bookingPreferenceDate(null, 'Europe/Moscow', now)).toBeNull();
  });
});
