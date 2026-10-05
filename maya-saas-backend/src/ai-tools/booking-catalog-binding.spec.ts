import { bindBookingCatalog } from './booking-catalog-binding';
const input = () => ({
  staffSource: {
    staff: [
      { id: 'a', name: 'Антон' },
      { id: 'i', name: 'Илья' },
    ],
  },
  serviceSource: { services: [{ id: 's', name: 'Моделирование бороды' }] },
  employee: '[name removed]',
  services: ['моделирование бороды'],
  latestText: 'Мастер Антон, моделирование бороды завтра',
  latestRedactedText: 'Мастер [name removed], моделирование бороды завтра',
});
describe('current public booking catalog binding', () => {
  it('recovers a unique public staff reference locally after privacy redaction', () => {
    expect(bindBookingCatalog(input())).toMatchObject({
      kind: 'resolved',
      staff: { id: 'a' },
      services: [{ id: 's' }],
    });
  });
  it('current entity switch wins over a carried preference', () => {
    expect(
      bindBookingCatalog({
        ...input(),
        employee: 'Антон',
        previousEmployee: 'Антон',
        latestText: 'Теперь мастер Илья',
      }),
    ).toMatchObject({ kind: 'resolved', staff: { id: 'i' } });
  });
  it('retains a revalidated preference for a time-only follow-up', () => {
    expect(
      bindBookingCatalog({
        ...input(),
        previousEmployee: 'Антон',
        latestText: 'Запиши на 17:00',
        latestRedactedText: 'Запиши на 17:00',
      }),
    ).toMatchObject({ kind: 'resolved', staff: { id: 'a' } });
  });
  it.each(['Не Антон, а Илья', 'Мастер Антонина', 'К Антону'])(
    'does not guess ambiguous or inflected references: %s',
    (latestText) => {
      expect(
        bindBookingCatalog({
          ...input(),
          latestText,
          previousEmployee: 'Антон',
        }).kind,
      ).toBe('unresolved');
    },
  );
  it('resolves a current service correction without reusing the old service', () => {
    expect(
      bindBookingCatalog({
        ...input(),
        serviceSource: {
          services: [
            { id: 's', name: 'Моделирование бороды' },
            { id: 'hair', name: 'Стрижка' },
          ],
        },
        services: ['Стрижка'],
      }),
    ).toMatchObject({ kind: 'resolved', services: [{ id: 'hair' }] });
  });
  it('does not recover an old preference when the latest turn contains a new private/unmatched name', () => {
    expect(
      bindBookingCatalog({
        ...input(),
        employee: 'Антон',
        previousEmployee: 'Антон',
        latestText: 'Хочу мастера Константина',
        latestRedactedText: 'Хочу мастера [name removed]',
      }).kind,
    ).toBe('unresolved');
  });
  it('refuses duplicate names, foreign IDs, missing services and unavailable sources', () => {
    const duplicate = {
      ...input(),
      staffSource: {
        staff: [
          { id: 'a', name: 'Антон' },
          { id: 'b', name: 'Антон' },
        ],
      },
    };
    expect(bindBookingCatalog(duplicate).kind).toBe('unresolved');
    expect(
      bindBookingCatalog({
        ...input(),
        latestText: '',
        latestRedactedText: '',
        employee: 'foreign-id',
      }).kind,
    ).toBe('unresolved');
    expect(
      bindBookingCatalog({ ...input(), services: ['foreign-service'] }).kind,
    ).toBe('unresolved');
    expect(bindBookingCatalog({ ...input(), staffSource: null })).toEqual({
      kind: 'unresolved',
      reason: 'source_unavailable',
    });
  });
});
