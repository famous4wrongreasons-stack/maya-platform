import { BadRequestException } from '@nestjs/common';

import { TenantsService } from './tenants.service';

/**
 * Защита адресации платформы.
 *
 * 🔴 Резолвер определяет тенанта по домену. Салон, забравший себе платформенное
 * имя или домен, увёл бы адресацию всей платформы на себя, а чужие салоны
 * получили бы отказ на каждом запросе. Проверяем, что такие попытки отбиваются.
 */
describe('TenantsService: зарезервированные имена и домены', () => {
  const guard = (dto: Record<string, unknown>) =>
    (
      TenantsService.prototype as unknown as {
        assertHostNamesAllowed(input: unknown): void;
      }
    ).assertHostNamesAllowed.call({}, dto);

  const OLD_ENV = process.env.PLATFORM_BASE_DOMAIN;

  afterEach(() => {
    if (OLD_ENV === undefined) delete process.env.PLATFORM_BASE_DOMAIN;
    else process.env.PLATFORM_BASE_DOMAIN = OLD_ENV;
  });

  it('пропускает обычные имена салона', () => {
    expect(() =>
      guard({ subdomain: 'barbershop-lermontova', slug: 'muzhskaya-estetika' }),
    ).not.toThrow();
  });

  it('не отдаёт зарезервированный поддомен', () => {
    expect(() => guard({ subdomain: 'admin' })).toThrow(BadRequestException);
    expect(() => guard({ subdomain: 'API' })).toThrow(BadRequestException);
    expect(() => guard({ slug: 'maya-os' })).toThrow(BadRequestException);
  });

  it('не отдаёт домен платформы и его поддомены', () => {
    process.env.PLATFORM_BASE_DOMAIN = 'maya.app';

    expect(() => guard({ customDomain: 'maya.app' })).toThrow(
      BadRequestException,
    );
    expect(() => guard({ customDomain: 'salon.maya.app' })).toThrow(
      BadRequestException,
    );
  });

  it('свой домен салона по-прежнему можно указать', () => {
    process.env.PLATFORM_BASE_DOMAIN = 'maya.app';

    expect(() => guard({ customDomain: 'malesthetic.pro' })).not.toThrow();
  });

  it('пустые значения не мешают', () => {
    expect(() =>
      guard({ subdomain: null, customDomain: '', slug: undefined }),
    ).not.toThrow();
  });
});
