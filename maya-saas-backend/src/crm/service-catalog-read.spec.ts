import {
  requireBookableServiceFacts,
  observedServiceCatalog,
  bookingServiceFactsFingerprint,
} from './service-catalog-read';
import { ServicesService } from '../services/services.service';

const known = {
  id: 'service-a',
  name: 'Услуга',
  price: 0,
  duration_minutes: 30,
  currency: 'RUB',
};
const selection = {
  tenantId: 'tenant',
  clientId: 'client',
  calendarTarget: {
    source: 'internal' as const,
    provider: null,
    companyId: null,
  },
  branchId: null,
  staffId: 'staff',
  start: '2026-10-08T09:00:00Z',
  timezone: 'Europe/Moscow',
};

describe('Shared factual catalog and new booking terms', () => {
  it('preserves actual zero price and exact fractional-minute duration', () => {
    const service = { ...known, duration_minutes: 30.5 };
    expect(
      requireBookableServiceFacts(
        observedServiceCatalog([service], 'synthetic'),
        [service.id],
      ),
    ).toEqual([service]);
  });
  it.each([
    { price: null, price_min: null, price_max: null },
    { price: null, price_min: 100, price_max: 200 },
    { price: 100, price_min: 100, price_max: 200 },
    { price: -1, price_min: -1, price_max: -1 },
    { duration_minutes: null },
    { duration_minutes: 0 },
    { duration_minutes: -30 },
    { currency: null },
    { currency: '' },
  ])('refuses material unknown/inconsistent terms: %j', (overrides) => {
    const catalog = observedServiceCatalog([known], 'synthetic');
    Object.assign(catalog.services[0], overrides);
    expect(() => requireBookableServiceFacts(catalog, [known.id])).toThrow(
      'Service Unavailable',
    );
  });
  it('checks only selected services and refuses missing or ambiguous identities', () => {
    const catalog = observedServiceCatalog(
      [known, { ...known, id: 'other' }],
      'synthetic',
    );
    catalog.services[1].duration_minutes = null;
    expect(requireBookableServiceFacts(catalog, [known.id])).toEqual([known]);
    expect(() => requireBookableServiceFacts(catalog, ['missing'])).toThrow();
    catalog.services.push(catalog.services[0]);
    expect(() => requireBookableServiceFacts(catalog, [known.id])).toThrow();
  });
  it('keeps unknowns and ranges on /services without a legacy getter', async () => {
    const catalog = observedServiceCatalog([known], 'synthetic');
    Object.assign(catalog.services[0], {
      price: null,
      price_min: 100,
      price_max: 200,
      duration_minutes: null,
      currency: null,
    });
    const crm = {
      readServiceCatalog: jest.fn().mockResolvedValue(catalog),
      getServices: jest.fn(),
    };
    expect(
      await new ServicesService(crm as never).listServices('tenant'),
    ).toEqual(catalog.services);
    expect(crm.readServiceCatalog).toHaveBeenCalledWith('tenant');
    expect(crm.getServices).not.toHaveBeenCalled();
  });
  it('refuses combining selected services in different currencies without conversion', () => {
    const catalog = observedServiceCatalog(
      [known, { ...known, id: 'usd', currency: 'USD' }],
      'internal_calendar',
    );
    expect(() =>
      requireBookableServiceFacts(catalog, [known.id, 'usd']),
    ).toThrow();
    expect(requireBookableServiceFacts(catalog, ['usd'])[0].currency).toBe(
      'USD',
    );
  });
  it('changes the terms fingerprint for material facts or selection, not catalog observation time', () => {
    const initial = bookingServiceFactsFingerprint(selection, [known]);
    expect(bookingServiceFactsFingerprint(selection, [{ ...known }])).toBe(
      initial,
    );
    for (const patch of [
      { price: 1 },
      { duration_minutes: 45 },
      { currency: 'USD' },
    ])
      expect(
        bookingServiceFactsFingerprint(selection, [{ ...known, ...patch }]),
      ).not.toBe(initial);
    for (const patch of [
      { tenantId: 'foreign' },
      { clientId: 'other' },
      { staffId: 'other' },
      { timezone: 'UTC' },
    ])
      expect(
        bookingServiceFactsFingerprint({ ...selection, ...patch }, [known]),
      ).not.toBe(initial);
  });
});
