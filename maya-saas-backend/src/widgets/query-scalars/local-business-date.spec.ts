import {
  validateLocalBusinessDate,
  validateRetainedLocalBusinessDate,
} from './local-business-date';

describe('Wave 4 journal date scalar ruling', () => {
  it.each(['2026-09-24', '2000-02-29', '2099-12-31'])(
    'retains canonical calendar date %s',
    (value) => {
      expect(
        validateRetainedLocalBusinessDate({
          type: 'local_business_date',
          value,
          provenance: 'server_validated',
        }),
      ).toBe(value);
    },
  );

  it.each([
    '2026-9-24',
    '24.09.2026',
    '2026-02-29',
    '2026-04-31',
    '2026-09-24T00:00:00Z',
    '',
  ])('refuses invalid/non-normalized date %j', (value) => {
    expect(() => validateLocalBusinessDate(value)).toThrow(
      'local_business_date_invalid',
    );
  });

  it('refuses a client-asserted provenance', () => {
    expect(() =>
      validateRetainedLocalBusinessDate({
        type: 'local_business_date',
        value: '2026-09-24',
        provenance: 'client_asserted' as never,
      }),
    ).toThrow('local_business_date_invalid');
  });
});
