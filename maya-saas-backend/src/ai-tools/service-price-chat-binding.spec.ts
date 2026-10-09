import {
  bindServicePriceTurn,
  type ServicePricePreference,
} from './service-price-chat-binding';
import { bindServicePriceChat } from './service-price-chat-binding';

const serviceSource = {
  services: [
    { id: '42', name: 'Стрижка', price: 1700 },
    { id: '43', name: 'Борода', price: 900 },
  ],
};
const bind = (...userMessages: string[]) =>
  bindServicePriceChat({ userMessages, serviceSource });

describe('explicit service price chat binding', () => {
  it.each([
    ['Установи цену услуги «Стрижка» 1900 рублей', 1900],
    ['Поставь цену услуги Стрижка — 1 900,25 ₽', 1900.25],
    ['Измени цену услуги Стрижка на 0 руб.', 0],
    ['Измени цену услуги Стрижка на 1900.', 1900],
  ] as const)(
    'binds the exact stated amount and authoritative service: %s',
    (text, price) => {
      expect(bind(text)).toEqual({
        kind: 'resolved',
        arguments: { service_id: '42', price_rubles: price },
      });
    },
  );
  it('carries only the service through consecutive price-only follow-ups', () => {
    expect(
      bind('Установи цену Стрижка 1800', 'Нет, 1900', 'Лучше 1950,50 рублей'),
    ).toEqual({
      kind: 'resolved',
      arguments: { service_id: '42', price_rubles: 1950.5 },
    });
  });
  it.each([
    'Завтра установи цену Стрижка 1900',
    'Если придёт клиент, установи цену Стрижка 1900',
    'Не установи цену Стрижка 1900',
    'Установи цену Стрижка на 10%',
    'Установи цену Стрижка, прибавь 100',
    'Установи цену Стрижка 1800–2000',
    'Установи цену Стрижка 20 долларов',
    'Какая цена Стрижка? Установи 1900?',
  ])(
    'cannot inherit authority from an invalid earlier command: %s',
    (anchor) => {
      expect(bind(anchor, 'Нет,2000').kind).toBe('clarify');
      expect(bind(anchor, 'Нет,2000', 'Лучше 2100').kind).toBe('clarify');
      expect(bind('Установи цену Стрижка 1700', anchor, 'Нет,2000').kind).toBe(
        'clarify',
      );
    },
  );
  it('allows an explicitly named replacement service without reusing the old one', () => {
    expect(
      bind('Установи цену Стрижка 1800', 'Измени цену Борода на 1000'),
    ).toEqual({
      kind: 'resolved',
      arguments: { service_id: '43', price_rubles: 1000 },
    });
  });
  it.each([
    'Измени цену Стрижка на 10%',
    'Измени цену Стрижка на две тысячи',
    'Измени цену Стрижка на 2 тысячи',
    'Измени цену Стрижка на 1800–2000',
    'Измени цену Стрижка с 1800 на 2000',
    'Измени цену Стрижка на 2000.123',
    'Измени цену Стрижка на 20 долларов',
    'Измени цену Стрижка, прибавь 100',
    'Не измени цену Стрижка на 1900',
    'Установи цену Стрижка на -100',
    'Установи цену Стрижка на −100',
    'Завтра установи цену Стрижка 1900',
    'Если придёт клиент, установи цену Стрижка 1900',
    'Какая цена Стрижка 1900?',
    'Установи цену Стрижка и Борода 1900',
    'Установи цену Массаж 1900',
  ])('asks rather than computes or guesses: %s', (text) => {
    expect(bind(text).kind).toBe('clarify');
  });
  it.each(['А массаж 1900', 'Какая выручка 1900?', 'Не надо, 1900'])(
    'does not inherit a service across new unknown intent: %s',
    (followup) => {
      expect(bind('Установи цену Стрижка 1800', followup).kind).toBe('clarify');
    },
  );
  it('does not reach backwards through unrelated turns or infer authorization from a price question', () => {
    expect(
      bind('Установи цену Стрижка 1800', 'Спасибо', 'Теперь 1900').kind,
    ).toBe('clarify');
    expect(bind('Какая цена Стрижка?', '1900').kind).toBe('clarify');
    expect(bind('1900').kind).toBe('clarify');
  });
  it('refuses duplicated service titles and IDs instead of selecting a model suggestion', () => {
    for (const extra of [
      { id: '44', name: 'Стрижка' },
      { id: '42', name: 'Другая услуга' },
    ]) {
      expect(
        bindServicePriceChat({
          userMessages: ['Установи цену Стрижка 1900'],
          serviceSource: { services: [...serviceSource.services, extra] },
        }).kind,
      ).toBe('clarify');
    }
  });
  it('does not treat numerals in an exact service name as a price', () => {
    expect(
      bindServicePriceChat({
        userMessages: ['Установи цену услуги «Стрижка 2026» 1900'],
        serviceSource: { services: [{ id: '42', name: 'Стрижка 2026' }] },
      }),
    ).toEqual({
      kind: 'resolved',
      arguments: { service_id: '42', price_rubles: 1900 },
    });
  });
  it('refuses absent or invalid source data', () => {
    for (const source of [
      null,
      {},
      { services: [] },
      { services: [{ id: 'other', name: 'Стрижка' }] },
    ]) {
      expect(
        bindServicePriceChat({
          userMessages: ['Установи цену Стрижка 1900'],
          serviceSource: source,
        }),
      ).toEqual({ kind: 'clarify', reason: 'source_unavailable' });
    }
  });
});

describe('finite pricing preference transitions', () => {
  const scope = { tenantId: 't', userId: 'u', sourceRevision: 'a'.repeat(64) };
  const serviceSource = {
    services: [
      { id: '81', name: 'Мужская стрижка' },
      { id: '82', name: 'Борода' },
    ],
  };
  const pending: ServicePricePreference = {
    version: 'maya.service-price-preference/1',
    ...scope,
    requestedPrice: 1500,
    service: null,
  };
  const selected: ServicePricePreference = {
    ...pending,
    service: serviceSource.services[0],
  };
  const bind = (
    text: string,
    previous: ServicePricePreference | null = pending,
    source = serviceSource,
  ) => bindServicePriceTurn({ text, previous, scope, serviceSource: source });
  it('selects exactly one literal title, then binds the next stated amount without historical text', () => {
    const clarified = bind('«Мужская стрижка»');
    expect(clarified.binding).toEqual({
      kind: 'resolved',
      arguments: { service_id: '81', price_rubles: 1500 },
    });
    expect(bind('Нет, на 1600 рублей.', clarified.preference).binding).toEqual({
      kind: 'resolved',
      arguments: { service_id: '81', price_rubles: 1600 },
    });
    expect(bind('Нет, на 1600 рублей.').preference).toMatchObject({
      requestedPrice: 1600,
      service: null,
    });
  });
  it.each([
    'удали Мужская стрижка',
    'Мужская стрижка и Борода',
    'отмена',
    'не надо',
    '1600 долларов',
    'сделай на 10% дешевле',
    '1600 или 1700',
    'а завтра?',
    'Мужская стрижка потом',
  ])(
    'clears the preference instead of borrowing the old amount for %s',
    (text) => {
      const result = bind(text);
      expect(result.binding.kind).toBe('clarify');
      expect(result.preference).toBeNull();
    },
  );
  it('does not transfer price to another service, renamed ID, ambiguous title or scope', () => {
    expect(bind('Борода', selected).preference).toBeNull();
    expect(
      bind('1600', selected, {
        services: [{ id: '81', name: 'Другая услуга' }],
      }).preference,
    ).toBeNull();
    expect(
      bind('Мужская стрижка', pending, {
        services: [
          ...serviceSource.services,
          { id: '83', name: 'Мужская стрижка' },
        ],
      }).preference,
    ).toBeNull();
    for (const change of [
      { tenantId: 'other' },
      { userId: 'other' },
      { sourceRevision: 'b'.repeat(64) },
    ])
      expect(
        bind('Мужская стрижка', { ...pending, ...change }).preference,
      ).toBeNull();
  });
  it.each([
    'Сколько стоит мужская стрижка за 1500 рублей?',
    'Если можно, подготовь изменение цены мужской стрижки на 1500 рублей.',
    'Подготовь изменение цены мужской стрижки после завтра на 1500 рублей.',
    'Подготовь изменение цены мужской стрижки на 10 процентов.',
    'Подготовь изменение цены мужской стрижки в филиале Север на 1500 рублей.',
  ])('does not retain an amount from a nonqualifying raw request: %s', (text) =>
    expect(bind(text, null).preference).toBeNull(),
  );
});
