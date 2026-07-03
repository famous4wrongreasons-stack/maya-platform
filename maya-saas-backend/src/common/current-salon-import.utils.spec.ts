import {
  buildCurrentSalonImportData,
  deriveTenantSlug,
  normalizePositiveIntList,
  slugifyValue,
} from './current-salon-import.utils';

describe('current salon import utils', () => {
  it('slugifies Cyrillic values for fallback slugs', () => {
    expect(slugifyValue('Мужская Эстетика')).toBe('muzhskaya-estetika');
  });

  it('derives the tenant slug from the app hostname first', () => {
    expect(
      deriveTenantSlug(
        'https://app.malesthetic.pro',
        'https://example.com',
        'Fallback Name',
      ),
    ).toBe('malesthetic');
  });

  it('normalizes active master ids from arrays and comma-separated strings', () => {
    expect(normalizePositiveIntList(['11', 22, 0, 'abc'])).toEqual([11, 22]);
    expect(normalizePositiveIntList('33, 44, nope')).toEqual([33, 44]);
  });

  it('builds import data without exposing or depending on chat-provided secrets', () => {
    const result = buildCurrentSalonImportData({
      BARBERSHOP_NAME: 'Мужская Эстетика',
      APP_URL: 'https://malesthetic.pro/app',
      SITE_URL: 'https://malesthetic.pro',
      YCLIENTS_BASE_URL: 'https://api.yclients.com/api/v1',
      YCLIENTS_PARTNER_TOKEN: 'partner-token',
      YCLIENTS_USER_TOKEN: 'user-token',
      YCLIENTS_COMPANY_ID: '123456',
      ACTIVE_MASTER_IDS: ['101', 202],
      BARBERSHOP_PHONE: '+79990000000',
      BARBERSHOP_ADDRESS: 'Moscow, Test street 1',
    });

    expect(result.tenantSlug).toBe('malesthetic');
    expect(result.yclientsCompanyId).toBe(123456);
    expect(result.activeMasterIds).toEqual([101, 202]);
    expect(result.branchName).toBe('Мужская Эстетика');
    expect(result.themeJson).toMatchObject({
      source: 'python-config-import',
      app_url: 'https://malesthetic.pro/app',
      site_url: 'https://malesthetic.pro',
    });
  });
});
